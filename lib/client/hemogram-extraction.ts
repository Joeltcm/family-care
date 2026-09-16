'use client';

const analysisMimeType = 'image/jpeg';

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
  const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdf.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const page = await document.getPage(1);
    const initial = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, 2400 / Math.max(initial.width, initial.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('analysis_image_unavailable');
    await page.render({ canvasContext: context, viewport }).promise;
    return canvasBlob(canvas);
  } finally {
    await document.destroy();
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
