# docs/reports — index

This directory has no stated lifecycle: it's accumulated 36+ dated folders (200+ MB, mostly
screenshot/evidence dumps) and 25 undated top-level files over roughly two weeks, with no
archival or consolidation policy. This index doesn't change that — it catalogs what's here so
"36 mystery folders" becomes navigable, and proposes a policy for a human to decide on. Nothing
listed here has been moved, archived, or deleted.

**Note for whoever reads this next:** a folder dated today relative to when this index was
written (`usability-code-audit-2026-10-12`) appeared here while this index was being built —
i.e., another session was writing to this directory concurrently. If you're about to archive or
reorganize anything here, check nothing is mid-write first.

## Dated audit/QA runs (chronological, folder name doubles as topic)

| Date | Folder | Size |
|---|---|---|
| 2026-09-28 | — (see `MARKET_GAP_ANALYSIS_2026-09-28.md` below) | — |
| 2026-10-06 | `local-core-connection-2026-10-06` | 236K |
| 2026-10-06 | `menu-completeness-2026-10-06` | 88K |
| 2026-10-06 | `menu-idle-sync-2026-10-06` | 268K |
| 2026-10-06 | `merged-admin-key-fix-2026-10-06` | 539K |
| 2026-10-06 | `qr-mobile-flow-2026-10-06` | 517K |
| 2026-10-06 | `admin-product-context-2026-10-06` | 2.3M |
| 2026-10-06 | `kiosk-management-2026-10-06` | 3.3M |
| 2026-10-06 | `browser-fixes-2026-10-06` | 15M |
| 2026-10-06 | `browser-qa-2026-10-06` | 61M |
| 2026-10-07 | `kiosk-kds-2026-10-07` | 753K |
| 2026-10-07 | `kiosk-touch-receipt-2026-10-08`* | 756K |
| 2026-10-07 | `billing-collection-2026-10-07` | 1.3M |
| 2026-10-07 | `kds-captain-controls-2026-10-07` | 1.4M |
| 2026-10-07 | `multi-branch-2026-10-07` | 1.4M |
| 2026-10-07 | `qr-ui-payment-images-2026-10-07` | 2.0M |
| 2026-10-07 | `qr-payment-recovery-2026-10-07` | 2.2M |
| 2026-10-07 | `jaman-ai-2026-10-07` | 2.9M |
| 2026-10-07 | `menu-templates-2026-10-06`* | 5.3M |
| 2026-10-07 | `menu-photos-2026-10-07` | 7.9M |
| 2026-10-07 | `kiosk-welcome-2026-10-07` | 27M |
| 2026-10-07 | `kiosk-welcome-design-access-2026-10-07` | 31M |
| 2026-10-07 | `template-images-2026-10-07` | 23M |
| 2026-10-08 | `crm-loyalty-2026-10-08` | 768K |
| 2026-10-08 | `qr-menu-staff-2026-10-08` | 268K |
| 2026-10-10 | `qr-module-2026-10-10` | 461K |
| 2026-10-10 | `qr-advanced-2026-10-10` | 920K |
| 2026-10-10 | `qr-product-2026-10-10` | 2.0M |
| 2026-10-11 | `ecosystem-assessment-2026-10-11` | 780K |
| 2026-10-11 | `native-updates-2026-10-11` | 759K |
| 2026-10-11 | `robustness-scalability-audit-2026-10-11` | 48K |
| 2026-10-11 | `ecosystem-remediation-2026-10-11` | 4.3M |
| 2026-10-11 | `qr-ui-2026-10-11` | 6.5M |
| 2026-10-11 | `ui-ux-implementation` (runs dated 2026-10-11) | 7.1M |
| 2026-10-11 | `ui-ux-audit-2026-10-11` | 17M |
| 2026-10-12 | `usability-code-audit-2026-10-12` | 4.2M (as of this index; may still be growing) |

\* dates are as spelled in the folder name itself; a couple don't match their listed position
exactly (e.g. `menu-templates-2026-10-06` sits among 10-07 work) — not corrected here, since this
index is a catalog of what exists, not a relabeling of it.

## Undated top-level reports (topic, inferred from each file's own heading)

