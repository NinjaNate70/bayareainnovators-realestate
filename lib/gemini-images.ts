import { setTimeout as delay } from 'node:timers/promises';

const geminiOrigin = 'https://generativelanguage.googleapis.com';
// Base64 expands the bytes by one third. Reserve space in the 20 MB inline request for the prompt and JSON.
const maxInlineBytes = 14_000_000;
export type GeminiImage = { data: Blob; contentType: string };
type ImagePart = { inlineData: { mimeType: string; data: string } } | { fileData: { mimeType: string; fileUri: string } };
type UploadedFile = { name?: string; uri?: string; state?: string };

async function temporaryFile(image: GeminiImage, apiKey: string, files: Set<string>, signal: AbortSignal): Promise<ImagePart> {
  const name = `files/${crypto.randomUUID()}`;
  files.add(name);
  const headers = { 'x-goog-api-key': apiKey };
  const start = await fetch(`${geminiOrigin}/upload/v1beta/files`, {
    method: 'POST', signal, redirect: 'error',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(image.data.size),
      'X-Goog-Upload-Header-Content-Type': image.contentType,
    },
    body: JSON.stringify({ file: { name, displayName: 'Tenant Shield inspection photo' } }),
  });
  const uploadUrl = start.headers.get('X-Goog-Upload-URL');
  if (!start.ok || !uploadUrl || new URL(uploadUrl).origin !== geminiOrigin) throw new Error('Gemini did not open an upload session.');

  const uploaded = await fetch(uploadUrl, {
    method: 'POST', signal, redirect: 'error',
    headers: {
      'Content-Length': String(image.data.size),
      'Content-Type': image.contentType,
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: image.data,
  });
  if (!uploaded.ok) throw new Error(`Gemini upload failed (${uploaded.status}).`);
  let { file }: { file?: UploadedFile } = await uploaded.json();
  if (!file?.name || !/^files\/[a-z0-9-]{1,40}$/.test(file.name)) throw new Error('Gemini returned an invalid file name.');
  const fileName = file.name;
  files.add(fileName);

  while (file?.state === 'PROCESSING') {
    await delay(750, undefined, { signal });
    const status = await fetch(`${geminiOrigin}/v1beta/${fileName}`, { headers, signal, cache: 'no-store' });
    if (!status.ok) throw new Error(`Gemini file status failed (${status.status}).`);
    file = await status.json();
  }
  if (!file?.uri || file.state === 'FAILED') throw new Error('Gemini could not process an uploaded photo.');
  return { fileData: { mimeType: image.contentType, fileUri: file.uri } };
}

export async function withGeminiImages<T>(apiKey: string, images: [GeminiImage, GeminiImage], assess: (parts: ImagePart[], signal: AbortSignal) => Promise<T>) {
  const signal = AbortSignal.timeout(45_000);
  if (images[0].data.size + images[1].data.size <= maxInlineBytes) {
    const parts = await Promise.all(images.map(async ({ data, contentType }) => ({
      inlineData: { mimeType: contentType, data: Buffer.from(await data.arrayBuffer()).toString('base64') },
    })));
    return assess(parts, signal);
  }

  const files = new Set<string>();
  try {
    const results = await Promise.allSettled(images.map((image) => temporaryFile(image, apiKey, files, signal)));
    return await assess(results.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    }), signal);
  } finally {
    await Promise.allSettled([...files].map(async (file) => {
      const deleted = await fetch(`${geminiOrigin}/v1beta/${file}`, {
        method: 'DELETE', signal: AbortSignal.timeout(3_000), headers: { 'x-goog-api-key': apiKey },
      });
      if (!deleted.ok && deleted.status !== 404) throw new Error('Gemini file cleanup failed.');
    })).then((results) => {
      if (results.some((result) => result.status === 'rejected')) console.warn('A temporary Gemini image could not be deleted.');
    });
  }
}
