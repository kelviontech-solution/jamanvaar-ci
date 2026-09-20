import type { Response } from 'express';

/**
 * Always a download with a fixed, whitelisted type: an uploaded file can never be rendered as a page
 * from the API's origin, whatever its name or content claims.
 */
export function sendAttachment(res: Response, file: { fileName: string; mimeType: string; data: Uint8Array }) {
  const safeName = file.fileName.replace(/[^\w.\- ]+/g, '_');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.status(200).end(Buffer.from(file.data));
}
