You are a Senior SaaS Architect, Full-Stack Engineer, Restaurant POS Architect, Offline-First Systems Engineer, and QA Engineer.

You are working on the JAMANVAAR restaurant management ecosystem.

IMPORTANT:

Do NOT treat QR Ordering as a simple frontend page.

The current QR Ordering implementation appears partially built / hardcoded / demo-like.

Your job is to audit the existing implementation and convert QR Ordering into a REAL, DATABASE-BACKED, MULTI-TENANT, PLAN-AWARE, RESTAURANT-SPECIFIC, END-TO-END feature.

Do NOT blindly rewrite existing code.

First inspect the current repository, architecture, database models, authentication, plans, entitlements, Restaurant Admin, Super Admin, POS, KDS, Kiosk, Captain, sync architecture, and existing QR implementation.

Then create an implementation plan.

Then implement it completely.

==================================================
1. CORE BUSINESS REQUIREMENT
==================================================

JAMANVAAR should support restaurant QR Ordering.

The intended real-world flow is:

SUPER ADMIN
    ↓
Creates / manages restaurant
    ↓
Assigns subscription plan
    ↓
Plan determines whether QR Ordering is available
    ↓
Restaurant Admin
    ↓
Creates/manages branches
    ↓
Creates/manages tables
    ↓
Generates QR codes
    ↓
QR is printed and placed on tables
    ↓
Customer scans QR
    ↓
Customer QR Ordering Web Page opens
    ↓
System identifies restaurant + branch + table
    ↓
Customer sees THAT restaurant's menu
    ↓
Customer selects items
    ↓
Cart
    ↓
Customer places order
    ↓
Order enters restaurant's canonical order system
    ↓
POS / Branch Core receives order
    ↓
KOT generated
    ↓
KDS receives KOT
    ↓
Restaurant prepares order
    ↓
Order status updates
    ↓
Customer can see order status where supported

This must be a real working flow.

It must NOT depend on hardcoded restaurant IDs, hardcoded menus, hardcoded table IDs, fake API responses, mock orders, or static QR URLs.

==================================================
2. FIRST TASK — FULL AUDIT
==================================================

Before changing anything, inspect the entire existing QR Ordering implementation.

Search for:

- QR pages
- QR components
- QR generation
- QR URLs
- table QR logic
- restaurant QR logic
- menu fetching
- menu display
- cart
- checkout
- order creation
- order APIs
- QR order APIs
- Restaurant Admin
- Super Admin plans
- Feature/Entitlement system
- POS order ingestion
- KOT creation
- KDS routing
- Branch logic
- Restaurant isolation
- authentication
- authorization
- local storage
- IndexedDB
- sync queue
- Branch Core/local edge implementation if present
- WebSocket implementation
- polling
- order status
- database models
- migrations
- seed data
- hardcoded restaurant data
- hardcoded menu data
- hardcoded feature flags

Find all code containing things like:

- restaurantId = ...
- branchId = ...
- tableId = ...
- QR URL constants
- demoRestaurant
- sampleRestaurant
- mockRestaurant
- dummyMenu
- staticMenu
- hardcodedMenu
- fakeOrder
- demoOrder
- local mock data
- static QR
- fixed plan IDs
- fixed feature flags

Do NOT assume the existing implementation is correct.

Produce:

docs/QR_ORDERING_CURRENT_STATE.md

containing:

1. What already exists
2. What works
3. What is hardcoded
4. What is mocked
5. What is missing
6. What APIs exist
7. What database entities exist
8. What frontend routes exist
9. What authentication exists
10. What plan entitlement system exists
11. What POS integration exists
12. What KDS integration exists
13. What synchronization exists
14. What must be redesigned

==================================================
3. QR ORDERING MUST BE A REAL ENTITLEMENT
==================================================

QR Ordering must NOT simply be hidden/shown based on frontend code.

The plan system must control it.

Use the existing centralized entitlement architecture if available.

Conceptually:

PLAN
    ↓
PLAN FEATURES
    ↓
LICENSE
    ↓
LICENSE FEATURE SNAPSHOT / OVERRIDES
    ↓
RESTAURANT
    ↓
BRANCH
    ↓
DEVICE / APPLICATION
    ↓
QR ORDERING

QR Ordering should be represented by a real feature key, for example:

QR_ORDERING

Use the project's existing feature naming convention if one already exists.

Do NOT introduce a second competing entitlement system.

==================================================
4. PLAN EXAMPLE
==================================================

Implement the entitlement model so that plans can be configured dynamically.

Example expected configuration:

₹5,000 PLAN

Includes:

- POS
- POS Admin
- Restaurant Admin
- Billing
- KOT
- Reports
- Inventory
- CRM

QR_ORDERING = false

UI behavior:

QR Ordering should still be visible in the feature list / plan comparison.

It should show something like:

QR Ordering
🔒 Not included in your current plan

User can understand that JAMANVAAR supports QR Ordering but their current plan does not include it.

They should NOT be able to actually generate active QR codes or receive QR orders.

--------------------------------------------

₹7,000 PLAN

Includes:

- everything from ₹5,000
- KDS
- Captain App

QR_ORDERING = false

It should still show:

QR Ordering
🔒 Available in higher plan

--------------------------------------------

₹9,000 PLAN

Includes:

- everything from ₹7,000
- QR Ordering

QR_ORDERING = true

Now Restaurant Admin should have:

QR Ordering
✓ Enabled

and the actual QR Ordering functionality becomes available.

IMPORTANT:

These prices are examples based on the current product configuration.

