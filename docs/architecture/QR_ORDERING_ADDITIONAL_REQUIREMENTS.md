# ADDITIONAL REQUIREMENT — FULL RESTAURANT-CONTROLLED QR ORDERING

This requirement applies to the ENTIRE QR Ordering flow.

QR Ordering must NOT contain hardcoded restaurant-specific ordering data.

The Restaurant Admin must be able to configure and edit the complete customer ordering experience from the Restaurant Admin panel.

The QR customer application should only DISPLAY and USE the configuration/data belonging to that restaurant and branch.

==================================================
1. RESTAURANT ADMIN MUST CONTROL THE MENU
==================================================

Restaurant Admin must be able to manage:

- Categories
- Menu items
- Item names
- Item descriptions
- Item images
- Item prices
- Item availability
- Item ordering
- Veg/non-veg classification if supported
- Tax configuration
- Item status
- Item visibility on QR
- QR availability
- Customization/modifier groups
- Modifier options
- Modifier prices
- Required/optional modifiers
- Minimum/maximum selections
- Default selections
- Special instructions

Do NOT hardcode any of these values in the QR customer application.

==================================================
2. MENU → CUSTOMER QR FLOW
==================================================

Restaurant Admin creates:

Category:
Pizza

Item:
Margherita Pizza

Price:
₹249

Description:
Classic tomato and mozzarella pizza.

Customization group:

Cheese

Options:

Regular Cheese
₹0

Extra Cheese
+₹40

Double Cheese
+₹70

Another customization:

Toppings

Options:

Olives
+₹30

Jalapeno
+₹25

Mushroom
+₹40

Customer opens QR.

Customer sees:

Margherita Pizza
₹249

[Add]

When customer taps Add:

Customization modal opens.

Cheese
○ Regular Cheese
○ Extra Cheese +₹40
○ Double Cheese +₹70

Toppings
☐ Olives +₹30
☐ Jalapeno +₹25
☐ Mushroom +₹40

Customer selects:

Extra Cheese
+
Olives

Price becomes:

₹249
+ ₹40
+ ₹30
= ₹319

Cart must display the selected customizations.

==================================================
3. CUSTOMIZATION MUST BE DATABASE-BACKED
==================================================

Do NOT hardcode:

"Extra Cheese"
"+₹40"

in frontend code.

These values must come from the restaurant's database/configuration.

Conceptually:

MenuItem
    ↓
ModifierGroup
    ↓
ModifierOption

Example:

MenuItem:
Margherita Pizza

ModifierGroup:
Cheese

ModifierOption:
Extra Cheese
priceDelta = 40

ModifierOption:
Double Cheese
priceDelta = 70

==================================================
4. RESTAURANT ADMIN MODIFIER MANAGEMENT
==================================================

Restaurant Admin must be able to:

Create Modifier Group

Example:

"Choose Your Cheese"

Configure:

- Group name
- Description
- Required/optional
- Minimum selections
- Maximum selections
- Display order
- Active/inactive

Then create modifier options:

Regular Cheese
Extra Cheese
Double Cheese

Each option must support:

- Name
- Price adjustment
- Image if supported
- Active/inactive
- Display order

==================================================
5. REQUIRED VS OPTIONAL CUSTOMIZATION
==================================================

Restaurant Admin should be able to configure:

OPTIONAL

Example:

Extra Toppings

Customer may select:

0 to 5

REQUIRED

Example:

Choose Size

Customer must select:

exactly 1

The backend must validate these rules.

Do NOT rely only on frontend validation.

==================================================
6. MINIMUM / MAXIMUM SELECTION
==================================================

Modifier groups should support:

minSelections
maxSelections

Examples:

Choose Size:

min = 1
max = 1

Extra Toppings:

min = 0
max = 5

Sauces:

min = 1
max = 2

Both frontend and backend must enforce these rules.

==================================================
7. MODIFIER PRICING
==================================================

Modifier pricing must be dynamic.

Example:

Base Item:
₹250

Modifiers:

Extra Cheese:
+₹40

Olives:
+₹30

Total:

₹320

Do NOT allow the customer frontend to determine the authoritative final price.

The backend must recalculate:

base price
+
modifier price adjustments
+
tax
-
discount

The backend-generated amount is authoritative.

==================================================
8. CART MUST PRESERVE CUSTOMIZATION
==================================================

Cart item should contain a snapshot/reference of:

- menu item
- selected modifiers
- quantities
- applicable pricing
- notes

Example:

Margherita Pizza × 2

Customizations:

Extra Cheese
Olives

Unit price:

₹319

Quantity:

2

Line total:

₹638

Do not reduce the cart to only:

itemId
quantity

because customization would be lost.

==================================================
9. ORDER MUST PRESERVE ORDER-TIME CONFIGURATION
==================================================

