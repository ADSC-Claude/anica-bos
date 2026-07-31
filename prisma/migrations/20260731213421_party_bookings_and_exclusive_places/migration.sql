-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "guestName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "partyRef" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "exclusiveUse" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Appointment_partyRef_idx" ON "Appointment"("partyRef");