Do NOT hardcode prices or feature relationships in frontend code.

Super Admin must be able to configure:

- plans
- prices
- billing period
- features
- feature descriptions
- enabled/disabled state
- limits
- overrides

from the Super Admin.

==================================================
5. SUPER ADMIN PLAN MANAGEMENT
==================================================

Super Admin must have a proper Plan & Entitlement Management system.

Example:

Plan:

Jamanvaar Core

Price:
₹5,000/year

Features:

✓ POS
✓ POS Admin
✓ Restaurant Admin
✓ Billing
✓ KOT
✓ Reports
✓ Inventory
✗ Captain
✗ KDS
✗ QR Ordering
✗ Kiosk

Another plan:

Jamanvaar Core + Captain

₹7,000/year

...

Another plan:

Jamanvaar Pro

₹9,000/year

...

Super Admin must be able to:

- create plan
- edit plan
- activate/deactivate plan
- add feature
- remove feature
- configure feature limits
- configure billing period
- assign plan to restaurant
- change restaurant plan
- see current restaurant entitlement state
- override individual feature if authorized
- revoke feature
- restore feature

The frontend must NOT determine:

"₹9000 means QR ordering"

Instead:

plan.features.includes(QR_ORDERING)

or the project's equivalent entitlement service.

==================================================
6. RESTAURANT ONBOARDING
==================================================

When Super Admin creates a restaurant:

Collect:

- Restaurant Name
- Owner Name
- Phone
- Email
- Address
- GST information if supported
- Branch information
- Plan
- Subscription start date
- Subscription end date
- Status

Generate:

Restaurant ID

using the existing required convention:

JM + registered phone number

Example:

JM9999999999

The Restaurant ID must belong to the restaurant record.

Do NOT regenerate it differently across applications.

Restaurant Admin login:

Restaurant ID
+
Password

Forgot Password:

Restaurant ID
+
registered email OTP

After OTP verification:

set new password.

==================================================
7. RESTAURANT ADMIN — QR ORDERING MODULE
==================================================

Restaurant Admin should have a proper:

QR Ordering

section.

Example sidebar:

Dashboard

Operations
- Orders
- Tables
- Menu
- KOT
- KDS

QR Ordering
- Overview
- Tables & QR
- QR Generator
- QR Orders
- QR Settings

Configuration

Reports

etc.

Do NOT add unnecessary pages if the existing architecture has a better structure.

==================================================
8. QR ORDERING DASHBOARD
==================================================

Create a proper QR Ordering overview.

Show:

QR Ordering Status

✓ Enabled

or

🔒 Not included in current plan

If disabled:

Explain:

"QR Ordering is available on an eligible plan."

Provide:

View Plan / Upgrade

BUT:

Do not implement fake upgrade/payment logic unless the project already has a real billing flow.

If QR is enabled:

Show:

Total Tables
QR Codes Generated
Active Tables
Today's QR Orders
Pending QR Orders
Completed QR Orders
QR Revenue

Example:

12 Tables
12 Active QR Codes
18 QR Orders Today
₹8,450 QR Sales

These values must come from real backend data.

No hardcoded statistics.

==================================================
9. TABLE MANAGEMENT
==================================================

QR Ordering is table-based.

Restaurant Admin should be able to create tables.

Example:

Table 01
Table 02
Table 03
Table 04

Fields:

- tableId
- restaurantId
- branchId
- tableNumber
- tableName if needed
- capacity
- status
- QR status
- active/inactive
- createdAt
- updatedAt

IMPORTANT:

Table IDs must be globally unique internally.

Do NOT use:

tableNumber as database ID.

Example:

id:
tbl_01HX....

displayNumber:
12

==================================================
10. BRANCH SUPPORT
==================================================

QR must always be associated with:

restaurantId
+
branchId
+
tableId

Never rely only on restaurantId.

Example:

Restaurant:

JM9999999999

Branch:

Ahmedabad Main Branch

Table:

T12

QR payload should identify:

restaurant
branch
table

through a secure identifier.

Do not expose unnecessary sensitive information.

==================================================
11. QR URL DESIGN
==================================================

Do NOT generate a generic:

/qr

or:

/order

URL that requires hardcoded restaurant data.

Instead use a unique QR identifier.

For example:

/order/q/<publicToken>

OR:

/qr/<publicToken>

Example:

https://order.jamanvaar.com/q/abc123xyz

The public token should resolve to:

restaurantId
branchId
tableId
QR configuration
status

The customer should NOT need to log in.

The public token must be:

- unique
- unguessable
- revocable
- regeneratable
- tied to one table
- tied to one branch
- tied to one restaurant

Never use sequential IDs directly as the public QR token.

==================================================
12. QR DATABASE MODEL
==================================================

Create or adapt a proper model.

Conceptually:

QrCode

id
publicToken
restaurantId
branchId
tableId
status
version
createdAt
updatedAt
revokedAt
lastScannedAt
metadata

Potential status:

ACTIVE
DISABLED
REVOKED

Add proper indexes:

restaurantId
branchId
tableId
publicToken

publicToken must be unique.

==================================================
13. QR RESOLUTION API
==================================================

Customer opens:

/q/:token

Frontend calls backend:

GET /public/qr/:token

Backend resolves token.

Return only safe public information:

restaurant:

name
logo
address if intended

branch:

name

table:

displayNumber

ordering:

enabled
menuVersion
settings

Do NOT return:

- passwords
- admin data
- internal secrets
- device tokens
- payment credentials
- private configuration

==================================================
14. PLAN CHECK AT QR RESOLUTION
==================================================

