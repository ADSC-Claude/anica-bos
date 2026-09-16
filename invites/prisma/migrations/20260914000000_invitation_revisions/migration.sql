-- History: one row per auto-save that changed a part, holding the invitation
-- as it was just before. Pruned to the last thirty plus one a day for sixty
-- days by the code that writes it; deleted with the invitation.
CREATE TABLE "InvitationRevision" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvitationRevision_invitationId_createdAt_idx" ON "InvitationRevision"("invitationId", "createdAt");

ALTER TABLE "InvitationRevision" ADD CONSTRAINT "InvitationRevision_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
