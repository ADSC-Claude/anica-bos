-- What an invitation was sold with, beside its package.
--
-- Backfilled from the line items of the order that activated it, so an
-- invitation bought with a Save the Date or a premium opening before this
-- column existed still says so. Orders are the record of the sale and are not
-- touched.
ALTER TABLE "Invitation" ADD COLUMN "addOns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Invitation" i
SET "addOns" = sub.codes
FROM (
  SELECT o."invitationId" AS id, array_agg(DISTINCT it."code") AS codes
  FROM "OrderItem" it
  JOIN "Order" o ON o."id" = it."orderId"
  WHERE it."kind" = 'ADDON' AND o."invitationId" IS NOT NULL
  GROUP BY o."invitationId"
) sub
WHERE i."id" = sub.id;
