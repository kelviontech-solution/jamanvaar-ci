ALTER TABLE "RestaurantPaymentConnection"
  ADD COLUMN "directSettlementRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "settlementBankName" TEXT,
  ADD COLUMN "settlementBankAccountType" TEXT;
