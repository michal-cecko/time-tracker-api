import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const TTL_HOURS = 24;
// Routes that should never be deduped (auth, refresh, etc. — replaying could
// rotate tokens unexpectedly). Match against req.url path-only.
const SKIP_PATH_PREFIXES = ['/api/v1/auth/', '/api/v1/sync/'];

interface ReqLike {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  user?: { id: string };
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly log = new Logger(IdempotencyInterceptor.name);
  constructor(private prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<ReqLike>();
    const res = http.getResponse<Response | FastifyReply>();

    if (!MUTATION_METHODS.has(req.method)) return next.handle();

    const path = (req.url || '').split('?')[0];
    if (SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))) return next.handle();

    const raw = req.headers['idempotency-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key) return next.handle();
    if (key.length > 120) throw new ConflictException('Idempotency-Key too long');

    const userId = req.user?.id;
    if (!userId) return next.handle(); // unauthenticated mutations don't dedupe

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing) {
      if (existing.userId !== userId || existing.method !== req.method || existing.path !== path) {
        throw new ConflictException('Idempotency-Key conflicts with prior request');
      }
      // Replay: short-circuit with the cached response.
      this.setStatus(res, existing.status);
      return of(existing.response);
    }

    return next.handle().pipe(
      tap({
        next: async (body: unknown) => {
          const status = this.getStatus(res) ?? 200;
          try {
            await this.prisma.idempotencyKey.create({
              data: {
                key,
                userId,
                method: req.method,
                path,
                status,
                response: (body ?? null) as any,
                expiresAt: new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000),
              },
            });
          } catch (e: any) {
            // P2002 unique → another concurrent request stored it first; harmless.
            if (e?.code !== 'P2002') this.log.warn(`failed to store idempotency key: ${e?.message ?? e}`);
          }
        },
      }),
    );
  }

  private getStatus(res: any): number | undefined {
    if (typeof res?.statusCode === 'number') return res.statusCode;
    return undefined;
  }
  private setStatus(res: any, status: number) {
    if (typeof res?.status === 'function') res.status(status);
    else if ('statusCode' in res) res.statusCode = status;
  }
}
