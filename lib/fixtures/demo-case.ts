import type { RentalCase } from '@/types/case';

export const demoCase: RentalCase = {
  id: 'demo', demo: true, address: '782 Cedar Street, San Luis Obispo, CA', renter: 'Alex Morgan', landlord: 'Cedar Street Property Management',
  moveOut: '2026-10-31', received: '2026-11-10', deposit: 1800, returned: 500, completedStep: 3, audited: true, stale: false,
  letter: '', replyBy: '', incoming: '', reply: '',
  evidence: [
    { id: 'L01', name: 'Itemized deductions.pdf', kind: 'letter', type: 'application/pdf', size: 0 },
    { id: 'L02', name: 'Cedar Street lease.pdf', kind: 'lease', type: 'application/pdf', size: 0 },
    { id: 'P01', name: 'Bedroom · move-in', kind: 'before', type: 'image/svg+xml', size: 0, url: '/demo/before.svg' },
    { id: 'P02', name: 'Bedroom · move-out', kind: 'after', type: 'image/svg+xml', size: 0, url: '/demo/after.svg' },
  ],
  charges: [
    { id: 'C01', name: 'Full bedroom repaint', room: 'Bedroom', amount: 400, verdict: 'not-allowed', reason: 'The example photo pair shows small surface marks. A full repaint may exceed what this evidence supports.', sources: ['CA-R01', 'P01', 'P02'], low: 250, high: 400 },
    { id: 'C02', name: 'Professional cleaning', room: 'Whole home', amount: 150, verdict: 'disputable', reason: 'The example itemization has a flat cleaning fee without a receipt or a description of the work.', sources: ['CA-R02', 'L01'], low: 100, high: 150 },
    { id: 'C03', name: 'Carpet replacement', room: 'Bedroom', amount: 350, verdict: 'disputable', reason: 'The example documents do not establish the carpet’s age or why replacement was needed.', sources: ['CA-R01', 'L01'], low: 300, high: 350 },
    { id: 'C04', name: 'Missing mailbox key', room: 'Entry', amount: 75, verdict: 'fair', reason: 'The example check-out record confirms a missing key and an itemized replacement cost.', sources: ['L01'], low: 0, high: 0 },
    { id: 'C05', name: 'Oven damage repair', room: 'Kitchen', amount: 125, verdict: 'fair', reason: 'The example itemization includes an acknowledged broken oven handle and a matching repair receipt.', sources: ['L01'], low: 0, high: 0 },
    { id: 'C06', name: 'Window blind repair', room: 'Living room', amount: 200, verdict: 'info', reason: 'There are no comparable photos or an itemized repair receipt for the blinds. Add evidence before drawing a conclusion.', sources: ['L01'], low: 0, high: 0 },
  ],
};

// TODO(api): Replace these illustrative rule records with the reviewed, versioned CA rules pack.
export const rules: Record<string, { title: string; description: string }> = {
  'CA-R01': { title: 'Wear and tear', description: 'Illustrative rule topic: distinguish ordinary wear from damage and document the basis for a charge. This fixture is not a verified legal determination.' },
  'CA-R02': { title: 'Supporting records', description: 'Illustrative rule topic: review itemization and supporting receipts. Thresholds and exceptions require a reviewed rules pack.' },
};
