import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  try { const response = await callFamilyCareApi(request, '/v1/emergency/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await request.json()) }); return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } }); }
  catch (error) { return bridgeError(error); }
}
