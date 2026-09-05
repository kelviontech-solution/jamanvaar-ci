# JAMANVAAR RESTAURANT SUITE — COMPLETE FEATURES & CAPABILITIES SPECIFICATION

> **Platform:** JAMANVAAR Restaurant Operating System  
> **Architecture:** 100% Local-First, Zero-Cloud Billing, Real-Time Mesh Synchronization  
> **Applications Included:**  
> 1. **JAMANVAAR POS Terminal** (`apps/pos` • Port 5175)  
> 2. **JAMANVAAR Restaurant Admin Center** (`apps/pos-admin` • Port 5176)  
> 3. **Shared Core Engine** (`@jamanvaar/database`, `@jamanvaar/business`, `@jamanvaar/api`, `@jamanvaar/ui`, `@jamanvaar/types`)

---

## 📑 TABLE OF CONTENTS

1. [Architectural Foundation & Local-First Principles](#1-architectural-foundation--local-first-principles)
2. [JAMANVAAR POS Terminal — Complete Feature List](#2-jamanvaar-pos-terminal--complete-feature-list)
3. [JAMANVAAR Restaurant Admin Center — Complete Feature List](#3-jamanvaar-restaurant-admin-center--complete-feature-list)
4. [Kitchen, KOT & Kitchen Display System (KDS)](#4-kitchen-kot--kitchen-display-system-kds)
5. [Inventory, Raw Ingredients & Recipe Deductions](#5-inventory-raw-ingredients--recipe-deductions)
6. [Sales, Financial & Statutory GST Reports](#6-sales-financial--statutory-gst-reports)
7. [Hardware, ESC/POS Thermal Printing & Peripherals](#7-hardware-escpos-thermal-printing--peripherals)
8. [Staff, Role-Based Access Control (RBAC) & Security](#8-staff-role-based-access-control-rbac--security)
9. [Preloaded Concept Menu Templates (14 Cuisines)](#9-preloaded-concept-menu-templates-14-cuisines)
10. [Commercial Licensing & Pricing Plans](#10-commercial-licensing--pricing-plans)

---

## 1. ARCHITECTURAL FOUNDATION & LOCAL-FIRST PRINCIPLES

- **Zero Cloud Dependency for Billing:** The restaurant operates with 100% local database persistence (`localStorage` snapshot + in-memory cache). Internet disconnection never stops billing, KOT generation, or receipt printing.
- **Bi-Directional Real-Time Event Sync:** Instant state synchronization across browser tabs and LAN devices using `BroadcastChannel('jamanvaar_db_bus')` and local HTTP sync server (`http://localhost:5178`).
- **Durable Event Queue & Idempotency:** Every mutation (order, payment, KOT, menu edit) is committed locally with an `eventId` and `idempotencyKey` to prevent duplicate processing.
- **Transactional State Engine:** Pure transaction calculations for sales, taxes, discounts, and inventory—no hardcoded or mock dashboard statistics.

---

## 2. JAMANVAAR POS TERMINAL — COMPLETE FEATURE LIST
*Target User: Restaurant Cashier & Counter Operator*

### 2.1 Ultra-Fast Touch Billing Workflow
- **Single Global Search Bar:** High-speed instant search for dishes, shortcodes/SKU (`PT`, `DM`, `BN`), tables, active bills, and tokens with single-click clear.
- **Visible Category Carousel & Tabs:** Large, touch-friendly category cards with live item counts for rapid navigation.
- **Dual-Action Food Cards:**
  - `[ + ADD ]`: Instant 1-click addition of standard item directly to cart (zero extra popups).
  - `[ CUSTOMIZE ]`: Opens modal for portion size, spice levels, dietary preferences, and modifier add-ons.
- **Active Order Header:** Cashier name, Terminal ID (`POS-01`), Active Shift #, and Live Network indicator (`LOCAL-FIRST`).

### 2.2 Food Customization & Modifiers Modal
- **Portion Sizes:** Full, Half, Regular, Large with price delta calculations.
- **Dietary Badges:** Veg (🟢), Jain (🟡), Non-Veg (🔴), Vegan.
- **Spice Level Selector:** Mild, Medium, Spicy, Extra Spicy (🌶️).
- **Modifier Add-ons:** Extra Cheese (+₹35), Butter (+₹20), Raita (+₹40), Extra Gravy (+₹50), etc.
- **Chef Special Notes:** Free-text kitchen instructions (e.g., *"Make without onion/garlic"*, *"Crispy naan"*).

### 2.3 Cart & Order Types Management
- **Order Types:**
  - **Dine-In:** Table selection, floor zone, guest count (Pax).
  - **Takeaway / Parcel:** Quick packaging fee option, customer pickup token.
  - **Delivery:** Customer name, address, delivery partner ref.
  - **Token / Express Counter:** Direct counter token generation (`101`, `102`, etc.).
- **Live Cart Operations:**
  - Inline quantity adjustment (`+` / `-`).
  - Delete item with single click.
  - Apply item-level or bill-level discount (Percentage `%` or Flat `₹`).
  - Automatic GST Calculation (CGST 2.5% + SGST 2.5% = 5%).
  - Smart Round-off to nearest whole rupee.

### 2.4 Hold, Recall & Multi-Order Stashing
- **Hold Order Button:** Cashier can temporarily stash an active cart when a customer steps aside to check their wallet/UPI.
- **Recall Orders Drawer:** Stashed carts list with customer name, item count, total amount, and hold timestamp. One-click instant restore.
- **Crash Recovery Auto-Save:** Cart sessions automatically persist locally; recovering intact even after accidental browser reload or power cut.

### 2.5 Multi-Tender & Split Payment Terminal
- **Single-Tender Payment Methods:**
  - **Cash:** Numeric keypad with quick cash denomination buttons (₹100, ₹200, ₹500, ₹2000), real-time change return calculator.
  - **UPI Dynamic QR:** Displays instant QR code for PhonePe, GPay, Paytm, and BHIM with auto-confirm.
  - **Card Swipe / EDC:** Card machine reference transaction ID entry.
  - **Wallet:** Customer loyalty point balance redemption.
- **Split Payment Engine:**
  - Split bill across multiple tenders (e.g., ₹200 Cash + ₹350 UPI + ₹150 Card).
  - Strict balance validator: payment cannot be completed until the sum of all portions exactly matches the bill total.

### 2.6 Receipt & KOT Generation
- **Automatic KOT Dispatch:** Splitting items by station (*Main Kitchen, Tandoor, Curry, Bar, Dessert*) and generating numbered KOT tickets.
- **Thermal Receipt Printing:** 80mm and 58mm ESC/POS compatible thermal receipt formatting with restaurant logo, GSTIN, FSSAI, itemization, and tax breakup.
- **Digital Receipts:** e-Bill delivery via WhatsApp, SMS, and QR code.

---

## 3. JAMANVAAR RESTAURANT ADMIN CENTER — COMPLETE FEATURE LIST
*Target User: Restaurant Owner, General Manager, Head Accountant*

### 3.1 Operations Dashboard
- **Dynamic Time Filters:** `TODAY`, `YESTERDAY`, `7_DAYS`, `30_DAYS`, `THIS_MONTH`, `THIS_YEAR`, `CUSTOM RANGE`—instantly recalculating all metrics.
- **10 Real-Time Transaction KPI Cards:**
  1. *Today's Net Sales* (calculated from closed bills)
  2. *Completed Orders Count* (Dine-In vs Takeaway breakup)
  3. *Average Order Value (AOV)*
  4. *Cash Collected in Drawer*
  5. *UPI Digital QR Volume*
  6. *Card Swipe EDC Volume*
  7. *Active Kitchen Backlog (Pending KOTs)*
  8. *Table Occupancy Percentage*
  9. *Low / Out-of-Stock Ingredients Count*
  10. *GST Statutory Tax Collected (5%)*
- **Hourly Sales Velocity Chart:** Visual 9 AM – 11 PM volume bars with peak hour detection.
- **Live Restaurant Activity Stream:** Real-time stream of incoming orders, payments, and table seatings.
- **Device & Terminal Monitor:** Live status of POS terminals, Kiosks, and Printers.

### 3.2 Billing & Tax Invoices Ledger
- **Complete Invoice History:** Searchable ledger by Invoice #, Token #, customer phone, date, and tender.
- **Invoice Actions:**
  - Thermal 80mm receipt modal preview.
  - Reprint physical receipt.
  - Void / refund transaction with manager PIN authorization and audit logging.

### 3.3 Orders Management & Deep Drill-Down
- **Multi-Parameter Filtering:** By Status (*Confirmed, Preparing, Ready, Completed, Cancelled*), Order Type, and Search.
- **Order Details Modal:** Complete itemization, modifier choices, special kitchen notes, applied coupons/discounts, tax breakdown, and timeline history.

### 3.4 Live Kitchen Display System (KDS) & Routing
- **Kitchen Ticket Cards:** Live status progression (`New` $\rightarrow$ `Preparing` $\rightarrow$ `Ready` $\rightarrow$ `Served`).
- **Station Tabs:** Main Kitchen, Tandoor Section, Curry Station, Beverages Bar, Dessert Counter.
- **Prep Timers & Alerts:** Visual indicators for tickets running beyond standard preparation time.

### 3.5 Menu & Catalog Full CRUD
- **Category Management:** Create, reorder, rename, delete categories, assign category icons.
- **Dish Management:**
  - Dish Name, SKU / Shortcode, Category, Price, Tax Rate.
  - Dietary Classification: Pure Veg, Jain, Non-Veg, Vegan.
  - Spice Level rating.
  - Kitchen Station routing assignment.
  - **Local Device Photo Upload:** Canvas-based client-side compression for crisp loading.
  - **86 Out-of-Stock Toggle:** 1-click toggle instantly pushes dish unavailability to all POS terminals and touch kiosks.
  - **Bulk Price Adjuster:** Apply percentage adjustments (e.g., +10%) across the catalog with rounding to nearest ₹1, ₹5, or ₹10.

### 3.6 Floor Plan & Table Layout Manager
- **Table Layout Matrix:** Visual grid of dining tables.
- **Table Properties:** Table Number, Seating Pax Capacity, Floor Zone (*Main Dining Hall, Family AC Section, Outdoor Terrace*).
- **Occupancy Status:** `AVAILABLE`, `OCCUPIED`, `RESERVED`, `BILL_REQUESTED`, `CLEANING`.

### 3.7 Customers CRM & Loyalty Points
- **Customer Directory:** Name, phone, email, lifetime visit count, total spent.
- **Loyalty Rewards Ledger:** View and manually award loyalty bonus points (₹1 = 1 Point).
- **Customer Order History:** Deep inspection of past orders and favorite dishes.

### 3.8 Staff & Role-Based Access Control (RBAC)
- **Role Hierarchy:** Super Admin, Restaurant Owner, Branch Manager, Cashier, Captain, Kitchen Chef.
- **Staff Controls:** Full name, username, 4-digit security PIN, assigned role, active/disabled toggle.
- **Manager Override System:** Enforces manager PIN approval for bill voiding, item cancellation, and high-value discounts.

### 3.9 Shift & Cash Drawer Reconciliation
- **Opening Cash Float:** Register opening cash for the shift (e.g., ₹2,000).
- **Live Cash Tracking:** Real-time cash additions from sales.
- **Cash In / Cash Out Movements:** Mid-day safe drops, petty cash expenses, change top-ups.
- **Shift Settlement & Variance:** Closing cash count entry with automatic calculation of variance (*Expected Cash vs Counted Cash*).

### 3.10 Hardware, Printers & Peripherals
- **Printer Configuration:** Thermal Receipt (80mm/58mm), Kitchen Station KOT printers, Bar printers.
- **Interface Support:** USB, Serial COM, Network LAN/Ethernet, Windows System Driver.
- **Hardware Tools:** Test print trigger, printer status monitor (`READY`, `PAPER_OUT`, `OFFLINE`), print queue retry.

### 3.11 Restaurant Profile & Legal Settings
- **Restaurant Details:** Trade name, registered legal entity name, address, phone number.
- **Statutory Identifiers:** GSTIN Number, FSSAI License Number.
- **Receipt Customization:** Header tagline, footer thank-you message, token display size, tax breakup visibility.

### 3.12 Deterministic Local Intelligence Assistant
- **Local DB Query Engine:** Built-in assistant answering real store numbers without cloud AI latency:
  - *"How much did we sell today?"*
  - *"What are today's top 5 items?"*
  - *"How much cash vs UPI was collected?"*
  - *"What are our busiest peak hours?"*
  - *"How many orders were placed today?"*

### 3.13 Security Audit Trail Logs
- **Immutable Action Log:** Logs every login, order creation, price edit, stock adjustment, void, and discount with user timestamp, action type, and details.

### 3.14 Database Backup & Disaster Recovery
- **JSON Snapshot Export:** Download complete database snapshot (*menu, tables, orders, inventory, settings*) to a local `.json` file.
- **Demo Seed Reset:** 1-click restore to standard factory demo data.

---

## 4. KITCHEN, KOT & KITCHEN DISPLAY SYSTEM (KDS)

| Feature | Description |
| :--- | :--- |
| **KOT Ticket Generation** | Sequential numbered KOT tickets (`KOT-01`, `KOT-02`) generated instantly upon order confirmation. |
| **Multi-Station Splitting** | Automatically separates items on the same bill to their respective preparation stations (e.g. Naan to *Tandoor*, Biryani to *Main Kitchen*, Mojito to *Bar*). |
| **Delta KOTs** | When additional items are added to an active table, only newly added items are printed on a Delta KOT. |
| **KDS Status Lifecycle** | Digital transition from `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `SERVED` with color-coded alerts. |

---

## 5. INVENTORY, RAW INGREDIENTS & RECIPE DEDUCTIONS

| Feature | Description |
| :--- | :--- |
| **Raw Ingredient Catalog** | Track Paneer, Butter, Rice, Flour, Oil, Cheese, Coffee Beans with units (`kg`, `ltr`, `pcs`, `grams`). |
| **Recipe-Linked Auto Deduction** | Completed POS orders trigger proportional deductions from raw stock based on recipe formulas (e.g., 1x *Paneer Tikka* deducts `0.2 kg` Paneer + `0.03 kg` Butter). |
| **Stock Movement Logging** | Records `RESTOCK`, `PURCHASE`, `SALE`, `WASTE`, `SPOILAGE`, and `ADJUSTMENT` with user attribution. |
| **Threshold Alerts** | Automatic calculation of `IN_STOCK`, `LOW_STOCK`, and `OUT_OF_STOCK` states. |

---

## 6. SALES, FINANCIAL & STATUTORY GST REPORTS

1. **Daily Sales Report:** Gross sales, discounts, CGST (2.5%), SGST (2.5%), Net sales, and tender breakup.
2. **Day-by-Day Matrix:** 14-day consecutive ledger with clickable rows for deep daily drilldown.
3. **Last 30 Days Analysis:** 30-day cumulative revenue, order counts, and daily average sales.
4. **Yearly Jan–Dec Ledger:** Month-by-month financial summary across the entire fiscal year.
5. **Top Selling Dishes:** Ranked list by quantity sold, gross revenue generated, and category.
6. **Category Performance:** Revenue share and order frequency breakdown by food category.
7. **End of Day (EOD) Z-Report:** Standard thermal 80mm formatted store closing audit certificate.
8. **Export Capabilities:** 1-click CSV download and ESC/POS thermal printing.

---

## 7. HARDWARE, ESC/POS THERMAL PRINTING & PERIPHERALS

- **Paper Sizes:** Full support for standard **80mm (3-inch)** and compact **58mm (2-inch)** thermal paper rolls.
- **ESC/POS Command Generation:** Native byte commands for bold text, double-width titles, center alignment, horizontal dashed separators, and automatic paper cutter trigger (`GS V 66 0`).
- **Resilient Print Queue:** Failed print jobs enter a retry queue with status tracking (`QUEUED`, `PRINTING`, `SUCCESS`, `FAILED`).

---

## 8. STAFF, ROLE-BASED ACCESS CONTROL (RBAC) & SECURITY

| Role | Permissions & Access Scope |
| :--- | :--- |
| **Super Admin / Owner** | Full system access, pricing changes, staff creation, financial reports, legal profile, database backup/reset. |
| **Branch Manager** | Operational reports, inventory adjustments, manager override authorizations, table layouts, shift settlements. |
| **Cashier** | Billing screen, cart operations, cash drawer reconciliation, receipt reprinting, customer lookup. |
| **Captain / Waiter** | Floor view, table status, taking table-side orders, sending KOTs. |
| **Kitchen Chef** | Live KDS view, marking tickets ready/served, station filters. |

---

## 9. PRELOADED CONCEPT MENU TEMPLATES (14 CUISINES)

The system includes **14 pre-built, production-ready concept menus** that can be loaded with 1 click in `ADD` or `REPLACE` mode:

1. 🍕 **Pizza & Italian Trattoria** (Woodfired pizzas, pastas, garlic breads, calzones)
2. 🍔 **Burger & Fast Casual Diner** (Gourmet smash burgers, loaded fries, shakes, nuggets)
3. 🍛 **North Indian & Mughlai Royal** (Paneer tikka, dal makhani, butter chicken, naan, biryani)
4. 🥞 **South Indian Pure Veg** (Crispy dosas, idli, vada, uttapam, filter coffee)
5. 🥗 **Pure Vegetarian Gujarati & Rajasthani Dining** (Thali items, dhokla, thepla, dal baati)
6. 🍜 **Pan-Asian & Indo-Chinese Wok** (Hakka noodles, manchurian, dimsums, spring rolls)
7. ☕ **Modern Cafe & Coffee Roastery** (Cappuccino, cold brew, avocado toast, sandwiches)
8. 🍽️ **Grand Multi-Cuisine Family Restaurant** (Starters, mains, sizzlers, breads, mocktails)
9. 🥐 **Bakery & Patisserie** (Croissants, pastries, sourdough loaves, celebration cakes)
10. 🍨 **Artisanal Ice Cream & Dessert Parlour** (Waffles, sundaes, gelato, gulab jamun)
11. 🍹 **Fresh Juice, Smoothie & Mocktail Bar** (Cold-pressed juices, protein shakes, mojitos)
12. 🥘 **Indian Family Dining & Sizzlers** (Veg & paneer sizzlers, platters, curries)
13. 📦 **Cloud Kitchen & Delivery Brand** (Meal bowls, combos, rolls, quick bites)
14. 🌮 **Street Food & Chaat House** (Pani puri, sev puri, samosa chaat, pav bhaji)

---

## 10. COMMERCIAL LICENSING & PRICING PLANS

| Feature / Capability | PLAN 1: JAMANVAAR POS (₹5,000 / Year) | PLAN 2: JAMANVAAR POS + CAPTAIN (₹7,000 / Year) ★ MOST POPULAR |
| :--- | :---: | :---: |
| **Counter Fast Billing & Touch POS** | ✅ Included | ✅ Included |
| **100% Offline Local-First Billing** | ✅ Included | ✅ Included |
| **Menu & 14 Preloaded Concept Templates** | ✅ Included | ✅ Included |
| **Table Layout & Floor Management** | ✅ Included | ✅ Included |
| **Kitchen KOT Station Routing** | ✅ Included | ✅ Included |
| **ESC/POS Thermal Printing (80/58mm)** | ✅ Included | ✅ Included |
| **Cash, UPI QR & Card Split Payment** | ✅ Included | ✅ Included |
| **Inventory & Recipe Stock Deduction** | ✅ Included | ✅ Included |
| **GST Tax & Financial Analytics Suite** | ✅ Included | ✅ Included |
| **Shift Management & Cash Drawer** | ✅ Included | ✅ Included |
| **Captain App for Table-side Ordering** | ❌ Not Included | ✅ **Included** |
| **Captain Direct KOT Generation** | ❌ Not Included | ✅ **Included** |
| **Food Ready Notifications to Captain** | ❌ Not Included | ✅ **Included** |
| **Course Progression & Mark Served** | ❌ Not Included | ✅ **Included** |
| **Multi-Device Local LAN Mesh Sync** | ❌ Up to 2 Devices | ✅ **Up to 5 Devices** |

---

*Specification Document generated by Antigravity IDE • Google DeepMind & KELVIONTECH*
