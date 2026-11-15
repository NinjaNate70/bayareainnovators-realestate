import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeAssessment,
  parseComparisonRequest,
  validateComparisonPair,
} from '../lib/inspection-comparison.ts';

const first = 'df2d7dbd-1b1d-4f0e-bf9b-5f4a90f87d01';
const second = 'df2d7dbd-1b1d-4f0e-bf9b-5f4a90f87d02';

test('requires an explicit comparison and two different photo IDs', () => {
  const request = { moveInPhotoId: first, moveOutPhotoId: second, spot: '  Sink  ', region: '  CA ', consent: true };
  assert.equal(parseComparisonRequest(request).spot, 'Sink');
  assert.equal(parseComparisonRequest(request).region, 'ca');
  assert.throws(() => parseComparisonRequest({ ...request, consent: false }));
  assert.throws(() => parseComparisonRequest({ ...request, moveOutPhotoId: first }));
});

test('rejects a reversed pair, another room, or a pending upload', () => {
  const moveIn = { id: first, phase: 'move_in', room_id: 'room-a', uploaded_at: '2026-11-14', content_type: 'image/heic', storage_path: 'first' };
  const moveOut = { ...moveIn, id: second, phase: 'move_out', storage_path: 'second' };
  assert.deepEqual(validateComparisonPair([moveOut, moveIn], first, second), [moveIn, moveOut]);
  assert.throws(() => validateComparisonPair([moveIn, moveOut], second, first));
  assert.throws(() => validateComparisonPair([moveIn, { ...moveOut, room_id: 'room-b' }], first, second));
  assert.throws(() => validateComparisonPair([moveIn, { ...moveOut, uploaded_at: null }], first, second));
});

test('an incomparable pair never gets a damage classification or repair estimate', () => {
  const result = normalizeAssessment({ comparable: false, category: 'repair', summary: 'The angle changed.', repair_code: 'drywall' }, []);
  assert.deepEqual(result, { status: 'needs_review', category: null, summary: 'The angle changed.', repair_code: null, estimate: null });
});

test('returns a source-backed price snapshot only when an approved price code matches', () => {
  const band = { code: 'drywall', title: 'Patch drywall', low_cents: 10000, high_cents: 18000, currency: 'USD', unit: 'per patch', source: 'Test catalog', effective_on: '2026-11-14' };
  const raw = { comparable: true, category: 'repair', summary: 'A hole is visible after move-out.', repair_code: 'drywall' };
  assert.deepEqual(normalizeAssessment(raw, [band]).estimate, band);
  assert.equal(normalizeAssessment({ ...raw, repair_code: 'made-up' }, [band]).estimate, null);
  assert.equal(normalizeAssessment({ ...raw, category: 'normal_wear_and_tear' }, [band]).estimate, null);
  assert.throws(() => normalizeAssessment({ ...raw, category: 'other' }, [band]));
  assert.throws(() => normalizeAssessment({ ...raw, summary: 'Patch the drywall for about $150.' }, [band]));
});
