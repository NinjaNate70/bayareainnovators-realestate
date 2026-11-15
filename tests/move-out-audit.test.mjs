import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveAuditFinding, summarizeAudit } from '../lib/move-out-audit.ts';

const finding = (category, summary = 'A mark is visible.') => ({ status: 'ready', category, summary });

test('shows a category only when both reviews agree', () => {
  assert.deepEqual(resolveAuditFinding(finding('repair'), finding('repair')), { status: 'completed', category: 'repair' });
  assert.deepEqual(resolveAuditFinding(finding('repair'), finding('no_damage')), { status: 'needs_review', category: null });
  assert.deepEqual(resolveAuditFinding(finding('repair'), { status: 'needs_review', category: null, summary: 'Move closer.' }), { status: 'needs_review', category: null });
});

test('tracks work, blocked rooms and finished rooms independently', () => {
  const statuses = ['awaiting_photos', 'queued', 'inspecting', 'review_queued', 'reviewing', 'completed', 'needs_review', 'failed'];
  assert.deepEqual(summarizeAudit(statuses), { total: 8, completed: 1, working: 4, needsAttention: 3 });
  assert.deepEqual(summarizeAudit([]), { total: 0, completed: 0, working: 0, needsAttention: 0 });
});
