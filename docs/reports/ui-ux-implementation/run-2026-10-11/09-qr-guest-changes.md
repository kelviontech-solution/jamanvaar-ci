# 09 — QR Guest changes

Theme preserved: mobile-first guest experience; this app already had the strongest accessibility baseline and was changed minimally. No desktop patterns introduced.

| Finding | Confirmed? | Files | Before → after | Verification | Status |
|---|---|---|---|---|---|
| QR-F2 "Try again" gave no visible feedback | Yes (interaction, audit run 2) | `src/App.tsx` | identical screen before/after → button reads "Trying again…" and is disabled while the request runs; if it fails again a `role="status"` note says "Still not connected. Check your internet connection, then try again." | typecheck, build, QR test files; **not re-rendered** after the edit | Resolved (source) |
| QR-F1 table-number input unlabeled | Yes (source) | `src/App.tsx` | placeholder only → wrapped in a `<label>Table number</label>` like the phone field | typecheck | Resolved (source) |
| QR-F3 focus management in the dish sheet | Suspected | — | not verified or changed | — | Not done |

Preserved on purpose: global focus-visible outlines, reduced-motion CSS, alert/status roles, explicit required-choice copy, pay-at-counter/retry payment recovery, zoom allowed.
Evidence: `evidence/qr-guest/QR-001-initial-390x844.png` (invalid code, unchanged).
