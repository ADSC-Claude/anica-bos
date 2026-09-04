-- The Activity screen lists sign-ins newest-first regardless of email and
-- filters actions by person; these are the two orderings the existing
-- indexes did not cover.
CREATE INDEX "LoginEvent_createdAt_idx" ON "LoginEvent"("createdAt");

CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
