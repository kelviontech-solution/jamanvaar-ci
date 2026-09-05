# JAMANVAAR Offline-First Sync Architecture

## 1. Outbox Pattern Implementation

JAMANVAAR employs an offline-first **Transactional Outbox Pattern** to ensure zero data loss during network disconnections.

```
[Customer Touch Order]
         │
         ▼
[Write to Local SQLite Orders]
         │
         ▼
[Insert Event into sync_events (PENDING)]
         │
         ├── Connection Online? ──► [Post to Sync Cloud API] ──► [Mark COMPLETED]
         │
         └── Connection Offline? ──► [Retain in Local Outbox] ──► [Auto-Retry on Reconnect]
```

---

## 2. Deterministic Conflict Resolution Rules

1. **Menu & Pricing Modifications**:
   - Cloud / Admin changes take precedence upon timestamp synchronization.
2. **Item Stock Availability (86 / Sold Out)**:
   - When an item is marked unavailable remotely, all kiosks immediately block new additions to cart. Existing in-flight carts are validated before payment.
3. **Order Submissions**:
   - Client-generated UUIDv4 `idempotency_key` guarantees that network timeouts or repeat button taps never generate duplicate orders or multiple KOT tickets.
4. **Payment Transactions**:
   - Payment gateway authority is definitive. Once verified, a payment transaction cannot be overwritten.
