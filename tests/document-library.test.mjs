import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayName, fileSize, libraryAccept, libraryFileError, libraryFolder, libraryType, libraryTypes, photoName, storedName, uploadProblem, viewable } from '../lib/document-library.ts';

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

test('documents, spreadsheets and photos up to 20MB are accepted; web pages and archives are not', () => {
  const file = (name, type, size = 1000) => ({ name, type, size });
  for (const [name, type] of [['a.pdf', 'application/pdf'], ['a.JPG', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp'], ['a.txt', 'text/plain'],
    ['a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]) {
    assert.equal(libraryFileError(file(name, type)), '', name);
    assert.equal(libraryType(file(name, type)), type, name);
  }
  // Browsers often give no type, or a generic one, for these; the extension decides.
  assert.equal(libraryType(file('IMG_0042.HEIC', '')), 'image/heic');
  assert.equal(libraryType(file('charges.csv', 'application/vnd.ms-excel')), 'text/csv');
  assert.equal(libraryType(file('scan', 'application/pdf')), 'application/pdf');
  assert.equal(libraryFileError(file('big.pdf', 'application/pdf', 20 * 1024 * 1024)), '');
  assert.match(libraryFileError(file('big.pdf', 'application/pdf', 20 * 1024 * 1024 + 1)), /larger than 20MB/);
  assert.match(libraryFileError(file('empty.pdf', 'application/pdf', 0)), /is empty/);
  for (const [name, type] of [['page.html', 'text/html'], ['logo.svg', 'image/svg+xml'], ['all.zip', 'application/zip'], ['run.exe', 'application/x-msdownload'], ['mystery', '']]) {
    assert.match(libraryFileError(file(name, type)), /can’t be saved here/, name);
  }
  // Every type the app sends is one the bucket is told to allow.
  const accept = libraryAccept.split(',');
  assert.ok(accept.filter((entry) => entry.startsWith('.')).every((extension) => libraryTypes.includes(libraryType(file(`x${extension}`, '')))));
  // The picker lists types as well as extensions, so phones offer photos and files.
  assert.ok(accept.includes('image/*') && accept.includes('application/pdf') && accept.includes('.docx') && accept.includes('.heic'));
});

test('the migration allows exactly the types the app sends', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../supabase/migrations/20261115000300_document_library.sql', import.meta.url), 'utf8');
  const allowed = [...sql.slice(sql.indexOf('array['), sql.indexOf(']', sql.indexOf('array['))).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...allowed].sort(), [...libraryTypes].sort());
  assert.match(sql, /'library', 'library', false, 20971520,/);
});

test('files a browser can show open in a tab; the rest are downloaded', () => {
  assert.deepEqual(['a.pdf', 'b.PNG', 'c.jpeg', 'd.txt'].map(viewable), [true, true, true, true]);
  assert.deepEqual(['a.docx', 'b.xlsx', 'c.heic', 'd.csv', 'noextension'].map(viewable), [false, false, false, false, false]);
});

test('a storage error is turned into what to do about it', () => {
  assert.deepEqual(uploadProblem('a.pdf', 'Bucket not found'), { text: 'Your document library isn’t set up yet.', setup: true });
  assert.equal(uploadProblem('a.pdf', 'new row violates row-level security policy').setup, true);
  assert.match(uploadProblem('a.docx', 'mime type application/msword is not supported').text, /file type the library doesn’t accept yet/);
  assert.match(uploadProblem('a.pdf', 'The object exceeded the maximum allowed size').text, /too large/);
  assert.match(uploadProblem('a.pdf', 'jwt expired').text, /Sign in again/);
  assert.equal(uploadProblem('a.pdf', 'Something odd happened').text, 'a.pdf couldn’t be saved (Something odd happened). Try again.');
});

test('sizes read naturally', () => {
  assert.deepEqual([fileSize(500), fileSize(204800), fileSize(3.5 * 1024 * 1024), fileSize(undefined)], ['1 KB', '200 KB', '3.5 MB', '']);
});

test('camera photos get a dated name so they can be told apart', () => {
  const taken = new Date(2026, 10, 15, 9, 5, 7);
  assert.equal(photoName('image.jpg', taken), 'Photo 2026-11-15 09.05.07.jpg');
  assert.equal(photoName('IMAGE.HEIC', taken), 'Photo 2026-11-15 09.05.07.heic');
  assert.equal(photoName('Lease.pdf', taken), 'Lease.pdf');
  assert.equal(photoName('my image.jpg', taken), 'my image.jpg');
});
