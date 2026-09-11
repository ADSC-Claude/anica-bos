-- A design's own vector animation: a Lottie JSON uploaded in the studio.
--
-- Its own kind rather than DESIGN_IMAGE, because nothing about it behaves like
-- a picture: it is not resized, it is not served to an <img>, and the player
-- that draws it is only loaded on a page that carries one. Its poster is a
-- DESIGN_IMAGE row beside it, exactly as a clip's is.
ALTER TYPE "MediaKind" ADD VALUE IF NOT EXISTS 'DESIGN_ANIM';