| File | What it is |
|---|---|
| `AUDIT_BRIEF.md` | The shared brief handed to audit agents (process doc, not a findings report) |
| `AUDIT.md` | Comprehensive repository & architecture audit (V1) |
| `FINAL_AUDIT.md` | Final audit & delivery report (V1) |
| `FULL_ECOSYSTEM_QA_AUDIT_REPORT.md` | Complete QA & product audit (final) |
| `FULL_PLATFORM_AUDIT_AND_READINESS_REPORT.md` | Full platform audit & SaaS readiness report |
| `FULL_PLATFORM_AUDIT_AND_REDESIGN_PLAN.md` | Full platform audit + "Premium UI" redesign plan |
| `QA_AUDIT_REPORT.md` | Comprehensive QA audit & defect report |
| `SECURITY_AUDIT_2026-09-27.md` | Enterprise security, authorization, data-integrity audit |
| `SECURITY_CODE_QUALITY_AUDIT.md` | Complete security, code quality & production-readiness audit |
| `ROLE_BASED_AUDIT_BUGS.md` | Role-based full audit — bug list |
| `BUG_CHECKLIST.md` | Bug fix checklist |
| `BUG_LIST.md`, `BUG_LIST_2.md`, `BUG_LIST_3.md` | Three successive bug-hunt passes (3 is a kelviontech-prod-2 deployment verification) |
| `KIOSK_SAAS_QA_AUDIT_REPORT.md` | Kiosk SaaS end-to-end manual QA audit |
| `KIOSK_COLLECTION_PAYMENT_AUDIT_2026-10-06.md` | Kiosk collection/settlement audit |
| `MENU_IMAGE_AUDIT.md` | Menu image & dish content verification audit |
| `PRODUCTION_SYNC_FIXES_2026-10-06.md` | Production sync remediation |
| `QA_FULL_PLATFORM_CLICKTHROUGH_2026-09-27.md` | Full-platform manual click-through |
| `RESTAURANT_ONBOARDING_MULTI_APP_TEST_REPORT.md` | Onboarding + multi-app test report |
| `MARKET_GAP_ANALYSIS_2026-09-28.md` | Market gap analysis: Captain/KDS/POS/Restaurant Admin |
| `QR_ORDERING_CURRENT_STATE.md` | QR Ordering state audit, pre-work baseline |
| `QR_ORDERING_AUDIT_RESTAURANT_CONTROL_AND_SCALE.md` | QR Ordering: menu control, multi-table, concurrency/scale |
| `QR_ORDERING_IMPLEMENTATION_REPORT.md` | QR Ordering implementation report |
| `JAMANVAAR_COMPLETE_SYSTEM_REPORT.md` | System-wide product report |
| `JAMANVAAR_REDESIGN_DELIVERABLES.md` | Subscription/entitlement/device redesign deliverables |
| `PLATFORM_STATUS_AND_ROADMAP.md` | Platform status, connectivity & roadmap |
| `PROGRESS_LOG.md` | WhatsApp connector track progress log |
| `SESSION_HANDOFF.md` | Handoff note for a bug-fixing pass on `BUG_LIST_2.md` (marked COMPLETE) |
| `JAMANVAAR_VS_PETPOOJA_AUDIT_2026-10-03.html` | Competitor comparison |
| `activation-invalid.png`, `bug007_admin_backdoor.png` | Standalone evidence screenshots, no accompanying report |

## A proposed lifecycle (not applied — needs a decision, not a script)

1. **Extract what's durable.** A handful of these almost certainly contain decisions or
   architecture context still in effect today (e.g. `SECURITY_AUDIT_2026-09-27.md`,
   `PLATFORM_STATUS_AND_ROADMAP.md`). Pull the parts still true into one living doc (an
   `ARCHITECTURE.md` or similar at the repo root) that gets updated in place, instead of living
   inside a dated snapshot nobody re-reads.
2. **Archive, don't delete, the rest.** Move dated folders older than some cutoff (e.g. 30 days,
   or "superseded by a later pass on the same topic") into a single `docs/reports/_archive/`
   rather than deleting — screenshots and evidence from a past audit have real value if a bug
   resurfaces, but shouldn't sit in the active working set.
3. **Separate evidence from findings going forward.** The large folders (15-61 MB) are almost
   entirely screenshots/binary evidence; keeping those out of the main report folder (e.g. one
   level deeper, or in a `.gitignore`'d local-only location, with only the written findings
   committed) would keep this directory's real size manageable as it keeps growing.
4. **One place, not two.** This session's own `robustness-scalability-audit-2026-10-11/` and the
   concurrent `usability-code-audit-2026-10-12/` are both active right now — worth checking
   whether they should be reconciled into one report before either is considered final.

This is a proposal, not a decision — items 2 and 3 involve moving or excluding real files and
should be confirmed before anyone (human or agent) acts on them.
