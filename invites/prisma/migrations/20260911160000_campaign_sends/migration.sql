-- Which scheduled message a send was.
--
-- Without it the daily job cannot tell a seven-day reminder from the one-day it
-- sends six days later, which means it cannot know what it has already sent —
-- and a blast it cannot remember is a blast it will repeat.
--
-- Blank on every existing row, which is correct: everything sent so far was a
-- reminder a couple pressed send on themselves.
ALTER TABLE "SmsMessage"   ADD COLUMN "campaign" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmailMessage" ADD COLUMN "campaign" TEXT NOT NULL DEFAULT '';

CREATE INDEX "SmsMessage_invitationId_campaign_idx"   ON "SmsMessage"("invitationId", "campaign");
CREATE INDEX "EmailMessage_invitationId_campaign_idx" ON "EmailMessage"("invitationId", "campaign");
