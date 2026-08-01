-- The treatment consent and liability waiver.
--
-- Separate columns from consentGiven / consentAt rather than more words behind
-- the same tick: the Data Privacy Act consent covers holding someone's health
-- history, this covers the treatment itself, and a spa that has to show which
-- of the two a client agreed to cannot do it from one boolean.
--
-- No backfill. Every existing client defaults to false, including the ones who
-- have already given data-privacy consent, because they ticked a box that said
-- nothing about liability and recording otherwise would be inventing a
-- signature. The desk collects it at the next visit.
ALTER TABLE "Client" ADD COLUMN "waiverGiven" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "waiverAt" TIMESTAMP(3);
