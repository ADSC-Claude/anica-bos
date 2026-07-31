-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "declineReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "needsApproval" BOOLEAN NOT NULL DEFAULT false;
