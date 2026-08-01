-- A visit becomes a sequence of timed treatments, each in its own place.
--
-- Until now an appointment held one place for its whole length. That is right
-- for one massage and wrong for a sauna followed by a massage: the bed sat
-- reserved and empty through the sauna, and the sauna was never held at all.
-- Worse, the finish time quoted online had no room in it for the shower, the
-- consultation and the therapist setting up, so the desk was always behind.
--
-- So each treatment gets its own place, its own planned window, and — once the
-- desk logs them — the times it actually ran.

ALTER TABLE "AppointmentService" ADD COLUMN "resourceId"        TEXT;
ALTER TABLE "AppointmentService" ADD COLUMN "startAt"           TIMESTAMP(3);
ALTER TABLE "AppointmentService" ADD COLUMN "endAt"             TIMESTAMP(3);
ALTER TABLE "AppointmentService" ADD COLUMN "actualStartAt"     TIMESTAMP(3);
ALTER TABLE "AppointmentService" ADD COLUMN "actualEndAt"       TIMESTAMP(3);
ALTER TABLE "AppointmentService" ADD COLUMN "changeoverMinutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AppointmentService"
  ADD CONSTRAINT "AppointmentService_resourceId_fkey"
  FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AppointmentService_resourceId_startAt_idx"
  ON "AppointmentService"("resourceId", "startAt");

ALTER TABLE "Service" ADD COLUMN "sequenceRank"      INTEGER DEFAULT 50 NOT NULL;
ALTER TABLE "Service" ADD COLUMN "changeoverMinutes" INTEGER;

-- Backfill the plan from what is already booked.
--
-- Laid out end to end inside the appointment's existing window, in sortRank
-- order. This matters: an appointment's window is already the *sum* of its
-- treatments' durations, so laying them sequentially fills it exactly and no
-- booking moves by a minute. Giving every treatment the appointment's whole
-- window instead would make a two-treatment booking look like two people on
-- one bed at the same time, and the next caller would be told it was full.
WITH ordered AS (
  SELECT
    s.id,
    a."startAt" AS "visitStart",
    a."resourceId",
    COALESCE(
      SUM(s."durationMinutes") OVER (
        PARTITION BY s."appointmentId"
        ORDER BY s."sortRank", s.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0
    ) AS "minutesBefore",
    s."durationMinutes"
  FROM "AppointmentService" s
  JOIN "Appointment" a ON a.id = s."appointmentId"
)
UPDATE "AppointmentService" t
SET "resourceId" = o."resourceId",
    "startAt"    = o."visitStart" + (o."minutesBefore" || ' minutes')::interval,
    "endAt"      = o."visitStart" + ((o."minutesBefore" + o."durationMinutes") || ' minutes')::interval
FROM ordered o
WHERE t.id = o.id
  AND t."startAt" IS NULL;

-- The house order, so a sauna is offered before a massage without anyone being
-- asked. Matched on the place a treatment needs rather than its name: heat and
-- soaking come first, the table last, and anything unrecognised keeps the
-- middling default so it does not jump the queue.
UPDATE "Service" SET "sequenceRank" = 10 WHERE "requiredResourceType" = 'SAUNA';
UPDATE "Service" SET "sequenceRank" = 20 WHERE "requiredResourceType" = 'CHAIR';
UPDATE "Service" SET "sequenceRank" = 30 WHERE "requiredResourceType" IN ('BED', 'ROOM');

-- A sauna needs a shower afterwards; nothing else needs more than the house
-- default, so only the sauna carries an override.
UPDATE "Service" SET "changeoverMinutes" = 20 WHERE "requiredResourceType" = 'SAUNA';
