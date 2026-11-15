import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayName, fileSize, libraryFileError, libraryFolder, storedName } from '../lib/document-library.ts';

test('files are stored under the renter’s own folder with a unique, safe name', () => {
  const id = 'df2d7dbd-1b1d-4f0e-bf9b-5f4a90f87d01';
  assert.equal(libraryFolder('user-1'), 'user-1/files');
  assert.equal(storedName('Lease 2026 (signed).pdf', id), `${id}-Lease 2026 _signed_.pdf`);
  // Nothing in a name can add a folder level or climb out of the folder.
  assert.ok(!storedName('../../other-user/secret.pdf', id).includes('/'));
  assert.equal(storedName('', id), `${id}-document`);
  assert.equal(storedName('x'.repeat(300) + '.pdf', id).length, id.length + 1 + 120);
  // Two uploads of the same file get different names.
  assert.notEqual(storedName('a.pdf'), storedName('a.pdf'));
});

test('the original name is shown again', () => {
  assert.equal(displayName('df2d7dbd-1b1d-4f0e-bf9b-5f4a90f87d01-Lease 2026.pdf'), 'Lease 2026.pdf');
  assert.equal(displayName(storedName('receipt-2026-11-01.png')), 'receipt-2026-11-01.png');
  assert.equal(displayName('no-prefix.pdf'), 'no-prefix.pdf');
});

test('only PDFs and photos up to 10MB are accepted', () => {
  const file = (type, size) => ({ name: 'file', type, size });
  assert.equal(libraryFileError(file('application/pdf', 1000)), '');
  assert.equal(libraryFileError(file('image/jpeg', 10 * 1024 * 1024)), '');
  assert.match(libraryFileError(file('image/png', 10 * 1024 * 1024 + 1)), /larger than 10MB/);
  assert.match(libraryFileError(file('application/zip', 10)), /isn’t a PDF, JPG or PNG/);
  assert.match(libraryFileError(file('text/html', 10)), /isn’t a PDF, JPG or PNG/);
  assert.match(libraryFileError(file('application/pdf', 0)), /is empty/);
});

test('sizes read naturally', () => {
  assert.deepEqual([fileSize(500), fileSize(204800), fileSize(3.5 * 1024 * 1024), fileSize(undefined)], ['1 KB', '200 KB', '3.5 MB', '']);
});
