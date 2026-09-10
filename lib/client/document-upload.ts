'use client';

type UploadCategory = 'lab' | 'prescription' | 'referral' | 'insurance' | 'clinical_note' | 'discharge' | 'other';

const acceptedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function optimizedImage(file: File) {
  if (!file.type.startsWith('image/')) return null;
  try {
    const bitmap = await createImageBitmap(file);
    try {
    const maximum = 2200;
    const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas, 'image/webp', 0.82);
    if (!blob || blob.size >= file.size * 0.88) return null;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
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
  const optimized = await optimizedImage(input.file);
  const body = new FormData();
  body.set('patientId', input.patientId);
  body.set('category', input.category);
  body.set('title', input.title);
  if (input.capturedAt) body.set('capturedAt', input.capturedAt);
  body.set('original', input.file);
  if (optimized) body.set('optimized', optimized);
  const response = await fetch('/api/family-care/documents', { method: 'POST', body });
  const payload = await response.json().catch(() => ({})) as { id?: string; error?: string };
  if (!response.ok || !payload.id) throw new Error(payload.error || 'document_upload_failed');
  return {
    id: payload.id,
    originalBytes: input.file.size,
    optimizedBytes: optimized?.size ?? null,
  };
}
