import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async weekly(userId: string, from?: string) {
    const start = startOfDay(from ? new Date(from) : new Date());
    start.setDate(start.getDate() - 6);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const entries = await this.prisma.timeEntry.findMany({
      where: { userId, startedAt: { gte: start, lt: end } },
      include: { task: { select: { project: { select: { id: true, name: true, colorHex: true } } } } },
    });

    const days: Array<{ date: string; total: number; perProject: Record<string, number> }> = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push({ date: day.toISOString().slice(0, 10), total: 0, perProject: {} });
    }

    let total = 0;
    const perProject: Record<string, { name: string; colorHex: string; seconds: number }> = {};

    for (const e of entries) {
      const sec = e.endedAt ? e.durationSeconds : Math.max(0, Math.floor((Date.now() - e.startedAt.getTime()) / 1000));
      const idx = Math.floor((startOfDay(e.startedAt).getTime() - start.getTime()) / 86_400_000);
      if (idx < 0 || idx > 6) continue;
      days[idx].total += sec;
      total += sec;
      const p = e.task?.project;
      if (!p) continue; // unassigned entry — contributes to total but no project bucket.
      days[idx].perProject[p.id] = (days[idx].perProject[p.id] ?? 0) + sec;
      perProject[p.id] = perProject[p.id]
        ? { ...perProject[p.id], seconds: perProject[p.id].seconds + sec }
        : { name: p.name, colorHex: p.colorHex, seconds: sec };
    }

    return { from: start.toISOString().slice(0, 10), to: days[6].date, total, days, perProject };
  }

  async range(userId: string, from: string, to: string) {
    const start = new Date(from);
    const end = new Date(to);
    const entries = await this.prisma.timeEntry.findMany({
      where: { userId, startedAt: { gte: start, lt: end } },
      include: { task: { select: { title: true, project: { select: { id: true, name: true } } } } },
      orderBy: { startedAt: 'desc' },
    });
    const total = entries.reduce((s, e) => s + (e.endedAt ? e.durationSeconds : Math.max(0, Math.floor((Date.now() - e.startedAt.getTime()) / 1000))), 0);
    return { from, to, total, entries };
  }
}
