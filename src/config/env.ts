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
