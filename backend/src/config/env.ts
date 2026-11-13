import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

function loadDotEnvIfPresent(): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnvIfPresent();

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z
      .string()
      .min(10)
      .default('postgresql://app_api:api_dev_secret_change_me@127.0.0.1:5434/kardesler_db'),
    DATABASE_READONLY_URL: z
      .string()
      .min(10)
      .default('postgresql://app_readonly:readonly_dev_secret_change_me@127.0.0.1:5434/kardesler_db'),
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
    JWT_KEY_ID: z.string().min(2).default('k1'),
    JWT_PREVIOUS_KEY_ID: z.string().optional(),
    JWT_CUSTOMER_SECRET: z
      .string()
      .min(32)
      .default('dev_customer_secret_key_change_me_in_production_12345'),
    JWT_CUSTOMER_PREVIOUS_SECRET: z.string().min(32).optional(),
    JWT_STAFF_SECRET: z
      .string()
      .min(32)
      .default('dev_staff_secret_key_change_me_in_production_67890'),
    JWT_STAFF_PREVIOUS_SECRET: z.string().min(32).optional(),
    JWT_PRINT_SECRET: z
      .string()
      .min(32)
      .default('dev_print_agent_secret_key_change_me_production_abcde'),
    JWT_PRINT_PREVIOUS_SECRET: z.string().min(32).optional(),
    OTP_HMAC_SECRET: z
      .string()
      .min(32)
      .default('dev_otp_hmac_sha256_secret_key_change_me_in_prod_999'),
    TOTP_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
    WEBHOOK_HMAC_SECRET: z
      .string()
      .min(32)
      .default('dev_payment_webhook_hmac_secret_change_me_in_prod_777'),
    ALLOW_REVIEW_DEMO_OTP: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    REVIEW_DEMO_PHONE: z.string().default('+905000000000'),
    REVIEW_DEMO_OTP_CODE: z.string().default('145300'),
    ADMIN_ORIGIN: z.string().default('http://localhost:5173'),
    GOOGLE_CLIENT_IDS: z.string().default(''),
    GOOGLE_REDIRECT_URIS: z.string().default('kardesler://auth/google,http://localhost:8081/auth'),
    GOOGLE_WEB_CLIENT_SECRET: z.string().default(''),
    GOOGLE_TOKEN_ENDPOINT: z.string().url().default('https://oauth2.googleapis.com/token'),
    GOOGLE_JWKS_URI: z.string().url().default('https://www.googleapis.com/oauth2/v3/certs'),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production') {
      const secrets = [
        ['JWT_CUSTOMER_SECRET', val.JWT_CUSTOMER_SECRET],
        ['JWT_STAFF_SECRET', val.JWT_STAFF_SECRET],
        ['JWT_PRINT_SECRET', val.JWT_PRINT_SECRET],
        ['OTP_HMAC_SECRET', val.OTP_HMAC_SECRET],
        ['WEBHOOK_HMAC_SECRET', val.WEBHOOK_HMAC_SECRET],
      ] as const;

      for (const [name, value] of secrets) {
        if (value.startsWith('dev_') || value.includes('change_me')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: `${name} must not use a development default in production`,
          });
        }
      }

      if (val.DATABASE_URL.includes('postgres@') || val.DATABASE_URL.includes('postgres:')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL must never use the postgres superuser in production',
        });
      }

      if (!val.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'REDIS_URL is required in production',
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(rawEnv);
}

export const env: Env = parseEnv(process.env);
