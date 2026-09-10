import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url().optional(),
  APP_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_API_URL: z.string().url().optional(),
  FAMILY_CARE_SERVICE_KEY: z.string().min(32).optional(),
  FAMILY_CARE_OWNER_LEGAL_NAME: z.string().min(2).max(160).optional(),
  FAMILY_CARE_SPOUSE_LEGAL_NAME: z.string().min(2).max(160).optional(),
  FAMILY_CARE_CHILD_LEGAL_NAME: z.string().min(2).max(160).optional(),
  FAMILY_CARE_SPOUSE_EMAIL: z.string().email().optional(),
  FAMILY_CARE_CHILD_EMAIL: z.string().email().optional(),
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
  VAPID_PUBLIC_KEY: z.string().min(40).optional(),
  VAPID_PRIVATE_KEY: z.string().min(30).optional(),
  VAPID_SUBJECT: z.string().default('mailto:family-care@example.com'),
  CALL_PROVIDER: z.string().optional(),
  FIELD_ENCRYPTION_KEY: z.string().min(40).optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
});

export const config = envSchema.parse(process.env);

export const capabilities = {
  database: Boolean(config.DATABASE_URL),
  authenticatedProfiles: Boolean(config.DATABASE_URL && config.FAMILY_CARE_SERVICE_KEY),
  temporaryMedicalShares: Boolean(config.DATABASE_URL && config.FAMILY_CARE_SERVICE_KEY && config.PUBLIC_API_URL),
  objectStorage: Boolean(config.R2_ACCOUNT_ID && config.R2_BUCKET && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY),
  deidentifiedAi: Boolean(config.DEEPSEEK_ENABLED && config.DEEPSEEK_API_KEY),
  healwaveReadOnly: Boolean(config.HEALWAVE_READONLY_ENABLED && config.HEALWAVE_READONLY_DATABASE_URL),
  pushNotifications: Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY),
  insuranceVault: Boolean(config.FIELD_ENCRYPTION_KEY),
  realSos: !config.SOS_SIMULATION_MODE && Boolean(
    config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY
    && config.CALL_PROVIDER === 'twilio'
    && config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM_NUMBER,
  ),
};
