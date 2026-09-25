-- Sync tracing: a trace id and event id on every sync log row, so one order journey can be followed end to end.
ALTER TABLE "SyncEventLog" ADD COLUMN "entityId" TEXT;
ALTER TABLE "SyncEventLog" ADD COLUMN "traceId" TEXT;
ALTER TABLE "SyncEventLog" ADD COLUMN "eventId" TEXT;
CREATE INDEX "SyncEventLog_traceId_idx" ON "SyncEventLog"("traceId");
