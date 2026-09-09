import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, context: { params: Promise<{ shareId: string }> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'invalid_origin' }, { status: 403 });
  }
  try {
    const { shareId } = await context.params;
    const response = await callFamilyCareApi(request, '/v1/shares/' + encodeURIComponent(shareId), { method: 'DELETE' });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  } catch (error) {
    return bridgeError(error);
  }
}
