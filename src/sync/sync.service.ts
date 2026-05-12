import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SyncBatchDto } from './dto/sync.dto';

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService, private rt: RealtimeService) {}

  // Idempotent on item.id — replaying the same batch is a no-op.
  // The actual apply-logic per item kind is intentionally simple here; the queue
  // is mostly for telemetry/visibility. Real mutations go through their REST endpoints.
  async apply(userId: string, dto: SyncBatchDto) {
    const applied: string[] = [];
    const skipped: string[] = [];

    for (const item of dto.items) {
      try {
        await this.prisma.syncQueueItem.create({
          data: {
            id: item.id,
            userId,
            kind: item.kind,
            payload: item.payload as Prisma.InputJsonValue,
            appliedAt: new Date(),
          },
        });
        applied.push(item.id);
      } catch (e: any) {
        // P2002 = unique constraint (replay) → idempotent skip
        if (e?.code === 'P2002') {
          skipped.push(item.id);
        } else {
          await this.prisma.syncQueueItem.upsert({
            where: { id: item.id },
            update: { error: e?.message ?? 'unknown' },
            create: {
              id: item.id,
              userId,
              kind: item.kind,
              payload: item.payload as Prisma.InputJsonValue,
              error: e?.message ?? 'unknown',
            },
          });
        }
      }
    }

    if (applied.length) this.rt.emitToUser(userId, 'sync.applied', { itemIds: applied });
    return { applied, skipped };
  }

  pending(userId: string) {
    return this.prisma.syncQueueItem.findMany({
      where: { userId, appliedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
}
