# 📚 JAMANVAAR Documentation Hub

All technical specifications, operational runbooks, architecture designs, and hardware setup guides for the **JAMANVAAR Restaurant Kiosk & Admin POS Platform** are cataloged below.

---

## 📑 Documentation Index

### Architecture
| Document | Purpose & Contents |
| :--- | :--- |
| **[`architecture/monorepo-structure.md`](./architecture/monorepo-structure.md)** | Monorepo folder structure audit, migration plan, and dependency rules. |
| **[`architecture/ARCHITECTURE.md`](./architecture/ARCHITECTURE.md)** | Zero-cloud, local on-premise system architecture & data flow. |
| **[`architecture/DATABASE.md`](./architecture/DATABASE.md)** | Schema design, entity relations, transactional safety & persistence. |
| **[`architecture/SECURITY.md`](./architecture/SECURITY.md)** | Local security, session memory scrub, PIN protection & audit logs. |
| **[`architecture/SYNC.md`](./architecture/SYNC.md)** | Sub-50ms local real-time sync engine & outbox reconciliation. |
| **[`architecture/PRODUCT_FLOWS_AND_ARCHITECTURE.md`](./architecture/PRODUCT_FLOWS_AND_ARCHITECTURE.md)** | End-to-end product flows across the ecosystem's apps. |
| **[`architecture/KITCHEN_FLOW.md`](./architecture/KITCHEN_FLOW.md)** | Order path from Captain/POS to the KDS and back, per-dish status, undo, cancel, courses, and screen sizes. |
| **[`integrations/WHATSAPP_ORDERING_PLAN_AND_PROMPT.md`](./integrations/WHATSAPP_ORDERING_PLAN_AND_PROMPT.md)** | How the WhatsApp chatbot connects to POS and KDS, the connect-by-key flow, and the prompt for the chatbot repo. |
| **[`integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md`](./integrations/JAMANVAAR_WHATSAPP_CONNECTOR_IMPLEMENTATION_PLAN.md)** | Cross-repo execution plan: where the code goes in each repo, backend/DB/frontend changes, team split, and phase-by-phase build + verification gates. |
| **[`integrations/WHATSAPP_API_KEY_GUIDE.md`](./integrations/WHATSAPP_API_KEY_GUIDE.md)** | How a restaurant gets a WhatsApp API key, in plain language. |
| **[`integrations/URBANPIPER_ZOMATO_SWIGGY_FLOW.md`](./integrations/URBANPIPER_ZOMATO_SWIGGY_FLOW.md)** | Suggested Zomato and Swiggy flow through UrbanPiper (design only). |
| **[`reports/MARKET_GAP_ANALYSIS_2026-09-28.md`](./reports/MARKET_GAP_ANALYSIS_2026-09-28.md)** | Feature comparison against the market and the fix list. |
| **[`architecture/CURRENT_SYNC_ARCHITECTURE.md`](./architecture/CURRENT_SYNC_ARCHITECTURE.md)** | Current state of the sync engine as actually implemented. |
| **[`architecture/SYNC_ARCHITECTURE.md`](./architecture/SYNC_ARCHITECTURE.md)** | Sync architecture design. |
| **[`architecture/DATA_OWNERSHIP_MATRIX.md`](./architecture/DATA_OWNERSHIP_MATRIX.md)** | Which app/service owns which data, and the read/write rules between them. |
| **[`architecture/QR_ORDERING_ARCHITECTURE.md`](./architecture/QR_ORDERING_ARCHITECTURE.md)** | QR table-ordering system architecture. |
| **[`architecture/QR_ORDERING_ENTITLEMENTS.md`](./architecture/QR_ORDERING_ENTITLEMENTS.md)** | QR ordering's plan/entitlement gating design. |
| **[`architecture/QR_ORDERING_FLOW.md`](./architecture/QR_ORDERING_FLOW.md)** | End-to-end QR ordering guest flow. |
| **[`architecture/QR_ORDERING_OFFLINE_BEHAVIOR.md`](./architecture/QR_ORDERING_OFFLINE_BEHAVIOR.md)** | QR ordering's offline/degraded-connectivity behavior. |
| **[`architecture/QR_ORDERING_SECURITY.md`](./architecture/QR_ORDERING_SECURITY.md)** | QR ordering security design. |
| **[`architecture/QR_ORDERING_ADDITIONAL_REQUIREMENTS.md`](./architecture/QR_ORDERING_ADDITIONAL_REQUIREMENTS.md)** | Requirement: QR ordering must be fully restaurant-controlled, no hardcoded data. |
| **[`architecture/QR_ORDERING_IMPLEMENTATION_BRIEF.md`](./architecture/QR_ORDERING_IMPLEMENTATION_BRIEF.md)** | Original engineering brief for building out QR ordering properly. |

