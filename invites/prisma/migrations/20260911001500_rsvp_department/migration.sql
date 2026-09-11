-- A corporate reply's department gets its own column.
--
-- It used to ride along on "email" as "address · department", because the
-- reply had nowhere else to put it. That was harmless while nothing read the
-- column and wrong the moment something did: a department is not an address,
-- and a mailing list is exactly where it must not end up.
ALTER TABLE "Rsvp" ADD COLUMN "department" TEXT NOT NULL DEFAULT '';

-- The rows already written, unpacked. Scoped to corporate invitations because
-- that is the only form that ever asked, so nothing else can be caught by it.
UPDATE "Rsvp" r
   SET "department" = btrim(split_part(r."email", ' · ', 2)),
       "email"      = btrim(split_part(r."email", ' · ', 1))
  FROM "Invitation" i
 WHERE i."id" = r."invitationId"
   AND i."occasion" = 'CORPORATE'
   AND r."email" LIKE '% · %';

-- And the case with nothing to split on: a guest who gave a department but no
-- address stored the department alone, because the separator was only written
-- when there was an address in front of it. What is not an address is the
-- department — the same shallow test the application uses, one @ with
-- something either side and a dot in the domain.
UPDATE "Rsvp" r
   SET "department" = btrim(r."email"),
       "email"      = ''
  FROM "Invitation" i
 WHERE i."id" = r."invitationId"
   AND i."occasion" = 'CORPORATE'
   AND r."email" <> ''
   AND r."department" = ''
   AND r."email" !~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$';
