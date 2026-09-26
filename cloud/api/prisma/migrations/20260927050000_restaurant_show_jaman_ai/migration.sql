-- The owner's "Show JAMAN AI Assistant" choice, kept in the cloud so every terminal of the restaurant follows it.
ALTER TABLE "Restaurant" ADD COLUMN "showJamanAi" BOOLEAN NOT NULL DEFAULT true;
