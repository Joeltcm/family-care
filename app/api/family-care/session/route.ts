import type { FamilyCareSession } from '@/lib/family-care-session';

export const dynamic = 'force-dynamic';

type Identity = {
  subject: string;
  email: string;
  displayName: string;
};

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

function getIdentity(request: Request): Identity | null {
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

export async function POST(request: Request) {
  const apiUrl = process.env.FAMILY_CARE_API_URL;
  const serviceKey = process.env.FAMILY_CARE_SERVICE_KEY;
  const identity = getIdentity(request);

  if (!identity) return Response.json({ error: 'authentication_required' }, { status: 401 });
  if (!apiUrl || !serviceKey) return Response.json({ error: 'identity_bridge_not_configured' }, { status: 503 });

  try {
    const response = await fetch(new URL('/v1/session/bootstrap', apiUrl), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'x-family-care-service-key': serviceKey,
        'x-family-care-user-id': identity.subject,
        'x-family-care-user-email': identity.email,
        'x-family-care-user-name': identity.displayName,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const payload = (await response.json()) as FamilyCareSession | { error: string };
    return Response.json(payload, {
      status: response.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch {
    return Response.json({ error: 'identity_service_unreachable' }, { status: 503 });
  }
}
