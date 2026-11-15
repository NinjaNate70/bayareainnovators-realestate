import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveInspectionPhoto, validateInspectionImage } from '../lib/inspection-photos.ts';

test('accepts an iPhone HEIC original even if the picker supplies no MIME type', () => {
  assert.equal(validateInspectionImage({ name: 'IMG_0123.HEIC', type: '', size: 3_000_000 }), 'image/heic');
});

test('rejects SVG and photos above the storage bucket limit', () => {
  assert.throws(() => validateInspectionImage({ name: 'image.svg', type: 'image/svg+xml', size: 1_000 }));
  assert.throws(() => validateInspectionImage({ name: 'image.jpg', type: 'image/jpeg', size: 20_971_521 }));
});

test('leaves an incomplete upload pending and allows a retry with the same photo ID', async () => {
  let stored = false;
  let visible = false;
  let interrupted = true;
  const operations = {
    stage: async () => {},
    upload: async () => {
      if (interrupted) throw new Error('Network interrupted');
      stored = true;
    },
    exists: async () => stored,
    finish: async () => { visible = true; },
  };

  await assert.rejects(saveInspectionPhoto(operations), /Network interrupted/);
  assert.equal(visible, false);
  interrupted = false;
  await saveInspectionPhoto(operations);
  assert.equal(visible, true);
});

test('finishes an upload when the file reached storage before the connection dropped', async () => {
  let visible = false;
  await saveInspectionPhoto({
    stage: async () => {},
    upload: async () => { throw new Error('File already exists'); },
    exists: async () => true,
    finish: async () => { visible = true; },
  });
  assert.equal(visible, true);
});
