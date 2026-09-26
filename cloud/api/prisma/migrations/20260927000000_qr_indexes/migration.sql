-- Found by reading the QR hot paths against the existing indexes (no index started with restaurantId + source):
--  * the daily QR order limit counts "restaurantId + source + createdAt >= day start" on every order;
--  * a table's open orders read "restaurantId + tableId + status".
CREATE INDEX "SyncedOrder_restaurantId_source_createdAt_idx" ON "SyncedOrder" ("restaurantId", "source", "createdAt");
CREATE INDEX "SyncedOrder_restaurantId_tableId_status_idx" ON "SyncedOrder" ("restaurantId", "tableId", "status");
