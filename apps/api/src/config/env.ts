import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default('./data/lhcc.sqlite'),

  BETTER_AUTH_SECRET: z.string().min(16, 'BETTER_AUTH_SECRET must be at least 16 characters'),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),
  TRUSTED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim())),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  OCCURRENCE_HORIZON_WEEKS: z.coerce.number().int().positive().default(8),
  FAIRNESS_LOOKBACK_WEEKS: z.coerce.number().int().positive().default(6),

  // Off-Pi nightly backup upload to Cloudflare R2 — optional. When unset, backups stay
  // local-only (as before). See README for how to create the bucket + API token.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_BACKUP_RETENTION_COUNT: z.coerce.number().int().positive().default(5),

  // Outbound email (availability reminders, batch schedule notifications) via Gmail/Google
  // Workspace SMTP with an app password — optional. When unset, both features silently no-op.
  // See README for how to generate an app password.
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().email().optional(),
  SMTP_APP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_ADMIN_NAME: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    console.error(parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
