-- A table's shape on the seating chart: round, rectangle or long. Drawn on the
-- chart only; the guest's own link still says the table's name.
ALTER TABLE "SeatingTable" ADD COLUMN "shape" TEXT NOT NULL DEFAULT 'round';
