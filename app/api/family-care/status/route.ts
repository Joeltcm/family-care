export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.FAMILY_CARE_API_URL;
  if (!apiUrl) return Response.json({ connected: false, reason: 'not_configured' }, { status: 503 });

  try {
    const response = await fetch(new URL('/health', apiUrl), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return Response.json({ connected: false, reason: 'unhealthy' }, { status: 503 });
    return Response.json({ connected: true });
  } catch {
    return Response.json({ connected: false, reason: 'unreachable' }, { status: 503 });
  }
}
