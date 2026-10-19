# Scorecards and scoring method

Latest focused source follow-up: [Entity-sync admission](ENTITY_SYNC_2026-10-19.md). The 2,418-test broad result is the preceding baseline; subsequent affected checks are reported separately and do not change the provisional ratings by themselves.

Latest local recovery evidence: [POS manager original-operation recovery](INTERRUPTED_OPERATION_RECOVERY_2026-10-19.md). Separate scores stay 7.0 / 7.0 / 6.5 pending the remaining documented acceptance gates.

The latest broad root run passed 2,418 tests in 336 files; the later recovery follow-up passed 94 tests. These are overlapping working-tree checks, with source/concurrency limits documented in the linked report. They improve evidence without closing the ten remaining work packages or production acceptance.

Latest verification and remaining acceptance: [Inbound sync, 19 October](INBOUND_SYNC_2026-10-19.md). No score increase is inferred from this focused repair alone.

19 October evidence: [Cancellation, accepted pricing and recorded balances](CANCELLATION_BALANCES_2026-10-19.md). Separate provisional scores remain 7.0 / 7.0 / 6.5; focused tests and browser fixtures do not replace remaining programme acceptance.

Updated headline scores: 18 October 2026. See [repair reassessment and remaining work](REASSESSMENT_2026-10-18.md). Application-by-application numbers and the weighted calculation below are retained as the **original audit baseline**, not freshly rerated UX or production certification.

Scores are provisional engineering judgments about the inspected scope, not measured reliability percentages, certifications or promises of production capacity. **NV** means not sufficiently verified to score. Authenticated UI journeys were not exhaustively re-run on this changing checkout, so a polished entry screenshot does not earn a full UX score.

## Separate headline scores

| Dimension | Provisional score | Reason |
| --- | --- | --- |
| Security | **7.0 / 10** | Required backup encryption fails closed and financial restore origin is verified; existing tenant/role/product security regressions pass. Complete route/native/provider/production acceptance remains incomplete. No confirmed cross-tenant exploit found in this scoped assessment. |
| Code quality | **7.0 / 10** | Prior root/API gates passed; later broad failures and focused correction runs are recorded explicitly. Actual POS/Kiosk/Captain/Admin command adoption, local recovery and component/SQLite checks improve coverage. See the latest [Admin return/reconciliation verification](ADMIN_RETURN_RECONCILIATION_2026-10-18.md) for final run totals. Large stores, legacy paths and remaining financial callers still limit the rating. |
| SaaS readiness | **6.5 / 10** | POS/Kiosk/Captain/Admin acknowledged operations, protected local export, reporting and truthful storage health improve operation. Remaining caller adoption, guided recovery, complete restore drills and installed/provider/hardware acceptance still prevent broad rollout. |

These scores remain separate. Averaging them must not hide a release blocker.

## Application assessment

FC = functional completeness; BI = backend integration; DI = data correctness; SEC = security; PERF = performance; REL = reliability/recovery; TEST = business-flow verification; UX = usability; MAINT = maintainability; PROD = production readiness within defined scope.

| Experience | FC | BI | DI | SEC | PERF | REL | TEST | UX | MAINT | PROD |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | ---: | ---: |
| Super Admin | 7 | 7 | 5 | 7 | NV | 5.5 | 6 | NV | 6 | 5.5 |
| Restaurant/POS Admin | 7.5 | 7 | 6 | 7 | NV | 6 | 6.5 | NV | 5.5 | 5.5 |
| Kiosk Admin experience | 7 | 7 | 6 | 7 | NV | 6 | 6 | NV | 5.5 | 5.5 |
| Dedicated QR Admin experience | 7.5 | 7.5 | 6.5 | 7 | NV | 6 | 6.5 | NV | 6 | 6 |
| POS terminal | 7.5 | 7 | 6 | 6.5 | NV | 5 | 6.5 | NV | 5.5 | 5.5 |
| Customer Kiosk | 7 | 7 | 6 | 6.5 | NV | 5.5 | 6 | NV | 5 | 5.5 |
| Captain | 7 | 7 | 5 | 6.5 | NV | 5.5 | 6 | NV | 6 | 5 |
| KDS | 7.5 | 7 | 6.5 | 7 | NV | 6.5 | 6.5 | NV | 6 | 6 |
| Customer QR | 7.5 | 7.5 | 6.5 | 7 | NV | 6.5 | 6.5 | NV | 6 | 6 |