### Product
| Document | Purpose & Contents |
| :--- | :--- |
| **[`product/ADMIN_GUIDE.md`](./product/ADMIN_GUIDE.md)** | Operational manual for Restaurant Managers and POS operators. |
| **[`product/JAMANVAAR_FEATURES_SPECIFICATION.md`](./product/JAMANVAAR_FEATURES_SPECIFICATION.md)** | Full product feature specification. |
| **[`product/KIOSK_SETUP.md`](./product/KIOSK_SETUP.md)** | Hardware configuration, touch screen calibration, and auto-boot. |
| **[`product/JAMANVAAR_Kiosk_Complete_Feature_Breakdown.pdf`](./product/JAMANVAAR_Kiosk_Complete_Feature_Breakdown.pdf)** | Complete executive feature breakdown document. |

### Development
| Document | Purpose & Contents |
| :--- | :--- |
| **[`development/API.md`](./development/API.md)** | Authoritative Local REST API & SSE Event Stream specifications. |
| **[`development/TESTING.md`](./development/TESTING.md)** | Vitest automated scenario test suite execution guide. |
| **[`development/RECEIPT_PRINTER_IMPLEMENTATION.md`](./development/RECEIPT_PRINTER_IMPLEMENTATION.md)** | 80mm ESC/POS thermal printing, auto-print detection & fallback retry. |
| **[`development/TROUBLESHOOTING.md`](./development/TROUBLESHOOTING.md)** | Error resolution guide for offline issues, printer jams, and ports. |
| **[`development/RUN_SERVERS.md`](./development/RUN_SERVERS.md)** | How to launch every platform service and terminal app for local dev. |
| **[`development/QR_ORDERING_API.md`](./development/QR_ORDERING_API.md)** | QR ordering REST API specification. |
| **[`development/QR_ORDERING_EXECUTION_PLAN.md`](./development/QR_ORDERING_EXECUTION_PLAN.md)** | QR ordering build execution plan. |
| **[`development/QR_ORDERING_TEST_PLAN.md`](./development/QR_ORDERING_TEST_PLAN.md)** | QR ordering test plan. |
| **[`development/RESTAURANT_ONBOARDING_AND_MULTI_APP_TEST_PLAN.md`](./development/RESTAURANT_ONBOARDING_AND_MULTI_APP_TEST_PLAN.md)** | Test plan for restaurant onboarding across every terminal app. |
| **[`development/RESTAURANT_ONBOARDING_MULTI_APP_TEST_SPECIFICATION.md`](./development/RESTAURANT_ONBOARDING_MULTI_APP_TEST_SPECIFICATION.md)** | Test specification for the same onboarding flow. |
| **[`development/BUG_FIXING_DEFERRED_RIGOR.md`](./development/BUG_FIXING_DEFERRED_RIGOR.md)** | Standard for what "fixed" means when a bug fix is deferred for rigor reasons. |

### Deployment
| Document | Purpose & Contents |
| :--- | :--- |
| **[`deployment/DEPLOYMENT.md`](./deployment/DEPLOYMENT.md)** | Installation and deployment procedures on Windows Kiosk terminals. |
| **[`deployment/GITHUB_RELEASE_GUIDE.md`](./deployment/GITHUB_RELEASE_GUIDE.md)** | GitHub release packaging and publishing guide. |
| **[`deployment/AWS_DEPLOYMENT_MASTER_PLAN.md`](./deployment/AWS_DEPLOYMENT_MASTER_PLAN.md)** | Master AWS deployment plan for kelviontech.in / restaurent.kelviontech.in. |
| **[`deployment/DEPLOYMENT_AWS_GUIDE.md`](./deployment/DEPLOYMENT_AWS_GUIDE.md)** | AWS deployment guide. |
| **[`deployment/KIOSK_AWS_DEPLOYMENT_GUIDE.md`](./deployment/KIOSK_AWS_DEPLOYMENT_GUIDE.md)** | Kiosk-specific AWS deployment guide. |
| **[`deployment/ORACLE_KELVIONTECH_PROD_2_SETUP.md`](./deployment/ORACLE_KELVIONTECH_PROD_2_SETUP.md)** | Oracle-hosted kelviontech production server setup. |
| **[`deployment/PACKAGING_READINESS.md`](./deployment/PACKAGING_READINESS.md)** | Desktop installer/packaging readiness checklist. |

