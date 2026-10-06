You are a Senior SaaS Architect, Distributed Systems Engineer, Restaurant POS Architect, QA Architect, and Integration Test Engineer.

I want you to perform a COMPLETE END-TO-END AUDIT and TEST of JAMANVAAR restaurant onboarding and multi-application/device integration.

This is NOT a simple UI test.

The objective is to verify that when a restaurant is onboarded with different combinations of:

- POS
- Kiosk
- KDS
- Captain App
- Restaurant Admin
- Multiple POS devices
- Multiple Kiosks
- Multiple Captain devices
- Multiple branches

the correct devices/apps are activated, configured, connected, synchronized, and able to exchange data correctly.

The system must behave correctly regardless of the combination selected during onboarding.

==================================================
1. FIRST READ THE EXISTING ARCHITECTURE
==================================================

Before changing code:

Inspect the complete repository.

Understand:

- Super Admin
- Restaurant Admin
- POS
- POS Admin
- Kiosk
- Kiosk Admin
- KDS
- Captain
- QR Ordering
- Branch Core / Local Core if implemented
- Cloud backend
- authentication
- device registration
- activation keys
- plans
- licenses
- entitlements
- restaurant
- branch
- tables
- menu
- orders
- KOT
- KDS
- inventory
- sync
- WebSocket
- local storage
- event system
- device management

Do not assume the existing architecture is correct.

Trace the real code.

Identify:

- APIs
- database models
- device registration
- authentication
- authorization
- local storage
- sync queues
- event handling
- order creation
- KOT creation
- KDS delivery
- Captain order flow
- Kiosk order flow
- POS order flow

==================================================
2. CREATE A TEST SPECIFICATION
==================================================

Create:

docs/RESTAURANT_ONBOARDING_AND_MULTI_APP_TEST_PLAN.md

This document must contain the complete test matrix described below.

Do NOT immediately start changing the application.

First create the test plan based on the actual architecture.

==================================================
3. CORE RESTAURANT STRUCTURE
==================================================

The fundamental hierarchy should be:

SUPER ADMIN
    ↓
RESTAURANT
    ↓
BRANCH
    ↓
DEVICES / APPLICATIONS

Example:

Restaurant:
JM9999999999

Branch:
Ahmedabad Main

Devices:

POS-01
POS-02

KIOSK-01
KIOSK-02

KDS-01

CAPTAIN-01
CAPTAIN-02
CAPTAIN-03

The system must understand that these devices belong to:

Restaurant
+
Branch
+
Device Type
+
Device Identity

==================================================
4. VERY IMPORTANT — DEVICE COUNT
==================================================

Do NOT assume:

one restaurant = one POS.

A restaurant may have:

1 POS
2 POS
5 POS
10 POS

Likewise:

1 Kiosk
2 Kiosks
5 Kiosks

and:

1 Captain
10 Captain devices

and:

1 KDS
multiple KDS screens

The architecture must support multiple devices without creating duplicate restaurants, duplicate branches, duplicate menus, or duplicate order systems.

==================================================
5. ONBOARDING SHOULD NOT CREATE DUPLICATE RESTAURANTS
==================================================

Example:

Super Admin creates:

Restaurant:
ABC Restaurant

Branch:
Main Branch

Then activates:

POS-01
POS-02
Kiosk-01
Kiosk-02
KDS-01
Captain-01

All devices must belong to the SAME:

restaurantId

and appropriate:

branchId

Do NOT create:

Restaurant A → POS
Restaurant B → Kiosk

They must remain one tenant.

==================================================
6. DEVICE IDENTITY
==================================================

Every installed/registered device must have a unique:

deviceId

Conceptually:

restaurantId
branchId
deviceId
deviceType

Example:

JM9999999999
BR001
POS-01
POS

JM9999999999
BR001
POS-02
POS

JM9999999999
BR001
KIOSK-01
KIOSK

JM9999999999
BR001
KDS-01
KDS

JM9999999999
BR001
CAPTAIN-01
CAPTAIN

Do not use restaurantId as deviceId.

Do not use device type as deviceId.

==================================================
7. PLAN ENTITLEMENT
==================================================

Test onboarding against the existing plan/entitlement architecture.

Example:

PLAN A:

POS
Restaurant Admin

PLAN B:

POS
Restaurant Admin
KDS
Captain

PLAN C:

POS
Restaurant Admin
KDS
Captain
QR Ordering

Kiosk should only be available when its entitlement is enabled.

Do not use:

if plan === "7000"

or:

if plan === "9000"

Use the centralized entitlement system.

==================================================
8. ONBOARDING MATRIX
==================================================

Create a complete test matrix.

At minimum test:

CASE 01

Restaurant:
POS only

Expected:

Restaurant Admin ✓
POS ✓
KDS ✗
Kiosk ✗
Captain ✗

--------------------------------

CASE 02

Restaurant:
POS + KDS

Expected:

POS ✓
KDS ✓
Restaurant Admin ✓

POS orders must reach KDS.

--------------------------------

CASE 03

Restaurant:
POS + Captain

Expected:

POS ✓
Captain ✓

Captain-created orders must reach POS/order pipeline.

--------------------------------

CASE 04

Restaurant:
POS + KDS + Captain

Expected:

POS
KDS
Captain

All connected through canonical order architecture.

--------------------------------

CASE 05

Restaurant:
POS + Kiosk

Expected:

POS ✓
Kiosk ✓

Kiosk orders must reach POS.

--------------------------------

CASE 06

Restaurant:
POS + Kiosk + KDS

Expected:

Kiosk
    ↓
Canonical Order
    ↓
POS / Branch Core
    ↓
KOT
    ↓
KDS

POS orders:

POS
    ↓
KOT
    ↓
KDS

Both sources must reach KDS correctly.

--------------------------------

CASE 07

Restaurant:
POS + Kiosk + Captain + KDS

Expected:

POS
Kiosk
Captain

all produce canonical orders.

All relevant KOTs reach KDS.

--------------------------------

CASE 08

Restaurant:
POS + Kiosk + QR + KDS

Expected:

POS orders
Kiosk orders
QR orders

all reach canonical order pipeline and KDS.

--------------------------------

CASE 09

Restaurant:
POS + Kiosk + Captain + QR + KDS

Full configuration.

Test all order sources simultaneously.

==================================================
9. MULTIPLE POS TEST
==================================================

Test:

POS-01
POS-02
POS-03

All belong to the same:

restaurant
branch

Create orders simultaneously.

Expected:

No duplicate orders.

No lost orders.

No ID collisions.

No overwritten carts.

No cross-device data leakage.

==================================================
10. MULTIPLE KIOSK TEST
==================================================

Test:

Kiosk-01
Kiosk-02
Kiosk-03

All operate simultaneously.

Customer A orders from Kiosk-01.

Customer B orders from Kiosk-02.

Expected:

Independent orders.

Both reach:

canonical order system
POS
KOT
KDS

No duplicate order creation.

==================================================
11. POS + KIOSK CONCURRENCY
==================================================

This is a critical scenario.

At the same time:

POS-01 creates Order A.

Kiosk-01 creates Order B.

Expected:

Order A
and
Order B

both exist.

Both receive unique IDs.

Both reach KOT.

Both reach KDS.

Neither overwrites the other.

==================================================
12. POS + KIOSK + CAPTAIN CONCURRENCY
==================================================

Simultaneously:

POS:
Order A

Kiosk:
Order B

Captain:
Order C

Expected:

A
B
C

all exist independently.

All enter the same canonical order pipeline.

All generate appropriate KOT events.

KDS receives all required kitchen work.

==================================================
13. MULTIPLE CAPTAIN DEVICES
==================================================

Test:

Captain-01
Captain-02
Captain-03

All create orders simultaneously.

Expected:

Each device can operate independently.

No duplicate orders.

No lost orders.

No overwritten orders.

All orders are associated with:

restaurantId
branchId
source = CAPTAIN
deviceId

where applicable.

==================================================
14. MULTIPLE KDS SCREENS
==================================================

If the architecture supports multiple KDS screens:

Test:

KDS-01
KDS-02

Determine whether KDS screens represent:

- same kitchen
- different kitchen stations
- different categories
- different branches

Do not assume all KDS screens should receive identical data.

Verify the existing routing configuration.

Example:

KDS Kitchen:

Pizza

KDS Bar:

Drinks

KDS Main:

All food

Verify routing according to actual system requirements.

==================================================
15. KIOSK → KDS
==================================================

Test:

Customer orders at Kiosk.

Expected:

Kiosk
 ↓
Canonical Order
 ↓
