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

  // Pipeline order — top-of-pipeline first, finished work last. Matches the
  // status palette order from the prototype and tokens.css.
  private static STATUS_ORDER: Record<Status, number> = {
    BACKLOG: 0,
    ESTIMATE: 1,
    APPROVED: 2,
    RETURN: 3,
    IN_PROGRESS: 4,
    IN_REVIEW: 5,
    WAITING: 6,
    HOLD: 7,
    DONE: 8,
    INVOICED: 9,
  };

  private sortSiblings(a: TaskWithEntries, b: TaskWithEntries): number {
    const sa = TasksService.STATUS_ORDER[a.status];
    const sb = TasksService.STATUS_ORDER[b.status];
    if (sa !== sb) return sa - sb;
    return a.position - b.position;
  }

  private buildTree(flat: TaskWithEntries[]): TaskWithEntries[] {
    const byParent = new Map<string | null, TaskWithEntries[]>();
    for (const t of flat) {
      const arr = byParent.get(t.parentTaskId) ?? [];
      arr.push({ ...t, children: [] });
      byParent.set(t.parentTaskId, arr);
    }
    const attach = (t: TaskWithEntries) => {
      t.children = (byParent.get(t.id) ?? []).sort((a, b) => this.sortSiblings(a, b));
      t.children.forEach(attach);
    };
    const roots = (byParent.get(null) ?? []).sort((a, b) => this.sortSiblings(a, b));
    roots.forEach(attach);
    return roots;
  }

  private decorate(t: TaskWithEntries, ancestors: Array<{ id: string; title: string }> = []): any {
    const ownTracked = t.timeEntries.reduce((sum, e) => {
      return sum + (e.endedAt ? e.durationSeconds : Math.max(0, Math.floor((Date.now() - e.startedAt.getTime()) / 1000)));
    }, 0);
    const childAncestors = [...ancestors, { id: t.id, title: t.title }];
    const children = t.children.map((c) => this.decorate(c, childAncestors));
    const childTracked = children.reduce((s, c) => s + c.totalTime, 0);
    const childEstimate = children.reduce((s, c) => s + (c.totalEstimate ?? 0), 0);
    const totalTime = ownTracked + childTracked;
    const totalEstimate = (t.estimateSeconds ?? 0) + childEstimate;
    const running = t.timeEntries.some((e) => !e.endedAt);

    // Own billing — what THIS task contributes, independent of children.
    let ownEarned: number | null = null;
    let ownProjected: number | null = null;
    if (t.billingMode === 'HOURLY_RATE' && t.hourlyRateCents != null) {
      ownEarned = Math.round((ownTracked / 3600) * t.hourlyRateCents);
      if (t.estimateSeconds != null) {
        ownProjected = Math.round((t.estimateSeconds / 3600) * t.hourlyRateCents);
      }
    } else if (t.billingMode === 'TASK_PRICE' && t.taskPriceCents != null) {
      ownEarned = t.taskPriceCents;
      ownProjected = t.taskPriceCents;
    }

    // Roll-up earnings from descendants. If the parent has no billing of its
    // own but its subtasks do, we still want to surface the totals.
    const childEarned = children.reduce((s: number, c: any) => s + (c.earnedSoFarCents ?? 0), 0);
    const childProjected = children.reduce((s: number, c: any) => s + (c.projectedTotalCents ?? 0), 0);
    const hasOwn = ownEarned !== null;
    const hasChildBilling = children.some((c: any) => c.earnedSoFarCents !== null);
    const anyBilling = hasOwn || hasChildBilling;

    const earnedSoFarCents = anyBilling ? (ownEarned ?? 0) + childEarned : null;
    const hasOwnProjected = ownProjected !== null;
    const hasChildProjected = children.some((c: any) => c.projectedTotalCents !== null);
    const projectedTotalCents = (hasOwnProjected || hasChildProjected)
      ? (ownProjected ?? 0) + childProjected
      : null;

    // Effective hourly rate across the whole subtree — earned / total hours.
    let effectiveRateCents: number | null = null;
    if (earnedSoFarCents != null && totalTime > 0) {
      effectiveRateCents = Math.round(earnedSoFarCents / (totalTime / 3600));
    } else if (t.billingMode === 'HOURLY_RATE' && t.hourlyRateCents != null) {
      effectiveRateCents = t.hourlyRateCents;
    }

    const { timeEntries, ...rest } = t as any;
    return {
      ...rest,
      ancestors,
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
    // Walk up parents to assemble the breadcrumb chain that leads to this task.
    const ancestors: Array<{ id: string; title: string }> = [];
    let cursor: TaskWithEntries | undefined = root;
    while (cursor?.parentTaskId) {
      const p = map.get(cursor.parentTaskId);
      if (!p) break;
      ancestors.unshift({ id: p.id, title: p.title });
      cursor = p;
    }
    // Restrict tree to this subtree only, sorted by status then position
    // to match the project-tree ordering.
    const collect = (node: TaskWithEntries): TaskWithEntries => ({
      ...node,
      children: flat
        .filter((x) => x.parentTaskId === node.id)
        .sort((a, b) => this.sortSiblings(a, b))
        .map(collect),
    });
    return this.decorate(collect(root), ancestors);
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

    // ── Move guards ──────────────────────────────────────────────────────
    // 1. Validate new parent / project ownership.
    // 2. Reject moving a task under itself or any of its descendants
    //    (would create a cycle).
    // 3. If projectId changes (either explicit, or implied by re-parenting),
    //    cascade the new projectId to every descendant so all sub-tasks
    //    stay in the same project tree as their root.
    let nextProjectId = existing.projectId;
    let nextParentTaskId: string | null | undefined = undefined;

    if (dto.parentTaskId !== undefined) {
      if (dto.parentTaskId === null) {
        nextParentTaskId = null;
      } else if (dto.parentTaskId === id) {
        throw new BadRequestException('A task cannot be its own parent');
      } else {
        const newParent = await this.prisma.task.findFirst({ where: { id: dto.parentTaskId, userId } });
        if (!newParent) throw new BadRequestException('New parent task not found');
        const descendants = await this.descendantIds(id);
        if (descendants.includes(dto.parentTaskId)) {
          throw new BadRequestException('Cannot move a task under one of its own descendants');
        }
        nextParentTaskId = dto.parentTaskId;
        nextProjectId = newParent.projectId; // inherit parent's project
      }
    }

    if (dto.projectId !== undefined && dto.projectId !== existing.projectId) {
      // Explicit project move beats inheritance — but only valid when the
      // task is becoming top-level (no parent) in the target project.
      if (nextParentTaskId == null && dto.parentTaskId === null) {
        // already chosen — re-parent + new project
      } else if (nextParentTaskId !== undefined) {
        // The new parent's project will be used; ignore dto.projectId mismatch.
      } else if (existing.parentTaskId == null) {
        // top-level today; allow direct project change
      } else {
        throw new BadRequestException('Cannot change projectId without also setting parentTaskId to null');
      }
      const target = await this.prisma.project.findFirst({ where: { id: dto.projectId, userId } });
      if (!target) throw new NotFoundException('Target project not found');
      nextProjectId = dto.projectId;
    }

    const data: Prisma.TaskUpdateInput = { ...dto } as any;
    delete (data as any).projectId; // we'll set it explicitly below
    delete (data as any).parentTaskId;
    if (nextParentTaskId !== undefined) (data as any).parentTaskId = nextParentTaskId;
    if (nextProjectId !== existing.projectId) (data as any).projectId = nextProjectId;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.description !== undefined) data.description = (dto.description as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    if (dto.status && CLOSED_STATUSES.includes(dto.status) && !existing.completedAt) {
      data.completedAt = new Date();
    } else if (dto.status && !CLOSED_STATUSES.includes(dto.status) && existing.completedAt) {
      data.completedAt = null;
    }

    const task = await this.prisma.task.update({ where: { id }, data });

    // Cascade projectId to descendants when the root moved across projects.
    if (nextProjectId !== existing.projectId) {
      const ids = await this.descendantIds(id);
      const descIds = ids.filter((x) => x !== id);
      if (descIds.length > 0) {
        await this.prisma.task.updateMany({
          where: { id: { in: descIds } },
          data: { projectId: nextProjectId },
        });
      }
    }

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

  // Deep-clones a task tree as a sibling at position+1. Time entries are
  // intentionally NOT copied; the duplicate starts fresh.
  async duplicate(userId: string, id: string) {
    const root = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!root) throw new NotFoundException('Task not found');

    const tree = await this.prisma.task.findMany({
      where: { userId, id: { in: await this.descendantIds(id) } },
    });
    const byParent = new Map<string | null, typeof tree>();
    for (const t of tree) {
      const k = t.parentTaskId ?? null;
      const arr = byParent.get(k) ?? [];
      arr.push(t);
      byParent.set(k, arr);
    }

    const clone = async (
      original: typeof root,
      newParentTaskId: string | null,
      position: number,
      titleSuffix: string,
    ): Promise<string> => {
      const created = await this.prisma.task.create({
        data: {
          projectId: original.projectId,
          userId,
          parentTaskId: newParentTaskId,
          title: original.title + titleSuffix,
          status: original.status,
          urgent: original.urgent,
          estimateSeconds: original.estimateSeconds,
          billingMode: original.billingMode,
          hourlyRateCents: original.hourlyRateCents,
          taskPriceCents: original.taskPriceCents,
          dueDate: original.dueDate,
          position,
          description: (original.description as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });
      const kids = byParent.get(original.id) ?? [];
      for (let i = 0; i < kids.length; i++) {
        await clone(kids[i], created.id, i, '');
      }
      return created.id;
    };

    const newId = await clone(root, root.parentTaskId, root.position + 1, ' (copy)');
    const newRoot = await this.prisma.task.findUniqueOrThrow({ where: { id: newId } });
    this.rt.emitToUser(userId, 'task.upserted', newRoot);
    return newRoot;
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