When the customer places the order, the order must preserve the actual selected configuration at the time of ordering.

If Restaurant Admin later changes:

Extra Cheese:

₹40 → ₹50

old orders must still show:

Extra Cheese +₹40

New orders should use:

Extra Cheese +₹50

Do not recalculate historical orders using today's menu configuration.

==================================================
10. MENU ITEM AVAILABILITY
==================================================

Restaurant Admin should be able to mark:

Available
Unavailable

Example:

Paneer Pizza
Available ✓

Customer sees it.

If Restaurant Admin disables it:

Paneer Pizza
Unavailable

Customer must no longer be able to place a new order containing it.

Backend must validate availability.

Do not rely only on frontend hiding.

==================================================
11. QR CHANNEL AVAILABILITY
==================================================

Restaurant Admin should be able to decide whether an item is available through QR Ordering.

Example:

Item:
Special Thali

POS:
✓

Kiosk:
✓

QR:
✗

Captain:
✓

If the existing system already has channel availability architecture, reuse it.

Otherwise introduce a proper configurable channel availability mechanism.

Do not hardcode:

if item.name === ...

or:

if item.id === ...

==================================================
12. CATEGORY MANAGEMENT
==================================================

Restaurant Admin must control:

- Category name
- Description
- Image
- Active/inactive
- Display order
- QR visibility

Customer QR page should automatically reflect these changes.

If Restaurant Admin changes:

"Starters"

to:

"Today's Starters"

the QR customer application should show the new value without code changes.

==================================================
13. MENU ORDERING
==================================================

Restaurant Admin should be able to reorder:

Categories

and:

Items

Customer QR page must use the configured display order.

Do not use database insertion order as the UI ordering rule.

==================================================
14. ITEM IMAGES
==================================================

Restaurant Admin should be able to:

- upload/change item image
- remove image
- set image
- preview image

QR customer page should use the restaurant's configured image.

Use the existing image/object-storage architecture if available.

Do not hardcode image URLs.

==================================================
15. ITEM DESCRIPTION
==================================================

Restaurant Admin controls:

Item name
Description
Price
Image
Availability

Customer QR page displays the current published values.

==================================================
16. TAX
==================================================

If the existing JAMANVAAR system supports tax configuration:

Restaurant Admin must be able to configure the applicable tax rules.

QR ordering must use the canonical pricing/tax calculation system.

Do NOT create a separate QR tax calculation engine.

Backend must calculate the final tax.

==================================================
17. DISCOUNTS
==================================================

If discounts are supported by the existing system:

QR ordering should use the same canonical discount rules.

Do not create a QR-only discount engine.

If QR-specific discounts are required later, design the architecture so they can be added without rewriting the order system.

==================================================
18. SPECIAL INSTRUCTIONS
==================================================

Restaurant Admin should be able to enable/disable customer special instructions.

Example:

"Any special instructions?"

Customer enters:

"Less spicy"

This must be stored with the order item/order.

Restaurant Admin should control whether this feature is available.

==================================================
19. QUANTITY RULES
==================================================

If needed, Restaurant Admin should be able to configure:

minimum quantity
maximum quantity

for menu items.

Backend must validate the rules.

==================================================
20. ITEM CUSTOMIZATION UI
==================================================

The QR customer experience should be:

Mobile-first.

Example:

--------------------------------
Margherita Pizza

₹249

Classic tomato & mozzarella

[ Add ]
--------------------------------

When Add is clicked:

--------------------------------
Customize your pizza

Cheese
Required

○ Regular Cheese
  Included

○ Extra Cheese
  +₹40

○ Double Cheese
  +₹70

Toppings
Optional

☐ Olives
  +₹30

☐ Jalapeno
  +₹25

--------------------------------

Total:
₹319

[Add to Cart]
--------------------------------

The exact visual design can differ, but the behavior must be dynamic.

==================================================
21. RESTAURANT ADMIN PREVIEW
==================================================

Restaurant Admin should ideally be able to preview:

"What the customer will see"

when editing menu/customizations.

The preview must use the same configuration/data structure as the real QR customer application.

Do not create a separate fake preview implementation.

==================================================
22. PUBLISH / DRAFT MODEL
==================================================

If practical within the existing architecture, support:

DRAFT
PUBLISHED

for menu configuration.

Restaurant Admin can edit:

Draft

and then:

Publish Changes

After publishing:

QR customer application receives the new configuration.

This prevents partially edited menus from appearing to customers.

If a publish system already exists, reuse it.

Do not introduce unnecessary duplicate menu versioning.

==================================================
23. MENU VERSIONING
==================================================

Each published menu/configuration should have a version.

Example:

Menu Version 15

Restaurant Admin changes:

Extra Cheese ₹40 → ₹45

Publish

Menu Version becomes:

16

Devices/customer sessions can determine whether their cached menu is stale.