KOT
 ↓
KDS

Verify:

order items
modifiers
quantity
table/order type
source
timestamps

are preserved.

==================================================
16. POS → KDS
==================================================

Test:

Cashier creates order.

Expected:

POS
 ↓
Canonical Order
 ↓
KOT
 ↓
KDS

Verify exactly the same order data.

==================================================
17. CAPTAIN → KDS
==================================================

Captain creates order.

Expected:

Captain
 ↓
Canonical Order
 ↓
KOT
 ↓
KDS

No separate Captain-only order pipeline.

==================================================
18. QR → KDS
==================================================

If QR Ordering is enabled:

Customer:

QR
 ↓
Order
 ↓
KOT
 ↓
KDS

Verify table context.

==================================================
19. CROSS-DEVICE ORDER CONSISTENCY
==================================================

For every order verify:

restaurantId
branchId
orderId
source
deviceId
tableId where applicable
items
modifiers
pricing
tax
status
timestamps

remain consistent across:

POS
Restaurant Admin
KDS
Captain
Kiosk
Cloud
Branch Core

where applicable.

==================================================
20. ORDER STATUS PROPAGATION
==================================================

Test:

POS creates order.

KDS:

NEW
→ PREPARING
→ READY

Verify the correct state propagates back to:

POS
Restaurant Admin
Captain
customer QR where applicable

Do not allow stale devices to overwrite newer states incorrectly.

==================================================
21. CONCURRENT ORDER STATUS UPDATES
==================================================

Example:

KDS-01:

Order #1001 → PREPARING

KDS-02:

same order → READY

Test how the architecture handles concurrent updates.

Determine the authoritative state transition rules.

Do not use uncontrolled last-write-wins if it can produce invalid order states.

==================================================
22. CONCURRENT ITEM MODIFICATION
==================================================

Test:

POS changes an order item.

Captain changes another item.

Kiosk/order source attempts another modification.

Determine the existing conflict strategy.

Do not silently overwrite the complete order JSON.

If item-level merge is required, verify it.

==================================================
23. PAYMENT CONCURRENCY
==================================================

Payment implementation is NOT the focus of this phase.

However, audit the architecture for:

POS payment
Kiosk payment
QR payment

and verify that the order model can eventually support safe payment concurrency.

Do NOT implement Razorpay now.

Do NOT implement Cash payment changes now.

Just verify architecture readiness.

==================================================
24. INVENTORY CONCURRENCY
==================================================

Example:

POS sells:

2 Pizza

Kiosk sells:

1 Pizza

Captain sells:

1 Pizza

All simultaneously.

Inventory should not become:

incorrect due to last-write-wins snapshots.

Verify the current inventory architecture.

If ledger/movement architecture exists, test it.

If not, document the gap.

==================================================
25. OFFLINE POS + ONLINE KIOSK
==================================================

Test:

POS internet:
OFFLINE

Kiosk:
ONLINE

Branch Core:
AVAILABLE

Verify:

POS can continue local operation.

Kiosk can continue operation.

When synchronization resumes:

orders converge correctly.

No duplicate order IDs.

No missing KOTs.

==================================================
26. OFFLINE MULTIPLE POS
==================================================

POS-01:

OFFLINE

POS-02:

OFFLINE

Both create orders.

Expected:

No collision.

When internet/network returns:

both synchronize.

No order loss.

==================================================
27. OFFLINE KIOSK
==================================================

If kiosk offline operation is supported:

Kiosk creates order locally.

Verify:

local persistence
queue
retry
sync
idempotency

If public QR ordering cannot operate without internet, document that explicitly.

Do not fake internet availability.

==================================================
28. BRANCH CORE FAILURE
==================================================

If Branch Core exists:

Simulate:

Branch Core OFFLINE/STOPPED.

Determine:

What POS can still do?

What Kiosk can still do?

What Captain can still do?

What KDS can still do?

What happens when Branch Core returns?

Document the exact fallback behavior.

Do not create a hidden single point of failure.

==================================================
29. DEVICE RESTART
==================================================

For every application:

POS
Kiosk
Captain
KDS
Restaurant Admin

Test:

Create data.

Close application/browser.

Restart.

Verify:

local data survives.

Pending sync survives.

Device identity survives.

No duplicate registration.

No duplicate orders.

==================================================
30. DEVICE RE-REGISTRATION
==================================================

