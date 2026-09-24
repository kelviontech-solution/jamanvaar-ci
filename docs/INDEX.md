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

### Deployment
| Document | Purpose & Contents |
| :--- | :--- |
| **[`deployment/DEPLOYMENT.md`](./deployment/DEPLOYMENT.md)** | Installation and deployment procedures on Windows Kiosk terminals. |
| **[`deployment/GITHUB_RELEASE_GUIDE.md`](./deployment/GITHUB_RELEASE_GUIDE.md)** | GitHub release packaging and publishing guide. |

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

For the current, authoritative security posture, see **[`security-audit/`](../security-audit/EXECUTIVE-SUMMARY.md)** at the repo root — the files above are historical.