==================================================
24. QR ORDERING SETTINGS
==================================================

Restaurant Admin should control:

QR Ordering Enabled

Customer Notes
Enabled/Disabled

Item Customization
Enabled/Disabled

Customer Order Status
Enabled/Disabled

Table Ordering
Enabled/Disabled

Menu-only QR
Enabled/Disabled

Cash Payment
Enabled/Disabled

Online Payment
Enabled/Disabled

IMPORTANT:

Payment implementation is OUT OF SCOPE for this phase.

Only make the architecture/configuration payment-ready.

Do not implement Razorpay or Cash payment processing in this phase.

==================================================
25. PAYMENT — CURRENT PHASE
==================================================

The project will eventually support:

Cash
Razorpay

Razorpay credentials will be supplied later through environment variables.

For now:

DO NOT implement:

- Razorpay checkout
- Razorpay webhooks
- payment capture
- payment verification
- payment UI flow
- Cash payment settlement flow

unless already required by the existing system for basic compatibility.

Instead:

- keep payment architecture extensible
- keep payment method configuration database-backed
- do not hardcode payment provider credentials
- do not put Razorpay keys in frontend source
- do not fake successful payments
- do not mark orders paid without actual payment verification

Payment implementation will be handled as a separate phase.

==================================================
26. IMPORTANT — EVERY CUSTOMER-VISIBLE VALUE MUST BE EDITABLE
==================================================

Audit the COMPLETE QR customer flow.

Identify every value displayed to the customer.

Examples:

Restaurant logo
Restaurant name
Branch name
Table number
Categories
Category images
Category names
Item names
Item descriptions
Item images
Item prices
Taxes
Modifiers
Modifier names
Modifier prices
Modifier rules
Special instructions
Availability
Cart labels where configurable
Order status labels where configurable
Ordering settings

Determine which should be:

DATABASE-BACKED
CONFIGURATION-BACKED
SYSTEM-GENERATED

Do NOT hardcode restaurant-specific values.

==================================================
27. RESTAURANT ADMIN AS SOURCE OF CONFIGURATION
==================================================

Restaurant Admin should be the primary operational interface for restaurant-specific configuration.

The QR customer application should not contain restaurant configuration.

Conceptually:

Restaurant Admin
       ↓
Database
       ↓
Published Restaurant Configuration
       ↓
QR Customer Application

NOT:

QR Customer Application
       ↓
Hardcoded values

==================================================
28. BACKEND VALIDATION
==================================================

Every customer order must be validated against the CURRENT published restaurant configuration.

Validate:

- restaurant
- branch
- table
- QR token
- entitlement
- item
- item availability
- QR channel availability
- modifier group
- modifier option
- required modifiers
- min/max selection
- modifier availability
- pricing
- tax
- quantity
- order totals

Never trust the browser's:

price
tax
discount
total

==================================================
29. ADMIN CHANGE PROPAGATION
==================================================

Test this exact flow:

Restaurant Admin:

Create item:

Margherita Pizza

₹249

Publish.

Customer scans QR.

Expected:

₹249

Then Restaurant Admin changes:

₹249 → ₹279

Publish.

Customer refreshes/reloads.

Expected:

₹279

Then add:

Extra Cheese +₹40

Publish.

Customer opens item.

Expected:

Extra Cheese +₹40

Change:

Extra Cheese +₹50

Publish.

Customer refreshes.

Expected:

Extra Cheese +₹50

No code deployment should be required.

==================================================
30. HISTORICAL ORDER IMMUTABILITY
==================================================

If an order was placed with:

Pizza ₹249
Extra Cheese ₹40

and Restaurant Admin later changes:

Pizza ₹279
Extra Cheese ₹50

The historical order MUST remain:

Pizza ₹249
Extra Cheese ₹40

This is mandatory.

Orders must preserve order-time pricing/configuration snapshots.

==================================================
31. MULTI-RESTAURANT TEST
==================================================

Restaurant A:

Pizza ₹250
Extra Cheese ₹40

Restaurant B:

Pizza ₹350
Extra Cheese ₹70

Scan Restaurant A QR.

Customer must see:

₹250
Extra Cheese ₹40

Scan Restaurant B QR.

Customer must see:

₹350
Extra Cheese ₹70

No cross-restaurant configuration leakage.

==================================================
32. MULTI-BRANCH TEST
==================================================

Restaurant A:

Branch 1:

Pizza ₹250

Branch 2:

Pizza ₹300

QR for Branch 1:

₹250

QR for Branch 2:

₹300

Branch-specific configuration must be respected where the system supports branch-level overrides.

==================================================
33. NO HARDCODED DEMO CONFIGURATION
==================================================

Search for all hardcoded customer ordering values.

Examples:

"Extra Cheese"
"₹40"
"Pizza"
"Burger"
"Cold Coffee"
"Table 1"