Test:

POS-01 is already registered.

Restart/reinstall simulation.

Verify device identity behavior.

Determine whether the system:

recognizes existing device

or

creates duplicate device.

There must be a safe device registration strategy.

==================================================
31. DEVICE ACTIVATION
==================================================

Test onboarding:

Super Admin creates restaurant.

Plan assigned.

Activation credentials generated.

POS activated.

Kiosk activated.

KDS activated.

Captain activated.

Verify each device receives:

restaurantId
branchId
deviceId
deviceType
entitlements
configuration
sync credentials

Do not require the Super Admin to manually create a completely separate restaurant integration for every device.

==================================================
32. DEVICE LIMITS
==================================================

If plans contain device limits:

Test:

Plan allows:

2 POS

Attempt to register:

POS-03

Expected:

blocked or requires authorized upgrade/override.

Do not silently allow unlimited devices if plan limits exist.

==================================================
33. KIOSK ADMIN
==================================================

Test:

One Kiosk Admin manages:

Kiosk-01
Kiosk-02
Kiosk-03

Kiosk Admin should see:

device
status
last seen
last sync
pending events
errors
version

Kiosk Admin should NOT need a separate restaurant for every kiosk.

==================================================
34. RESTAURANT ADMIN DEVICE FLEET
==================================================

Restaurant Admin should be able to understand the operational fleet.

Example:

Devices:

POS-01     ONLINE
POS-02     OFFLINE
KIOSK-01   ONLINE
KIOSK-02   ONLINE
KDS-01     ONLINE
CAPTAIN-01 ONLINE
CAPTAIN-02 ONLINE

Show:

last seen
last sync
pending events
errors
device type
branch

Do not show fake statuses.

==================================================
35. DEVICE COMMANDS
==================================================

Test commands such as:

SYNC_NOW

where supported.

Example:

Restaurant Admin:

POS-02
[Sync Now]

If POS-02 is online:

command delivered.

If offline:

command remains pending.

When POS-02 reconnects:

command is received.

Do not pretend an offline device received a command.

==================================================
36. RESTAURANT → BRANCH DATA ISOLATION
==================================================

Test:

Restaurant A
Branch A1
Branch A2

Restaurant B
Branch B1

Ensure:

A1 cannot access A2 data unless explicitly authorized.

Restaurant A cannot access Restaurant B.

Devices cannot cross tenant boundaries.

==================================================
37. MENU PROPAGATION
==================================================

Restaurant Admin changes:

Pizza price

Publish.

Verify:

POS
Kiosk
Captain
QR

receive the correct menu/configuration according to their channel.

No stale configuration should silently become authoritative.

==================================================
38. MENU CONCURRENCY
==================================================

Test:

Restaurant Admin changes menu.

Kiosk is using old menu.

POS is using old menu.

Customer QR loads new menu.

Verify versioning and order-time validation.

Old cached clients must not be able to submit invalid prices.

==================================================
39. ENTITLEMENT CHANGE WHILE DEVICES ARE ONLINE
==================================================

Example:

Restaurant currently has:

POS
KDS
Captain
QR

Super Admin disables:

QR_ORDERING

Expected:

QR new orders become unavailable.

Existing historical QR orders remain.

Other features continue.

Verify propagation to:

Restaurant Admin
QR
POS where relevant
Branch Core

==================================================
40. ENTITLEMENT CHANGE WHILE DEVICE IS OFFLINE
==================================================

Example:

POS/Kiosk is offline.

Super Admin changes restaurant entitlement.

Device reconnects.

Verify entitlement refresh.

Do not allow permanently stale privileges.

==================================================
41. MULTI-BRANCH DEVICE TEST
==================================================

Restaurant:

JM9999999999

Branch A:

POS-A1
KDS-A
Kiosk-A

Branch B:

POS-B1
KDS-B
Kiosk-B

Verify:

Branch A order → Branch A KDS

Branch B order → Branch B KDS

Never:

Branch A order → Branch B KDS

unless explicitly configured as a shared kitchen.

==================================================
42. SHARED KITCHEN TEST
==================================================

If the architecture supports a shared kitchen across branches:

test explicitly.

Do not assume.

Document:

Branch A
    ↓
Shared KDS

Branch B
    ↓
Shared KDS

Verify routing rules.

