export type UploadedTextEncoding = 'utf-8' | 'windows-1254';

export function decodeUploadedText(bytes: ArrayBuffer | Uint8Array): { text: string; encoding: UploadedTextEncoding } {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(data), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1254').decode(data), encoding: 'windows-1254' };
  }
}

export async function normalizeSekonicPreviewRequest(request: Request): Promise<Request> {
  if (request.method !== 'POST') return request;
  const url = new URL(request.url);
  if (!/^\/api\/exams\/[^/]+\/preview-file$/.test(url.pathname)) return request;

  const form = await request.clone().formData();
  const file = form.get('file');
  if (!(file instanceof File)) return request;

  const bytes = await file.arrayBuffer();
  const decoded = decodeUploadedText(bytes);
  if (decoded.encoding === 'utf-8') return request;

  const normalizedFile = new File(
    [new TextEncoder().encode(decoded.text)],
    file.name,
    { type: file.type || 'text/plain', lastModified: file.lastModified },
  );
  form.set('file', normalizedFile);

  const headers = new Headers(request.headers);
  headers.delete('content-type');
  headers.delete('content-length');

  return new Request(request.url, {
    method: request.method,
    headers,
    body: form,
    redirect: request.redirect,
  });
}
