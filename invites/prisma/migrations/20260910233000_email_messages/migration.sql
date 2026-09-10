-- One e-mail sent to one guest. The mirror of "SmsMessage", and it shares
-- "SmsStatus": sent, logged because no key is set, or refused — the three
-- outcomes are the same whichever gateway carried it.
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "guestId" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'LOGGED',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- The two questions asked of this table: what did this invitation send, and
-- has this guest been written to recently.
CREATE INDEX "EmailMessage_invitationId_createdAt_idx" ON "EmailMessage"("invitationId", "createdAt");
CREATE INDEX "EmailMessage_guestId_createdAt_idx" ON "EmailMessage"("guestId", "createdAt");

ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A deleted guest leaves their message behind with no owner, the same as SMS:
-- the record of what was sent outlives the row it was sent to.
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
