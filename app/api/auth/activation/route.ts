import { callFamilyCareAuthApi, sessionCookie } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'invalid_origin' }, { status: 403 });
  }
  try {
    const response = await callFamilyCareAuthApi(request, '/v1/auth/activate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await request.json()),
    });
    const payload = await response.json() as { token?: string; expiresAt?: string; error?: string };
    const headers = new Headers({ 'cache-control': 'private, no-store' });
    if (response.ok && payload.token && payload.expiresAt) {
      headers.set('set-cookie', sessionCookie(payload.token, payload.expiresAt, request));
      return Response.json({ authenticated: true }, { headers });
    }
    return Response.json({ error: payload.error || 'activation_failed' }, { status: response.status, headers });
  } catch {
    return Response.json({ error: 'identity_service_unreachable' }, { status: 503 });
  }
}
