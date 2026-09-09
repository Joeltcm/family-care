import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { z } from 'zod';
import { requireCallerIdentity } from './auth.js';
import { capabilities, config } from './config.js';
import { checkDatabase, database } from './database.js';
import { renderClinicalRecord, renderShareGate } from './share-page.js';
import { buildHealwaveReadOnlyStatus } from './services/healwave.js';
import { bootstrapSession, IdentityConflictError } from './services/session.js';
import {
  createMedicalRecordShare,
  getMedicalShareGate,
  openMedicalRecordShare,
  revokeMedicalRecordShare,
  SharePermissionError,
  ShareUnavailableError,
} from './services/shares.js';

const app = Fastify({
  logger: {
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers.x-family-care-service-key',
      'req.headers.x-family-care-user-email',
      'req.headers.x-family-care-user-name',
      'body',
      'response.body',
    ],
  },
  bodyLimit: 1_048_576,
  trustProxy: true,
});

await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.get('/health', async (_request, reply) => {
  const storage = await checkDatabase();
  if (storage.configured && !storage.connected) return reply.code(503).send({ status: 'degraded', service: 'family-care-api', storage });
  return { status: 'ok', service: 'family-care-api', storage, time: new Date().toISOString() };
});

app.get('/v1/capabilities', async () => ({
  capabilities,
  healwave: buildHealwaveReadOnlyStatus(),
  safety: {
    clinicalDecisionSupport: false,
    medicationChanges: false,
    sosSimulation: config.SOS_SIMULATION_MODE,
  },
}));

app.get('/v1/demo/dashboard', async () => ({
  period: 2026,
  metrics: { appointments: 18, hospitalizations: 1, treatments: 4, specialists: 6 },
  disclaimer: 'Datos ficticios. No usar para decisiones médicas.',
}));

app.post('/v1/session/bootstrap', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;

  try {
    return await bootstrapSession(identity);
  } catch (error) {
    if (error instanceof IdentityConflictError) {
      return reply.code(409).send({ error: 'identity_conflict' });
    }
    throw error;
  }
});

const createShareSchema = z.object({
  patientId: z.string().uuid(),
  expiresInMinutes: z.union([z.literal(15), z.literal(60), z.literal(240), z.literal(1440)]),
});

app.post('/v1/shares', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const parsed = createShareSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_share_request' });
  try {
    return await createMedicalRecordShare(identity, parsed.data.patientId, parsed.data.expiresInMinutes);
  } catch (error) {
    if (error instanceof SharePermissionError) return reply.code(403).send({ error: error.message });
    if (error instanceof ShareUnavailableError) return reply.code(503).send({ error: error.message });
    throw error;
  }
});

app.delete('/v1/shares/:shareId', async (request, reply) => {
  const identity = requireCallerIdentity(request, reply);
  if (!identity) return;
  const parsed = z.object({ shareId: z.string().uuid() }).safeParse(request.params);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_share_id' });
  try {
    return await revokeMedicalRecordShare(identity, parsed.data.shareId);
  } catch (error) {
    if (error instanceof SharePermissionError) return reply.code(404).send({ error: error.message });
    if (error instanceof ShareUnavailableError) return reply.code(503).send({ error: error.message });
    throw error;
  }
});

const shareTokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const sharePinSchema = z.object({ pin: z.string().regex(/^\d{6}$/) });
const shareHeaders = {
  'cache-control': 'private, no-store, max-age=0',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex, nofollow, noarchive',
};

app.get('/share/:token', { logLevel: 'silent', config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
  const parsed = shareTokenSchema.safeParse(request.params);
  if (!parsed.success) return reply.code(404).headers(shareHeaders).type('text/html').send(renderShareGate(false));
  const gate = await getMedicalShareGate(parsed.data.token);
  return reply.headers(shareHeaders).type('text/html').send(renderShareGate(gate.available, gate.expiresAt));
});

app.post('/share/:token', { logLevel: 'silent', config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
  const token = shareTokenSchema.safeParse(request.params);
  const body = sharePinSchema.safeParse(request.body);
  if (!token.success || !body.success) return reply.code(400).headers(shareHeaders).type('text/html').send(renderShareGate(Boolean(token.success), undefined, 'PIN inválido.'));
  const result = await openMedicalRecordShare(token.data.token, body.data.pin);
  if (result.status === 'ok') return reply.headers(shareHeaders).type('text/html').send(renderClinicalRecord(result));
  if (result.status === 'invalid_pin') {
    const gate = await getMedicalShareGate(token.data.token);
    return reply.code(401).headers(shareHeaders).type('text/html').send(renderShareGate(gate.available, gate.expiresAt, 'PIN incorrecto.'));
  }
  return reply.code(410).headers(shareHeaders).type('text/html').send(renderShareGate(false));
});

const uploadIntentSchema = z.object({
  patientId: z.string().uuid(),
  category: z.enum(['lab', 'prescription', 'referral', 'insurance', 'clinical-note', 'other']),
  filename: z.string().min(1).max(180),
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
});

app.post('/v1/documents/upload-intent', async (request, reply) => {
  const parsed = uploadIntentSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_upload', issues: parsed.error.issues });
  if (!capabilities.objectStorage) return reply.code(503).send({ error: 'storage_not_configured', message: 'Configure R2 en Railway para habilitar cargas.' });
  return reply.code(501).send({ error: 'presigning_not_enabled', message: 'El adaptador R2 debe habilitarse después de configurar autenticación.' });
});

const sosSchema = z.object({ patientId: z.string().uuid(), locationConsent: z.boolean(), note: z.string().max(280).optional() });

app.post('/v1/emergency/events', async (request, reply) => {
  const parsed = sosSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'invalid_sos', issues: parsed.error.issues });
  if (config.SOS_SIMULATION_MODE) return reply.code(202).send({ mode: 'simulation', notified: 0, callsPlaced: 0 });
  if (!capabilities.realSos) return reply.code(503).send({ error: 'providers_not_configured' });
  return reply.code(501).send({ error: 'provider_adapter_pending' });
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error({ err: error }, 'request_failed');
  reply.code(500).send({ error: 'internal_error' });
});

await app.listen({ host: '0.0.0.0', port: config.PORT });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await database?.end();
    process.exit(0);
  });
}
