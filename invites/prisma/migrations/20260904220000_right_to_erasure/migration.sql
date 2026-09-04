-- The Data Privacy Act's right to erasure. The row stays because orders point
-- at it and those are receipts; what identifies a person does not.
ALTER TABLE "User" ADD COLUMN "erasedAt" TIMESTAMP(3);
