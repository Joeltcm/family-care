import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ invitationId: string }> }) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  const { invitationId } = await context.params;
  try {
    const response = await callFamilyCareApi(request, `/v1/family/invitations/${encodeURIComponent(invitationId)}/activation`, { method: 'POST' });
    return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
  } catch (error) { return bridgeError(error); }
}
