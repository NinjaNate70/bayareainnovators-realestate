// Kept in its own file so screens can show guide sections without loading the
// server-side assistant code.
//
// Rules the assistant may cite. Condensed from the California Courts Self-Help
// Guide, "Guide to security deposits in California" (retrieved 2026-11-14).
// The assistant must not state a California rule that is not in this list.
export const guideSource = {
  title: 'Guide to security deposits in California',
  publisher: 'California Courts Self-Help Guide',
  url: 'https://selfhelp.courts.ca.gov/guide-security-deposits-california',
};

export const depositGuide = [
  {
    id: 'G1',
    title: 'What a security deposit is',
    text: 'A security deposit is money, usually 1 to 2 months\' rent, that a landlord holds in case the tenant damages the rental unit or breaks the lease and does not pay rent. When the tenant moves out the landlord must return the deposit but can keep some of it to pay for certain items, like damage to the rental unit.',
  },
  {
    id: 'G2',
    title: 'Pre-inspection before moving out',
    text: 'After the tenant gives notice, the landlord must tell the tenant in writing that they have the right to ask for a pre-inspection. This gives the tenant a chance to repair things before moving out so they get their security deposit back.',
  },
  {
    id: 'G3',
    title: 'The 21-day deadline',
    text: 'After a tenant moves out, a landlord has 21 days to either return all of the security deposit, or return the security deposit minus any deductions along with an itemized statement. The itemized statement must list what was deducted and why.',
  },
  {
    id: 'G4',
    title: 'Receipts for deductions over $125',
    text: 'If the deductions are for more than $125.00, the landlord must attach a copy of any invoices or receipts with the itemized statement. If the landlord or their employee did the work themselves, they must include a description of the work, how long it took, and the hourly rate they charged. Any rates must be reasonable.',
  },
  {
    id: 'G5',
    title: 'Repairs not finished within 21 days',
    text: 'If the repairs are not finished within the 21-day period for a good reason, the landlord can send the tenant a reasonable (good faith) estimate of the repair costs. Then, within 14 days of the repairs being done, the landlord must send the tenant the receipts.',
  },
  {
    id: 'G6',
    title: 'What a landlord can deduct',
    text: 'The landlord can deduct for: cleaning the rental unit when a tenant moves out, but only to make it as clean as when the tenant first moved in; repairing damage, other than normal wear and tear, caused by the tenant and the tenant\'s guests; and restoring or replacing furniture or other personal items, but only if this was included in the rental agreement and the damage is not from normal wear and tear. Generally, a landlord can keep part of the security deposit for rent owed, with some exceptions.',
  },
  {
    id: 'G7',
    title: 'Ending a lease early because of violence',
    text: 'If a tenant sends a written notice under Civil Code section 1946.7 that they are ending the rental agreement early because they or someone they live with was a victim of violence in the last 180 days, the landlord cannot use the security deposit as a penalty for ending the lease early or to cover the rental period after the tenant ended the lease.',
  },
  {
    id: 'G8',
    title: 'Step 1 if the deposit is not returned: write a letter',
    text: 'If the landlord does not return the entire security deposit within 21 days, or the tenant does not agree with the deductions, the tenant can write a letter asking the landlord to return the security deposit. The tenant should keep a copy of the letter for their records.',
  },
  {
    id: 'G9',
    title: 'Step 2: small claims court',
    text: 'If the tenant and landlord cannot agree, the tenant can sue the landlord about the security deposit return. They can sue for both the amount of the deposit and two times the amount of the security deposit in damages. The judge may give the tenant these additional damages if the landlord retained the deposit in bad faith. A person who is a tenant can only sue for up to $12,500 in small claims court. The law is in California Civil Code section 1950.5.',
  },
] as const;
