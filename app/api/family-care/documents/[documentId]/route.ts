import { env } from 'cloudflare:workers';
import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await context.params;
    const variant = new URL(request.url).searchParams.get('variant') === 'original' ? 'original' : 'optimized';
    const metadataResponse = await callFamilyCareApi(request, `/v1/documents/${encodeURIComponent(documentId)}/download?variant=${variant}`);
    if (!metadataResponse.ok) return new Response(await metadataResponse.text(), { status: metadataResponse.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
    const metadata = await metadataResponse.json() as { title: string; objectKey: string; contentType: string; sizeBytes: number };
    const storage = (env as unknown as { MEDICAL_FILES?: R2Bucket }).MEDICAL_FILES;
    if (!storage) return Response.json({ error: 'storage_not_configured' }, { status: 503 });
    const object = await storage.get(metadata.objectKey);
    if (!object) return Response.json({ error: 'document_bytes_not_found' }, { status: 404 });
    const safeTitle = metadata.title.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100) || 'documento';
    return new Response(object.body, {
      headers: {
        'content-type': metadata.contentType,
        'content-length': String(metadata.sizeBytes),
        'content-disposition': `inline; filename="${safeTitle}"; filename*=UTF-8''${encodeURIComponent(metadata.title)}`,
        'cache-control': 'private, no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return bridgeError(error);
  }
}