This is extremely important.

When the customer scans a QR:

Backend must verify:

1. QR exists
2. QR is active
3. restaurant exists
4. branch exists
5. restaurant is active
6. subscription/license is valid
7. QR_ORDERING entitlement is enabled
8. branch is valid
9. table is active

If QR_ORDERING is not enabled:

Do NOT show the actual ordering experience.

Show:

"QR Ordering is currently unavailable for this restaurant."

Do NOT trust frontend feature flags for this.

Backend authorization is mandatory.

==================================================
15. CUSTOMER QR ORDER PAGE
==================================================

The page must dynamically load the restaurant.

Example:

Customer scans Table 12.

Page:

--------------------------------
[Restaurant Logo]

Restaurant Name

Table 12

Dine-in Ordering

--------------------------------

Search menu

Categories:

Starters
Main Course
Pizza
Beverages
Desserts

Products:

Paneer Pizza
₹249

[Add]

...

Cart

2 Items
₹498

[View Cart]
--------------------------------

Everything must come from that restaurant's database.

No hardcoded menu.

==================================================
16. MENU ARCHITECTURE
==================================================

Customer QR Ordering should use the same canonical restaurant menu system used by:

POS
Kiosk
Captain
Restaurant Admin

Do NOT create a separate QR menu database.

Canonical:

Restaurant
    ↓
Branch
    ↓
Menu
    ↓
Category
    ↓
Item
    ↓
Modifier Group
    ↓
Modifier
    ↓
Pricing
    ↓
Availability

QR Ordering reads from this canonical menu.

If menu item is disabled:

POS sees disabled
QR sees disabled
Kiosk sees disabled
Captain sees disabled

depending on each channel's rules.

==================================================
17. CHANNEL AVAILABILITY
==================================================

Menu items should optionally support channel availability.

Example:

Item:

Paneer Pizza

Available:

POS ✓
Kiosk ✓
QR ✓
Captain ✓

Another:

Secret Special

POS ✓
QR ✗
Kiosk ✗

Do NOT create hardcoded checks.

Use a configurable channel model/field if appropriate.

Example:

salesChannels:

POS
KIOSK
QR
CAPTAIN

Use the existing architecture if already present.

==================================================
18. CART
==================================================

Customer cart must support:

- add item
- remove item
- quantity
- modifiers
- notes
- special instructions
- taxes
- discounts if supported
- subtotal
- total

Calculations must happen using canonical pricing rules.

Do not trust the client-submitted total.

Example:

Client says:

total = ₹100

Backend recalculates:

items
+
modifiers
+
tax
-
discount

Server-generated total is authoritative.

==================================================
19. CUSTOMER CHECKOUT
==================================================

Before placing order:

Show:

Restaurant Name

Table:

T12

Items:

Paneer Pizza × 2
Cold Coffee × 1

Subtotal

Tax

Total

Customer information if required:

- name
- mobile

Do not force unnecessary login.

==================================================
20. QR ORDER CREATION
==================================================

Order must enter the SAME canonical Order domain as:

POS
Kiosk
Captain
QR

Do NOT create:

QrOrder

as a completely separate business order system unless there is a strong architectural reason.

Preferred:

Order
source = QR

channel/source values:

POS
KIOSK
CAPTAIN
QR
etc.

Order should contain:

id
restaurantId
branchId
source
tableId
items
pricing
tax
discount
status
paymentStatus
createdAt
updatedAt

Example:

source:

QR

orderType:

DINE_IN

tableId:

table_xxx

==================================================
21. ORDER ID / IDEMPOTENCY
==================================================

Customer can accidentally press:

Place Order

multiple times.

This MUST NOT create duplicate orders.

Generate a clientOrderId / idempotencyKey.

Example:

qrClientRequestId

Backend must enforce uniqueness.

If the same request is submitted twice:

return the original order.

Do not create another order.

This must work even if:

- customer double-clicks
- browser retries
- network reconnects
- API times out after order was created
- customer refreshes page

==================================================
22. QR ORDER → POS
==================================================

This is critical.

When customer places a QR order:

QR
 ↓
Canonical Order
 ↓
Branch Core / Cloud
 ↓
POS order feed
 ↓
KOT
 ↓
KDS

The order must appear in the restaurant's operational system.

POS should show something like:

NEW ORDER

#QR-1024

Table 12

2 × Paneer Pizza
1 × Cold Coffee

Source:
QR ORDER

Status:
NEW

Do NOT create a completely separate QR-only order screen that is disconnected from POS.

==================================================
23. QR ORDER → KOT
==================================================

When QR order is accepted/created:

Generate KOT according to the existing canonical order lifecycle.

KOT should contain:

- KOT ID
- order ID
- restaurant
- branch
- table
- source
- items
- modifiers
- notes
- timestamps

Do not use:

max(KOT number) + 1

because multiple devices may create KOTs simultaneously.

Use a collision-safe numbering strategy.

==================================================
24. QR ORDER → KDS
==================================================

KDS should receive QR orders through the same canonical KOT/KDS pipeline.

Example:

KDS:

NEW

QR
Table 12

KOT #1024

Paneer Pizza × 2
Cold Coffee × 1

[Start]
[Ready]

QR should not require a completely separate KDS integration.

==================================================
25. OFFLINE / BRANCH CORE REQUIREMENT
==================================================

This feature must fit into the existing JAMANVAAR offline-first architecture.

Do NOT create a QR system that bypasses the sync architecture.

Target:

QR Customer
      ↓
Internet
      ↓
Cloud / Branch-aware API
      ↓
