/** Browser decoding respects EXIF orientation. Only optimized image bytes reach the upload API. */
export async function optimizePageImage(file: File): Promise<{ image: string; bytes: number; originalBytes: number }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024)
    throw new Error('Choose a JPEG, PNG or WebP photo up to 20 MB.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('This photograph could not be opened. Choose another image.');
  });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 60000000) throw new Error('Choose a photograph smaller than 60 megapixels.');
    let scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 5; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Image preparation is unavailable in this browser.');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare this photograph.'))), 'image/webp', 0.86 - attempt * 0.07)
      );
      if (blob.size <= 1000000) {
        const image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read the prepared photograph.'));
          reader.readAsDataURL(blob);
        });
        return { image, bytes: blob.size, originalBytes: file.size };
      }
      scale *= 0.75;
    }
    throw new Error('This image is still too large after compression. Choose a smaller photograph.');
  } finally {
    bitmap.close();
  }
}
