const imageTypes = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
]);
const allowedTypes = new Set(imageTypes.values());

export function validateInspectionImage(file: Pick<File, 'name' | 'type' | 'size'>) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const contentType = file.type && file.type !== 'application/octet-stream'
    ? file.type
    : imageTypes.get(extension);

  if (!contentType || !allowedTypes.has(contentType)) {
    throw new Error('Choose a JPEG, PNG, WebP, HEIC, or HEIF photo.');
  }
  if (file.size === 0 || file.size > 20 * 1024 * 1024) {
    throw new Error('Choose a photo between 1 byte and 20 MB.');
  }
  return contentType;
}

type UploadOperations = {
  stage: () => Promise<void>;
  upload: () => Promise<void>;
  exists: () => Promise<boolean>;
  finish: () => Promise<void>;
};

export async function saveInspectionPhoto({ stage, upload, exists, finish }: UploadOperations) {
  await stage();
  try {
    await upload();
  } catch (uploadError) {
    // A successful upload can lose its response. Keep the original object on retry.
    const alreadyUploaded = await exists().catch(() => false);
    if (!alreadyUploaded) throw uploadError;
  }
  await finish();
}
