'use client';

type UploadCategory = 'lab' | 'prescription' | 'referral' | 'insurance' | 'clinical_note' | 'discharge' | 'other';

const acceptedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

type PreparedDocument = {
  file: File;
  contentEncoding?: 'gzip';
  sourceBytes: number;
  compressed: boolean;
};

async function compressImage(file: File): Promise<PreparedDocument> {
  if (!file.type.startsWith('image/')) return { file, sourceBytes: file.size, compressed: false };
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const maximum = 2000;
      const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('image_canvas_unavailable');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas, 'image/webp', 0.78);
      if (!blob || blob.size >= file.size * 0.92) return { file, sourceBytes: file.size, compressed: false };
      return {
        file: new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' }),
        sourceBytes: file.size,
        compressed: true,
      };
    } finally {
      bitmap.close();
    }
  } catch {
    return { file, sourceBytes: file.size, compressed: false };
  }
}

async function compressPdf(file: File): Promise<PreparedDocument> {
  // PDFs usually already contain compressed images. Gzip is lossless and is
  // retained only when it produces a meaningful saving; the download route
  // transparently restores the original PDF using Content-Encoding.
  if (typeof CompressionStream === 'undefined') return { file, sourceBytes: file.size, compressed: false };
  try {
    const compressed = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    if (compressed.size >= file.size * 0.92) return { file, sourceBytes: file.size, compressed: false };
    return {
      file: new File([compressed], file.name, { type: file.type }),
      contentEncoding: 'gzip',
      sourceBytes: file.size,
      compressed: true,
    };
  } catch {
    return { file, sourceBytes: file.size, compressed: false };
  }
}

async function prepareDocument(file: File): Promise<PreparedDocument> {
  return file.type === 'application/pdf' ? compressPdf(file) : compressImage(file);
}

export async function uploadClinicalDocument(input: {
  patientId: string;
  category: UploadCategory;
  title: string;
  capturedAt: string | null;
  file: File;
}) {
  if (!acceptedTypes.has(input.file.type)) throw new Error('unsupported_file_type');
  if (input.file.size > 25 * 1024 * 1024) throw new Error('file_too_large');
  const prepared = await prepareDocument(input.file);
  const body = new FormData();
  body.set('patientId', input.patientId);
  body.set('category', input.category);
  body.set('title', input.title);
  if (input.capturedAt) body.set('capturedAt', input.capturedAt);
  body.set('original', prepared.file);
  if (prepared.contentEncoding) body.set('originalContentEncoding', prepared.contentEncoding);
  const response = await fetch('/api/family-care/documents', { method: 'POST', body });
  const payload = await response.json().catch(() => ({})) as { id?: string; error?: string };
  if (!response.ok || !payload.id) throw new Error(payload.error || 'document_upload_failed');
  return {
    id: payload.id,
    sourceBytes: prepared.sourceBytes,
    storedBytes: prepared.file.size,
    compressed: prepared.compressed,
  };
}