Branch Core
      ↓
POS / KDS

For restaurant operational devices:

POS
KDS
Captain
Kiosk
Restaurant Admin

local operations must use the existing local persistence and sync model.

IMPORTANT:

A customer QR scan inherently requires network connectivity unless the customer device is on the restaurant LAN and the system intentionally supports local QR access.

Do NOT fake offline internet QR ordering.

If restaurant internet is down:

Option A:

Public QR ordering becomes unavailable.

OR

Option B:

If the customer is connected to the restaurant LAN/Wi-Fi and local Branch Core exposes a secure local QR endpoint, support local QR ordering.

Research and document which approach the architecture supports.

Never claim cloud QR ordering works without connectivity unless it genuinely does.

==================================================
26. BRANCH CORE INTEGRATION
==================================================

If Branch Core exists or is being implemented:

QR orders should be routed through the canonical branch operational layer.

Example:

Public QR Request
      ↓
Cloud
      ↓
Branch Routing
      ↓
Branch Core
      ↓
POS
      ↓
KOT
      ↓
KDS

If direct cloud → POS is currently implemented:

audit whether that violates the intended architecture.

Do not create a second incompatible routing system.

==================================================
27. MULTIPLE POS SUPPORT
==================================================

Restaurant may have:

POS 1
POS 2
POS 3

QR order should not belong to one specific POS.

Example:

QR order created:

Order #QR-1234

Branch:

Ahmedabad Main

POS 1 and POS 2 should receive it according to the canonical order distribution rules.

Only one device should be allowed to claim/process the order transition where required.

Do not duplicate the order simply because multiple POS devices sync.

==================================================
28. MULTIPLE KIOSKS
==================================================

QR Ordering must coexist with Kiosk.

Example:

Restaurant:

Branch 1

Kiosk 1
Kiosk 2
POS 1
POS 2
KDS 1
Captain devices

All should operate against the same branch data model.

Do not create isolated order databases.

==================================================
29. MULTI-BRANCH
==================================================

Restaurant:

JM9999999999

Branch A

Table A1
Table A2

Branch B

Table B1
Table B2

QR from Branch A must NEVER load:

Branch B menu
Branch B table
Branch B operational data

Every QR request must resolve:

restaurantId
branchId
tableId

and enforce all three.

==================================================
30. SECURITY / TENANT ISOLATION
==================================================

QR endpoints are public.

Therefore security is extremely important.

Customer does not authenticate.

But public QR token must provide access only to intended public ordering information.

Never expose:

- restaurant admin APIs
- POS APIs
- customer data
- employee data
- device tokens
- internal IDs unnecessarily
- inventory
- purchase data
- reports
- credentials
- private settings

Prevent:

- token guessing
- IDOR
- restaurant cross-access
- branch cross-access
- table manipulation
- price manipulation
- quantity abuse
- duplicate order submission
- unauthorized feature usage

Rate-limit public QR APIs.

Add abuse protection.

==================================================
31. QR REGENERATION
==================================================

Restaurant Admin should be able to:

Generate QR
Download QR
Print QR
Disable QR
Regenerate QR
Revoke QR

If QR is regenerated:

old QR should become invalid.

Do not silently leave multiple active public tokens for the same table unless explicitly supported.

==================================================
32. QR PRINTING
==================================================

Provide a clean QR printing layout.

Example:

--------------------------------

[Restaurant Logo]

RESTAURANT NAME

Scan to Order

[ QR CODE ]

Table 12

Scan • Order • Enjoy

--------------------------------

Do not print internal IDs.

QR should have sufficient contrast and error correction.

Provide:

Download PNG
Download PDF
Print

if supported by the current web architecture.

==================================================
33. MENU QR OPTION
==================================================

The user also mentioned QR codes may be placed on menu cards.

Support two possible QR modes if appropriate:

TABLE_ORDER

and

MENU_ONLY

TABLE_ORDER:

QR identifies table.

MENU_ONLY:

QR opens restaurant menu without automatically assigning a table.

If MENU_ONLY is implemented:

customer must choose:

Table number

or

Order type

before checkout.

Do not assume a table when there isn't one.

This should be configurable.

==================================================
34. CUSTOMER SESSION
==================================================

Customer browser session should remember:

restaurant
branch
table
cart
session/order context

But do not rely on localStorage alone for order correctness.

Cart can be client-side.

Order creation must be server-authoritative.

If customer refreshes:

cart/session should behave predictably.

If order was already submitted:

do not recreate it.

==================================================
35. ORDER STATUS
==================================================

Customer should optionally see:

Order Received
Preparing
Ready
Completed

Potential lifecycle:

PLACED
CONFIRMED
PREPARING
READY
SERVED
COMPLETED
CANCELLED

Use the existing canonical order status system.

Do not create a separate incompatible QR status model.

==================================================
36. PLAN DISABLED BEHAVIOR
==================================================

If restaurant downgrades:

₹9,000
→
₹7,000

QR_ORDERING becomes disabled.

Existing QR codes should NOT continue creating new orders simply because old QR URLs exist.

Backend must reject new QR orders.

Customer sees:

"QR Ordering is currently unavailable."

Restaurant Admin sees:

"QR Ordering is disabled because this restaurant's current plan does not include QR Ordering."

Existing historical QR orders remain in reports.

Do not delete historical data.

==================================================
37. PLAN UPGRADE
==================================================

If restaurant upgrades:

₹7,000
→
₹9,000

QR_ORDERING becomes enabled.

Existing configuration should become usable if still valid.

Restaurant should not need to rebuild everything unless explicitly required.

