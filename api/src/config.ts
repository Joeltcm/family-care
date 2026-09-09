import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url().optional(),
  APP_ORIGIN: z.string().default('http://localhost:3000'),
  FAMILY_CARE_SERVICE_KEY: z.string().min(32).optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_ENABLED: z.string().default('false').transform((value) => value === 'true'),
  HEALWAVE_READONLY_ENABLED: z.string().default('false').transform((value) => value === 'true'),
  HEALWAVE_READONLY_DATABASE_URL: z.string().url().optional(),
  SOS_SIMULATION_MODE: z.string().default('true').transform((value) => value !== 'false'),
  PUSH_PROVIDER: z.string().optional(),
  CALL_PROVIDER: z.string().optional(),
});

export const config = envSchema.parse(process.env);

export const capabilities = {
  database: Boolean(config.DATABASE_URL),
  authenticatedProfiles: Boolean(config.DATABASE_URL && config.FAMILY_CARE_SERVICE_KEY),
  objectStorage: Boolean(config.R2_ACCOUNT_ID && config.R2_BUCKET && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY),
  deidentifiedAi: Boolean(config.DEEPSEEK_ENABLED && config.DEEPSEEK_API_KEY),
  healwaveReadOnly: Boolean(config.HEALWAVE_READONLY_ENABLED && config.HEALWAVE_READONLY_DATABASE_URL),
  realSos: !config.SOS_SIMULATION_MODE && Boolean(config.PUSH_PROVIDER && config.CALL_PROVIDER),
};
