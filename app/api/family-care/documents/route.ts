import { env } from 'cloudflare:workers';
import { bridgeError, callFamilyCareApi } from '@/lib/server/family-care-api';

export const dynamic = 'force-dynamic';

const categories = new Set(['lab', 'prescription', 'referral', 'insurance', 'clinical_note', 'discharge', 'other']);
const contentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bucket() {
  return (env as unknown as { MEDICAL_FILES?: R2Bucket }).MEDICAL_FILES;
}

async function digest(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'invalid_origin' }, { status: 403 });
  const storage = bucket();
  if (!storage) return Response.json({ error: 'storage_not_configured' }, { status: 503 });
  const written: string[] = [];
  try {
    const form = await request.formData();
    const patientId = String(form.get('patientId') || '');
    const category = String(form.get('category') || '');
    const title = String(form.get('title') || '').trim();
    const capturedAt = String(form.get('capturedAt') || '') || null;
    const original = form.get('original');
    const optimized = form.get('optimized');
    if (!uuid.test(patientId) || !categories.has(category) || title.length < 2 || title.length > 180 || !(original instanceof File)) {
      return Response.json({ error: 'invalid_document' }, { status: 400 });
    }
    const files = [
      { file: original, variant: 'original' as const },
      ...(optimized instanceof File ? [{ file: optimized, variant: 'optimized' as const }] : []),
    ];
    if (files.some(({ file }) => !contentTypes.has(file.type) || file.size < 1 || file.size > 25 * 1024 * 1024)) {
      return Response.json({ error: 'invalid_document_file' }, { status: 400 });
    }
    const prepared = [];
    for (const item of files) {
      const data = await item.file.arrayBuffer();
      prepared.push({ ...item, data, sha256: await digest(data) });
    }
    const uploadId = prepared.find((item) => item.variant === 'original')!.sha256;
    const versions = [];
    for (const { file, variant, data, sha256 } of prepared) {
      const objectKey = `medical/${patientId}/${uploadId}/${variant}`;
      await storage.put(objectKey, data, {
        httpMetadata: { contentType: file.type },
        customMetadata: { sha256, variant },
      });
      written.push(objectKey);
      versions.push({ objectKey, contentType: file.type, sizeBytes: file.size, sha256, variant });
    }
    const response = await callFamilyCareApi(request, `/v1/patients/${encodeURIComponent(patientId)}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category, title, capturedAt, versions }),
    });
    if (!response.ok) {
      await Promise.all(written.map((key) => storage.delete(key)));
    }
    return new Response(await response.text(), { status: response.status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
  } catch (error) {
    await Promise.all(written.map((key) => storage.delete(key).catch(() => undefined)));
    return bridgeError(error);
  }
}
