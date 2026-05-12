import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

let app: NestFastifyApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

describe('Auth (e2e)', () => {
  const email = `test-${Date.now()}@example.com`;
  let access: string;

  it('rejects malformed register', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short', name: '' });
    expect(res.status).toBe(400);
  });

  it('registers a new user and returns tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123', name: 'Test' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    access = res.body.accessToken;
  });

  it('GET /me requires auth and returns the user', async () => {
    const unauth = await request(app.getHttpServer()).get('/api/v1/me');
    expect(unauth.status).toBe(401);

    const me = await request(app.getHttpServer()).get('/api/v1/me').set('Authorization', `Bearer ${access}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });
});
