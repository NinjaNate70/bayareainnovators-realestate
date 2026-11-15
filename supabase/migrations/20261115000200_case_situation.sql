-- Adds the renter's own notes about their situation to a case: roommates,
-- agreements with the landlord, anything the documents don't show. The wizard's
-- Details step saves them here, and the audit and the case assistant read them.
--
-- Run once in the Supabase SQL Editor, after the case workspace migration.
-- It is safe to run again.

alter table public.cases
  add column if not exists situation_text text not null default ''
  check (char_length(situation_text) <= 4000);

-- Tell the API about the new column straight away.
notify pgrst, 'reload schema';
