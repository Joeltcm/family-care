export type FamilyCareIdentity = {
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

export function getFamilyCareIdentity(request: Request): FamilyCareIdentity | null {
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

export async function callFamilyCareApi(request: Request, path: string, init: RequestInit = {}) {
  const apiUrl = process.env.FAMILY_CARE_API_URL;
  const serviceKey = process.env.FAMILY_CARE_SERVICE_KEY;
  const identity = getFamilyCareIdentity(request);
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
