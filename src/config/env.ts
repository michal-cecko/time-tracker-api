import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DEFAULT: z.string().default('7d'),
  JWT_REFRESH_TTL_STAY: z.string().default('90d'),
  CORS_ORIGINS: z.string().default(''),
  APP_URL: z.string().default('http://localhost:3000'),
  SENTRY_DSN: z.string().optional(),
  // Public sign-up. Default off in production so randoms can't join your
  // tracker; flip the env var when you want to open it up.
  REGISTRATION_ENABLED: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.flatten();
    throw new Error(`Invalid environment: ${JSON.stringify(formatted.fieldErrors)}`);
  }
  cached = parsed.data;
  return cached;
}
