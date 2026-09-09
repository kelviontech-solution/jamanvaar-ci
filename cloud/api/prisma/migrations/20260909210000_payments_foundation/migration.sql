-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CASHFREE');

-- CreateEnum
CREATE TYPE "PaymentConnectionType" AS ENUM ('PLATFORM_POOLED');

-- CreateEnum
CREATE TYPE "PaymentConnectionStatus" AS ENUM ('NOT_CONNECTED', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'SENT_TO_POS', 'PAYMENT_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('CREATED', 'PENDING', 'AUTHORIZED', 'SUCCESS', 'FAILED', 'USER_DROPPED', 'CANCELLED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentTransactionMethod" AS ENUM ('UPI', 'CARD', 'NET_BANKING', 'WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'PROCESSED', 'FAILED', 'IGNORED_DUPLICATE');

-- CreateTable
CREATE TABLE "MenuSnapshotItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "externalItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "basePrice" INTEGER NOT NULL,
    "modifierGroups" JSONB,
    "taxRate" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuSnapshotItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "kioskId" TEXT,
    "externalOrderId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "OrderPaymentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'CASHFREE',
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'CREATED',
    "method" "PaymentTransactionMethod",
    "paymentSessionId" TEXT,
    "providerResponse" JSONB,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantPaymentConnection" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'CASHFREE',
    "connectionType" "PaymentConnectionType" NOT NULL DEFAULT 'PLATFORM_POOLED',
    "cashfreeVendorId" TEXT,
    "status" "PaymentConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "settlementAccountName" TEXT,
    "settlementAccountNumberEncrypted" TEXT,
    "settlementIfsc" TEXT,
    "settlementUpiVpa" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantPaymentConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'CASHFREE',
    "providerEventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuSnapshotItem_restaurantId_idx" ON "MenuSnapshotItem"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuSnapshotItem_restaurantId_externalItemId_key" ON "MenuSnapshotItem"("restaurantId", "externalItemId");

-- CreateIndex
CREATE INDEX "Order_restaurantId_idx" ON "Order"("restaurantId");

-- CreateIndex
CREATE INDEX "Order_kioskId_idx" ON "Order"("kioskId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_restaurantId_externalOrderId_key" ON "Order"("restaurantId", "externalOrderId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_restaurantId_idx" ON "PaymentTransaction"("restaurantId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_orderId_idx" ON "PaymentTransaction"("orderId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_providerPaymentId_idx" ON "PaymentTransaction"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_provider_providerOrderId_key" ON "PaymentTransaction"("provider", "providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantPaymentConnection_restaurantId_key" ON "RestaurantPaymentConnection"("restaurantId");

-- CreateIndex
CREATE INDEX "Refund_restaurantId_idx" ON "Refund"("restaurantId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "WebhookEvent_restaurantId_idx" ON "WebhookEvent"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventKey_key" ON "WebhookEvent"("provider", "providerEventKey");

-- AddForeignKey
ALTER TABLE "MenuSnapshotItem" ADD CONSTRAINT "MenuSnapshotItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_kioskId_fkey" FOREIGN KEY ("kioskId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantPaymentConnection" ADD CONSTRAINT "RestaurantPaymentConnection_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: every payment table is tenant-owned (restaurantId-scoped), same shape
-- as every other tenant table (Subscription, ActivationKey, Backup,
-- ApplicationEntitlement, ...). FORCE is required because the app's DB role
-- owns these tables and Postgres exempts owners from RLS by default.
-- WebhookEvent.restaurantId is nullable — the policy shape is unchanged,
-- it simply means a row with no resolved restaurant is invisible under any
-- tenant context, only visible via runAsPlatform, which is correct: only
-- system/platform code touches WebhookEvent directly.

ALTER TABLE "MenuSnapshotItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MenuSnapshotItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuSnapshotItem"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "PaymentTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentTransaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentTransaction"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "RestaurantPaymentConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RestaurantPaymentConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RestaurantPaymentConnection"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Refund"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );

ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WebhookEvent"
  USING (
    current_setting('app.is_platform_context', true) = 'true'
    OR "restaurantId" = current_setting('app.current_restaurant_id', true)
  );
