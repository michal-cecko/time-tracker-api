import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

let app: NestFastifyApplication;
let access: string;
let projectId: string;
let taskId: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const reg = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email: `tasks-${Date.now()}@example.com`, password: 'password123', name: 'Tasker' });
  access = reg.body.accessToken;
});

afterAll(async () => {
  await app.close();
});

describe('Projects + Tasks + Timer (e2e)', () => {
  it('creates a project, then a task, then starts the timer', async () => {
    const proj = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${access}`)
      .send({ name: 'Test Project', initials: 'TP', colorHex: '#ff7a45' });
    expect(proj.status).toBe(201);
    projectId = proj.body.id;

    const task = await request(app.getHttpServer())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${access}`)
      .send({ projectId, title: 'First task', estimateSeconds: 3600 });
    expect(task.status).toBe(201);
    taskId = task.body.id;

    const started = await request(app.getHttpServer())
      .post('/api/v1/time-entries/start')
      .set('Authorization', `Bearer ${access}`)
      .send({ taskId });
    expect(started.status).toBe(200);
    expect(started.body.endedAt).toBeNull();

    const stopped = await request(app.getHttpServer())
      .post('/api/v1/time-entries/stop')
      .set('Authorization', `Bearer ${access}`);
    expect(stopped.status).toBe(200);
    expect(stopped.body.endedAt).toBeTruthy();
    expect(stopped.body.durationSeconds).toBeGreaterThan(0);
  });

  it('rejects billing XOR violation', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${access}`)
      .send({ billingMode: 'HOURLY_RATE', hourlyRateCents: 8500, taskPriceCents: 12000 });
    expect(res.status).toBe(400);
  });

  it('sync batch is idempotent on item.id', async () => {
    const items = [{ id: 'fixed-uuid-1', kind: 'TIME', payload: { durationSeconds: 60 } }];
    const a = await request(app.getHttpServer()).post('/api/v1/sync/batch').set('Authorization', `Bearer ${access}`).send({ items });
    expect(a.body.applied).toContain('fixed-uuid-1');
    const b = await request(app.getHttpServer()).post('/api/v1/sync/batch').set('Authorization', `Bearer ${access}`).send({ items });
    expect(b.body.skipped).toContain('fixed-uuid-1');
  });
});