Example:

Existing tables:

T1
T2
T3

Existing QR records can become active after entitlement is enabled.

==================================================
38. FEATURE OVERRIDE
==================================================

Super Admin may have the ability to override feature entitlement.

Example:

Restaurant plan:

₹7,000

QR_ORDERING:

Not included

Super Admin can temporarily enable:

QR_ORDERING = true

The effective entitlement should become:

plan entitlement
+
feature override

Use the existing license/override architecture.

Do not modify the plan itself just to give one restaurant access.

==================================================
39. ENTITLEMENT CHECK LOCATION
==================================================

There must be one centralized entitlement service.

Example:

EntitlementService.has(
    restaurantId,
    "QR_ORDERING"
)

Use equivalent architecture appropriate to the codebase.

Frontend:

for UI.

Backend:

for authorization.

Branch Core:

for operational capability.

Do NOT repeat:

if plan === "9000"

throughout the codebase.

That is explicitly forbidden.

==================================================
40. OFFLINE ENTITLEMENT
==================================================

Restaurant Admin / POS / Kiosk / local systems may temporarily lose internet.

Cache the last valid entitlement snapshot.

Document:

- when entitlement is cached
- how long it remains valid
- what happens when subscription expires
- what happens when server cannot be reached
- what happens when feature is revoked

Do not allow a revoked feature to remain permanently enabled offline.

Create a documented grace policy.

==================================================
41. SYNC ARCHITECTURE
==================================================

QR orders must use the existing shared synchronization architecture.

Do NOT create:

QRSyncService

that has completely different semantics from:

POS sync
Kiosk sync
Captain sync

unless there is a real protocol-level reason.

All operational events should use:

eventId
restaurantId
branchId
deviceId
entityType
entityId
eventType
payload
createdAt
sequence/cursor where applicable

Events must be idempotent.

==================================================
42. NO UPDATEDAT CURSOR
==================================================

Do NOT rely on:

updatedAt > lastSyncTime

as the only sync mechanism.

Use the project's server-side monotonic sequence/cursor architecture.

Example:

branch sequence:

1001
1002
1003
1004

Client has cursor:

1002

Request:

events after 1002

Returns:

1003
1004

This prevents same-millisecond ordering problems.

==================================================
43. WEBSOCKET
==================================================

If WebSocket is implemented:

Use it only as a real-time acceleration mechanism.

WebSocket disconnect must NOT break correctness.

If KDS misses an event:

cursor/delta sync must recover it.

Example:

KOT created
↓
WebSocket sent
↓
KDS disconnected
↓
WebSocket event missed
↓
KDS reconnects
↓
sync from cursor
↓
KOT recovered

==================================================
44. DUPLICATE PROTECTION
==================================================

Test:

Customer clicks Place Order twice.

Network times out.

Browser retries.

Cloud receives same idempotency key.

Expected:

ONE order.

Not:

TWO orders.

Also test:

Branch Core receives duplicate event.

POS receives duplicate event.

KDS receives duplicate KOT event.

All must remain idempotent.

==================================================
45. PAYMENT
==================================================

Do not implement fake payment success.

For QR ordering:

If online payment is supported:

Payment Gateway
    ↓
Backend
    ↓
Verified payment
    ↓
Order marked paid

Frontend success callback alone must NOT mark order as paid.

If cash payment is supported:

Restaurant configuration determines whether customer can select cash.

If offline:

Do not claim UPI succeeded without gateway verification.

==================================================
46. QR ORDER SETTINGS
==================================================

Restaurant Admin should have settings such as:

QR Ordering:
ON/OFF

Customer ordering:
Enabled/Disabled

Allow customer notes:
ON/OFF

Allow modifiers:
ON/OFF

Allow cash:
ON/OFF

Allow online payment:
ON/OFF

Show order status:
ON/OFF

Menu-only QR:
ON/OFF

Table ordering:
ON/OFF

These settings must be database-backed.

Do not hardcode them.

==================================================
47. ANALYTICS
==================================================

Restaurant Admin should be able to see:

QR scans
QR sessions
QR orders
QR revenue
Average order value
Orders by table
Orders by branch
Orders by time
Conversion if session tracking is implemented

Do not fabricate metrics.

Track only meaningful events.

Example:

QR_SCANNED

QR_MENU_VIEWED

QR_CART_CREATED

QR_ORDER_STARTED

QR_ORDER_PLACED

QR_ORDER_FAILED

Be careful with privacy and unnecessary tracking.

==================================================
48. AUDIT LOGGING
==================================================

Track administrative actions:

QR_CREATED
QR_DISABLED
QR_REGENERATED
QR_REVOKED
QR_SETTINGS_CHANGED
QR_FEATURE_ENABLED
QR_FEATURE_DISABLED

Include:

actor
restaurantId
branchId
timestamp
target
metadata

==================================================
49. UI REQUIREMENTS
==================================================

The UI should feel like a real SaaS feature, not a demo.

Restaurant Admin:

QR Ordering

----------------------------------

QR Ordering
Enabled ✓

12 Active QR Codes
18 Orders Today
₹8,450 Revenue

----------------------------------

Tables & QR

Table 01     Active     [View QR]
Table 02     Active     [View QR]
Table 03     Active     [View QR]

[Generate QR]
[Print All]
[Download All]

----------------------------------

If feature unavailable:

QR Ordering 🔒

Your current plan does not include QR Ordering.

[View Plan]

Do not make the disabled state look broken.

Make it obvious that this is a real available feature that is simply not included in the current entitlement.