==================================================
43. NETWORK TOPOLOGY TEST
==================================================

Test intended network architecture:

Cloud
 ↓
Internet
 ↓
Branch Core
 ↓
LAN
 ├── POS
 ├── Kiosk
 ├── Captain
 └── KDS

Verify which communication happens through:

Cloud

and which through:

Branch Core/LAN.

Do not allow applications to randomly use incompatible communication paths.

==================================================
44. DATA FLOW DOCUMENTATION
==================================================

Create a complete data flow diagram for:

POS Order

Kiosk Order

Captain Order

QR Order

Each must show:

UI
→ Local DB
→ Branch Core
→ Cloud
→ Sync
→ POS
→ KOT
→ KDS

where applicable.

Document the actual implementation rather than an imagined architecture.

==================================================
45. EVENT FLOW
==================================================

For every major operation identify events.

Example:

ORDER_CREATED
ORDER_UPDATED
KOT_CREATED
KOT_UPDATED
ORDER_STATUS_CHANGED
MENU_UPDATED
INVENTORY_MOVEMENT
DEVICE_REGISTERED
DEVICE_SYNCED

Verify:

eventId

is unique per event.

Never use orderId as eventId.

==================================================
46. DUPLICATE EVENT TEST
==================================================

Send the same event multiple times.

Expected:

ONE logical result.

Test:

POS
Kiosk
Captain
KDS
Branch Core
Cloud

for idempotent processing.

==================================================
47. OUT-OF-ORDER EVENT TEST
==================================================

Deliver:

Event 103

before:

Event 102

Determine whether the system:

buffers
recovers
uses sequence
uses version
rejects safely

Do not silently apply stale state over newer state.

==================================================
48. SYNC CURSOR TEST
==================================================

Test:

Client cursor:

100

Server:

101
102
103

Client receives:

101
102

disconnects.

Reconnects.

Expected:

103 is received.

No missed event.

Do not use only updatedAt timestamp synchronization.

==================================================
49. WEBSOCKET FAILURE TEST
==================================================

If WebSocket exists:

Disconnect it.

Create order.

Verify:

Order still reaches destination through recovery/sync.

WebSocket must be an acceleration mechanism, not the only correctness mechanism.

==================================================
50. DATABASE TRANSACTION TEST
==================================================

For order creation verify that:

Order
+
Order Items
+
KOT/outbox event

cannot end up partially committed.

Simulate failure at different stages.

Expected:

transaction rollback or recoverable state.

Never:

Order exists

but:

sync event permanently missing.

==================================================
51. HIGH-CONCURRENCY TEST MATRIX
==================================================

Test combinations such as:

2 POS + 1 KDS

2 POS + 2 Kiosk + 1 KDS

3 POS + 3 Kiosk + 2 KDS + 5 Captain

5 POS + 5 Kiosk + 2 KDS + 10 Captain

QR + POS + Kiosk + Captain simultaneously

multiple branches simultaneously

multiple restaurants simultaneously

Do not only test each application independently.

Test the ecosystem.

==================================================
52. DATA CONSISTENCY MATRIX
==================================================

For each order verify:

SOURCE
POS / KIOSK / CAPTAIN / QR

↓

LOCAL STATE

↓

BRANCH CORE

↓

CLOUD

↓

CANONICAL ORDER

↓

KOT

↓

KDS

↓

ORDER STATUS

Every stage must preserve:

orderId
restaurantId
branchId
source
deviceId
tableId
items
modifiers
quantity
pricing
tax
status
timestamps

where applicable.

==================================================
53. TEST AUTOMATION
==================================================

Build automated integration/E2E tests wherever possible.

Do not rely only on manual clicking.

Use the project's existing:

Playwright
API tests
unit tests
integration tests

or equivalent.

Test actual APIs and database state.

==================================================
54. TEST DATA SETUP
==================================================

Create reusable test fixtures.

Example:

Restaurant:
TEST_RESTAURANT_01

Branches:

BRANCH_A
BRANCH_B

Devices:

POS_01
POS_02
KIOSK_01
KIOSK_02
KDS_01
CAPTAIN_01
CAPTAIN_02

Tables:

T01
T02
T03

Menu:

Pizza
Burger
Coffee

This should be test data only.

Do not introduce hardcoded production behavior.

==================================================
55. FAILURE INJECTION
==================================================

Where practical test:

