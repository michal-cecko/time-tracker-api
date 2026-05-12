import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  list(userId: string, q: { taskId?: string; projectId?: string; limit?: number }) {
    return this.prisma.activityLog.findMany({
      where: {
        userId,
        ...(q.taskId ? { taskId: q.taskId } : {}),
        ...(q.projectId ? { projectId: q.projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(q.limit ?? 50, 200),
    });
  }
}
