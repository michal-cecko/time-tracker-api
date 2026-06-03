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

  it('runs multiple timers concurrently and stops them independently', async () => {
    // Two distinct tasks, each tracked at the same time.
    const mk = async (title: string) => {
      const t = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${access}`)
        .send({ projectId, title });
      return t.body.id as string;
    };
    const taskA = await mk('Concurrent A');
    const taskB = await mk('Concurrent B');

    const a = await request(app.getHttpServer())
      .post('/api/v1/time-entries/start')
      .set('Authorization', `Bearer ${access}`)
      .send({ taskId: taskA });
    const b = await request(app.getHttpServer())
      .post('/api/v1/time-entries/start')
      .set('Authorization', `Bearer ${access}`)
      .send({ taskId: taskB });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Starting B must NOT have stopped A.
    expect(a.body.endedAt).toBeNull();
    expect(b.body.endedAt).toBeNull();

    // Re-starting the same task is idempotent — returns the existing entry.
    const aAgain = await request(app.getHttpServer())
      .post('/api/v1/time-entries/start')
      .set('Authorization', `Bearer ${access}`)
      .send({ taskId: taskA });
    expect(aAgain.body.id).toBe(a.body.id);

    const running = await request(app.getHttpServer())
      .get('/api/v1/time-entries/running')
      .set('Authorization', `Bearer ${access}`);
    expect(Array.isArray(running.body)).toBe(true);
    expect(running.body.length).toBe(2);

    // Stop only A by id; B keeps running.
    const stoppedA = await request(app.getHttpServer())
      .post('/api/v1/time-entries/stop')
      .set('Authorization', `Bearer ${access}`)
      .send({ entryId: a.body.id });
    expect(stoppedA.status).toBe(200);
    expect(stoppedA.body.id).toBe(a.body.id);

    const stillRunning = await request(app.getHttpServer())
      .get('/api/v1/time-entries/running')
      .set('Authorization', `Bearer ${access}`);
    expect(stillRunning.body.length).toBe(1);
    expect(stillRunning.body[0].id).toBe(b.body.id);

    // Clean up B so later tests start from a clean slate.
    await request(app.getHttpServer())
      .post('/api/v1/time-entries/stop')
      .set('Authorization', `Bearer ${access}`)
      .send({ entryId: b.body.id });
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
