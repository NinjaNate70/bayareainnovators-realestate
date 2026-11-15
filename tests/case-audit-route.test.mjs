import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import sharp from 'sharp';

// Resolve the app's TypeScript aliases when loading a route directly in Node.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      return next(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return next(specifier, context);
  },
});
const { POST } = await import('../app/api/cases/audit/route.ts');
hooks.deregister();

test('the audit sends both resized photos when their stored originals exceed the photo budget', async (t) => {
  const userId = 'audit-test-user';
  const caseId = '20646de5-2bd9-42a5-86d1-f9600f950a1b';
  const photos = await sharp({
    create: { width: 2600, height: 1100, channels: 3, background: '#848079' },
  }).png({ compressionLevel: 0 }).withMetadata({ orientation: 6 }).toBuffer();
  assert.ok(photos.length < 10 * 1024 * 1024);
  assert.ok(photos.length * 2 > 12 * 1024 * 1024);

  const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
  const evidence = [
    { source_id: 'P1', name: 'before.png', kind: 'before', type: 'image/png', bucket: 'photos' },
    { source_id: 'P2', name: 'after.png', kind: 'after', type: 'image/png', bucket: 'photos' },
    { source_id: 'P3', name: 'unreadable.jpg', kind: 'after', type: 'image/jpeg', bucket: 'photos' },
    { source_id: 'D1', name: 'letter.pdf', kind: 'letter', type: 'application/pdf', bucket: 'documents' },
  ].map((file) => ({ ...file, path: `${userId}/${caseId}/${file.name}` }));
  const row = {
    address: '12 Oak St, CA',
    deposit_cents: 180000,
    returned_cents: 140000,
    charges: [{ source_id: 'C1', name: 'Paint', room: 'Bedroom', amount_cents: 40000 }],
    photo_pairs: { C1: { before: 'P1', after: 'P2' } },
    evidence,
  };
  const replies = {
    '/auth/v1/user': Response.json({ id: userId, aud: 'authenticated' }),
    '/rest/v1/cases': Response.json([row]),
    '/rest/v1/inspection_comparisons': Response.json([]),
  };

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    GEMINI_API_KEY: 'test-gemini-key',
    ANTHROPIC_API_KEY: '',
  };
  for (const [name, value] of Object.entries(env)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }

  const modelCalls = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.origin === env.NEXT_PUBLIC_SUPABASE_URL) {
      assert.equal(options?.method ?? 'GET', 'GET');
      const reply = replies[url.pathname];
      if (reply) return reply.clone();
      const file = evidence.find(({ bucket, path }) => url.pathname === `/storage/v1/object/${bucket}/${path}`);
      assert.ok(file, url.pathname);
      const bytes = file.kind === 'letter' ? pdf
        : file.source_id === 'P3' ? Buffer.from('corrupt JPEG') : photos;
      return new Response(bytes, { headers: { 'content-type': file.type } });
    }
    assert.equal(url.hostname, 'generativelanguage.googleapis.com');
    const parts = JSON.parse(options.body).contents[0].parts;
    modelCalls.push(parts);
    return Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"charges":[]}' }] } }],
    });
  });

  const response = await POST(new Request('http://localhost/api/cases/audit', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-session-token' },
    body: JSON.stringify({ caseId, consent: true }),
  }));
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.photos_read, 2);
  assert.equal(result.documents_read, 1);

  const parts = modelCalls.flat();
  const images = parts.flatMap((part) => part.inline_data?.mime_type.startsWith('image/') ? [part.inline_data] : []);
  assert.equal(images.length, 2);
  for (const image of images) {
    assert.equal(image.mime_type, 'image/jpeg');
    const bytes = Buffer.from(image.data, 'base64');
    const { format, width, height } = await sharp(bytes).metadata();
    assert.deepEqual({ format, width, height }, { format: 'jpeg', width: 663, height: 1568 });
    assert.ok(bytes.length < photos.length);
  }
  assert.ok(result.charges[0].requests.some((request) => request.includes('unreadable.jpg')));
  assert.deepEqual(parts.find((part) => part.inline_data?.mime_type === 'application/pdf')?.inline_data, {
    mime_type: 'application/pdf',
    data: pdf.toString('base64'),
  });
});
