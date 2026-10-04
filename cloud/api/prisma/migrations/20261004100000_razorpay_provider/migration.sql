-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'RAZORPAY';

-- AlterDefault
ALTER TABLE "PaymentTransaction" ALTER COLUMN "provider" SET DEFAULT 'RAZORPAY';
ALTER TABLE "RestaurantPaymentConnection" ALTER COLUMN "provider" SET DEFAULT 'RAZORPAY';
ALTER TABLE "WebhookEvent" ALTER COLUMN "provider" SET DEFAULT 'RAZORPAY';
