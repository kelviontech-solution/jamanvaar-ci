# API performance and error observations

Local real API + PostgreSQL, Chromium, mostly Vite development builds; Restaurant Admin fleet storm also reproduced in a production build. Counts include negative security tests, injected faults and initial expired access-token recovery. Browser duration includes queueing/transfer; server middleware duration is a separate request cohort and is not a database-query measurement. These mixed-workload percentiles are diagnostic samples, not production SLAs.

Thresholds applied to recorded p95: <200ms GOOD, 200–500ms ACCEPTABLE, 500–1,000ms SLOW, 1,000–2,000ms VERY SLOW, ≥2,000ms INVESTIGATE. A low p95 does not excuse a request storm.

[Full browser matrix](API_PERFORMANCE_MATRIX.csv) includes method, call count, status distribution, failure count, payload bytes, mean, p95 and maximum for every captured API group. [Server timing matrix](SERVER_PERFORMANCE_MATRIX.csv) aggregates actual QA API middleware observations.

## Most frequent captured calls

| App | Method | Endpoint | Calls | p95 ms | Max ms | Status counts |
| --- | --- | --- | --- | --- | --- | --- |
| admin | GET | /api/v1/devices/me/fleet | 22479 | 9.3 | 1521.52 | {"200":22468,"FAILED":11} |
| adminprod | GET | /api/v1/devices/me/fleet | 3451 | 7.67 | 300.29 | {"200":3451} |
| kds | GET | /api/v1/orders/sync | 232 | 313.34 | 343.73 | {"200":229,"FAILED":3} |
| pos | GET | /api/v1/orders/sync | 231 | 296.35 | 1981.48 | {"200":221,"FAILED":10} |
| pos | GET | /api/v1/entity-sync/DINING_TABLE | 220 | 303.27 | 1921.63 | {"200":212,"FAILED":8} |
| admin | GET | /api/v1/tenant/me/applications | 219 | 635.23 | 4380.31 | {"200":104,"401":114,"FAILED":1} |
| admin | GET | /api/v1/orders/sync | 166 | 328.16 | 2336.46 | {"200":159,"FAILED":7} |
| admin | GET | /api/v1/entity-sync/DINING_TABLE | 162 | 321.79 | 2438.01 | {"200":155,"FAILED":7} |
| pos | GET | /api/v1/entity-sync/SERVICE_MESSAGE | 140 | 26.26 | 1991.76 | {"200":131,"FAILED":9} |
| kds | GET | /api/v1/entity-sync/SERVICE_MESSAGE | 135 | 15.42 | 1350.71 | {"200":133,"FAILED":2} |
| admin | GET | /api/v1/inventory/movements | 132 | 356.03 | 2188.64 | {"200":126,"FAILED":6} |
| super | GET | /api/v1/platform/system-health | 120 | 351.87 | 387.67 | {"200":116,"401":4} |
| admin | GET | /api/v1/tenant/me/entitlements | 115 | 628.2 | 4394.43 | {"200":60,"401":54,"FAILED":1} |
| super | GET | /api/v1/platform/me | 114 | 342.76 | 387.39 | {"200":110,"401":4} |
| super | GET | /api/v1/platform/notifications/unread-count | 114 | 129.36 | 251.55 | {"200":114} |
| pos | GET | /api/v1/entity-sync/STAFF_USER | 107 | 420.02 | 670.07 | {"200":105,"FAILED":2} |
| admin | GET | /api/v1/entity-sync/STAFF_USER | 106 | 336.42 | 452.48 | {"200":104,"FAILED":2} |
| pos | GET | /api/v1/entity-sync/TAX_GROUP | 90 | 380.22 | 652.52 | {"200":88,"FAILED":2} |
| pos | GET | /api/v1/entity-sync/MODIFIER_GROUP | 89 | 68.95 | 1038.45 | {"200":87,"FAILED":2} |
| pos | GET | /api/v1/entity-sync/MENU_CATEGORY | 89 | 35.69 | 180.97 | {"200":87,"FAILED":2} |

## Slow captured groups

