-- Enable the preference for newly created rows only. Preserve existing restaurant/branch opt-outs.
-- Guests can pay online only while their connection and verified gateway are active.
ALTER TABLE "QrSettings" ALTER COLUMN "allowOnlinePayment" SET DEFAULT true;
