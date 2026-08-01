-- Remove follow-up questions whose parent does not exist.
--
-- The previous migration inserts follow-ups for the seeded health questions,
-- which is right for a database that has been running a while and wrong for a
-- brand new one: there, the migrations run *before* the seed, so the parents
-- do not exist yet and the follow-ups land pointing at nothing. They can never
-- be displayed — a follow-up only appears when its parent is ticked — so they
-- are invisible rubbish that makes the catalogue lie about itself.
--
-- On an established database this deletes nothing: every parent is there. On a
-- fresh one it clears the way for the seed to create the whole set properly.
--
-- Guarded twice over: only rows whose parent is genuinely missing, and only
-- rows nobody has ever answered. A question with an answer behind it is not
-- rubbish whatever its parent is doing, and is left alone for a human to look
-- at.
DELETE FROM "ClientFieldDefinition" f
WHERE f."dependsOnKey" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ClientFieldDefinition" p WHERE p."key" = f."dependsOnKey"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ClientFieldValue" v WHERE v."definitionId" = f."id"
  );