If they are demo seed data, clearly separate them from production logic.

Production QR ordering must load real restaurant configuration.

==================================================
34. ACCEPTANCE CRITERIA
==================================================

QR Ordering is not complete unless Restaurant Admin can:

[ ] Create category
[ ] Edit category
[ ] Reorder category
[ ] Disable category
[ ] Create item
[ ] Edit item
[ ] Change item price
[ ] Change item description
[ ] Change item image
[ ] Enable/disable item
[ ] Control QR visibility
[ ] Create modifier group
[ ] Edit modifier group
[ ] Set required/optional
[ ] Set minimum selections
[ ] Set maximum selections
[ ] Create modifier option
[ ] Edit modifier option
[ ] Change modifier price
[ ] Enable/disable modifier
[ ] Reorder modifier options
[ ] Publish menu changes

Customer must then see those changes.

Customer must be able to:

[ ] Scan QR
[ ] See correct restaurant
[ ] See correct branch
[ ] See correct table
[ ] See current published menu
[ ] Select item
[ ] Select customization
[ ] See dynamic modifier pricing
[ ] Add customized item to cart
[ ] See correct cart total
[ ] Place order
[ ] Order retains selected customization

Historical orders must retain original pricing.

Payment implementation is NOT part of this phase.

# ADDITIONAL REQUIREMENT — MULTI-CUSTOMER QR, TABLE MANAGEMENT, CONCURRENCY & HIGH TRAFFIC

This requirement is mandatory for the QR Ordering implementation.

The QR Ordering system must support real restaurant usage where:

- One restaurant can have many branches.
- One branch can have many tables.
- Each table has its own QR code.
- Multiple customers can scan the SAME table QR simultaneously.
- Multiple phones can create orders at the same time.
- Multiple tables can receive orders simultaneously.
- Multiple restaurants can receive QR orders simultaneously.
- Traffic must not cause duplicate orders, lost orders, incorrect table mapping, or cross-restaurant data leakage.

The implementation must be production-oriented and concurrency-safe.

==================================================
1. TABLE-BASED QR ARCHITECTURE
==================================================

Each QR code must be associated with:

restaurantId
branchId
tableId
qrToken

Conceptually:

Restaurant
    ↓
Branch
    ↓
Table
    ↓
QR Code
    ↓
Customer Session
    ↓
Order

A QR code must NEVER belong only to a restaurant.

It must identify the correct table context.

Example:

Restaurant:
JAMANVAAR Restaurant

Branch:
Ahmedabad Main

Table:
12

QR:

restaurant = JM9999999999
branch = branch_abc
table = table_12

Use a secure public QR token instead of exposing raw internal IDs.

==================================================
2. RESTAURANT ADMIN TABLE MANAGEMENT
==================================================

Restaurant Admin must have a complete Table Management section.

Example:

Restaurant Admin
    ↓
Tables
    ↓
Branch selection
    ↓
Table Management

Example:

Ahmedabad Main Branch

┌───────────────────────────────────────────────┐
│ Table 01   Active   QR Active    [View QR]   │
│ Table 02   Active   QR Active    [View QR]   │
│ Table 03   Active   QR Active    [View QR]   │
│ Table 04   Active   QR Active    [View QR]   │
│ Table 05   Active   QR Active    [View QR]   │
└───────────────────────────────────────────────┘

Restaurant Admin must be able to:

- Create table
- Edit table
- Rename table
- Change capacity
- Activate table
- Deactivate table
- Delete/archive table where safe
- Generate QR
- Regenerate QR
- Revoke QR
- Download QR
- Print QR
- Print all QR codes
- See current table status
- See current active orders
- See current QR orders
- See last QR scan where supported

==================================================
3. TABLE DATABASE MODEL
==================================================

Table should conceptually contain:

id
restaurantId
branchId
displayNumber
name
capacity
status
qrEnabled
createdAt
updatedAt

Internal id must be globally unique.

Do NOT use:

tableNumber

as the database primary key.

Example:

id:
tbl_01J....

displayNumber:
12

==================================================
4. QR DATABASE MODEL
==================================================

QR entity should contain:

id
restaurantId
branchId
tableId
publicToken
status
version
createdAt
updatedAt
revokedAt
lastScannedAt

publicToken must be:

- cryptographically random
- unique
- non-sequential
- revocable

Add proper database indexes.

At minimum:

unique(publicToken)

index(restaurantId, branchId)

index(branchId, tableId)

==================================================
5. MULTIPLE PHONES ON ONE TABLE
==================================================

This is a critical requirement.

One table QR can be scanned by many phones simultaneously.

Example:

Table 12

Customer A:
Phone A

Customer B:
Phone B

Customer C:
Phone C

Customer D:
Phone D

Customer E:
Phone E

All customers use:

Table 12 QR.

