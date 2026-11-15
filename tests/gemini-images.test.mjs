import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withGeminiImages } from '../lib/gemini-images.ts';

test('small photo pairs stay inline and preserve their order and MIME type', async () => {
  const first = { data: new Blob(['before']), contentType: 'image/heic' };
  const second = { data: new Blob(['after']), contentType: 'image/jpeg' };
  await withGeminiImages('test-only', [first, second], async (parts) => {
    assert.deepEqual(parts.map(({ inlineData }) => [inlineData.mimeType, Buffer.from(inlineData.data, 'base64').toString()]), [
      ['image/heic', 'before'], ['image/jpeg', 'after'],
    ]);
  });
});

test('large photo pairs use the Gemini Files API and clean up after a failed assessment', async (t) => {
  const uploaded = new Set();
  const removed = new Set();
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    const path = new URL(url).pathname;
    if (path === '/upload/v1beta/files') {
      const { file } = JSON.parse(request.body);
      return new Response(null, { headers: { 'X-Goog-Upload-URL': `https://generativelanguage.googleapis.com/session?id=${file.name}` } });
    }
    if (path === '/session') {
      assert.equal(request.headers['X-Goog-Upload-Command'], 'upload, finalize');
      const name = new URL(url).searchParams.get('id');
      uploaded.add(name);
      return Response.json({ file: { name, uri: `https://generativelanguage.googleapis.com/v1beta/${name}`, state: 'ACTIVE' } });
    }
    assert.equal(request.method, 'DELETE');
    removed.add(path.replace('/v1beta/', ''));
    return new Response(null, { status: 204 });
  });
  const image = { data: new Blob([new Uint8Array(8_000_000)]), contentType: 'image/jpeg' };
  await assert.rejects(withGeminiImages('test-only', [image, image], async (parts) => {
    assert.equal(parts.length, 2);
    assert.ok(parts.every((part) => part.fileData.fileUri.startsWith('https://generativelanguage.googleapis.com/v1beta/files/')));
    throw new Error('Assessment interrupted');
  }), /Assessment interrupted/);
  assert.equal(uploaded.size, 2);
  assert.deepEqual(removed, uploaded);
});