- network disconnect
- API timeout
- database timeout
- duplicate request
- duplicate event
- device restart
- Branch Core restart
- WebSocket disconnect
- stale menu
- stale entitlement
- concurrent order
- concurrent status update

==================================================
56. ACCEPTANCE CRITERIA
==================================================

The onboarding/multi-app architecture is considered verified only when:

[ ] Restaurant can be created
[ ] Branch can be created
[ ] Plan can be assigned
[ ] Entitlements propagate
[ ] Devices register correctly
[ ] Multiple POS supported
[ ] Multiple Kiosk supported
[ ] Multiple Captain devices supported
[ ] Multiple KDS supported where designed
[ ] POS → KDS works
[ ] Kiosk → POS works
[ ] Kiosk → KDS works
[ ] Captain → POS works
[ ] Captain → KDS works
[ ] QR → POS works
[ ] QR → KDS works
[ ] Multiple simultaneous orders work
[ ] No duplicate orders
[ ] No lost orders
[ ] No order ID collision
[ ] No KOT ID collision
[ ] Restaurant isolation works
[ ] Branch isolation works
[ ] Device isolation works
[ ] Menu propagation works
[ ] Entitlement changes work
[ ] Offline behavior is understood
[ ] Sync recovery works
[ ] WebSocket recovery works
[ ] Device restart works
[ ] Device re-registration works
[ ] High concurrency tests pass
[ ] Load tests produce measurable results
[ ] No critical data corruption
[ ] No production hardcoding introduced

==================================================
57. FINAL REPORT
==================================================

After testing, create:

docs/RESTAURANT_ONBOARDING_MULTI_APP_TEST_REPORT.md

Include:

1. Architecture tested
2. Device combinations tested
3. Onboarding scenarios
4. Data flow results
5. POS tests
6. Kiosk tests
7. Captain tests
8. KDS tests
9. QR tests
10. Multi-device tests
11. Multi-branch tests
12. Concurrency tests
13. Offline tests
14. Sync tests
15. Failure recovery tests
16. Security/isolation tests
17. Load tests
18. Failed tests
19. Bugs found
20. Architectural weaknesses
21. Recommended fixes
22. Remaining risks

For every failed test include:

TEST ID
EXPECTED
ACTUAL
ROOT CAUSE
FILE/MODULE
SEVERITY
RECOMMENDED FIX

==================================================
58. IMPORTANT — DO NOT FAKE PASS
==================================================

Never mark a test PASS simply because the UI appears correct.

Verify:

Database state
API response
local state
sync events
device state
order state
KOT state
KDS state

A green UI is not proof of correct architecture.

==================================================
59. IMPORTANT — NO PACKAGING
==================================================

Do NOT create:

EXE
APK
AAB
installer
production package

The purpose of this task is:

ARCHITECTURE + INTEGRATION + CONCURRENCY + DATA FLOW + TESTING.

The applications must become packaging-ready, but packaging happens later.

==================================================
60. EXECUTION METHOD
==================================================

Do not attempt all tests in one giant operation.

First:

1. Audit the repository.
2. Create/update the test plan.
3. Create a test matrix.
4. Identify existing test infrastructure.
5. Identify missing test infrastructure.
6. Execute tests in logical groups.
7. Fix verified architectural problems.
8. Re-run affected tests.
9. Update the test report.
10. Continue until the complete matrix has been evaluated.

Never make a large architectural change without first understanding the existing implementation.

==================================================
FINAL OBJECTIVE
==================================================

I want confidence that JAMANVAAR works as ONE connected restaurant ecosystem.

Example:

Restaurant
    ↓
Branch
    ↓
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ POS 1       │ POS 2       │ Kiosk 1     │ Kiosk 2     │
└─────────────┴─────────────┴─────────────┴─────────────┘
       │              │             │            │
       └──────────────┴─────────────┴────────────┘
                              ↓
                         Branch Core
                              ↓
                      Canonical Order
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
                   KOT                 KDS
                    ↑
              Captain / QR

Every application must understand:

WHO
    = restaurant

WHERE
    = branch

WHICH DEVICE
    = deviceId

WHAT
    = order/event

WHERE IT CAME FROM
    = source/channel

AND HOW IT SYNCS
    = event + idempotency + cursor

The final system must support multiple devices and simultaneous operations without duplicate, lost, overwritten, or cross-tenant data.