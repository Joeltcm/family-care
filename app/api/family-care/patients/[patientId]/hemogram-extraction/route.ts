import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const { patientId } = await params;
    const response = await callFamilyCareApi(request, `/v1/patients/${encodeURIComponent(patientId)}/hemogram-extraction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: await request.text(),
    });
    return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
  } catch (error) {
    return bridgeError(error);
  }
}
