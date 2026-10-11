# 07 — KDS changes

Theme preserved: ivory/navy kitchen board, ticket density, tabs, undo model, connection bar — all untouched.

| Finding | Confirmed? | Files | Before → after | Verification | Status |
|---|---|---|---|---|---|
| SH-004 false "Local Core: Connected" | Yes (rendered) | `src/App.tsx` | activation layout passed no state → passes `kdsDb` connection state and health URL | rendered: **"Local Core: Unreachable"** | Resolved |
| KDS-F1 "Activation failed" | Yes | `src/App.tsx` | → "Could not complete activation. Check this device's internet connection and try again." | rendered bad-key submit | Resolved |
| KDS-F2 timer chip 11 px; priority/reprint 40 px | Source-confirmed (viewing-distance impact unverified) | `KdsTicketCard.tsx` | timer chip `text-[11px]` → `text-xs sm:text-[13px]`; priority `<select>` and reprint button 40 → 44 px; KOT number chip 10 → 11 px on the accessible brand orange. Card height impact is ≤4 px per ticket, so ticket count per screen is preserved | typecheck + `kds_ticket_served_gate` suite; **not rendered** (no tickets) | Resolved (modest) |
| KDS-F3 tab semantics without panels | Yes | — | not changed (low value) | — | Not done |
| SH-007 zoom lock | Yes | — | not changed (terminal) | — | Not done — decision needed |

Not verified: the board itself (needs an activated station and seeded tickets): readability at distance, 768×1024 layout, many-item tickets.
Evidence: `evidence/kds/*`.
