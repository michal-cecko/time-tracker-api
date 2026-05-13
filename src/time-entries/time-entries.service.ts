import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { RealtimeService } from '../realtime/realtime.service';
import { HistoryQuery, ListPerTaskQuery, ManualEntryDto, StartTimerDto, UpdateEntryDto } from './dto/time-entry.dto';

@Injectable()
export class TimeEntriesService {
  constructor(private prisma: PrismaService, private tasks: TasksService, private rt: RealtimeService) {}

  private async ensureTaskOwned(userId: string, taskId: string) {
    const t = await this.prisma.task.findFirst({ where: { id: taskId, userId } });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  async start(userId: string, dto: StartTimerDto) {
    await this.ensureTaskOwned(userId, dto.taskId);
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const running = await tx.timeEntry.findFirst({ where: { userId, endedAt: null } });
      if (running) {
        const duration = Math.max(1, Math.floor((now.getTime() - running.startedAt.getTime()) / 1000));
        const stopped = await tx.timeEntry.update({
          where: { id: running.id },
          data: { endedAt: now, durationSeconds: duration },
        });
        this.rt.emitToUser(userId, 'timer.stopped', {
          entryId: stopped.id,
          taskId: stopped.taskId,
          endedAt: stopped.endedAt,
          durationSeconds: stopped.durationSeconds,
        });
      }
      const entry = await tx.timeEntry.create({
        data: { userId, taskId: dto.taskId, startedAt: now },
      });
      this.rt.emitToUser(userId, 'timer.started', {
        entryId: entry.id,
        taskId: entry.taskId,
        startedAt: entry.startedAt,
      });
      return entry;
    });
  }

  async stop(userId: string) {
    const running = await this.prisma.timeEntry.findFirst({ where: { userId, endedAt: null } });
    if (!running) throw new BadRequestException('No running timer');
    const now = new Date();
    const duration = Math.max(1, Math.floor((now.getTime() - running.startedAt.getTime()) / 1000));
    const entry = await this.prisma.timeEntry.update({
      where: { id: running.id },
      data: { endedAt: now, durationSeconds: duration },
    });
    this.rt.emitToUser(userId, 'timer.stopped', {
      entryId: entry.id,
      taskId: entry.taskId,
      endedAt: entry.endedAt,
      durationSeconds: entry.durationSeconds,
    });
    return entry;
  }

  async runningEntry(userId: string) {
    return this.prisma.timeEntry.findFirst({ where: { userId, endedAt: null } });
  }

  async manual(userId: string, dto: ManualEntryDto) {
    const task = await this.ensureTaskOwned(userId, dto.taskId);
    const startedAt = new Date(dto.startedAt);
    let endedAt: Date | null = null;
    let duration = dto.durationSeconds ?? 0;
    if (dto.endedAt) {
      endedAt = new Date(dto.endedAt);
      duration = Math.max(1, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
    } else if (duration > 0) {
      endedAt = new Date(startedAt.getTime() + duration * 1000);
    } else {
      throw new BadRequestException('Provide endedAt or durationSeconds');
    }
    const entry = await this.prisma.timeEntry.create({
      data: { userId, taskId: dto.taskId, startedAt, endedAt, durationSeconds: duration, manual: true, note: dto.note },
    });
    await this.prisma.activityLog.create({
      data: { userId, taskId: task.id, projectId: task.projectId, kind: ActivityKind.MANUAL_ENTRY_ADDED, meta: { entryId: entry.id, durationSeconds: duration } },
    });
    this.rt.emitToUser(userId, 'entry.upserted', entry);
    return entry;
  }

  async update(userId: string, id: string, dto: UpdateEntryDto) {
    const existing = await this.prisma.timeEntry.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Time entry not found');
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : existing.startedAt;
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : existing.endedAt;
    let duration = dto.durationSeconds ?? existing.durationSeconds;
    if (endedAt) duration = Math.max(1, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));

    const entry = await this.prisma.timeEntry.update({
      where: { id },
      data: { startedAt, endedAt, durationSeconds: duration, note: dto.note ?? existing.note },
    });
    this.rt.emitToUser(userId, 'entry.upserted', entry);
    return entry;
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.timeEntry.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Time entry not found');
    await this.prisma.timeEntry.delete({ where: { id } });
    this.rt.emitToUser(userId, 'entry.deleted', { id });
  }

  async listForTask(userId: string, taskId: string, q: ListPerTaskQuery) {
    await this.ensureTaskOwned(userId, taskId);
    const includeDescendants = q.descendants === 'true';
    const taskIds = includeDescendants ? await this.tasks.descendantIds(taskId) : [taskId];
    return this.prisma.timeEntry.findMany({
      where: { userId, taskId: { in: taskIds } },
      orderBy: { startedAt: 'desc' },
      include: { task: { select: { id: true, title: true } } },
    });
  }

  async history(userId: string, q: HistoryQuery) {
    const where: any = { userId };
    if (q.from || q.to) {
      where.startedAt = {};
      if (q.from) where.startedAt.gte = new Date(q.from);
      if (q.to) where.startedAt.lte = new Date(q.to);
    }
    const entries = await this.prisma.timeEntry.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: {
        task: {
          select: { id: true, title: true, parentTaskId: true, project: { select: { id: true, name: true, colorHex: true, initials: true } } },
        },
      },
    });
    // Resolve ancestor chains (Project > Parent > … > Self minus the leaf)
    // for every entry that points at a nested task. Single query, mapped in JS.
    const needAncestors = entries.some((e) => e.task?.parentTaskId);
    if (!needAncestors) return entries;
    const all = await this.prisma.task.findMany({
      where: { userId },
      select: { id: true, title: true, parentTaskId: true },
    });
    const map = new Map(all.map((t) => [t.id, t]));
    const chainOf = (taskId: string): Array<{ id: string; title: string }> => {
      const chain: Array<{ id: string; title: string }> = [];
      let cur = map.get(taskId);
      while (cur?.parentTaskId) {
        const p = map.get(cur.parentTaskId);
        if (!p) break;
        chain.unshift({ id: p.id, title: p.title });
        cur = p;
      }
      return chain;
    };
    return entries.map((e) => {
      if (!e.task) return e;
      return { ...e, task: { ...e.task, ancestors: chainOf(e.taskId) } };
    });
  }
}
