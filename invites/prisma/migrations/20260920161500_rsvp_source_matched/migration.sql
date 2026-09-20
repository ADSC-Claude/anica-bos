-- The couple matching a typed reply to a name on their guest list by hand.
-- A reply that arrived before the list existed, or one where the guest typed
-- a nickname, can now be joined to the row it belongs to.

-- AlterEnum
ALTER TYPE "RsvpSource" ADD VALUE 'MATCHED';
