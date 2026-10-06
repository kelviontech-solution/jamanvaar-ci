# Merged Restaurant Admin kiosk-key access fix

## Confirmed root cause — High

Restaurant Admin always registers as a `POS_ADMIN` device. Owner activation already accepted either a `POS_ADMIN` or `KIOSK_ADMIN` entitlement, so a kiosk-only plan could successfully redeem its kiosk-admin key. `DeviceAuthGuard`, used for heartbeat, fleet, order sync and realtime, then required an enabled entitlement matching the physical device type exactly. The first device request therefore returned `403 APP_DISABLED`, producing the screenshot's false “POS_ADMIN is not enabled” lock.

The earlier activation regression stopped at the successful activation response. It did not check subsequent device calls with only the kiosk entitlement enabled. The new regression exercises that missing boundary and the actual browser login/key/refresh flow.

## Implemented changes

- `cloud/api/src/common/guards/device-auth.guard.ts`: a merged `POS_ADMIN` console may operate when either admin entitlement is enabled on a valid active/trial subscription. Other terminal types retain their own app check. Restaurant, subscription expiry, branch, device lock and revocation enforcement remain in place.
- `cloud/api/src/modules/application-entitlements/application-entitlements.service.ts`: on kiosk-only plans, merged `POS_ADMIN` devices and legacy `KIOSK_ADMIN` devices count toward the kiosk-admin quota and impact acknowledgement. When both admin entitlements exist, quota counting retains activation's POS-admin priority.
- App entitlement rows remain distinct. Kiosk-only access does not turn on `POS_ADMIN`, enable POS terminals, or expose Restaurant-only sidebar modules. The existing registered device needs no conversion or new activation key.

No production database migration, entitlement rewrite or customer key redemption was performed. All test fixtures were created in the dedicated local QA database.

## Verification

Before the fix, the new actual-API suite reproduced the failure: 5/8 passed, with kiosk heartbeat and post-activation access returning 403, and a second console incorrectly bypassing a kiosk-admin quota of one. [Before-fix evidence](before-fix.json) retains these failures.

After the fix:

| Check | Result | Evidence |
| --- | --- | --- |
| New merged-access and related device/catalog/realtime suites | 33/33 passed; new suite 8/8 | [API results](api-after-fix.json) |
| Tenant login, activation redemption, multi-family regressions | 53/53 passed | [Activation results](activation-regressions.json) |
| Real nav entitlement data and device-gate regressions | 36/36 passed | [Frontend results](frontend-regressions.json) |
| Actual Playwright owner login → typed KIOSK_ADMIN key → portal | Passed | [Browser matrix](test-matrix.jsonl), [screenshot](evidence/kiosk-only-merged-admin-active.png) |
| Browser refresh → retained kiosk-only access → kiosk settings | Passed | [Screenshot](evidence/kiosk-only-settings-after-refresh.png) |
| API TypeScript check / Nest build | Passed | [Build result](api-build.json) |

The browser ran the actual merged app against the isolated compiled API, with actual auth/device guards and RLS. Heartbeat and fleet returned 200; the false overlay was absent, kiosk modules were visible and POS-only Billing/Menu modules were absent. API cases cover kiosk-only, restaurant-only, both families, disable/re-enable, neither admin enabled, expired subscription, quota and a disabled POS terminal failing closed.

The browser QA used port 5286 and API 4010 so the user's Restaurant Admin 5176 and backend 4000 services remained available. Existing live restaurant/key data was not used. Payment/provider actions were not performed. New backend code must be loaded by the running server; a watch process reloads it automatically, otherwise restart/redeploy the API, then refresh Restaurant Admin.