==================================================
50. CUSTOMER UI
==================================================

Customer page should be mobile-first.

Example:

[Restaurant Logo]

Restaurant Name
Table 12

Search food...

Categories

Pizza
Burgers
Starters
Drinks

--------------------------------

Paneer Pizza
₹249

[Add]

--------------------------------

Garlic Bread
₹149

[Add]

--------------------------------

Sticky bottom cart:

2 Items     ₹498
[View Cart]

Use a clean restaurant ordering experience.

Do not make it look like an admin dashboard.

==================================================
51. PERFORMANCE
==================================================

QR customer page must load quickly.

Do not fetch the entire Restaurant Admin dataset.

Only load:

restaurant public profile
branch public info
table context
published menu
availability
ordering settings

Use caching/versioning.

Menu images should use optimized URLs.

==================================================
52. MENU VERSIONING
==================================================

Create menu version support.

Example:

menuVersion = 42

Customer loads version 42.

When menu changes:

version = 43

Client can refresh.

This can also help:

POS
Kiosk
QR
Captain

know whether cached menu is stale.

==================================================
53. DATA OWNERSHIP
==================================================

Clearly define:

Cloud owns:

- restaurant master
- branches
- plans
- licenses
- entitlements
- QR configuration
- canonical operational data
- reporting data

Branch Core owns locally:

- local operational replica
- local orders
- KOT
- KDS state
- local sync queue
- local device state

Device owns:

- local cache
- local pending events
- local UI state

Customer browser owns:

- temporary cart
- QR session
- temporary customer context

Do not store authoritative restaurant data only in customer browser.

==================================================
54. HARD-CODED DATA ELIMINATION
==================================================

This is one of the most important tasks.

Search entire codebase for hardcoded:

Restaurant name
Restaurant logo
Restaurant ID
Branch ID
Table ID
Menu items
Prices
Plan IDs
Feature availability
QR URL
Order IDs
KOT IDs

Replace them with real data from:

database
API
entitlement service
restaurant configuration
branch configuration

Demo seed data may remain only for development/testing.

But production code must not depend on it.

==================================================
55. API CONTRACT
==================================================

Create documented API contracts.

At minimum:

GET /public/qr/:token

GET /public/qr/:token/menu

POST /public/qr/:token/orders

GET /public/qr/orders/:orderPublicId

GET /restaurant/qr/tables

POST /restaurant/qr/tables

POST /restaurant/qr/tables/:id/generate

POST /restaurant/qr/tables/:id/regenerate

POST /restaurant/qr/tables/:id/revoke

GET /restaurant/qr/orders

GET /restaurant/qr/settings

PUT /restaurant/qr/settings

Adapt naming to existing API conventions.

Do not create duplicate endpoints if equivalent ones already exist.

==================================================
56. PUBLIC ORDER ID
==================================================

Do not expose internal sequential database IDs to customers.

Customer order tracking should use a public identifier.

Example:

JQ-8F72K

or secure random public token.

Internal:

UUID/ULID

Public:

randomized public order reference.

==================================================
57. RATE LIMITING
==================================================

Public QR endpoints need rate limiting.

Protect:

QR resolution
menu requests
order creation
order status

Prevent:

spam orders
brute force token discovery
API abuse

==================================================
58. VALIDATION
==================================================

Backend must validate:

restaurant active
branch active
table active
QR active
QR_ORDERING entitlement
item exists
item belongs to restaurant
item available
modifier exists
modifier belongs to item
quantity valid
price valid
order total
tax
discount
payment method
idempotency key

Never trust customer-provided:

restaurantId
branchId
tableId
price
total

Resolve restaurant/branch/table from QR token.

==================================================
59. TESTING
==================================================

Create full automated tests.

Test:

1. QR token resolves correct restaurant
2. QR token resolves correct branch
3. QR token resolves correct table
4. invalid QR rejected
5. revoked QR rejected
6. disabled QR rejected
7. inactive restaurant rejected
8. inactive branch rejected
9. QR entitlement disabled rejected
10. QR entitlement enabled works
11. plan upgrade enables QR
12. plan downgrade disables new QR orders
13. feature override works
14. menu comes from correct restaurant
15. menu never leaks another restaurant
16. branch isolation
17. item validation
18. price tampering rejected
19. duplicate order prevention
20. retry after timeout safe
21. QR order enters canonical Order
22. QR order reaches POS
23. QR order creates KOT
24. KOT reaches KDS
25. duplicate sync doesn't duplicate
26. missed WebSocket event recovered
27. multiple POS devices receive correctly
28. multiple QR tables work
29. multiple branches work
30. QR regeneration invalidates old token
31. QR download/print data correct
32. customer refresh safe
33. order status works
34. payment verification safe
35. rate limiting
36. authorization
37. tenant isolation
38. audit logs
39. menu version changes propagate
40. offline/local sync behavior

==================================================
60. END-TO-END TEST
==================================================

Create one complete automated E2E scenario:

SETUP

Super Admin creates:

Restaurant:
Jamanvaar Test Restaurant

Branch:
Ahmedabad Main

Plan:
₹9,000 equivalent plan with QR_ORDERING

Create:

Table 12

Menu:

Paneer Pizza ₹249
Cold Coffee ₹120

Generate QR.

TEST

Open QR URL as anonymous customer.

Expected:

Restaurant name:
Jamanvaar Test Restaurant

Table:
12

Menu appears.

Customer adds:

2 × Paneer Pizza
1 × Cold Coffee

Place order.

Expected:

ONE order created.

POS:

NEW QR ORDER

Table 12

