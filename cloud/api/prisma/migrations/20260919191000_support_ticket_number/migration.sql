-- SERIAL creates the sequence and backfills existing tickets.
ALTER TABLE "SupportTicket" ADD COLUMN "number" SERIAL;
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");
