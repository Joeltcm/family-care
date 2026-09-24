import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ patientId: string; documentId: string }> }) {
  try {
    const { patientId, documentId } = await context.params;
    const metadataResponse = await callFamilyCareApi(
      request,
      `/v1/patients/${encodeURIComponent(patientId)}/healwave/documents/${encodeURIComponent(documentId)}`,
    );
    if (!metadataResponse.ok) {
      return new Response(await metadataResponse.text(), {
        status: metadataResponse.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
      });
    }
    const metadata = await metadataResponse.json() as { url: string; name?: string | null; content_type?: string | null };
    const documentResponse = await fetch(metadata.url, { signal: AbortSignal.timeout(20_000) });
    if (!documentResponse.ok || !documentResponse.body) return Response.json({ error: 'healwave_document_bytes_unavailable' }, { status: 502 });
    const title = metadata.name || 'documento-healwave';
    const safeTitle = title.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100) || 'documento-healwave';
    return new Response(documentResponse.body, {
      headers: {
        'content-type': metadata.content_type || documentResponse.headers.get('content-type') || 'application/octet-stream',
        ...(documentResponse.headers.get('content-length') ? { 'content-length': documentResponse.headers.get('content-length')! } : {}),
        'content-disposition': `inline; filename="${safeTitle}"; filename*=UTF-8''${encodeURIComponent(title)}`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return bridgeError(error);
  }
}
