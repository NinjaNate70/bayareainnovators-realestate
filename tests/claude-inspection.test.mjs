import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';

test('Claude receives labeled images and a mismatched view becomes a retake request', async () => {
  const { assessInspectionPair } = await import('../lib/claude-inspection.ts');
  const data = await sharp({ create: { width: 20, height: 10, channels: 3, background: 'gray' } }).webp().toBuffer();
  const photo = new Blob([data], { type: 'image/webp' });
  const result = await assessInspectionPair({ apiKey: 'test-key', model: 'claude-test', before: photo, after: photo,
    spot: 'Wall by sink', bands: [], fetch: async (url, request) => {
      assert.equal(new URL(url).hostname, 'api.anthropic.com');
      const content = JSON.parse(request.body).messages[0].content;
      assert.deepEqual(content.slice(1).map((item) => item.text ?? item.source.media_type), [
        'Move-in photo', 'image/jpeg', 'Move-out photo', 'image/jpeg',
      ]);
      const answer = { comparable: false, category: 'undetermined', match: 'Only one image shows the sink.',
        move_in: 'The wall next to the sink is visible.', move_out: 'The other wall fills the image.',
        change: 'The same wall cannot be checked.', next: 'Retake the move-out photo with the sink in frame.', repair_code: null };
      return Response.json({ content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn' });
    } });
  assert.equal(result.assessment.status, 'needs_review');
  assert.equal(result.assessment.category, null);
  assert.match(result.assessment.summary, /Next step: Retake the move-out photo with the sink in frame/);
});
