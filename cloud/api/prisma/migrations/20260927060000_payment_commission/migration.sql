-- Commission & split settlement: routes each Cashfree order's restaurant
-- share to the restaurant's own vendor account (previously never declared,
-- so 100% of every payment stayed in the platform's master Cashfree
-- account). commissionBps/platformAmount/restaurantAmount are an immutable
-- snapshot taken once at order-creation time.
ALTER TABLE "RestaurantPaymentConnection" ADD COLUMN "commissionOverrideBps" INTEGER;
ALTER TABLE "PaymentTransaction" ADD COLUMN "commissionBps" INTEGER;
ALTER TABLE "PaymentTransaction" ADD COLUMN "platformAmount" INTEGER;
ALTER TABLE "PaymentTransaction" ADD COLUMN "restaurantAmount" INTEGER;
