export type Verdict = 'fair' | 'disputable' | 'not-allowed' | 'info';
export type CaseTab = 'audit' | 'photos' | 'letter' | 'replies';
export interface Evidence { id: string; name: string; kind: 'letter' | 'lease' | 'before' | 'after'; type: string; size: number; url?: string }
export interface Charge { id: string; name: string; room: string; amount: number; verdict: Verdict; reason: string; sources: string[]; low: number; high: number }
export interface RentalCase { id: string; demo: boolean; address: string; renter: string; landlord: string; moveOut: string; received: string; deposit: number; returned: number; charges: Charge[]; evidence: Evidence[]; completedStep: number; audited: boolean; stale: boolean; letter: string; replyBy: string; incoming: string; reply: string }