### Reports
| Document | Purpose & Contents |
| :--- | :--- |
| **[`reports/AUDIT.md`](./reports/AUDIT.md)** | Full feature audit, compliance checks, and requirements checklist. |
| **[`reports/FINAL_AUDIT.md`](./reports/FINAL_AUDIT.md)** | Final verification logs and component readiness report. |
| **[`reports/MENU_IMAGE_AUDIT.md`](./reports/MENU_IMAGE_AUDIT.md)** | Menu image sourcing and integrity audit. |
| **[`reports/JAMANVAAR_COMPLETE_SYSTEM_REPORT.md`](./reports/JAMANVAAR_COMPLETE_SYSTEM_REPORT.md)** | Complete system status report. |
| **[`reports/SECURITY_CODE_QUALITY_AUDIT.md`](./reports/SECURITY_CODE_QUALITY_AUDIT.md)** | Older third-party security/code-quality audit — superseded by [`security-audit/`](../security-audit/) at the repo root. |
| **[`reports/FULL_PLATFORM_AUDIT_AND_REDESIGN_PLAN.md`](./reports/FULL_PLATFORM_AUDIT_AND_REDESIGN_PLAN.md)** | Platform-wide audit and redesign plan. |
| **[`reports/FULL_ECOSYSTEM_QA_AUDIT_REPORT.md`](./reports/FULL_ECOSYSTEM_QA_AUDIT_REPORT.md)** | QA audit across the whole app ecosystem. |
| **[`reports/FULL_PLATFORM_AUDIT_AND_READINESS_REPORT.md`](./reports/FULL_PLATFORM_AUDIT_AND_READINESS_REPORT.md)** | Platform readiness audit. |
| **[`reports/KIOSK_SAAS_QA_AUDIT_REPORT.md`](./reports/KIOSK_SAAS_QA_AUDIT_REPORT.md)** | Kiosk/SaaS-specific QA audit. |
| **[`reports/QA_AUDIT_REPORT.md`](./reports/QA_AUDIT_REPORT.md)** | General QA audit report. |
| **[`reports/PLATFORM_STATUS_AND_ROADMAP.md`](./reports/PLATFORM_STATUS_AND_ROADMAP.md)** | Current platform status and roadmap. |
| **[`reports/BUG_LIST.md`](./reports/BUG_LIST.md)** | BUG-001…BUG-143 tracked issues. |
| **[`reports/ROLE_BASED_AUDIT_BUGS.md`](./reports/ROLE_BASED_AUDIT_BUGS.md)** | BUG-144…BUG-163, role-based audit findings. |
| **[`reports/BUG_CHECKLIST.md`](./reports/BUG_CHECKLIST.md)** | Working checklist for tracked bugs. |
| **[`reports/AUDIT_BRIEF.md`](./reports/AUDIT_BRIEF.md)** | Onboarding brief for whoever picks up the next audit/bug pass. |
| **[`reports/BUG_LIST_2.md`](./reports/BUG_LIST_2.md)** | Second-generation tracked bug list (B2-xxx). |
| **[`reports/BUG_LIST_3.md`](./reports/BUG_LIST_3.md)** | Third-generation tracked bug list. |
| **[`reports/SESSION_HANDOFF.md`](./reports/SESSION_HANDOFF.md)** | Point-in-time handoff notes between work sessions. |
| **[`reports/JAMANVAAR_REDESIGN_DELIVERABLES.md`](./reports/JAMANVAAR_REDESIGN_DELIVERABLES.md)** | Deliverables tracking for the platform redesign effort. |
| **[`reports/QA_FULL_PLATFORM_CLICKTHROUGH_2026-09-27.md`](./reports/QA_FULL_PLATFORM_CLICKTHROUGH_2026-09-27.md)** | Full-platform manual click-through QA pass. |
| **[`reports/QR_ORDERING_AUDIT_RESTAURANT_CONTROL_AND_SCALE.md`](./reports/QR_ORDERING_AUDIT_RESTAURANT_CONTROL_AND_SCALE.md)** | Audit of restaurant-side control and scale limits for QR ordering. |
| **[`reports/QR_ORDERING_CURRENT_STATE.md`](./reports/QR_ORDERING_CURRENT_STATE.md)** | Point-in-time status of the QR ordering feature. |
| **[`reports/QR_ORDERING_IMPLEMENTATION_REPORT.md`](./reports/QR_ORDERING_IMPLEMENTATION_REPORT.md)** | What was actually implemented for QR ordering. |
| **[`reports/RESTAURANT_ONBOARDING_MULTI_APP_TEST_REPORT.md`](./reports/RESTAURANT_ONBOARDING_MULTI_APP_TEST_REPORT.md)** | Results of the restaurant onboarding multi-app test pass. |
| **[`reports/SECURITY_AUDIT_2026-09-27.md`](./reports/SECURITY_AUDIT_2026-09-27.md)** | Dated security audit — see `security-audit/` at the repo root for the current posture. |

### Progress
| Document | Purpose & Contents |
| :--- | :--- |
| **[`reports/PROGRESS_LOG.md`](./reports/PROGRESS_LOG.md)** | Dated, running log of what's actually been done on the WhatsApp connector track (including prerequisite bug fixes) — newest entry first, each says what changed and how it was verified. |

For the current, authoritative security posture, see **[`security-audit/`](../security-audit/EXECUTIVE-SUMMARY.md)** at the repo root — the files above are historical.
