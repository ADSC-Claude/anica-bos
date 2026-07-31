-- Approval PINs belong to the Owner alone.
--
-- The PIN authorises voids, refunds and manual discounts above the threshold.
-- It used to be accepted from Admins too, which made it the one control a
-- manager could exercise over their own shift — a void erases a sale and a
-- manual discount gives money away.
--
-- verifyApprovalPin now matches OWNER only, so a hash on any other row is
-- already inert. Clearing it anyway: a stored credential that silently grants
-- nothing is worse than no credential, because the next person to read the
-- table cannot tell which it is. saveUserAction clears the hash whenever an
-- account is saved as a non-Owner, and this does the same for the accounts
-- nobody has saved since.
--
-- No schema change — the column stays nullable and stays where it is.

UPDATE "User"
SET "approvalPinHash" = NULL
WHERE role <> 'OWNER'
  AND "approvalPinHash" IS NOT NULL;