2 × Paneer Pizza
1 × Cold Coffee

KOT created.

KDS:

KOT appears.

Update KDS:

PREPARING
READY

Customer order status updates if status tracking is enabled.

==================================================
61. NEGATIVE E2E TEST
==================================================

Change restaurant plan to one without QR_ORDERING.

Open same QR.

Expected:

QR ordering unavailable.

Attempt direct POST to order API.

Expected:

403 / entitlement error.

Do not allow bypass through API.

==================================================
62. SECOND NEGATIVE TEST
==================================================

Use Restaurant A QR.

Attempt to manipulate:

restaurantId = Restaurant B

Expected:

Request rejected.

The backend must derive restaurant/branch/table from QR token.

==================================================
63. MULTI-RESTAURANT TEST
==================================================

Create:

Restaurant A
Restaurant B

Both have QR enabled.

Restaurant A:

Table 1
Menu A

Restaurant B:

Table 1
Menu B

Scan Restaurant A QR.

Expected:

ONLY Menu A.

Scan Restaurant B QR.

Expected:

ONLY Menu B.

No cross-tenant leakage.

==================================================
64. MULTI-BRANCH TEST
==================================================

Restaurant:

JM9999999999

Branch A:

Table 1
Menu A

Branch B:

Table 1
Menu B

Scan Branch A QR.

Expected:

Branch A context.

Never Branch B.

==================================================
65. OFFLINE SYNC TEST
==================================================

Where applicable:

Create operational order/event locally.

Stop internet.

Ensure local system remains functional.

Restore network.

Verify:

pending event
→ sync
→ server acknowledgment
→ local status update

No duplicates.

Do NOT use localStorage as the transactional source for critical operational data.

Use the project's proper local DB abstraction:

IndexedDB for browser/dev if appropriate.

SQLite/native later.

The business logic must not depend on packaging.

==================================================
66. PACKAGING READINESS
==================================================

IMPORTANT:

DO NOT BUILD EXE.

DO NOT BUILD APK.

DO NOT BUILD AAB.

DO NOT PACKAGE Tauri.

DO NOT package Android.

DO NOT create installers.

Current phase is architecture and functionality readiness.

QR Ordering must already work correctly in the current development environment.

Later:

QR customer web remains web-based.

POS may become Tauri EXE.

Restaurant Admin may become EXE/APK.

Captain may become APK.

Kiosk may become EXE.

KDS may become PWA/browser/TV app.

The architecture must support this without rewriting QR business logic.

==================================================
67. HARDWARE / PLATFORM ABSTRACTION
==================================================

Do not mix:

QR business logic

with:

Tauri APIs
Android APIs
browser-specific APIs

Use interfaces/services where appropriate.

QR ordering should be platform independent.

==================================================
68. DOCUMENTATION
==================================================

Create:

docs/QR_ORDERING_ARCHITECTURE.md

docs/QR_ORDERING_FLOW.md

docs/QR_ORDERING_ENTITLEMENTS.md

docs/QR_ORDERING_API.md

docs/QR_ORDERING_SECURITY.md

docs/QR_ORDERING_TEST_PLAN.md

docs/QR_ORDERING_OFFLINE_BEHAVIOR.md

docs/QR_ORDERING_CURRENT_STATE.md

Include diagrams.

At minimum:

Super Admin
     ↓
Plan
     ↓
License
     ↓
Entitlement
     ↓
Restaurant
     ↓
Branch
     ↓
Table
     ↓
QR Token
     ↓
Customer
     ↓
Canonical Order
     ↓
Branch Core
     ↓
POS
     ↓
KOT
     ↓
KDS

==================================================
69. DO NOT CREATE A SECOND ORDER SYSTEM
==================================================

This is critical.

If the current project has:

Order
SyncedOrder
KioskOrder
QrOrder
CaptainOrder

do not blindly keep creating separate order pipelines.

Audit them.

The target architecture should have one canonical operational Order domain.

Sources/channels can be:

POS
KIOSK
QR
CAPTAIN

The same order lifecycle should be reused.

If a migration is required:

document it.

Do not destroy existing production data.

==================================================
70. DO NOT CREATE A SECOND SYNC SYSTEM
==================================================

QR Ordering must use the same:

event IDs
idempotency
sequence cursor
sync queue
conflict handling
branch isolation
retry
dead-letter
acknowledgement

already defined for the JAMANVAAR architecture.

==================================================
71. IMPORTANT: DO NOT FAKE COMPLETION
==================================================

Do not tell me:

"QR UI is ready."

when backend is not ready.

Do not tell me:

"API is integrated."

if it still returns mock data.

Do not tell me:

"Plan-based access works."

if the frontend simply checks a plan name.

Do not tell me:

"POS integration works."

if the QR order never reaches the canonical POS order pipeline.

Do not tell me:

"Offline supported."

if the operation depends on internet.

Do not use:

TODO
Coming Soon
Mock Data
Hardcoded Restaurant

for production behavior.

==================================================
72. DEFINITION OF DONE
==================================================

QR Ordering is considered COMPLETE only when:

