import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ActivityKind } from '@prisma/client';

// Stops any running TimeEntry at local midnight when the owner's Settings
// has `autoStopAtMidnight: true`. The cron runs once a day in the server's
// time zone (set via the TZ env var on the container).
//
// Each stopped entry is flagged `autoStopped = true` so the client surfaces
// a "Review" notification — the user can then trim the duration or delete
// the entry if they truly weren't working past midnight.
@Injectable()
export class AutoStopService {
  private readonly log = new Logger(AutoStopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rt: RealtimeService,
  ) {}

  // 00:05 every day, server-local time. The five-minute offset keeps the
  // entry's endedAt firmly inside the previous day so the daily totals stack
  // cleanly. If you need per-user time-zones, add a `timezone` column on
  // Settings and shift the comparison accordingly.
  @Cron('5 0 * * *')
  async stopRunning() {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0); // today 00:00 server-local

    // Find every still-open entry whose owner opted in.
    const running = await this.prisma.timeEntry.findMany({
      where: {
        endedAt: null,
        user: { settings: { autoStopAtMidnight: true } },
      },
      include: { task: { select: { id: true, title: true, projectId: true } } },
    });

    if (running.length === 0) return;

    this.log.log(`Auto-stopping ${running.length} forgotten timer(s) at midnight.`);

    for (const e of running) {
      const endedAt = cutoff; // pin to today 00:00 local
      const duration = Math.max(1, Math.floor((endedAt.getTime() - e.startedAt.getTime()) / 1000));
      const updated = await this.prisma.timeEntry.update({
        where: { id: e.id },
        data: { endedAt, durationSeconds: duration, autoStopped: true },
      });
      await this.prisma.activityLog.create({
        data: {
          userId: e.userId,
          taskId: e.taskId,
          projectId: e.task.projectId,
          kind: ActivityKind.TIME_TRACKED,
          meta: { autoStopped: true, durationSeconds: duration },
        },
      });
      // Two events: keeps existing `timer.stopped` listeners working, and
      // the dedicated `timer.autoStopped` lets the client know to show the
      // review notification rather than the regular silent stop.
      this.rt.emitToUser(e.userId, 'timer.stopped', {
        entryId: updated.id,
        taskId: updated.taskId,
        endedAt: updated.endedAt,
        durationSeconds: updated.durationSeconds,
      });
      this.rt.emitToUser(e.userId, 'timer.autoStopped', {
        entryId: updated.id,
        taskId: updated.taskId,
        taskTitle: e.task.title,
        durationSeconds: updated.durationSeconds,
      });
    }
  }
}
