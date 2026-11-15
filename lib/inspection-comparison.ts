export const categories = ['no_damage', 'normal_wear_and_tear', 'repair'] as const;
export type Category = (typeof categories)[number];

export type PriceBand = {
  code: string;
  title: string;
  low_cents: number;
  high_cents: number;
  currency: string;
  unit: string;
  source: string;
  effective_on: string;
};

export type Assessment = {
  status: 'ready' | 'needs_review';
  category: Category | null;
  summary: string;
  repair_code: string | null;
  estimate: PriceBand | null;
};

export type SavedComparison = Assessment & {
  id: string;
  spot: string;
  region: string | null;
  move_in_photo_id: string;
  move_out_photo_id: string;
  created_at: string;
};

export const comparisonColumns = 'id, spot, region, move_in_photo_id, move_out_photo_id, status, category, summary, repair_code, estimate, created_at';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}

export function parseComparisonRequest(value: unknown) {
  const { moveInPhotoId, moveOutPhotoId, spot, region, consent } = object(value);
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if (typeof moveInPhotoId !== 'string' || typeof moveOutPhotoId !== 'string' ||
      !uuid.test(moveInPhotoId) || !uuid.test(moveOutPhotoId) ||
      moveInPhotoId.toLowerCase() === moveOutPhotoId.toLowerCase()) {
    throw new Error('Select two different photos.');
  }
  if (typeof spot !== 'string' || spot.trim().length < 1 || spot.trim().length > 120) {
    throw new Error('Enter a spot name of 1 to 120 characters.');
  }
  if (region !== undefined && (typeof region !== 'string' || region.trim().length > 120)) {
    throw new Error('Enter a pricing region of up to 120 characters.');
  }
  if (consent !== true) throw new Error('Confirm that the two photos can be sent for analysis.');
  return {
    moveInPhotoId: moveInPhotoId.toLowerCase(),
    moveOutPhotoId: moveOutPhotoId.toLowerCase(),
    spot: spot.trim(),
    region: typeof region === 'string' ? region.trim().toLowerCase() || null : null,
  };
}

export function validateComparisonPair<T extends { id: string; phase: string; room_id: string; uploaded_at: string | null }>(
  photos: T[], moveInPhotoId: string, moveOutPhotoId: string,
): [T, T] {
  const before = photos.find((photo) => photo.id === moveInPhotoId);
  const after = photos.find((photo) => photo.id === moveOutPhotoId);
  if (!before?.uploaded_at || !after?.uploaded_at || before.room_id !== after.room_id ||
      before.phase !== 'move_in' || after.phase !== 'move_out') {
    throw new Error('Choose completed move-in and move-out photos from the same room.');
  }
  return [before, after];
}

export function normalizeAssessment(value: unknown, bands: PriceBand[]): Assessment {
  const { comparable, category, summary, repair_code } = object(value);
  if (typeof comparable !== 'boolean' || typeof summary !== 'string' || !summary.trim() || summary.length > 2000) {
    throw new Error('Gemini returned an invalid assessment.');
  }
  if (/[$£€¥]\s*\d|\b\d[\d,.]*\s*(?:USD|CAD|AUD|EUR|GBP|dollars?|bucks)\b/i.test(summary)) {
    throw new Error('Gemini returned a price outside the approved catalog.');
  }
  if (!comparable) return { status: 'needs_review', category: null, summary: summary.trim(), repair_code: null, estimate: null };
  const validCategory = categories.find((candidate) => candidate === category);
  if (!validCategory) throw new Error('Gemini returned an unknown category.');
  const estimate = validCategory === 'repair' ? bands.find((band) => band.code === repair_code) ?? null : null;
  return {
    status: 'ready', category: validCategory, summary: summary.trim(),
    repair_code: estimate?.code ?? null, estimate,
  };
}
