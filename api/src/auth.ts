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
  if (!candidate) return false;
  const received = Buffer.from(candidate);
  return [config.FAMILY_CARE_SERVICE_KEY, config.FAMILY_CARE_CLOUDFLARE_SERVICE_KEY]
    .filter((value): value is string => Boolean(value))
    .some((value) => {
      const expected = Buffer.from(value);
      return expected.length === received.length && timingSafeEqual(expected, received);
    });
}

export function requireServiceBridge(request: FastifyRequest, reply: FastifyReply) {
  if (!config.FAMILY_CARE_SERVICE_KEY && !config.FAMILY_CARE_CLOUDFLARE_SERVICE_KEY) {
    reply.code(503).send({ error: 'identity_bridge_not_configured' });
    return false;
  }
  if (!matchesServiceKey(header(request, 'x-family-care-service-key'))) {
    reply.code(401).send({ error: 'unauthorized' });
    return false;
  }
  return true;
}

export function requireCallerIdentity(request: FastifyRequest, reply: FastifyReply): CallerIdentity | null {
  if (!requireServiceBridge(request, reply)) return null;

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
