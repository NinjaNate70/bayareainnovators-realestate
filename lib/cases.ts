import type { RentalCase } from '@/types/case';
import { demoCase } from '@/lib/fixtures/demo-case';

export const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
export function freshCase(): RentalCase { return { id: `case-${Date.now()}`, demo: false, address: '', renter: '', landlord: '', moveOut: '', received: '', deposit: 0, returned: 0, charges: [], evidence: [], completedStep: 0, audited: false, stale: false, letter: '', replyBy: '', incoming: '', reply: '' }; }
// TODO(api): Replace browser-only case persistence with authenticated case storage.
export function readCase(id: string): RentalCase | null {
  const raw = localStorage.getItem(`tenant-shield:${id}`);
  if (raw) { const value = JSON.parse(raw); if (!value || value.id !== id || !Array.isArray(value.charges) || !Array.isArray(value.evidence)) throw new Error('Invalid saved case'); return value; }
  return id === 'demo' ? structuredClone(demoCase) : null;
}
export function saveCase(value: RentalCase) { localStorage.setItem(`tenant-shield:${value.id}`, JSON.stringify(value)); localStorage.setItem('tenant-shield:current', value.id); }

function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open('tenant-shield-evidence', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
// TODO(api): Replace local IndexedDB originals with private evidence upload and retrieval.
export async function storeFile(id: string, file: File) { const db = await database(); try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { db.close(); } }
export async function getFile(id: string): Promise<Blob | undefined> { const db = await database(); try { return await new Promise((resolve, reject) => { const r = db.transaction('files').objectStore('files').get(id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); } finally { db.close(); } }
