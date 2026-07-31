-- Which places are taken whole.
--
-- Rooms and the sauna are: a couples room goes to one party or stays empty, and
-- nobody joins strangers in a sauna. Open beds and the foot-spa chairs are the
-- opposite — two unrelated bookings sit side by side there all evening, which is
-- the whole point of having four beds rather than one room of four.
--
-- Matched on type rather than name, so a second sauna or a third couples room
-- added later inherits the right behaviour without anyone remembering to tick a
-- box. Anything already ticked is left alone.

UPDATE "Resource"
SET "exclusiveUse" = true
WHERE type IN ('ROOM', 'SAUNA')
  AND "exclusiveUse" = false;

-- A couples room holds two and a sauna holds four. Capacity 1 on either is the
-- old default from before capacity was read at all, and would now mean "one
-- party, one person" — which for a room is exactly the sale the owner does not
-- want to make.
UPDATE "Resource" SET capacity = 2 WHERE type = 'ROOM'  AND capacity < 2;
UPDATE "Resource" SET capacity = 4 WHERE type = 'SAUNA' AND capacity < 4;
