-- CreateIndex
CREATE INDEX "MailLog_orgId_sentAt_idx" ON "MailLog"("orgId", "sentAt");

-- CreateIndex
CREATE INDEX "Member_email_idx" ON "Member"("email");

-- CreateIndex
CREATE INDEX "Message_authorId_idx" ON "Message"("authorId");

-- CreateIndex
CREATE INDEX "Photo_filename_idx" ON "Photo"("filename");

-- CreateIndex
CREATE INDEX "Photo_albumId_sortOrder_idx" ON "Photo"("albumId", "sortOrder");

-- CreateIndex
CREATE INDEX "Rsvp_memberId_idx" ON "Rsvp"("memberId");

-- CreateIndex
CREATE INDEX "Rsvp_userId_idx" ON "Rsvp"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");

