-- A Save the Date is an invitation in its own right, hanging off the one it
-- announces. It has to be its own row rather than a second face on the same
-- one: it goes out months ahead, and publishing it early on the shared record
-- would start the couple's revision count and lock their template long before
-- they have a venue.
--
-- ON DELETE CASCADE, because a Save the Date for an invitation that no longer
-- exists is a link to nothing.
ALTER TABLE "Invitation" ADD COLUMN "saveTheDateOfId" TEXT;

CREATE UNIQUE INDEX "Invitation_saveTheDateOfId_key" ON "Invitation"("saveTheDateOfId");

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_saveTheDateOfId_fkey" FOREIGN KEY ("saveTheDateOfId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