| App | Method | Endpoint | Completed samples | p95 ms | Max ms | Class |
| --- | --- | --- | --- | --- | --- | --- |
| kds | GET | /api/v1/menu/version | 53 | 1471.82 | 1534.85 | VERY SLOW |
| kiosk | POST | /api/v1/payments/:id/qr | 5 | 1295.99 | 1295.99 | VERY SLOW |
| super | GET | /api/v1/platform/reports/devices | 2 | 1055.37 | 1055.37 | VERY SLOW |
| kiosk | PATCH | /api/v1/devices/me/heartbeat | 22 | 946.18 | 1033.53 | SLOW |
| pos | GET | /api/v1/devices/me/ai-config | 19 | 809.25 | 809.25 | SLOW |
| admin | PATCH | /api/v1/devices/me/heartbeat | 68 | 772.78 | 4731.58 | SLOW |
| super | GET | /api/v1/platform/reports/summary | 2 | 764.28 | 764.28 | SLOW |
| admin | GET | /api/v1/devices/me/ai-config | 18 | 721.01 | 721.01 | SLOW |
| super | GET | /api/v1/platform/reports/restaurants | 2 | 667.16 | 667.16 | SLOW |
| pos | PATCH | /api/v1/devices/me/heartbeat | 79 | 657.31 | 711.71 | SLOW |
| admin | GET | /api/v1/tenant/me/applications | 218 | 635.23 | 4380.31 | SLOW |
| adminprod | GET | /api/v1/tenant/me/applications | 7 | 632.25 | 632.25 | SLOW |
| admin | GET | /api/v1/tenant/me/entitlements | 114 | 628.2 | 4394.43 | SLOW |
| adminprod | GET | /api/v1/tenant/me/entitlements | 4 | 620.5 | 620.5 | SLOW |
| captain | PATCH | /api/v1/devices/me/heartbeat | 30 | 549.82 | 1397.62 | SLOW |
| captain | GET | /api/v1/entity-sync/RESERVATION | 30 | 548.34 | 844.45 | SLOW |
| adminprod | GET | /api/v1/devices/me/ai-config | 2 | 547.86 | 547.86 | SLOW |
| adminprod | PATCH | /api/v1/devices/me/heartbeat | 4 | 547.63 | 547.63 | SLOW |
| adminprod | GET | /api/v1/inventory/movements | 13 | 547.4 | 547.4 | SLOW |
| adminprod | GET | /api/v1/devices/me/restaurant | 4 | 547.33 | 547.33 | SLOW |
| adminprod | GET | /api/v1/entity-sync/RESERVATION | 6 | 547.17 | 547.17 | SLOW |
| adminprod | GET | /api/v1/entity-sync/SHIFT | 6 | 546.11 | 546.11 | SLOW |
| pos | GET | /api/v1/devices/me/restaurant | 79 | 527.16 | 1693.01 | SLOW |
| admin | GET | /api/v1/entity-sync/CUSTOMER | 65 | 521.08 | 914.84 | SLOW |
| kds | PATCH | /api/v1/devices/me/heartbeat | 53 | 507.61 | 1802 | SLOW |

## Failure interpretation

- Intentional 401/403/400/404 authorization/validation probes, unconfigured-gateway 503 and injected 503 are expected test outcomes, not generic application defects. Raw network records preserve exact statuses.
- Long-lived `/realtime/stream` is excluded from latency percentiles. Initial 200 text/event-stream and actual reconnection are recorded separately in realtime-connections.jsonl and TEST_MATRIX.csv; normal stream cancellation at browser close is not a failed ordinary API.
- LAN core localhost:5178 was intentionally absent. Its connection-refused logs measure unavailable local infrastructure, not an AWS outage. Browser offline and the isolated API restart also deliberately generated failures.
- Fleet repetition is independently confirmed at idle in production code (B001). Some development initial requests may also reflect React StrictMode and must not be called production duplication without a production reproduction.
- No DB query trace, SQL EXPLAIN, lock wait timeline, real provider latency, WAN profile, Nginx/ALB trace or AWS resource measurement was available. The only demonstrated bottleneck source is the frontend fleet loop; per-stage backend/DB attribution remains unverified.
