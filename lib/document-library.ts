// The document library: a renter's files kept in one place, outside any case.
// They live in the private "library" storage bucket under
// <user id>/files/<random id>-<file name>. No local imports, so tests load it directly.

export const libraryBucket = 'library';
export const libraryFolder = (userId: string) => `${userId}/files`;

// What the library keeps, by file extension. The bucket's own allow-list in the
// document library migration must match. Web pages and scripts are left out.
const byExtension: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const libraryTypes = [...new Set(Object.values(byExtension))];
// For the file picker. Types and extensions are both listed because phones
// honour one or the other; "image/*" lets a phone offer its photo library.
export const libraryAccept = ['image/*', ...libraryTypes.filter((type) => !type.startsWith('image/')), ...Object.keys(byExtension).map((extension) => `.${extension}`)].join(',');

// Phone cameras hand back every photo as "image.jpg". Give each a dated name
// so they can be told apart in the list.
export function photoName(name: string, taken: Date = new Date()) {
  const found = name.match(/^image\.(jpe?g|png|heic|heif|webp)$/i);
  if (!found) return name;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `Photo ${taken.getFullYear()}-${pad(taken.getMonth() + 1)}-${pad(taken.getDate())} ${pad(taken.getHours())}.${pad(taken.getMinutes())}.${pad(taken.getSeconds())}.${found[1].toLowerCase()}`;
}
export const libraryKinds = 'PDF, Word, Excel, text, JPG, PNG, WebP or HEIC';
export const libraryMaxBytes = 20 * 1024 * 1024;

const idPrefix = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
const extension = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

// The type to store a file as. Browsers leave the type blank, or report a
// generic one, for some files (HEIC photos, CSVs), so the extension decides
// whenever it is one the library knows.
export function libraryType(file: { name: string; type: string }) {
  return byExtension[extension(file.name)] ?? (libraryTypes.includes(file.type) ? file.type : '');
}

// Why a file can't be added, or an empty string when it can.
export function libraryFileError(file: { name: string; type: string; size: number }) {
  if (!libraryType(file)) return `${file.name} can’t be saved here. Add a ${libraryKinds} file.`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > libraryMaxBytes) return `${file.name} is larger than 20MB. Choose a smaller file.`;
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

// Whether a browser can show the file in a tab; anything else is downloaded.
export const viewable = (name: string) => ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'txt'].includes(extension(name));

export function fileSize(bytes: number | undefined) {
  if (!bytes || !Number.isFinite(bytes)) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Turns a storage error into what the renter should do about it.
export function uploadProblem(fileName: string, message: string): { text: string; setup: boolean } {
  if (/bucket/i.test(message)) return { text: 'Your document library isn’t set up yet.', setup: true };
  if (/row-level security|not authorized|unauthorized|permission/i.test(message)) {
    return { text: 'Your account isn’t allowed to save here yet. Ask your project admin to run the document library migration in Supabase.', setup: true };
  }
  if (/mime|type/i.test(message)) return { text: `${fileName} is a file type the library doesn’t accept yet. Ask your project admin to run the latest document library migration.`, setup: false };
  if (/size|large|exceed/i.test(message)) return { text: `${fileName} is too large to save.`, setup: false };
  if (/jwt|expired|token/i.test(message)) return { text: 'Your session expired. Sign in again, then add the file.', setup: false };
  return { text: `${fileName} couldn’t be saved (${message.slice(0, 120)}). Try again.`, setup: false };
}
