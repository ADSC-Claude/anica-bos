-- Where a reply came from: a personal link, a name picked off the guest
-- list, or a name typed in. Additive and nullable — every reply written
-- before the picker existed keeps a NULL, which is the honest record: the
-- question was not asked of it.

-- CreateEnum
CREATE TYPE "RsvpSource" AS ENUM ('LINK', 'PICKED', 'TYPED');

-- AlterTable
ALTER TABLE "Rsvp" ADD COLUMN "source" "RsvpSource";
