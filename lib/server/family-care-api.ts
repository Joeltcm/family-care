import { createRemoteJWKSet, jwtVerify } from 'jose';

export type FamilyCareIdentity = {
  subject: string;
  email: string;
  displayName: string;
};

const accessKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function decodeDisplayName(request: Request, fallback: string) {
  const encoded = request.headers.get('oai-authenticated-user-full-name');
  const encoding = request.headers.get('oai-authenticated-user-full-name-encoding');
  if (!encoded || encoding !== 'percent-encoded-utf-8') return fallback;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return fallback;
  }
}

function getOpenAiIdentity(request: Request): FamilyCareIdentity | null {
  let subject = request.headers.get('oai-authenticated-user-id');
  let email = request.headers.get('oai-authenticated-user-email');
  let displayName = email?.split('@')[0] ?? '';

  if (process.env.NODE_ENV !== 'production' && process.env.FAMILY_CARE_DEV_USER_ID && process.env.FAMILY_CARE_DEV_USER_EMAIL) {
    subject ||= process.env.FAMILY_CARE_DEV_USER_ID;
    email ||= process.env.FAMILY_CARE_DEV_USER_EMAIL;
    displayName = process.env.FAMILY_CARE_DEV_USER_NAME || displayName;
  } else if (email) {
    displayName = decodeDisplayName(request, displayName);
  }
  return subject && email ? { subject, email, displayName } : null;
}

async function getCloudflareAccessIdentity(request: Request): Promise<FamilyCareIdentity | null> {
  const assertion = request.headers.get('cf-access-jwt-assertion');
  const configuredDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = process.env.CF_ACCESS_AUD;
  if (!assertion || !configuredDomain || !audience) return null;

  const teamDomain = configuredDomain.startsWith('https://')
    ? configuredDomain.replace(/\/$/, '')
    : `https://${configuredDomain.replace(/\/$/, '')}`;
  let keySet = accessKeySets.get(teamDomain);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    accessKeySets.set(teamDomain, keySet);
  }

  try {
    const { payload } = await jwtVerify(assertion, keySet, {
      issuer: teamDomain,
      audience,
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    const email = payload.email.toLowerCase();
    const displayName = typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim()
      : email.split('@')[0];
    return { subject: `cloudflare:${payload.sub}`, email, displayName };
  } catch {
    return null;
  }
}

export async function getFamilyCareIdentity(request: Request): Promise<FamilyCareIdentity | null> {
  return getOpenAiIdentity(request) || await getCloudflareAccessIdentity(request);
}

export async function callFamilyCareApi(request: Request, path: string, init: RequestInit = {}) {
  const apiUrl = process.env.FAMILY_CARE_API_URL;
  const serviceKey = process.env.FAMILY_CARE_SERVICE_KEY;
  const identity = await getFamilyCareIdentity(request);
  if (!identity) throw new Error('authentication_required');
  if (!apiUrl || !serviceKey) throw new Error('identity_bridge_not_configured');

  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('x-family-care-service-key', serviceKey);
  headers.set('x-family-care-user-id', identity.subject);
  headers.set('x-family-care-user-email', identity.email);
  headers.set('x-family-care-user-name', identity.displayName);
  return fetch(new URL(path, apiUrl), {
    ...init,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
}

export function bridgeError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'authentication_required') return Response.json({ error: message }, { status: 401 });
  if (message === 'identity_bridge_not_configured') return Response.json({ error: message }, { status: 503 });
  return Response.json({ error: 'identity_service_unreachable' }, { status: 503 });
}
