import { ServiceUnavailableException } from '@nestjs/common';

/** Keep provider calls shorter than the database transaction budget, including body transfer. */
export async function upstreamJson(url: string, init: RequestInit, timeoutMs = 8000): Promise<{ response: Response; body: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json();
    return { response, body };
  } catch {
    // A lost POST response is not proof the provider rejected the operation.
    throw new ServiceUnavailableException({ message: 'The payment provider did not complete the request. Check payment status before trying again.', code: init.method === 'POST' ? 'UPSTREAM_RESULT_UNKNOWN' : 'UPSTREAM_UNAVAILABLE' });
  } finally { clearTimeout(timer); }
}