### Why these scores differ

- **Super Admin:** strong real control plane; per-restaurant refund/date/device metrics and incomplete recovery fidelity are central weaknesses. Repair EC-05–08/10 before trusting its financial/recovery overview.
- **Restaurant Admin:** shared configurable tools and branch/product scope are valuable; local-first state, recovery contracts and whole-workspace complexity require acceptance by owner/manager roles. Improve task routing and shared-setting scope without another admin silo.
- **Kiosk Admin:** real configuration and terminal management are present. Readiness must distinguish configuration from hardware acknowledgement, and a test journey must cover each terminal override. EC-09 matters here.
- **QR Admin:** independent and bundled product paths exist. Ensure health checks, page/menu publication, CRM and entitlements are verified with QR-only and all-product plans; this audit does not certify every optional feature.
- **POS:** extensive ordering/payment/offline tooling; EC-01/02 and evolving settlement/cart APIs require fault and concurrency verification. Actual installed printing/upgrade acceptance is unknown.
- **Kiosk:** substantial customer journey and real payment integration. Shared touch/loyalty fixes exist in the newer commit, but local commit, printer health and physical payment/reset behaviour remain important acceptance boundaries.
- **Captain:** table/course/KOT integration exists; incomplete quick-add validation is a reproduced correctness problem. Reuse identical dish-rule fixtures across all channels.
- **KDS:** item revisions, station/expo processing and authoritative sync are meaningful strengths. Physical multi-screen simultaneous operations, full serving/payment semantics and recovery remain unverified here.
- **Customer QR:** server quotes, signed guest proof and provider verification are substantial. Secure recovery, kitchen propagation, mobile payment app transitions and live receipt acceptance still need full current-version tests.

## Shared engineering dimensions

| Area | Judgment / limit |
| --- | --- |
| Backend services | 7 / 10: real modular services, transactions and guards; reporting/recovery contracts remain inconsistent |
| Database architecture | 7 / 10: migration chain, RLS, composite membership and uniqueness exist; application recovery does not yet reconstruct the complete business data set |
| Offline synchronization | 5.5 / 10: replay/cursor/SQLite machinery exists; accepted-versus-durable boundary and identity omissions remain |
| Tenant/branch isolation | 7 / 10 provisional: explicit layers exist; every protected route and installed reconnect path were not manually tested |
| Subscription enforcement | 7 / 10 provisional: server product/branch/device controls and cached policy exist; installed expiry/revocation acceptance still needed |
| Realtime | 7 / 10: authenticated SSE, cross-process relay and catch-up recovery; high-scale socket/reauth behaviour unmeasured |
| DevOps/release | 6 / 10: migrations and signing workflows exist; declared type gates fail and installed release acceptance remains blocked |
| Observability | 6 / 10: health, exception records, runtime metrics and request IDs exist; misleading health formulas and no demonstrated fleet SLO acceptance |
| Measured deployment capacity | NV: neither 1,000 restaurants nor 10,000 sessions certified |

## Original weighted engineering maturity (17 October baseline)

The requested weights are retained: functionality 20%, integrity 15%, security 15%, recovery 15%, performance 10%, integration 10%, verification 5%, UX 5%, maintenance/operations 5%.

Use assessed values 7, 5.5, 6.5, 5.5, NV, 6.5, 5.5, NV, 6 respectively. Performance and full UX are excluded and remaining weights normalized over **85% assessed coverage**:

`(7×20 + 5.5×15 + 6.5×15 + 5.5×15 + 6.5×10 + 5.5×5 + 6×5) / 85 = 6.18`

**Provisional engineering maturity: 6.2 / 10.** This is deliberately not presented as a fully verified overall product score. Production readiness is **NO-GO for an unqualified broad commercial rollout** until the P1 defects and required operational acceptance are resolved. A numerical average cannot override financial recovery or order-loss risks.
