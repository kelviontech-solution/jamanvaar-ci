-- BUG-088: restaurants raise tickets from Restaurant Admin; tickets get a category, history and attachments.
ALTER TABLE "SupportTicket" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "SupportTicket" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "SupportTicket" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "SupportTicket" ADD COLUMN "raisedByUserId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "raisedByName" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "raisedByEmail" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "branchId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "deviceId" TEXT;
CREATE INDEX "SupportTicket_source_idx" ON "SupportTicket"("source");

ALTER TABLE "TicketComment" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "TicketComment" ADD COLUMN "authorType" TEXT NOT NULL DEFAULT 'PLATFORM';
ALTER TABLE "TicketComment" ADD COLUMN "authorName" TEXT;
ALTER TABLE "TicketComment" ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'PLATFORM',
    "actorName" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "visibleToRestaurant" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketEvent_ticketId_createdAt_idx" ON "TicketEvent"("ticketId", "createdAt");
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedByType" TEXT NOT NULL DEFAULT 'PLATFORM',
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