The system MUST NOT assume:

one QR = one customer.

The system MUST support:

one table
→ many customer sessions
→ many orders

==================================================
6. CUSTOMER SESSION
==================================================

Each customer/browser must have an independent temporary session.

Example:

Table 12

Customer A:

sessionId = sess_A

Customer B:

sessionId = sess_B

Customer C:

sessionId = sess_C

Do NOT use:

tableId

as the customer session ID.

Do NOT store the cart globally by:

restaurantId + tableId

because this would cause customers to overwrite each other's carts.

Incorrect:

cart[tableId]

Correct:

cart[customerSessionId]

==================================================
7. CART IS CUSTOMER-SPECIFIC
==================================================

Every customer must have an independent cart.

Example:

Customer A:

Cart:
2 × Pizza
1 × Coke

Customer B:

Cart:
1 × Burger

Customer C:

Cart:
3 × Coffee

They must never see each other's carts.

The QR table identifies the ordering context.

The customer session identifies the customer/browser context.

Therefore:

QR Token
    ↓
Restaurant + Branch + Table

Customer Session
    ↓
Customer-specific Cart

Order
    ↓
Restaurant + Branch + Table + Session/Order Context

==================================================
8. ORDERS FROM SAME TABLE
==================================================

By default, each customer submission creates a separate order.

Example:

Table 12:

Order #1001
Customer Session A

Order #1002
Customer Session B

Order #1003
Customer Session C

All belong to:

restaurantId
branchId
tableId = Table 12

Do NOT automatically merge them.

This prevents one customer's cart/order from modifying another customer's order.

==================================================
9. TABLE ORDER GROUPING
==================================================

The system should still allow POS/Restaurant Admin to understand:

TABLE 12

Orders:

#1001
#1002
#1003

Total table amount:

₹1,480

But the underlying orders remain separate.

Example Restaurant Admin/POS:

TABLE 12

3 Active Orders

Order #1001   ₹520
Order #1002   ₹340
Order #1003   ₹620

Total:
₹1,480

If table-level bill merging is required later, it should be an explicit action.

Do NOT automatically merge orders.

==================================================
10. TABLE ACTIVE ORDER STATE
==================================================

Restaurant Admin/POS should be able to see table-level status.

Possible states:

AVAILABLE
ORDERING
PREPARING
SERVING
OCCUPIED
BILL_REQUESTED
BILLED
CLEANING

Do not allow multiple devices to incorrectly overwrite table state.

Use controlled state transitions.

==================================================
11. TABLE STATUS MUST NOT BLOCK MULTIPLE CUSTOMERS
==================================================

Important:

Table status must NOT prevent multiple customers at the same table from ordering.

For example:

Table 12 = OCCUPIED

Customer B scans QR.

They must still be able to order.

Do NOT implement:

if table.status === OCCUPIED
    reject QR order

That would break normal restaurant QR usage.

Table occupancy and customer ordering are different concepts.

==================================================
12. ORDER OWNERSHIP
==================================================

Each order must contain:

orderId
restaurantId
branchId
tableId
source
customerSessionId where appropriate
createdAt
updatedAt

Source:

QR

The system should be able to determine:

Which restaurant?

Which branch?

Which table?

Which channel?

Which order?

==================================================
13. CUSTOMER SESSION SECURITY
==================================================

Customer session must NOT be trusted as an authorization mechanism.

The backend must always derive restaurant/branch/table from the QR token.

Do NOT allow the customer to submit:

restaurantId = Restaurant B

while using Restaurant A QR.

Do NOT trust:

tableId

from the client.

Correct:

QR token
    ↓
Backend resolves
    ↓
restaurantId
branchId
tableId

==================================================
14. CONCURRENT ORDER CREATION
==================================================

The backend must support multiple orders being created simultaneously.

Example:

10 customers scan Table 12.

All submit orders within 2 seconds.

Expected:

10 valid orders.

NOT:

1 order
NOT:
duplicate orders
NOT:
overwritten orders
NOT:
lost orders

Database transactions must protect order creation.

==================================================
15. IDEMPOTENCY
==================================================

Every customer order submission must have an idempotency key.

Example:

clientRequestId

or:

idempotencyKey

The key must be unique for the customer order attempt.

Database/backend must enforce idempotency.

If:

Request A
Request A retry
Request A retry

arrive simultaneously:

Expected:

ONE order.

All retries should resolve to the same order result.

==================================================
16. ORDER NUMBER GENERATION
==================================================

Do NOT generate order numbers using:

MAX(orderNumber) + 1

This is unsafe under concurrency.

Do not rely on:

local device counters.

Use:

UUID/ULID/internal unique ID

for the real database identity.

Human-readable order numbers must use a concurrency-safe sequence mechanism.

Example:

Order #1001
Order #1002
Order #1003

