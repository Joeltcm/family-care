import { callFamilyCareAuthApi, clearSessionCookie, getPasswordSessionToken } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const passwordToken = getPasswordSessionToken(request);
  if (passwordToken) {
    try {
      await callFamilyCareAuthApi(request, '/v1/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${passwordToken}` } });
    } catch { /* The local cookie is still cleared if the API is temporarily unavailable. */ }
    return new Response(null, {
      status: 302,
      headers: { location: '/login', 'set-cookie': clearSessionCookie(request), 'cache-control': 'no-store' },
    });
  }
  const cloudflareAccess = request.headers.has('cf-access-jwt-assertion');
  const destination = cloudflareAccess
    ? new URL('/cdn-cgi/access/logout', request.url)
    : new URL('/signout-with-chatgpt?return_to=/', request.url);
  return Response.redirect(destination, 302);
}
