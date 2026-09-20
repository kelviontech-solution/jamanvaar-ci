-- BUG-074: mark backups whose stored object is encrypted at rest.
ALTER TABLE "Backup" ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false;