No duplicates.

==================================================
17. KOT NUMBER GENERATION
==================================================

The same rule applies to KOT.

Never use:

MAX(kotNumber) + 1

because multiple POS/Branch Core devices can create KOTs simultaneously.

Use a safe sequence or equivalent collision-free numbering strategy.

==================================================
18. CONCURRENT MENU ACCESS
==================================================

QR customers should NOT query the database independently for every item interaction.

Recommended flow:

Customer opens QR:

Load:

restaurant public profile
branch
table
published menu
menu version
ordering settings

Cache published menu appropriately.

Cart interactions should happen locally in the customer browser.

When submitting the order:

Backend validates the final order against authoritative menu/configuration.

==================================================
19. MENU CACHE
==================================================

Menu can be cached using:

menuVersion

Example:

Restaurant menu:

version 42

Customer loads:

version 42

If unchanged:

serve cached version where appropriate.

If Restaurant Admin publishes:

version 43

new customers receive:

version 43

Do NOT cache menu indefinitely.

==================================================
20. HIGH TRAFFIC — RESTAURANT ISOLATION
==================================================

Traffic from one restaurant must not block unrelated restaurants.

Example:

Restaurant A:

500 customers ordering.

Restaurant B:

10 customers ordering.

Restaurant B must continue operating normally.

Avoid global application locks.

Use tenant-aware database queries, indexing, connection pooling, caching, and scalable request handling.

==================================================
21. HIGH TRAFFIC — BRANCH ISOLATION
==================================================

Within one restaurant:

Branch A:

300 QR customers.

Branch B:

50 QR customers.

Branch B should not be unnecessarily blocked by Branch A.

Use:

restaurantId
branchId

for data partitioning, indexing, routing and operational processing where appropriate.

==================================================
22. DATABASE INDEXING
==================================================

Audit all QR-related database queries.

Add appropriate indexes for:

restaurantId
branchId
tableId
publicToken
orderId
source
createdAt
status
idempotencyKey

Do not blindly add indexes everywhere.

Review query plans for high-volume operations.

==================================================
23. DATABASE CONNECTION MANAGEMENT
==================================================

Ensure the backend uses proper database connection pooling.

Do NOT create a new database connection for every request.

Review:

- maximum connections
- idle connections
- connection timeout
- transaction timeout
- query timeout

Configuration must be environment-driven.

==================================================
24. API STATELESSNESS
==================================================

QR public API should be horizontally scalable.

Do not store critical QR ordering session state only in server memory.

For example, this is unsafe:

serverMemory.sessions

because another server instance may receive the next request.

Critical state must be persisted appropriately.

Customer cart may remain client-side.

Order correctness must be server-side.

==================================================
25. HORIZONTAL SCALING
==================================================

The architecture should allow:

API Server 1
API Server 2
API Server 3

to handle QR requests.

Do not require:

Customer A must always reach Server 1.

Do not depend on in-memory server state for order correctness.

==================================================
26. LOAD BALANCER COMPATIBILITY
==================================================

QR APIs must work behind a load balancer/reverse proxy.

Do not require sticky sessions unless there is a documented technical reason.

If WebSocket is used for order status:

ensure proper connection management and recovery.

WebSocket is not the source of truth.

==================================================
27. RATE LIMITING
==================================================

Protect public QR APIs.

Rate limit:

QR resolution
Menu API
Order creation
Order status
Session creation

Rate limits should be designed so normal restaurant traffic is not accidentally blocked.

Use appropriate keys such as:

IP
QR token
restaurant
session

depending on endpoint.

Do not use only IP-based rate limiting for all traffic because many customers may share the same restaurant Wi-Fi/NAT.

==================================================
28. BOT / ABUSE PROTECTION
==================================================

Prevent:

QR token brute force
Order spam
Mass duplicate submissions
Invalid item requests
Huge quantities
Huge payloads
Repeated checkout attempts

Set reasonable:

quantity limits
payload size limits
request limits

==================================================
29. ORDER TRANSACTION
==================================================

Order creation should be transactional.

Conceptually:

BEGIN TRANSACTION

1. Resolve QR
2. Validate restaurant
3. Validate branch
4. Validate table
5. Validate entitlement
6. Validate menu version/configuration
7. Validate item availability
8. Validate modifiers
9. Calculate authoritative price
10. Create order
11. Create order items
12. Create order event
13. Create sync/outbox event
14. Commit

If a critical step fails:

ROLLBACK

Do not create a half-order.

==================================================
30. OUTBOX / EVENT CONSISTENCY
==================================================

Order creation and the event that informs the operational system must not become inconsistent.

Avoid:

Order created successfully
but
sync event lost.

Use the existing transactional outbox/sync architecture where applicable.

Example:

Order
+
Order Items
+
Outbox Event

must be committed atomically where supported by the architecture.

