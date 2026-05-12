import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityKind, BillingMode, Prisma, Status, Task } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, ReorderDto, SetStatusDto, UpdateTaskDto } from './dto/task.dto';
import { CLOSED_STATUSES } from '../common/constants/status';
import { RealtimeService } from '../realtime/realtime.service';

type TaskWithEntries = Task & {
  timeEntries: { durationSeconds: number; startedAt: Date; endedAt: Date | null }[];
  children: TaskWithEntries[];
};

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService, private rt: RealtimeService) {}

  private validateBilling(dto: { billingMode?: BillingMode | null; hourlyRateCents?: number | null; taskPriceCents?: number | null }) {
    const mode = dto.billingMode;
    if (!mode || mode === 'NONE') return;
    if (mode === 'HOURLY_RATE' && dto.taskPriceCents != null) {
      throw new BadRequestException('HOURLY_RATE mode forbids taskPriceCents');
    }
    if (mode === 'TASK_PRICE' && dto.hourlyRateCents != null) {
      throw new BadRequestException('TASK_PRICE mode forbids hourlyRateCents');
    }
  }

  private buildTree(flat: TaskWithEntries[]): TaskWithEntries[] {
    const byParent = new Map<string | null, TaskWithEntries[]>();
    for (const t of flat) {
      const arr = byParent.get(t.parentTaskId) ?? [];
      arr.push({ ...t, children: [] });
      byParent.set(t.parentTaskId, arr);
    }
    const attach = (t: TaskWithEntries) => {
      t.children = (byParent.get(t.id) ?? []).sort((a, b) => a.position - b.position);
      t.children.forEach(attach);
    };
    const roots = (byParent.get(null) ?? []).sort((a, b) => a.position - b.position);
    roots.forEach(attach);
    return roots;
  }

  private decorate(t: TaskWithEntries): any {
    const ownTracked = t.timeEntries.reduce((sum, e) => {
      return sum + (e.endedAt ? e.durationSeconds : Math.max(0, Math.floor((Date.now() - e.startedAt.getTime()) / 1000)));
    }, 0);
    const children = t.children.map((c) => this.decorate(c));
    const childTracked = children.reduce((s, c) => s + c.totalTime, 0);
    const childEstimate = children.reduce((s, c) => s + (c.totalEstimate ?? 0), 0);
    const totalTime = ownTracked + childTracked;
    const totalEstimate = (t.estimateSeconds ?? 0) + childEstimate;
    const running = t.timeEntries.some((e) => !e.endedAt);

    let effectiveRateCents: number | null = null;
    let earnedSoFarCents: number | null = null;
    let projectedTotalCents: number | null = null;
    if (t.billingMode === 'HOURLY_RATE' && t.hourlyRateCents != null) {
      effectiveRateCents = t.hourlyRateCents;
      earnedSoFarCents = Math.round((totalTime / 3600) * t.hourlyRateCents);
      if (t.estimateSeconds != null) {
        projectedTotalCents = Math.round((t.estimateSeconds / 3600) * t.hourlyRateCents);
      }
    } else if (t.billingMode === 'TASK_PRICE' && t.taskPriceCents != null) {
      const hours = totalTime / 3600;
      effectiveRateCents = hours > 0 ? Math.round(t.taskPriceCents / hours) : null;
      earnedSoFarCents = t.taskPriceCents;
      projectedTotalCents = t.taskPriceCents;
    }

    const { timeEntries, ...rest } = t as any;
    return {
      ...rest,
      totalTime,
      totalEstimate,
      running,
      effectiveRateCents,
      earnedSoFarCents,
      projectedTotalCents,
      children,
    };
  }

  async listForProject(userId: string, projectId: string) {
    const flat = (await this.prisma.task.findMany({
      where: { projectId, userId },
      include: { timeEntries: { select: { durationSeconds: true, startedAt: true, endedAt: true } } },
      orderBy: [{ position: 'asc' }],
    })) as unknown as TaskWithEntries[];
    const tree = this.buildTree(flat);
    return tree.map((t) => this.decorate(t));
  }

  async getOne(userId: string, id: string) {
    const t = await this.prisma.task.findFirst({
      where: { id, userId },
      include: { timeEntries: { select: { durationSeconds: true, startedAt: true, endedAt: true } } },
    });
    if (!t) throw new NotFoundException('Task not found');
    const flat = (await this.prisma.task.findMany({
      where: { projectId: t.projectId, userId },
      include: { timeEntries: { select: { durationSeconds: true, startedAt: true, endedAt: true } } },
    })) as unknown as TaskWithEntries[];
    const map = new Map(flat.map((x) => [x.id, x]));
    const root = map.get(id)!;
    // Restrict tree to this subtree only.
    const collect = (node: TaskWithEntries): TaskWithEntries => ({
      ...node,
      children: flat.filter((x) => x.parentTaskId === node.id).map(collect),
    });
    return this.decorate(collect(root));
  }

  async create(userId: string, dto: CreateTaskDto) {
    this.validateBilling(dto);
    const project = await this.prisma.project.findFirst({ where: { id: dto.projectId, userId } });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.parentTaskId) {
      const parent = await this.prisma.task.findFirst({ where: { id: dto.parentTaskId, projectId: dto.projectId, userId } });
      if (!parent) throw new BadRequestException('Parent task not in same project');
    }

    const last = await this.prisma.task.findFirst({
      where: { projectId: dto.projectId, parentTaskId: dto.parentTaskId ?? null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const task = await this.prisma.task.create({
      data: {
        projectId: dto.projectId,
        userId,
        parentTaskId: dto.parentTaskId ?? null,
        title: dto.title,
        status: dto.status ?? Status.BACKLOG,
        urgent: dto.urgent ?? false,
        estimateSeconds: dto.estimateSeconds,
        billingMode: dto.billingMode ?? BillingMode.NONE,
        hourlyRateCents: dto.hourlyRateCents,
        taskPriceCents: dto.taskPriceCents,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        description: (dto.description as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        position: (last?.position ?? -1) + 1,
      },
    });

    await this.prisma.activityLog.create({
      data: { userId, taskId: task.id, projectId: task.projectId, kind: ActivityKind.TASK_CREATED },
    });
    this.rt.emitToUser(userId, 'task.upserted', task);
    return task;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    this.validateBilling(dto);
    const existing = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Task not found');

    const data: Prisma.TaskUpdateInput = { ...dto } as any;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.description !== undefined) data.description = (dto.description as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (dto.status && CLOSED_STATUSES.includes(dto.status) && !existing.completedAt) {
      data.completedAt = new Date();
    } else if (dto.status && !CLOSED_STATUSES.includes(dto.status) && existing.completedAt) {
      data.completedAt = null;
    }

    const task = await this.prisma.task.update({ where: { id }, data });

    if (dto.status && dto.status !== existing.status) {
      await this.prisma.activityLog.create({
        data: {
          userId,
          taskId: id,
          projectId: existing.projectId,
          kind: ActivityKind.STATUS_CHANGED,
          meta: { from: existing.status, to: dto.status },
        },
      });
    }
    this.rt.emitToUser(userId, 'task.upserted', task);
    return task;
  }

  async setStatus(userId: string, id: string, dto: SetStatusDto) {
    return this.update(userId, id, { status: dto.status });
  }

  async reorder(userId: string, id: string, dto: ReorderDto) {
    const existing = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Task not found');
    const task = await this.prisma.task.update({
      where: { id },
      data: { position: dto.position, parentTaskId: dto.parentTaskId === undefined ? existing.parentTaskId : dto.parentTaskId },
    });
    this.rt.emitToUser(userId, 'task.upserted', task);
    return task;
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.prisma.task.delete({ where: { id } });
    this.rt.emitToUser(userId, 'task.deleted', { id });
  }

  // Used by time-entries to collect a task's full descendant set for ?descendants=true queries.
  async descendantIds(taskId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE descendants AS (
        SELECT id FROM "Task" WHERE id = ${taskId}::uuid
        UNION ALL
        SELECT t.id FROM "Task" t INNER JOIN descendants d ON t."parentTaskId" = d.id
      )
      SELECT id FROM descendants;
    `;
    return result.map((r) => r.id);
  }
}
