import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, ListProjectsQuery, UpdateProjectDto } from './dto/project.dto';
import { CLOSED_STATUSES } from '../common/constants/status';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService, private rt: RealtimeService) {}

  async list(userId: string, q: ListProjectsQuery) {
    const where: any = { userId };
    if (q.archived === 'true') where.archived = true;
    else if (q.archived === 'false' || !q.archived) where.archived = false;

    const projects = await this.prisma.project.findMany({
      where,
      orderBy: [{ archived: 'asc' }, { createdAt: 'desc' }],
      include: {
        tasks: {
          select: {
            status: true,
            billingMode: true,
            hourlyRateCents: true,
            taskPriceCents: true,
            estimateSeconds: true,
            timeEntries: { select: { durationSeconds: true, endedAt: true, startedAt: true } },
          },
        },
      },
    });

    const since30 = Date.now() - 30 * 24 * 3600 * 1000;

    return projects.map((p) => {
      let trackedSeconds = 0;
      let openTaskCount = 0;
      let earnedCents = 0;
      let projectedCents = 0;
      let earnedLast30dCents = 0;
      let hasBilling = false;
      let hasProjected = false;

      for (const t of p.tasks) {
        if (!CLOSED_STATUSES.includes(t.status)) openTaskCount += 1;

        let taskTrackedSec = 0;
        let taskTrackedLast30Sec = 0;
        for (const e of t.timeEntries) {
          const dur = e.endedAt
            ? e.durationSeconds
            : Math.max(0, Math.floor((Date.now() - e.startedAt.getTime()) / 1000));
          taskTrackedSec += dur;
          // An entry counts toward "last 30 days" if it overlaps the window.
          // We approximate by anchoring on the entry's end (or "now" if running).
          const endMs = e.endedAt ? e.endedAt.getTime() : Date.now();
          if (endMs >= since30) taskTrackedLast30Sec += dur;
        }
        trackedSeconds += taskTrackedSec;

        if (t.billingMode === 'HOURLY_RATE' && t.hourlyRateCents != null) {
          hasBilling = true;
          earnedCents += Math.round((taskTrackedSec / 3600) * t.hourlyRateCents);
          earnedLast30dCents += Math.round((taskTrackedLast30Sec / 3600) * t.hourlyRateCents);
          if (t.estimateSeconds != null) {
            hasProjected = true;
            projectedCents += Math.round((t.estimateSeconds / 3600) * t.hourlyRateCents);
          }
        } else if (t.billingMode === 'TASK_PRICE' && t.taskPriceCents != null) {
          hasBilling = true;
          hasProjected = true;
          earnedCents += t.taskPriceCents;
          projectedCents += t.taskPriceCents;
          // Attribute a slice of the fixed price proportional to the share
          // of the task's tracked time that fell in the last 30 days.
          if (taskTrackedSec > 0) {
            earnedLast30dCents += Math.round(t.taskPriceCents * (taskTrackedLast30Sec / taskTrackedSec));
          }
        }
      }

      const { tasks, ...rest } = p;
      return {
        ...rest,
        trackedSeconds,
        openTaskCount,
        earnedCents: hasBilling ? earnedCents : null,
        earnedLast30dCents: hasBilling ? earnedLast30dCents : null,
        projectedCents: hasProjected ? projectedCents : null,
        effectiveRateCents:
          hasBilling && trackedSeconds > 0
            ? Math.round(earnedCents / (trackedSeconds / 3600))
            : null,
      };
    });
  }

  async getOrThrow(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({ where: { id, userId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(userId: string, dto: CreateProjectDto) {
    const { description, ...rest } = dto;
    const p = await this.prisma.project.create({
      data: {
        ...rest,
        userId,
        ...(description !== undefined ? { description: description as Prisma.InputJsonValue } : {}),
      },
    });
    this.rt.emitToUser(userId, 'project.upserted', p);
    return p;
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    await this.getOrThrow(userId, id);
    const { description, ...rest } = dto;
    const data: Prisma.ProjectUpdateInput = { ...rest };
    if (description !== undefined) {
      data.description = (description as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    }
    const p = await this.prisma.project.update({ where: { id }, data });
    this.rt.emitToUser(userId, 'project.upserted', p);
    return p;
  }

  async archive(userId: string, id: string) {
    await this.getOrThrow(userId, id);
    const p = await this.prisma.project.update({
      where: { id },
      data: { archived: true, archivedAt: new Date() },
    });
    this.rt.emitToUser(userId, 'project.upserted', p);
    return p;
  }

  async unarchive(userId: string, id: string) {
    await this.getOrThrow(userId, id);
    const p = await this.prisma.project.update({
      where: { id },
      data: { archived: false, archivedAt: null },
    });
    this.rt.emitToUser(userId, 'project.upserted', p);
    return p;
  }

  async remove(userId: string, id: string) {
    await this.getOrThrow(userId, id);
    await this.prisma.project.delete({ where: { id } });
    this.rt.emitToUser(userId, 'project.deleted', { id });
  }
}