==================================================
31. POS CONCURRENCY
==================================================

Multiple POS terminals may receive QR orders.

Example:

POS 1
POS 2
POS 3

All may learn about:

QR Order #1001

The system must not create three copies.

Use:

eventId
orderId
server sequence
idempotent processing

according to the existing sync architecture.

==================================================
32. KDS CONCURRENCY
==================================================

KDS may receive the same event more than once.

Expected:

ONE KOT displayed.

Duplicate event delivery must not create:

duplicate KOT cards
duplicate kitchen tickets
duplicate preparation tasks

==================================================
33. BRANCH CORE CONCURRENCY
==================================================

If Branch Core is used:

Multiple QR orders can arrive simultaneously.

Branch Core must:

- persist events
- process them safely
- maintain ordering where required
- avoid duplicates
- forward to POS/KDS
- recover after restart
- retry failed events

Do not rely on process memory.

==================================================
34. QUEUE BACKPRESSURE
==================================================

If traffic temporarily exceeds processing capacity:

do NOT drop orders.

Use appropriate queue/backpressure mechanisms where required.

Order request should either:

- complete successfully
- fail clearly
- retry safely

Never silently disappear.

==================================================
35. TIMEOUT HANDLING
==================================================

Important scenario:

Customer presses:

Place Order

Backend creates order.

Network response times out.

Customer sees:

"Something went wrong."

Customer presses again.

System must recognize the original idempotency key and return:

Order already created.

Do NOT create another order.

==================================================
36. DATABASE DEADLOCK / RETRY
==================================================

Where appropriate, safely retry transient database failures.

But NEVER blindly retry a non-idempotent order creation without an idempotency key.

==================================================
37. TABLE-WISE QR PRINTING
==================================================

Restaurant Admin should be able to generate:

Table 1 QR
Table 2 QR
Table 3 QR
...

Each QR must contain its own secure token.

Provide:

Print single QR
Print selected QRs
Print all QRs

The printed card should clearly show:

Restaurant Name

Table 12

Scan to Order

[QR]

==================================================
38. QR REGENERATION
==================================================

If Table 12 QR is compromised:

Restaurant Admin:

Regenerate QR

Expected:

Old QR token:

INVALID

New QR token:

ACTIVE

Existing historical orders remain valid.

Regenerating QR must NOT delete historical orders.

==================================================
39. TABLE DEACTIVATION
==================================================

If Restaurant Admin deactivates Table 12:

New QR orders must be rejected.

Existing historical orders remain.

Existing active orders must not be deleted.

Restaurant Admin should see the table as inactive.

==================================================
40. BRANCH DEACTIVATION
==================================================

If a branch becomes inactive:

Its QR codes must not accept new orders.

Other branches must continue working.

==================================================
41. RESTAURANT DEACTIVATION
==================================================

If restaurant is suspended/inactive:

QR ordering must stop.

Public QR should show a safe message:

"Ordering is currently unavailable."

Do not expose administrative information.

==================================================
42. REAL-TIME ORDER STATUS
==================================================

Customer may optionally see:

Order Received
Preparing
Ready
Completed

If WebSocket is used:

WebSocket improves speed.

But correctness must come from persistent state.

If WebSocket fails:

Customer can refresh/reconnect.

==================================================
43. ORDER STATUS IS ORDER-SPECIFIC
==================================================

If Table 12 has:

Order A = Preparing
Order B = Ready
Order C = Completed

Do not show all customers the same status.

Each order must have its own status.

Table-level status is separate from order status.

==================================================
44. TABLE ACTIVE ORDERS
==================================================

Restaurant Admin/POS should be able to view:

Table 12

Active Orders:

#1001 Preparing
#1002 Ready
#1003 New

Total:

₹1,480

This must be computed from real order data.

==================================================
45. CUSTOMER PRIVACY
==================================================

Customer A must NOT be able to view:

Customer B's order.

Even though both use:

Table 12

Customer order tracking must use an order-specific secure public identifier/session relationship.

==================================================
46. PUBLIC ORDER STATUS TOKEN
==================================================

If customer can track their order:

generate a secure public tracking token.

Do not expose:

internal database ID
restaurant admin IDs
customer private information

Customer A's token must only access Customer A's order.

==================================================
47. HIGH TRAFFIC LOAD TEST
==================================================

Create automated load/concurrency tests.

Minimum scenarios:

100 simultaneous QR sessions

100 simultaneous order submissions

500 simultaneous menu requests

1000 simultaneous QR resolutions

Use realistic payloads.

The goal is to verify correctness first.

Do not assume benchmark numbers automatically equal production capacity.

Measure:

- request latency
- error rate
- duplicate rate
- database errors
- transaction failures
- queue backlog
- connection pool exhaustion

==================================================
48. SAME TABLE LOAD TEST
==================================================

