-- Where each existing treatment is performed.
--
-- Every service predates this column, so they all read NULL — "anywhere that is
-- free", which would let a foot spa take a bed and a massage take a foot-spa
-- chair. The owner's rule: reflexology and foot spa happen in the chair area,
-- sauna in the sauna, everything else on a bed.
--
-- This must be a separate migration from the one adding CHAIR to the enum:
-- Postgres refuses to use a new enum value in the transaction that added it.
--
-- Anything mis-assigned is one dropdown away from being corrected in
-- Settings → Services, and every statement below only touches rows that still
-- have no answer, so re-running changes nothing.

-- Chair: any foot treatment, and anything reflexology. Matched on the service
-- name and on its category, so a service filed under "Foot Spa & Reflexology"
-- is caught even when its own name does not say so — "Foot Massage" is
-- reflexology done in the chair area, not a massage done on a bed.
UPDATE "Service" s
SET "requiredResourceType" = 'CHAIR'
FROM "ServiceCategory" c
WHERE s."categoryId" = c.id
  AND s."requiredResourceType" IS NULL
  AND (
    s.name ILIKE '%foot%' OR s.name ILIKE '%reflex%' OR
    c.name ILIKE '%foot%' OR c.name ILIKE '%reflex%'
  );

-- Sauna: matched on the service name only. Categories are grab-bags — a
-- category called "Add-ons & Sauna" holds hot compresses too, and sending a hot
-- compress to the sauna would make it unbookable whenever the sauna is in use.
UPDATE "Service"
SET "requiredResourceType" = 'SAUNA'
WHERE "requiredResourceType" IS NULL
  AND name ILIKE '%sauna%';

-- Everything else happens on a bed, which a room full of beds also satisfies.
UPDATE "Service"
SET "requiredResourceType" = 'BED'
WHERE "requiredResourceType" IS NULL;
