-- Split "taken whole" from "must be filled".
--
-- One flag was answering two questions, and the sauna is where that broke. Both
-- a couples room and the sauna go to one booking at a time — nobody joins
-- strangers in either. But only the room has to be *filled*: leaving one of its
-- two beds empty strands a bed nobody else can book, whereas one person in a
-- four-place sauna is an ordinary sale. She has it to herself and the next
-- booking takes it after her.
--
-- So exclusiveUse keeps its first meaning and fillWhole carries the second.

ALTER TABLE "Resource" ADD COLUMN "fillWhole" BOOLEAN NOT NULL DEFAULT false;

-- Rooms only. Matched on type rather than name so a third couples room added
-- later inherits the rule without anyone remembering to tick a box, and the
-- sauna is deliberately left out.
UPDATE "Resource" SET "fillWhole" = true WHERE type = 'ROOM' AND "exclusiveUse" = true;
