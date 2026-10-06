# Missing reliable guarantees and unfinished verification

This audit does not label a feature missing merely because a test was not executed. Rows distinguish demonstrated missing guarantees from required verification and intentionally pending integrations. No competitor feature comparison was researched, so competitive parity is not claimed.

| Capability | Evidence category | Evidence / next action |
| --- | --- | --- |
| Durable paid kiosk kitchen delivery | CONFIRMED broken guarantee | B003: customer paid/confirmed but remote KDS has no ticket. |
| Correct tax/payment/receipt contract | CONFIRMED broken guarantee | B002: 105 vs 118 and 314 vs 299. |
| Server-verifiable refund staff approval | CONFIRMED missing enforcement | B005: Cashier refund succeeds with device credentials only. |
| Cross-device inventory master bootstrap | CONFIRMED missing transport in tested path | B007: movements persist, definition absent and new admin empty. |
| Owner session recovery and truthful no-shift display | CONFIRMED missing reliable UX | B009/B010. |
| Active direct-bank Route settlement | INTENTIONALLY PENDING | User confirmed Route pending; request recorded, MANUAL mode retained until activation/verification. Do not auto-enable direct transfer. |
| All CRUD/approval/undo/import/bulk actions | UNVERIFIED | Rendered pages do not establish action completeness; control and unexecuted matrices identify limits. |
| Split bills, mixed/inclusive tax, modifiers, table transfers and refund variants | UNVERIFIED | Expectations for professional restaurant operation; execute exact supported paths before claiming absent or complete. |
| Simultaneous peak and long soak | UNVERIFIED | Only sequential 20 sales and 30 KOTs executed. |
| Physical printing/cash drawer/provider delivery | BLOCKED | Needs equipment/provider sandbox; local queue and OTP capture are partial substitutes only. |
| Backup restore, multi-instance relay, deployed AWS proof | UNVERIFIED / BLOCKED | Requires isolated restore setup and deployed telemetry/access. |

Common POS capability expectations above are product requirements, not sourced claims about any named competitor. Priority is correctness of the existing restaurant workflow before adding features.
