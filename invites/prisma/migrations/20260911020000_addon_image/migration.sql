-- A picture of what an add-on buys.
--
-- Blank by default and blank is fine: the pages render nothing rather than an
-- empty frame, so every row that exists today keeps working and a picture is
-- added when there is one worth showing.
ALTER TABLE "AddOn" ADD COLUMN "imageUrl" TEXT NOT NULL DEFAULT '';
