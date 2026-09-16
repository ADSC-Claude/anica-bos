-- A moving picture: a GIF, an animated WebP, an animated PNG.
--
-- Two of the three formats are the same content type as their still versions —
-- an animated WebP is image/webp and an APNG is image/png — so the type cannot
-- answer it and the column has to. What it means is *never re-encode this*: the
-- studio's picture path goes through a canvas, which holds one frame, so a
-- moving picture would arrive as its own first frame. It is stored and served
-- exactly as it was uploaded, and the checklist watches its weight instead.
ALTER TABLE "Media" ADD COLUMN "animated" BOOLEAN NOT NULL DEFAULT false;
