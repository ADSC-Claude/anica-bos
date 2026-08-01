-- Follow-up questions, and a way to say "none of these".
--
-- "when you click something thats needing a follow up question, create a follow
--  up question that will be answered" — and a tick box for when nothing applies.
--
-- "Recent surgery or injury" on its own tells the therapist to be careful of
-- something without saying what or where. The half of the answer that matters
-- was never asked for.
ALTER TABLE "ClientFieldDefinition" ADD COLUMN "dependsOnKey" TEXT;
ALTER TABLE "ClientFieldDefinition" ADD COLUMN "isNoneOption" BOOLEAN NOT NULL DEFAULT false;

-- Medications becomes a tick with a follow-up, and goes on the online form.
-- It was a free-text box that was never shown to guests booking online, so the
-- therapist met them without knowing.
INSERT INTO "ClientFieldDefinition"
  ("id", "key", "label", "section", "type", "options", "helpText", "required",
   "showOnline", "alertValues", "sortRank", "retired", "dependsOnKey", "isNoneOption")
VALUES
  (gen_random_uuid()::text, 'medications_taking', 'Currently taking any medication',
   'MEDICAL', 'BOOLEAN', '{}', '', false, true, '{true}', 18, false, NULL, false)
ON CONFLICT ("key") DO NOTHING;

UPDATE "ClientFieldDefinition"
SET "label" = 'If yes, please specify:',
    "dependsOnKey" = 'medications_taking',
    "showOnline" = true,
    "helpText" = 'Anything you take regularly, including vitamins and herbal remedies.',
    "sortRank" = 19
WHERE "key" = 'medications';

-- One follow-up per condition that needs one. Each asks the thing a therapist
-- would otherwise have to ask on the table, with the guest already undressed.
INSERT INTO "ClientFieldDefinition"
  ("id", "key", "label", "section", "type", "options", "helpText", "required",
   "showOnline", "alertValues", "sortRank", "retired", "dependsOnKey", "isNoneOption")
VALUES
  (gen_random_uuid()::text, 'hypertension_detail', 'Is it controlled, and are you on medication for it?',
   'MEDICAL', 'TEXT', '{}', '', false, true, '{}', 10, false, 'hypertension', false),
  (gen_random_uuid()::text, 'heart_condition_detail', 'What should your therapist be careful of?',
   'MEDICAL', 'TEXT', '{}', '', false, true, '{}', 11, false, 'heart_condition', false),
  (gen_random_uuid()::text, 'diabetes_detail', 'Any numbness in your hands or feet?',
   'MEDICAL', 'TEXT', '{}', 'Numb areas need a lighter touch and a careful check of the skin.',
   false, true, '{}', 12, false, 'diabetes', false),
  (gen_random_uuid()::text, 'pregnancy_detail', 'How many weeks, or how long since you gave birth?',
   'MEDICAL', 'TEXT', '{}', '', false, true, '{}', 13, false, 'pregnancy', false),
  (gen_random_uuid()::text, 'recent_surgery_detail', 'What was it, when, and which area should we avoid?',
   'MEDICAL', 'TEXT', '{}', '', false, true, '{}', 14, false, 'recent_surgery', false),
  (gen_random_uuid()::text, 'skin_condition_detail', 'Whereabouts on your body?',
   'MEDICAL', 'TEXT', '{}', '', false, true, '{}', 15, false, 'skin_condition', false),
  (gen_random_uuid()::text, 'varicose_veins_detail', 'Whereabouts?',
   'MEDICAL', 'TEXT', '{}', '', false, true, '{}', 16, false, 'varicose_veins', false)
ON CONFLICT ("key") DO NOTHING;

-- Last in the list, because it is the answer you give after reading the rest.
INSERT INTO "ClientFieldDefinition"
  ("id", "key", "label", "section", "type", "options", "helpText", "required",
   "showOnline", "alertValues", "sortRank", "retired", "dependsOnKey", "isNoneOption")
VALUES
  (gen_random_uuid()::text, 'none_apply', 'None of the above',
   'MEDICAL', 'BOOLEAN', '{}', '', false, true, '{}', 17, false, NULL, true)
ON CONFLICT ("key") DO NOTHING;