Simulate:

100 customers

all ordering from:

Table 12

Expected:

100 valid independent orders

No:

duplicate IDs
lost orders
overwritten carts
incorrect table mapping
cross-customer cart leakage

==================================================
49. MULTI-TABLE LOAD TEST
==================================================

Simulate:

Table 1 → 20 customers
Table 2 → 20 customers
...
Table 50 → 20 customers

Expected:

1000 valid orders

Each order must remain associated with the correct table.

==================================================
50. MULTI-RESTAURANT LOAD TEST
==================================================

Simulate:

Restaurant A
Restaurant B
Restaurant C
...

with simultaneous QR traffic.

Verify:

No cross-tenant data leakage.

No restaurant can access another restaurant's:

menu
table
order
QR
branch
configuration

==================================================
51. PLAN ENTITLEMENT UNDER LOAD
==================================================

Under high traffic:

QR_ORDERING entitlement must still be enforced.

Do not perform expensive repeated plan queries unnecessarily.

Use appropriate cached entitlement state where safe.

Backend remains authoritative.

==================================================
52. CACHE SAFETY
==================================================

If caching is used:

Cache keys MUST include the correct tenant context.

Never use:

menu:table12

if that could collide across restaurants.

Use something conceptually like:

menu:{restaurantId}:{branchId}:{version}

QR resolution cache must also include the secure QR token.

==================================================
53. CACHE INVALIDATION
==================================================

When Restaurant Admin changes/publishes:

menu
price
modifier
availability
QR configuration

stale cached data must eventually be invalidated or versioned.

Never allow stale pricing to be accepted by the backend.

Customer cache can be stale for display.

Backend validation must use authoritative current configuration.

==================================================
54. HIGH TRAFFIC PAYMENT SEPARATION
==================================================

Payment processing is NOT part of this implementation phase.

Do NOT implement Razorpay or Cash processing now.

However:

Order creation must be designed so that payment processing can later be attached safely.

Do not mark an order:

PAID

just because it was successfully created.

Payment status must remain separate.

==================================================
55. OBSERVABILITY
==================================================

Implement appropriate structured logging/metrics for:

QR resolution
QR scan
menu load
order creation
order failure
idempotency hit
duplicate request
validation failure
sync failure
KOT creation
KDS delivery

Do not log sensitive customer/payment information unnecessarily.

==================================================
56. CORRELATION ID
==================================================

Requests should be traceable.

Use a request/correlation ID where appropriate.

Example:

requestId

Then trace:

Customer request
→ API
→ Order
→ Outbox
→ Branch Core
→ POS
→ KOT
→ KDS

This will make production debugging significantly easier.

==================================================
57. FAILURE RECOVERY
==================================================

Test failures such as:

API server restart
Branch Core restart
POS restart
KDS restart
database temporary failure
network interruption
WebSocket disconnect
customer browser refresh
duplicate request
timeout
queue backlog

No accepted order should disappear.

==================================================
58. DEFINITION OF DONE
==================================================

Multi-customer QR ordering is complete only when:

[ ] One QR supports multiple phones
[ ] Each phone has independent session/cart
[ ] Orders remain independent
[ ] All orders retain correct table
[ ] Customer A cannot see Customer B order
[ ] Duplicate submissions are idempotent
[ ] Order IDs cannot collide
[ ] KOT IDs cannot collide
[ ] Multiple POS devices work
[ ] Multiple KDS clients work
[ ] Multiple branches work
[ ] Multiple restaurants work
[ ] Table management exists in Restaurant Admin
[ ] Table-wise QR generation works
[ ] QR regeneration works
[ ] QR revoke works
[ ] Table deactivation works
[ ] Branch isolation works
[ ] Restaurant isolation works
[ ] High traffic does not lose orders
[ ] Queue/backpressure is handled
[ ] Database transactions are safe
[ ] Connection pooling is configured
[ ] API can scale horizontally
[ ] Rate limiting exists
[ ] Cache keys are tenant-safe
[ ] Menu cache is versioned
[ ] Historical orders remain immutable
[ ] WebSocket failure is recoverable
[ ] Sync remains idempotent
[ ] Observability exists
[ ] Load/concurrency tests pass
[ ] No EXE/APK/AAB is created

==================================================
FINAL PRINCIPLE
==================================================

The QR system must be designed around:

ONE RESTAURANT
    ↓
MANY BRANCHES
    ↓
MANY TABLES
    ↓
ONE QR PER TABLE
    ↓
MANY CUSTOMER PHONES
    ↓
MANY INDEPENDENT ORDERS
    ↓
ONE CANONICAL ORDER SYSTEM
    ↓
POS / KOT / KDS

Do NOT design:

ONE QR
    ↓
ONE CUSTOMER
    ↓
ONE ORDER

That model is incorrect for restaurant table QR ordering.