-- BUG-094: an approximate location on each sign-in, so a person can recognise their own sessions.
ALTER TABLE "PlatformRefreshToken" ADD COLUMN "location" TEXT;
