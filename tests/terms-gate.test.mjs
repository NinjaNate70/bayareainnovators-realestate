import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRIVACY_VERSION, TERMS_VERSION, oauthEnabled, termsAccepted, termsGatePath, termsMetadata } from '../lib/auth/terms.ts';
import { safeReturnTo } from '../lib/auth/validation.ts';

test('only an acceptance of the current Terms version passes the gate', () => {
  const acceptedAt = '2026-11-15T09:00:00.000Z';
  assert.equal(termsAccepted({ terms_version: TERMS_VERSION, terms_accepted_at: acceptedAt }), true);
  // Email signups store these fields with the account, so they never see the gate.
  assert.equal(termsAccepted({ name: 'Renter', terms_version: TERMS_VERSION, terms_accepted_at: acceptedAt, privacy_version: PRIVACY_VERSION, consented_at: acceptedAt }), true);
  assert.equal(termsAccepted({ terms_version: TERMS_VERSION }), false);
  assert.equal(termsAccepted({ terms_version: TERMS_VERSION, terms_accepted_at: '' }), false);
  assert.equal(termsAccepted({ terms_version: 'review-draft-v1', terms_accepted_at: acceptedAt, consented_at: acceptedAt }), false);
  // A new Google account has only what Google provides.
  assert.equal(termsAccepted({ name: 'Renter', full_name: 'Renter', avatar_url: 'https://example.test/a.png' }), false);
  assert.equal(termsAccepted({}), false);
  assert.equal(termsAccepted(null), false);
  assert.equal(termsAccepted(undefined), false);
});

test('accepting records every consent field with one timestamp', () => {
  const now = new Date('2026-11-15T09:30:00.000Z');
  const metadata = termsMetadata(now);
  assert.deepEqual(metadata, {
    terms_version: TERMS_VERSION,
    terms_accepted_at: now.toISOString(),
    privacy_version: PRIVACY_VERSION,
    consented_at: now.toISOString(),
  });
  assert.equal(termsAccepted(metadata), true);
});

test('the gate keeps the destination for after acceptance', () => {
  assert.equal(termsGatePath('/case/abc?tab=letter#draft'), '/accept-terms?returnTo=%2Fcase%2Fabc%3Ftab%3Dletter%23draft');
  assert.equal(termsGatePath('/inspections'), '/accept-terms?returnTo=%2Finspections');
  assert.equal(termsGatePath(null), '/accept-terms');
  assert.equal(termsGatePath(''), '/accept-terms');
});

test('Google sign-in shows only with Supabase Auth and the flag on', () => {
  assert.equal(oauthEnabled('supabase', 'true'), true);
  assert.equal(oauthEnabled('supabase', 'false'), false);
  assert.equal(oauthEnabled('supabase', undefined), false);
  assert.equal(oauthEnabled('local', 'true'), false);
  assert.equal(oauthEnabled(undefined, 'true'), false);
  assert.equal(oauthEnabled('supabase', 'TRUE'), false);
});

test('return paths allow My Inspections and Documents but not the gate or other sites', () => {
  assert.equal(safeReturnTo('/inspections'), '/inspections');
  assert.equal(safeReturnTo('/documents'), '/documents');
  assert.equal(safeReturnTo('%2Fcase%2Fabc%3Ftab%3Dletter'), '/case/abc?tab=letter');
  for (const path of ['/accept-terms', '/auth/callback', '//evil.test/inspections', 'https://evil.test/inspections', '/inspections/../login'])
    assert.equal(safeReturnTo(path), null);
});
