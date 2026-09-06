-- Guest photo uploads: who sent it, and the connection it came from.
ALTER TABLE "Media" ADD COLUMN "uploadedBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Media" ADD COLUMN "ip" TEXT NOT NULL DEFAULT '';

-- The guest page reads approved photos newest-first; the owner's moderation
-- screen reads the unapproved ones the same way.
CREATE INDEX "Media_invitationId_kind_approved_createdAt_idx" ON "Media"("invitationId", "kind", "approved", "createdAt");
CREATE INDEX "Media_ip_createdAt_idx" ON "Media"("ip", "createdAt");
