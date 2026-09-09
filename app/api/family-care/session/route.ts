import type { FamilyCareSession } from '@/lib/family-care-session';
import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const response = await callFamilyCareApi(request, '/v1/session/bootstrap', { method: 'POST' });
    const payload = (await response.json()) as FamilyCareSession | { error: string };
    return Response.json(payload, {
      status: response.status,
      headers: { 'cache-control': 'private, no-store' },
    });
  } catch (error) {
    return bridgeError(error);
  }
}
