-- Five minutes between treatments, not twenty.
--
-- The first pass gave the sauna a twenty-minute override for the shower. The
-- owner's call is five for everything, and the arithmetic is the reason:
--
--   sauna  1:30 – 2:00
--   gap         5 min
--   massage 2:05 – 3:05   -> next bookable slot 3:15 on the quarter-hour grid
--
-- Ten minutes of slack falls out of the slot grid for free, and that is where a
-- slow consultation goes. Twenty in the gap *plus* the grid rounding would push
-- the same visit to 3:30 and cost the evening a whole treatment.

-- Back to the house default for every treatment. The override column stays —
-- something may genuinely need longer later — but nothing carries one today.
UPDATE "Service" SET "changeoverMinutes" = NULL WHERE "changeoverMinutes" IS NOT NULL;

-- The house default itself, if it was ever saved from the settings screen.
-- Settings not present in this table fall back to the code default, which is
-- now 5, so only a stored row needs correcting.
UPDATE "Setting"
SET value = '5'::jsonb
WHERE key = 'booking.changeoverMinutes';