[ ] Super Admin can configure QR_ORDERING entitlement
[ ] Plans control QR entitlement
[ ] Restaurant receives entitlement from license
[ ] Feature UI reflects entitlement
[ ] Backend enforces entitlement
[ ] Restaurant Admin can manage QR tables
[ ] Restaurant Admin can generate QR
[ ] QR token is unique and secure
[ ] QR maps to restaurant
[ ] QR maps to branch
[ ] QR maps to table
[ ] Customer can scan
[ ] Customer sees correct restaurant
[ ] Customer sees correct branch/table
[ ] Customer sees real menu
[ ] Customer can add items
[ ] Customer can select modifiers
[ ] Server validates prices
[ ] Customer can place order
[ ] Duplicate submission is prevented
[ ] Order enters canonical Order domain
[ ] POS receives QR order
[ ] KOT is created
[ ] KDS receives KOT
[ ] Order status works
[ ] Multiple POS supported
[ ] Multiple branches supported
[ ] Multiple QR tables supported
[ ] Restaurant isolation works
[ ] Branch isolation works
[ ] Plan downgrade blocks new QR orders
[ ] Plan upgrade enables QR
[ ] Super Admin override works
[ ] QR revoke works
[ ] QR regenerate works
[ ] QR printing works
[ ] Audit logging works
[ ] Rate limiting works
[ ] Security tests pass
[ ] E2E tests pass
[ ] Sync tests pass
[ ] No critical hardcoded production data
[ ] No fake API responses
[ ] No duplicate order pipeline
[ ] No duplicate sync architecture
[ ] Packaging is NOT performed
[ ] Architecture is packaging-ready

==================================================
73. FINAL AUDIT AFTER IMPLEMENTATION
==================================================

After implementation:

Run:

- type checking
- lint
- unit tests
- integration tests
- API tests
- entitlement tests
- security tests
- E2E tests
- sync tests

Then perform a final repository-wide search for:

hardcoded restaurant IDs
hardcoded branch IDs
hardcoded table IDs
hardcoded menu items
hardcoded QR URLs
hardcoded plan IDs
hardcoded feature checks
mock QR APIs
mock order APIs
fake QR orders
fake POS integration

Fix every production occurrence.

==================================================
74. FINAL REPORT
==================================================

At the end, produce:

docs/QR_ORDERING_IMPLEMENTATION_REPORT.md

Include:

1. Existing implementation
2. Problems found
3. Architecture changes
4. Database changes
5. API changes
6. Entitlement changes
7. Restaurant Admin changes
8. Customer QR changes
9. POS integration
10. KOT integration
11. KDS integration
12. Sync changes
13. Security changes
14. Test results
15. Remaining issues
16. Packaging readiness
17. Exact files changed
18. Migration requirements

Also provide a clear final status:

QR ORDERING STATUS

Entitlement:
PASS / FAIL

QR Generation:
PASS / FAIL

Customer Ordering:
PASS / FAIL

POS Integration:
PASS / FAIL

KOT:
PASS / FAIL

KDS:
PASS / FAIL

Sync:
PASS / FAIL

Multi-Tenant:
PASS / FAIL

Multi-Branch:
PASS / FAIL

Security:
PASS / FAIL

E2E:
PASS / FAIL

Packaging Readiness:
PASS / FAIL

IMPORTANT:

Do not mark PASS unless it is actually verified by code/tests.

==================================================
FINAL OBJECTIVE
==================================================

Transform JAMANVAAR QR Ordering from a UI/demo/hardcoded concept into a real SaaS capability.

The final experience should be:

SUPER ADMIN
→ decides what plan gets QR Ordering

RESTAURANT ADMIN
→ sees QR Ordering according to entitlement
→ manages tables
→ generates QR

CUSTOMER
→ scans QR
→ sees the correct restaurant
→ sees the correct branch/table
→ sees the real menu
→ orders

JAMANVAAR
→ validates entitlement
→ validates restaurant/branch/table
→ validates menu/prices
→ creates canonical order
→ routes order through branch architecture
→ POS receives order
→ KOT generated
→ KDS receives KOT
→ status updates

Everything must be:

DATABASE-BACKED
MULTI-TENANT
PLAN-AWARE
BRANCH-AWARE
IDEMPOTENT
SYNC-SAFE
SECURE
OFFLINE-ARCHITECTURE-COMPATIBLE
PACKAGING-READY

BUT:

DO NOT CREATE EXE/APK/AAB/INSTALLERS NOW.

First make the entire system genuinely work.

Only after this phase is completely verified should packaging be considered.

One important architectural point

The biggest thing I would not let Claude do is this:

if (plan === "9000") {
   showQRCode();
}

or:

if (restaurantId === "JM9999999999") {
   showRestaurantMenu();
}

That would just make the current hardcoding slightly prettier.

The correct architecture is:

                 SUPER ADMIN
                      │
                      ▼
                  PLAN
                      │
                      ▼
              LICENSE / ENTITLEMENT
                      │
             QR_ORDERING = TRUE
                      │
                      ▼
               RESTAURANT
                      │
             ┌────────┴────────┐
             ▼                 ▼
          BRANCH             BRANCH
             │
             ▼
           TABLE
             │
             ▼
        UNIQUE QR TOKEN
             │
             ▼
         CUSTOMER
             │
             ▼
       CANONICAL ORDER
             │
             ▼
        BRANCH CORE
             │
        ┌────┴─────┐
        ▼          ▼
       POS         KDS
        │           │
        ▼           ▼
       KOT       PREPARING

That way QR isn't a separate mini application. It's simply another order channel inside JAMANVAAR.

And your plan page can genuinely say:

Feature	₹5K	₹7K	₹9K
POS	✓	✓	✓
Restaurant Admin	✓	✓	✓
KOT	✓	✓	✓
KDS	—	✓	✓
Captain	—	✓	✓
QR Ordering	🔒	🔒	✓

But the database entitlement, not the ₹9K number, determines access. That is what will make the system actually SaaS-ready rather than looking like a hardcoded demo.