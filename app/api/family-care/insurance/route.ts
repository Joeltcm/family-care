import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { const response = await callFamilyCareApi(request, '/v1/insurance'); return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } }); }
  catch (error) { return bridgeError(error); }
}
