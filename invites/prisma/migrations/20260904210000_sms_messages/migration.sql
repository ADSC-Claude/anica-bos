-- Text messages we sent, or tried to.
CREATE TYPE "SmsStatus" AS ENUM ('SENT', 'LOGGED', 'FAILED');

CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "guestId" TEXT,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'LOGGED',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsMessage_invitationId_createdAt_idx" ON "SmsMessage"("invitationId", "createdAt");
CREATE INDEX "SmsMessage_guestId_createdAt_idx" ON "SmsMessage"("guestId", "createdAt");

ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
