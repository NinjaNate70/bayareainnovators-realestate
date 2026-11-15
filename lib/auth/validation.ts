export const normalizeEmail = (email:string) => email.trim().toLowerCase();
export const validEmail = (email:string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export function passwordError(password:string) {
  const n=Array.from(password).length;
  return n<12 ? "Use at least 12 characters for your password." : n>128 ? "Use no more than 128 characters for your password." : !password.trim() ? "Include something other than spaces." : "";
}
export function safeReturnTo(value:string|null|undefined):string|null {
  if(!value || value.length>2048 || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  let decoded=value;
  try { for(let i=0;i<3;i++) { const next=decodeURIComponent(decoded); if(next===decoded) break; decoded=next; } } catch { return null; }
  if(!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
  const url=new URL(decoded,"https://tenantshield.invalid");
  if(url.origin!=="https://tenantshield.invalid" || !(url.pathname.startsWith("/case/")||url.pathname==="/account")) return null;
  return url.pathname+url.search+url.hash;
}
