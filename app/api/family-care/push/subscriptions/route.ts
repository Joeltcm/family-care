import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

async function forward(request: Request, method: 'POST' | 'DELETE') {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const response = await callFamilyCareApi(request, '/v1/push/subscriptions', {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(await request.json()),
    });
    return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
  } catch (error) {
    return bridgeError(error);
  }
}

export async function POST(request: Request) { return forward(request, 'POST'); }
export async function DELETE(request: Request) { return forward(request, 'DELETE'); }
