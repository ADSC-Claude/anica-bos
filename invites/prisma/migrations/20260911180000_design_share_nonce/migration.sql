-- The secret in a Share-draft link. Blank is the default and means the design
-- is not shared; changing it invalidates every link handed out so far.
ALTER TABLE "Template" ADD COLUMN "shareNonce" TEXT NOT NULL DEFAULT '';
