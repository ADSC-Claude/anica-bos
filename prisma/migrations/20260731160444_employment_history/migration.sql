-- One pair of dates for every status, instead of a field that only made sense
-- for one of them. Written add → copy → drop so a separation already recorded
-- keeps its date and reason rather than being dropped with the column.

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "statusFrom" TIMESTAMP(3),
ADD COLUMN     "statusUntil" TIMESTAMP(3),
ADD COLUMN     "statusReason" TEXT NOT NULL DEFAULT '';

UPDATE "Employee"
   SET "statusFrom"   = "separatedAt",
       "statusReason" = "separationReason"
 WHERE "separatedAt" IS NOT NULL
    OR "separationReason" <> '';

ALTER TABLE "Employee" DROP COLUMN "separatedAt",
DROP COLUMN "separationReason";

-- CreateTable
CREATE TABLE "EmploymentEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "EmploymentStatus" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmploymentEvent_employeeId_startDate_idx" ON "EmploymentEvent"("employeeId", "startDate");

-- AddForeignKey
ALTER TABLE "EmploymentEvent" ADD CONSTRAINT "EmploymentEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the history with the spell each employee is currently in, so a profile
-- opened tomorrow is not blank for someone separated today.
INSERT INTO "EmploymentEvent" ("id", "employeeId", "status", "startDate", "reason", "recordedBy")
SELECT
  'evt_' || "id",
  "id",
  "status",
  COALESCE("statusFrom", CURRENT_TIMESTAMP),
  "statusReason",
  'migration'
FROM "Employee"
WHERE "status" <> 'ACTIVE';
