'use client';

import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

const analysisMimeType = 'image/jpeg';

// Vite must emit the PDF.js worker as an application asset. Without an explicit
// URL, PDF.js attempts to infer it from the current bundle and PDF uploads fail
// before the information can be sent for transcription.
let workerConfigured = false;

async function pdfLibrary() {
  const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!workerConfigured) {
    pdf.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    workerConfigured = true;
  }
  return pdf;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, analysisMimeType, 0.92));
}

async function imageFromFile(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const maximum = 2400;
    const scale = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('analysis_image_unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvasBlob(canvas);
  } finally {
    bitmap.close();
  }
}

async function imageFromPdf(file: File) {
  const pdf = await pdfLibrary();
  const pdfDocument = await pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const page = await pdfDocument.getPage(1);
    const initial = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, 2400 / Math.max(initial.width, initial.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('analysis_image_unavailable');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return canvasBlob(canvas);
  } finally {
    await pdfDocument.destroy();
  }
}

async function dataBase64(blob: Blob) {
  const source = await blob.arrayBuffer();
  const bytes = new Uint8Array(source);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function prepareHemogramExtractionImage(file: File) {
  const image = file.type === 'application/pdf' ? await imageFromPdf(file) : await imageFromFile(file);
  if (!image || image.size > 4 * 1024 * 1024) throw new Error('analysis_image_too_large');
  return { mimeType: analysisMimeType, base64: await dataBase64(image) };
}
