import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ patientId: string }> }) {
  try {
    const { patientId } = await context.params;
    const response = await callFamilyCareApi(request, `/v1/patients/${encodeURIComponent(patientId)}/care-plan`);
    return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
  } catch (error) {
    return bridgeError(error);
  }
}
