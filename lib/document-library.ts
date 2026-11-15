// The document library: a renter's files kept in one place, outside any case.
// They live in the private "library" storage bucket under
// <user id>/files/<random id>-<file name>. No local imports, so tests load it directly.

export const libraryBucket = 'library';
export const libraryFolder = (userId: string) => `${userId}/files`;

const types = ['application/pdf', 'image/png', 'image/jpeg'];
const maxBytes = 10 * 1024 * 1024;
const idPrefix = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

// Why a file can't be added, or an empty string when it can.
export function libraryFileError(file: { name: string; type: string; size: number }) {
  if (!types.includes(file.type)) return `${file.name} isn’t a PDF, JPG or PNG.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > maxBytes) return `${file.name} is larger than 10MB. Choose a smaller file.`;
  return '';
}

// The name a file is stored under. The random id keeps two files with the same
// name apart; the rest is the original name made safe for a storage path.
export function storedName(original: string, id: string = crypto.randomUUID()) {
  const safe = original.normalize('NFKD').replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim().slice(-120);
  return `${id}-${safe || 'document'}`;
}

// The name to show for a stored file.
export const displayName = (stored: string) => stored.replace(idPrefix, '') || stored;

export function fileSize(bytes: number | undefined) {
  if (!bytes || !Number.isFinite(bytes)) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
