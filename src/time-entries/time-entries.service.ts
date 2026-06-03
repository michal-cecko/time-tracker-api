import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { RealtimeService } from '../realtime/realtime.service';
import { HistoryQuery, ListPerTaskQuery, ManualEntryDto, StartTimerDto, StopTimerDto, UpdateEntryDto } from './dto/time-entry.dto';

@Injectable()
export class TimeEntriesService {
  constructor(private prisma: PrismaService, private tasks: TasksService, private rt: RealtimeService) {}

  private async ensureTaskOwned(userId: string, taskId: string) {
    const t = await this.prisma.task.findFirst({ where: { id: taskId, userId } });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  async start(userId: string, dto: StartTimerDto) {
    if (dto.taskId) await this.ensureTaskOwned(userId, dto.taskId);
    return this.prisma.$transaction(async (tx) => {
      const startAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
      // Multiple timers may run at once — one per task (plus at most one
      // unassigned). Starting no longer stops the others. If a timer for this
      // same task is already running, return it untouched so a double-tap or a
      // replayed offline start is idempotent rather than spawning a duplicate.
      const existing = await tx.timeEntry.findFirst({
        where: { userId, endedAt: null, taskId: dto.taskId ?? null },
      });
      if (existing) return existing;
      const entry = await tx.timeEntry.create({
        data: { userId, taskId: dto.taskId ?? null, startedAt: startAt },
      });
      this.rt.emitToUser(userId, 'timer.started', {
        entryId: entry.id,
        taskId: entry.taskId,
        startedAt: entry.startedAt,
      });
      return entry;
    });
  }

  async stop(userId: string, dto: StopTimerDto = {}) {
    // With concurrent timers a stop targets a specific entry. Without an id we
    // fall back to the most recently started running timer (legacy clients).
    const running = await this.prisma.timeEntry.findFirst({
      where: dto.entryId
        ? { id: dto.entryId, userId, endedAt: null }
        : { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!running) throw new BadRequestException('No running timer');
    const requestedEnd = dto.endedAt ? new Date(dto.endedAt) : new Date();
    // Never let endedAt precede startedAt (clock skew, bad client clock).
    const end = requestedEnd > running.startedAt ? requestedEnd : new Date(running.startedAt.getTime() + 1000);
    const duration = Math.max(1, Math.floor((end.getTime() - running.startedAt.getTime()) / 1000));
    const entry = await this.prisma.timeEntry.update({
      where: { id: running.id },
      data: { endedAt: end, durationSeconds: duration },
    });
    this.rt.emitToUser(userId, 'timer.stopped', {
      entryId: entry.id,
      taskId: entry.taskId,
      endedAt: entry.endedAt,
      durationSeconds: entry.durationSeconds,
    });
    return entry;
  }

  // Returns every currently-running timer (newest first). Concurrent timers
  // are supported, so this is always an array — clients render them as a set.
  async runningEntries(userId: string) {
    return this.prisma.timeEntry.findMany({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }

  async manual(userId: string, dto: ManualEntryDto) {
    const task = dto.taskId ? await this.ensureTaskOwned(userId, dto.taskId) : null;
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
      data: { userId, taskId: dto.taskId ?? null, startedAt, endedAt, durationSeconds: duration, manual: true, note: dto.note },
    });
    if (task) {
      await this.prisma.activityLog.create({
        data: { userId, taskId: task.id, projectId: task.projectId, kind: ActivityKind.MANUAL_ENTRY_ADDED, meta: { entryId: entry.id, durationSeconds: duration } },
      });
    }
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

    // Allow assign / re-assign / clear (null) of the task.
    let taskId: string | null | undefined = undefined;
    if (dto.taskId !== undefined) {
      if (dto.taskId === null) taskId = null;
      else { await this.ensureTaskOwned(userId, dto.taskId); taskId = dto.taskId; }
    }

    const entry = await this.prisma.timeEntry.update({
      where: { id },
      data: {
        startedAt,
        endedAt,
        durationSeconds: duration,
        note: dto.note ?? existing.note,
        ...(taskId !== undefined ? { taskId } : {}),
      },
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
      if (!e.task || !e.taskId) return e;
      return { ...e, task: { ...e.task, ancestors: chainOf(e.taskId) } };
    });
  }
}
