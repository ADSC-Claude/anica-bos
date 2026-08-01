-- Split an employee's name, and give her the name people actually use.
--
-- One "Full name" box was doing two jobs badly. Payroll and the government
-- forms need the legal name in parts — SSS and BIR ask for surname, first name,
-- middle name separately — and nobody in the building calls anyone by it. The
-- desk, the clients and the roster all say "Ms. Jenny".
--
-- So: the parts are stored, `name` keeps the assembled legal name for payroll,
-- and `displayName` carries what everyone says out loud.

ALTER TABLE "Employee" ADD COLUMN "firstName"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "Employee" ADD COLUMN "middleName"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "Employee" ADD COLUMN "lastName"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "Employee" ADD COLUMN "nickname"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "Employee" ADD COLUMN "title"       TEXT NOT NULL DEFAULT 'Ms.';
ALTER TABLE "Employee" ADD COLUMN "displayName" TEXT NOT NULL DEFAULT '';

-- Backfill the parts from whatever is in `name` today.
--
-- First word is the given name and the rest is the surname. Filipino names do
-- not split reliably — "Grace Delos Reyes" could be a two-word surname or a
-- middle name and a surname, and guessing wrong puts the wrong thing on a
-- payslip. So the middle name is deliberately left empty for someone to fill in
-- rather than invented here, and nothing is lost: `name` still holds exactly
-- what it held before.
UPDATE "Employee"
SET "firstName" = split_part(trim(name), ' ', 1),
    "lastName"  = CASE
                    WHEN position(' ' IN trim(name)) > 0
                    THEN substring(trim(name) FROM position(' ' IN trim(name)) + 1)
                    ELSE ''
                  END
WHERE "firstName" = '';

-- "Ms." + nickname, or her first name when there is no nickname yet.
UPDATE "Employee"
SET "displayName" = trim(
      COALESCE(NULLIF(title, ''), 'Ms.') || ' ' ||
      COALESCE(NULLIF("nickname", ''), NULLIF("firstName", ''), name)
    )
WHERE "displayName" = '';
