import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),

    // Database Connections (least-privilege roles by default, NEVER superuser)
    DATABASE_URL: z
      .string()
      .min(10)
      .default('postgresql://app_api:api_dev_secret_change_me@127.0.0.1:5434/kardesler_db'),
    DATABASE_READONLY_URL: z
      .string()
      .min(10)
      .default('postgresql://app_readonly:readonly_dev_secret_change_me@127.0.0.1:5434/kardesler_db'),

    // Redis (optional in dev/test; falls back to in-memory rate limit & pub/sub)
    REDIS_URL: z.string().optional(),

    // Distinct Cryptographic Secrets (>= 32 chars required)
    JWT_CUSTOMER_SECRET: z
      .string()
      .min(32)
      .default('dev_customer_secret_key_change_me_in_production_12345'),
    JWT_STAFF_SECRET: z
      .string()
      .min(32)
      .default('dev_staff_secret_key_change_me_in_production_67890'),
    JWT_PRINT_SECRET: z
      .string()
      .min(32)
      .default('dev_print_agent_secret_key_change_me_production_abcde'),
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

    // App Store / Play Store Review Demo Account (Disabled by default, forbidden in prod unless explicitly enabled)
    ALLOW_REVIEW_DEMO_OTP: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    REVIEW_DEMO_PHONE: z.string().default('+905000000000'),
    REVIEW_DEMO_OTP_CODE: z.string().default('145300'),

    // CORS
    ADMIN_ORIGIN: z.string().default('http://localhost:5173'),
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
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse(rawEnv);
}

export const env: Env = parseEnv(process.env);
