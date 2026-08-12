-- A public contact form needs somewhere to land. An enquiry that sits unread
-- for three days is a booking lost to whoever answered first, so it raises an
-- alert on the dashboard like any other thing that needs a person.
--
-- Additive only: adding a value to an enum rewrites no rows and takes no
-- table lock, so this is safe to run against a live database.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'ENQUIRY';
