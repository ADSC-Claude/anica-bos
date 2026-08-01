-- A 7.5% promotion is an ordinary thing for the spa to run, and an integer
-- column forces it to 7 or 8 — a price the guest was never quoted.
--
-- Widening integer -> double precision is lossless in both directions this
-- column is used: every existing whole percentage (20) and every existing
-- centavo amount (15000) keeps its exact value, and integers remain exact in
-- a double far beyond any amount this spa will ring up.
--
-- The money itself is untouched: SaleDiscount.amountCents stays an integer,
-- and discountAmount() still rounds every result to whole centavos.
ALTER TABLE "DiscountPreset" ALTER COLUMN "value" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "SaleDiscount" ALTER COLUMN "value" SET DATA TYPE DOUBLE PRECISION;
