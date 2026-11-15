// Renter-facing wording for AI failures. Server logs keep the provider name for
// diagnosis; the text a renter reads does not name the provider.
export const neutralService = (text: string) =>
  text.replace(/\b(?:Gemini|Claude)\b/g, 'our analysis service');

// "1 charge", "2 charges".
export const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;
