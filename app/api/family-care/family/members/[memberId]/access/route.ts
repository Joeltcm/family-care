import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ memberId: string }> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const { memberId } = await context.params;
    const response = await callFamilyCareApi(request, `/v1/family/members/${encodeURIComponent(memberId)}/access`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await request.json()),
    });
    return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
  } catch (error) {
    return bridgeError(error);
  }
}
