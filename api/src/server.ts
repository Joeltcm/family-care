import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { z } from 'zod';
import { capabilities, config } from './config.js';
import { buildHealwaveReadOnlyStatus } from './services/healwave.js';

const app = Fastify({
  logger: { redact: ['req.headers.authorization', 'req.headers.cookie', 'body', 'response.body'] },
  bodyLimit: 1_048_576,
  trustProxy: true,
});

await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.get('/health', async () => ({ status: 'ok', service: 'family-care-api', time: new Date().toISOString() }));

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
