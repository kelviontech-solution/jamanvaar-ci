# QR standalone product and operations implementation plan

The two supplied briefs are approved task scope. Existing customer `/q/` and kiosk `/kiosk/` routes stay independently deployed. `/qr/` is currently unused.

Reuse the existing Restaurant Admin Vite application as a second public entry, its cloud client, owner/manager authentication, canonical activation keys, QR console, signed branch scope, QR settings/publications, SyncedOrder, confirmed payment allocations and existing feature catalog. No new password, licensing, menu or kitchen order subsystem.

1. Add `/qr/`, `/qr/login/`, `/qr/activate/`, `/qr/admin/` and account recovery in the existing app build/reverse proxy. Include a local demo that never calls order/payment APIs. QR-only authentication requires QR_ORDERING; keys remain the existing management device keys (POS_ADMIN/ANY), not new public registration. Authenticate before key redemption; hide key after success. Reuse validated branch selection and real QR navigation.
2. Add server-derived setup health checklist and safe live branding preview. Reuse secure image parsing/storage; theme customization is allowlisted and contrast validated. Arbitrary custom domains require infrastructure verification/TLS and are documented rather than accepted as trusted.
3. Add optional service request, scheduled pickup, menu analytics and extended branding feature flags to the current licensing catalog. Store private server-owned operations configuration/requests in the existing tenant RLS SyncedEntity store, outside device writable types.
4. Add anonymous signed-session/table service requests with deduplication/cooldowns, scoped staff transitions/audit and durable retrieval in QR Admin and Captain.
5. Add timezone-aware pickup availability and admission-lock capacity validation against canonical orders, including payment-pending reservations and safe terminal cancellation release. Store pickup data in protected canonical metadata; expose it to POS/KDS/Captain without duplicate tickets.
6. Extend analytics from canonical orders, confirmed collections/refunds and deduplicated observable funnel events. Define sales and cost coverage explicitly; no inferred profit without reliable costs. Provide branch/date filtering and safe CSV.
7. Add compiled-app browser flows and API concurrency/security regression. Apply migrations only to isolated QA data; document deployment/rollback, provider limitations and actual test results.

Key risks: shared-origin credentials must remain server authenticated; QR-only management may not authorize unrelated admin endpoints; future pickup timestamps must resolve in branch/restaurant timezone including DST; stale slot prices/capacity recheck transactionally; private service requests must not be discoverable from another QR/session; analytics must distinguish observed landing sessions from physical scans.
