# JAMANVAAR Testing & QA Verification Matrix

## 1. Automated Test Execution

Run the complete test suite:
```bash
npm test
```

### Coverage Scope:
- `pricing.test.ts`: GST 5% tax calculations (CGST 2.5% + SGST 2.5%), modifier additions, coupon discount limits, and round-off logic.
- `modifiers.test.ts`: Enforces minimum/maximum selections and required group constraints.
- `coupons.test.ts`: Minimum cart threshold enforcement, percentage/flat discount caps, expiration guards.

---

## 2. Offline Resilience Test Matrix

| Scenario | Expected Behavior | Verification Status |
|---|---|---|
| Network lost while customer is browsing menu | Menu loads smoothly from local SQLite cache; zero blocking | PASSED |
| Network lost during cart checkout | Customer can complete order with Cash-at-counter; event queues in sync outbox | PASSED |
| Network restored after disconnection | Outbox automatically flushes pending order events to server; zero duplicates | PASSED |
| App crash during active payment | State machine recovers safely; idempotency key prevents double debit | PASSED |
