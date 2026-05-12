import { Injectable, NotFoundException } from '@nestjs/common';
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
            timeEntries: { select: { durationSeconds: true, endedAt: true, startedAt: true } },
          },
        },
      },
    });

    return projects.map((p) => {
      let trackedSeconds = 0;
      let openTaskCount = 0;
      for (const t of p.tasks) {
        if (!CLOSED_STATUSES.includes(t.status)) openTaskCount += 1;
        for (const e of t.timeEntries) {
          trackedSeconds += e.endedAt
            ? e.durationSeconds
            : Math.max(0, Math.floor((Date.now() - e.startedAt.getTime()) / 1000));
        }
      }
      const { tasks, ...rest } = p;
      return { ...rest, trackedSeconds, openTaskCount };
    });
  }

  async getOrThrow(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({ where: { id, userId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(userId: string, dto: CreateProjectDto) {
    const p = await this.prisma.project.create({ data: { ...dto, userId } });
    this.rt.emitToUser(userId, 'project.upserted', p);
    return p;
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    await this.getOrThrow(userId, id);
    const p = await this.prisma.project.update({ where: { id }, data: dto });
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
