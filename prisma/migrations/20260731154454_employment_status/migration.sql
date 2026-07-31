-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'SEPARATED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "separatedAt" TIMESTAMP(3),
ADD COLUMN     "separationReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE';

-- Backfill: anyone already switched off predates the status column. Without
-- this they would come back as ACTIVE while `active` stayed false, which is the
-- one combination the rest of the system cannot read consistently.
UPDATE "Employee" SET "status" = 'SEPARATED' WHERE "active" = false;
