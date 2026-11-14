-- The one-click demo was removed. Delete leftover demo accounts (they were set to expire within
-- 24 hours anyway). Only the reserved, never-deliverable demo email domain is matched. Their
-- bills, items, claims, participants and sessions are removed by ON DELETE CASCADE.
DELETE FROM "User" WHERE "email" LIKE '%@demo.whoorderedtax.invalid';
