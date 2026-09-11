-- A fourth package above Signature.
--
-- Added rather than reordered: the enum's order carries no meaning here, since
-- what a tier outranks is decided by RANK in src/lib/tiers.ts, and every order
-- ever sold stores one of these values.
ALTER TYPE "Tier" ADD VALUE 'LUXURY';
