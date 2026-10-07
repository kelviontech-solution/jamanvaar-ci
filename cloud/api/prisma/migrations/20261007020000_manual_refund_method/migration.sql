-- Refunds are recorded by hand: the restaurant pays the customer in cash or by UPI itself.
CREATE TYPE "RefundMethod" AS ENUM ('CASH', 'UPI_TO_CUSTOMER');
ALTER TABLE "Refund" ADD COLUMN "method" "RefundMethod";
