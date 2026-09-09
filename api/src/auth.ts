import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from './config.js';

const identitySchema = z.object({
  subject: z.string().min(8).max(200),
  email: z.string().email().max(254),
  displayName: z.string().min(1).max(120),
});

export type CallerIdentity = z.infer<typeof identitySchema>;

function header(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function matchesServiceKey(candidate: string | undefined) {
  if (!candidate || !config.FAMILY_CARE_SERVICE_KEY) return false;
  const expected = Buffer.from(config.FAMILY_CARE_SERVICE_KEY);
  const received = Buffer.from(candidate);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function requireCallerIdentity(request: FastifyRequest, reply: FastifyReply): CallerIdentity | null {
  if (!config.FAMILY_CARE_SERVICE_KEY) {
    reply.code(503).send({ error: 'identity_bridge_not_configured' });
    return null;
  }

  if (!matchesServiceKey(header(request, 'x-family-care-service-key'))) {
    reply.code(401).send({ error: 'unauthorized' });
    return null;
  }

  const email = header(request, 'x-family-care-user-email');
  const parsed = identitySchema.safeParse({
    subject: header(request, 'x-family-care-user-id'),
    email,
    displayName: header(request, 'x-family-care-user-name') || email?.split('@')[0],
  });

  if (!parsed.success) {
    reply.code(401).send({ error: 'invalid_identity' });
    return null;
  }

  return parsed.data;
}
