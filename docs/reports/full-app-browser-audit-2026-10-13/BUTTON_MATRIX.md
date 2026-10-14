# Button coverage matrix

The raw log has 3717 observations and 2159 distinct app/page/label combinations. Duplicate dish names or repeated pages are not independent functionality tests.

`ACTIVATED`: clicked and result sampled, commonly followed by cancellation. `INVENTORIED` / `NOT_EXERCISED`: identified but not committed or verified. `DISABLED`: unavailable in the fixture. `REPEATED_INSTANCE`: same action already sampled. `HARNESS_OR_UI_FAILURE`: requires classification, not automatically a product defect.

This matrix deliberately exposes incomplete coverage instead of labeling every button PASS.

| Latest status | Combinations |
| --- | --- |
| ACTIVATED | 85 |
| NOT_EXERCISED | 272 |
| REPEATED_INSTANCE | 8 |
| DISABLED | 38 |
| HARNESS_OR_UI_FAILURE | 1 |
| INVENTORIED | 1755 |

## restaurant-admin

| Page | Button / accessible label | Latest status |
| --- | --- | --- |
| dashboard | Refresh | ACTIVATED |
| dashboard | 0 unpaid bills · ₹0 → View bills | NOT_EXERCISED |
| dashboard | Check device connections | ACTIVATED |
| dashboard | Review guest menu | NOT_EXERCISED |
| dashboard | Review register shifts | NOT_EXERCISED |
| dashboard | Review stock alerts | NOT_EXERCISED |
| dashboard | Dismiss checklist | NOT_EXERCISED |
| dashboard | Add your dishes | DISABLED |
| dashboard | Set up this branch’s tables | DISABLED |
| dashboard | Add your team | DISABLED |
| dashboard | Connect receipt and kitchen printers | NOT_EXERCISED |
| dashboard | Check again | NOT_EXERCISED |
| dashboard | Check device acknowledgements | NOT_EXERCISED |
| dashboard | Set up a table QR | NOT_EXERCISED |
| dashboard | Open menu & publish | NOT_EXERCISED |
| dashboard | Check setup again | NOT_EXERCISED |
| dashboard | Open settings → | REPEATED_INSTANCE |
| billing | Flat Ledger | NOT_EXERCISED |
| billing | Day-by-Day | NOT_EXERCISED |
| billing | Download / Print Invoices Ledger as PDF | NOT_EXERCISED |
| billing | Export CSV | ACTIVATED |
| billing | Today | NOT_EXERCISED |
| billing | Yesterday | NOT_EXERCISED |
| billing | Last 7 Days | NOT_EXERCISED |
| billing | Last 30 Days | NOT_EXERCISED |
| billing | This Month | NOT_EXERCISED |
| billing | This Year | NOT_EXERCISED |
| billing | Custom Date | NOT_EXERCISED |
| billing | Dine-in: ₹0 (0) | NOT_EXERCISED |
| billing | Takeaway: ₹0 (0) | NOT_EXERCISED |
| billing | Delivery: ₹0 (0) | NOT_EXERCISED |
| billing | Quick Token: ₹0 (0) | NOT_EXERCISED |
| billing | PENDING COLLECTION ₹0 0 orders awaiting payment. Settle kiosk cash orders in POS. | NOT_EXERCISED |
| billing | Clear Filters & Show All Records | NOT_EXERCISED |
| orders | Back to Order History (All Days) | NOT_EXERCISED |
| orders | Previous Day | NOT_EXERCISED |
| orders | Today | NOT_EXERCISED |
| orders | Next Day | DISABLED |
| orders | Export Day CSV | ACTIVATED |
| orders | Prev | DISABLED |
| orders | Next | DISABLED |
| live-kitchen | All Kitchen Stations | NOT_EXERCISED |
| live-kitchen | Cooking (0) | NOT_EXERCISED |
| live-kitchen | Ready for Table (0) | NOT_EXERCISED |
| live-kitchen | Served (0) | NOT_EXERCISED |
| live-kitchen | All Tickets (0) | NOT_EXERCISED |
| tables | Table QR Standees | NOT_EXERCISED |
| tables | Add Dining Table | ACTIVATED |
| tables | All Floor Sections 1 | NOT_EXERCISED |
| tables | UI Dining Hall 1 | NOT_EXERCISED |
| tables | Generate / Print QR Standee for Table UI01 | ACTIVATED |
| tables | Status of table UI01: Available | NOT_EXERCISED |
| tables | Edit Table Details | NOT_EXERCISED |
| tables | Delete Table | NOT_EXERCISED |
| reservations | New Reservation | NOT_EXERCISED |
| reservations | + Take a Reservation | NOT_EXERCISED |
| kitchen | All Kitchen Stations | NOT_EXERCISED |
| kitchen | Cooking (0) | NOT_EXERCISED |
| kitchen | Ready for Table (0) | NOT_EXERCISED |
| kitchen | Served (0) | NOT_EXERCISED |
| kitchen | All Tickets (0) | NOT_EXERCISED |
| qr-ordering | Overview | NOT_EXERCISED |
| qr-ordering | QR Orders | NOT_EXERCISED |
| qr-ordering | Service Requests | NOT_EXERCISED |
| qr-ordering | Menu & Availability | NOT_EXERCISED |
| qr-ordering | Tables & QR | NOT_EXERCISED |
| qr-ordering | Customer Branding | NOT_EXERCISED |
| qr-ordering | Payment Settings | ACTIVATED |
| qr-ordering | Ordering Rules | NOT_EXERCISED |
| qr-ordering | Advanced Features | NOT_EXERCISED |
| qr-ordering | Analytics | NOT_EXERCISED |
| qr-ordering | 1 table without an active QR code — set up Tables & QR → | NOT_EXERCISED |
| qr-ordering | 1. Publish menu | NOT_EXERCISED |
| qr-ordering | 2. Set up table QR | NOT_EXERCISED |
| qr-ordering | 3. Check payments | NOT_EXERCISED |
| qr-ordering | 4. Preview appearance | NOT_EXERCISED |
| qr-ordering | Show advanced tools | NOT_EXERCISED |
| qr-ordering | Check setup again | NOT_EXERCISED |
| qr-ordering | Open settings → | REPEATED_INSTANCE |
| menu | Publish to QR / Kiosk | NOT_EXERCISED |
| menu | Add Dish | ACTIVATED |
| menu | Add Category | ACTIVATED |
| menu | Load Menu Template | ACTIVATED |
| menu | Upload a menu CSV (download the template first if you need the columns) | NOT_EXERCISED |
| menu | Download a CSV template (or your current menu, if you have one) | NOT_EXERCISED |
| menu | Export Menu CSV | ACTIVATED |
| menu | Bulk Price Adjust | ACTIVATED |
| menu | Scan, review and explicitly archive confirmed duplicates | NOT_EXERCISED |
| menu | All Diets | NOT_EXERCISED |
| menu | Veg | NOT_EXERCISED |
| menu | Non-Veg | NOT_EXERCISED |
| menu | Egg | NOT_EXERCISED |
| menu | Jain | NOT_EXERCISED |
| menu | Vegan | NOT_EXERCISED |
| menu | All Categories 100 dishes | NOT_EXERCISED |
| menu | UI Category 1 10 dishes | NOT_EXERCISED |
| menu | UI Category 2 10 dishes | NOT_EXERCISED |
| menu | UI Category 3 10 dishes | NOT_EXERCISED |
| menu | UI Category 4 10 dishes | NOT_EXERCISED |
| menu | UI Category 5 10 dishes | NOT_EXERCISED |
| menu | UI Category 6 10 dishes | NOT_EXERCISED |
| menu | UI Category 7 10 dishes | NOT_EXERCISED |
| menu | UI Category 8 10 dishes | NOT_EXERCISED |
| menu | UI Category 9 10 dishes | NOT_EXERCISED |
| menu | UI Category 10 10 dishes | NOT_EXERCISED |
| menu | Click to change the price | NOT_EXERCISED |
| menu | In Stock | NOT_EXERCISED |
| menu | Edit Dish | REPEATED_INSTANCE |
| menu | Archive Dish | NOT_EXERCISED |
| menu | Create Combo | HARNESS_OR_UI_FAILURE |
| menu | + Create First Combo | NOT_EXERCISED |
| options | Publish to guests | NOT_EXERCISED |
| options | Preview what guests will see | ACTIVATED |
| options | New group | NOT_EXERCISED |
| options | New tax group | NOT_EXERCISED |
| inventory | Create Recipe Formula | ACTIVATED |
| inventory | Add Stock Item | ACTIVATED |
| inventory | + Add First Ingredient | NOT_EXERCISED |
| inventory | + Create Recipe Formula | NOT_EXERCISED |
| purchasing | Receive goods | NOT_EXERCISED |
| purchasing | Suppliers | NOT_EXERCISED |
| purchasing | Stock count | NOT_EXERCISED |
| purchasing | Reorder & expiry | NOT_EXERCISED |
| purchasing | Costing & reports | NOT_EXERCISED |
| customers | Export CRM CSV (0) | ACTIVATED |
| customers | Loyalty Program | ACTIVATED |
| customers | Marketing Campaigns | NOT_EXERCISED |
| customers | Register New Customer | NOT_EXERCISED |
| customers | All Guests | NOT_EXERCISED |
| customers | VIP High Spenders | NOT_EXERCISED |
| customers | Frequent Regulars | NOT_EXERCISED |
| customers | New Guests | NOT_EXERCISED |
| customers | Inactive (30+ Days) | NOT_EXERCISED |
| customers | Celebrations This Month | NOT_EXERCISED |
| staff | Add Employee | ACTIVATED |
| staff | Edit Staff | REPEATED_INSTANCE |
| staff | Remove staff UI Cashier | NOT_EXERCISED |
| staff | Remove staff UI Captain | NOT_EXERCISED |
| staff | Remove staff UI Kitchen | NOT_EXERCISED |
| staff | Remove staff UI Manager | NOT_EXERCISED |
| staff | Schedule Shift | ACTIVATED |
| staff | Clock In | NOT_EXERCISED |
| staff | Clock Out | NOT_EXERCISED |
| staff | Add Rider | ACTIVATED |
| coupons | + Add Coupon Code | NOT_EXERCISED |
| shifts | Generate Official EOD Z-Report | ACTIVATED |
| shifts | Record Cash Movement | NOT_EXERCISED |
| shifts | Open Cashier Shift | ACTIVATED |
| reports | Report Design | ACTIVATED |
| reports | Preview Report | ACTIVATED |
| reports | Print Report | NOT_EXERCISED |
| reports | Download PDF | ACTIVATED |
| reports | Export CSV | ACTIVATED |
| reports | Today | NOT_EXERCISED |
| reports | Yesterday | NOT_EXERCISED |
| reports | Last 7 Days | NOT_EXERCISED |
| reports | Last 30 Days | NOT_EXERCISED |
| reports | This Month | NOT_EXERCISED |
| reports | Last Month | NOT_EXERCISED |
| reports | This Year | NOT_EXERCISED |
| reports | Custom Range | NOT_EXERCISED |
| reports | Filters | NOT_EXERCISED |
| reports | Overview | NOT_EXERCISED |
| reports | Sales | NOT_EXERCISED |
| reports | Menu | NOT_EXERCISED |
| reports | Financial | NOT_EXERCISED |
| reports | Operations | NOT_EXERCISED |
| reports | Customers | NOT_EXERCISED |
| reports | Inventory | NOT_EXERCISED |
| printers | Configure Printer | ACTIVATED |
| printers | + Configure First Printer | NOT_EXERCISED |
| printers | Force Sync Now | NOT_EXERCISED |
| printers | Pair Local Core | NOT_EXERCISED |
| printers | Save & Connect | NOT_EXERCISED |
| printers | Test Ping & Latency | NOT_EXERCISED |
| printers | Process Queue Now | NOT_EXERCISED |
| receipts | Go to Settings | ACTIVATED |
| receipts | 80mm Standard POS | NOT_EXERCISED |
| receipts | 58mm Compact POS | NOT_EXERCISED |
| receipts | Save Receipt Settings | NOT_EXERCISED |
| receipts | Save & check | DISABLED |
| sync | Sync now | NOT_EXERCISED |
| sync | Pair Local Core | NOT_EXERCISED |
| sync | Connect | NOT_EXERCISED |
| sync | Clear and re-download | NOT_EXERCISED |
| sync | Publish menu | NOT_EXERCISED |
| sync | Refresh | ACTIVATED |
| settings | Save changes | NOT_EXERCISED |
| settings | Apply branch profile | NOT_EXERCISED |
| settings | Refresh device acknowledgement | ACTIVATED |
| settings | Refresh assistant access | ACTIVATED |
| settings | Reset | NOT_EXERCISED |
| settings | Save & Apply Across All Reports | NOT_EXERCISED |
| subscription | My Plan | NOT_EXERCISED |
| subscription | Billing & Invoices | NOT_EXERCISED |
| subscription | Compare Plans | NOT_EXERCISED |
| subscription | Activate Offline | NOT_EXERCISED |
| subscription | Change password | NOT_EXERCISED |
| subscription | Refresh | ACTIVATED |
| subscription | Generate Login | ACTIVATED |
| subscription | Copy ID | NOT_EXERCISED |
| backup | Backup to Cloud Now | NOT_EXERCISED |
| backup | Download Backup JSON | ACTIVATED |
| backup | Upload & Restore | ACTIVATED |
| backup | Reset Seed Data | DISABLED |
| support | New ticket | NOT_EXERCISED |
| downloads | This app hasn't had a version published yet | DISABLED |

## kiosk-admin

| Page | Button / accessible label | Latest status |
| --- | --- | --- |
| dashboard | Refresh | ACTIVATED |
| dashboard | Check device connections | ACTIVATED |
| dashboard | Review guest menu | NOT_EXERCISED |
| dashboard | Activated kiosks 0 | NOT_EXERCISED |
| dashboard | Online kiosks 0 | NOT_EXERCISED |
| dashboard | Available menu items 100 | NOT_EXERCISED |
| dashboard | 1. Set up your menu Choose a restaurant template or add your own dishes. | NOT_EXERCISED |
| dashboard | 2. Design the customer screen Set your logo, welcome screen and wording. | NOT_EXERCISED |
| dashboard | 3. Check payments Review collection, fees and settlement details. | NOT_EXERCISED |
| dashboard | 4. Connect your kiosks Activate the customer terminal with its own kiosk key. | NOT_EXERCISED |
| dashboard | Open Payments & Payouts | NOT_EXERCISED |
| dashboard | Check again | NOT_EXERCISED |
| dashboard | Check device acknowledgements | NOT_EXERCISED |
| dashboard | Set up a table QR | NOT_EXERCISED |
| dashboard | Open menu & publish | ACTIVATED |
| dashboard | Check setup again | NOT_EXERCISED |
| dashboard | Open settings → | REPEATED_INSTANCE |
| orders | Back to Order History (All Days) | NOT_EXERCISED |
| orders | Previous Day | NOT_EXERCISED |
| orders | Today | NOT_EXERCISED |
| orders | Next Day | DISABLED |
| orders | Export Day CSV | ACTIVATED |
| orders | Prev | DISABLED |
| orders | Next | DISABLED |
| terminals | Request Activation Key | NOT_EXERCISED |
| menu | Publish to QR / Kiosk | NOT_EXERCISED |
| menu | Add Dish | ACTIVATED |
| menu | Add Category | ACTIVATED |
| menu | Load Menu Template | ACTIVATED |
| menu | Upload a menu CSV (download the template first if you need the columns) | NOT_EXERCISED |
| menu | Download a CSV template (or your current menu, if you have one) | NOT_EXERCISED |
| menu | Export Menu CSV | ACTIVATED |
| menu | Bulk Price Adjust | ACTIVATED |
| menu | Scan, review and explicitly archive confirmed duplicates | NOT_EXERCISED |
| menu | All Diets | NOT_EXERCISED |
| menu | Veg | NOT_EXERCISED |
| menu | Non-Veg | NOT_EXERCISED |
| menu | Egg | NOT_EXERCISED |
| menu | Jain | NOT_EXERCISED |
| menu | Vegan | NOT_EXERCISED |
| menu | All Categories 100 dishes | NOT_EXERCISED |
| menu | UI Category 1 10 dishes | NOT_EXERCISED |
| menu | UI Category 2 10 dishes | NOT_EXERCISED |
| menu | UI Category 3 10 dishes | NOT_EXERCISED |
| menu | UI Category 4 10 dishes | NOT_EXERCISED |
| menu | UI Category 5 10 dishes | NOT_EXERCISED |
| menu | UI Category 6 10 dishes | NOT_EXERCISED |
| menu | UI Category 7 10 dishes | NOT_EXERCISED |
| menu | UI Category 8 10 dishes | NOT_EXERCISED |
| menu | UI Category 9 10 dishes | NOT_EXERCISED |
| menu | UI Category 10 10 dishes | NOT_EXERCISED |
| menu | Click to change the price | NOT_EXERCISED |
| menu | In Stock | NOT_EXERCISED |
| menu | Edit Dish | REPEATED_INSTANCE |
| menu | Archive Dish | NOT_EXERCISED |
| menu | Create Combo | ACTIVATED |
| menu | + Create First Combo | NOT_EXERCISED |
| options | Publish to guests | NOT_EXERCISED |
| options | Preview what guests will see | ACTIVATED |
| options | New group | NOT_EXERCISED |
| options | New tax group | NOT_EXERCISED |
| appearance | Save & Publish Kiosk Settings | ACTIVATED |
| welcome-screen | Reset to Default | NOT_EXERCISED |
| welcome-screen | Apply to Kiosk | NOT_EXERCISED |
| welcome-screen | Upload Custom Background | ACTIVATED |
| welcome-screen | Refresh available designs | ACTIVATED |
| welcome-screen | Preview Royal Indian Dining | ACTIVATED |
| welcome-screen | Preview Modern Indian Dining | ACTIVATED |
| welcome-screen | Preview Gujarati Thali | ACTIVATED |
| welcome-screen | Preview North Indian Cuisine | ACTIVATED |
| welcome-screen | Preview South Indian Cuisine | ACTIVATED |
| welcome-screen | Preview Indian Street Food | ACTIVATED |
| welcome-screen | Preview Premium Biryani | ACTIVATED |
| welcome-screen | Preview Vegetarian Garden | ACTIVATED |
| welcome-screen | Preview Café & Casual Dining | ACTIVATED |
| welcome-screen | Preview Heritage Sweets | ACTIVATED |
| welcome-screen | Preview Midnight Spice | ACTIVATED |
| welcome-screen | Preview Terracotta Table | ACTIVATED |
| welcome-screen | Preview Teal Pop Kitchen | ACTIVATED |
| welcome-screen | Preview Botanical Bistro | ACTIVATED |
| welcome-screen | Preview Pastel Patisserie | ACTIVATED |
| welcome-screen | Preview Urban Street Kitchen | ACTIVATED |
| welcome-screen | Portrait | NOT_EXERCISED |
| welcome-screen | Landscape | NOT_EXERCISED |
| welcome-screen | Start Order | NOT_EXERCISED |
| combos | New Combo | NOT_EXERCISED |
| combos | Save Combo | NOT_EXERCISED |
| coupons | + Add Coupon Code | NOT_EXERCISED |
| kitchen | All Kitchen Stations | NOT_EXERCISED |
| kitchen | Cooking (0) | NOT_EXERCISED |
| kitchen | Ready for Table (0) | NOT_EXERCISED |
| kitchen | Served (0) | NOT_EXERCISED |
| kitchen | All Tickets (0) | NOT_EXERCISED |
| tables | Table QR Standees | NOT_EXERCISED |
| tables | Add Dining Table | ACTIVATED |
| tables | All Floor Sections 1 | NOT_EXERCISED |
| tables | UI Dining Hall 1 | NOT_EXERCISED |
| tables | Generate / Print QR Standee for Table UI01 | ACTIVATED |
| tables | Status of table UI01: Available | NOT_EXERCISED |
| tables | Edit Table Details | ACTIVATED |
| tables | Delete Table | NOT_EXERCISED |
| staff | Add Employee | ACTIVATED |
| staff | Edit Staff | REPEATED_INSTANCE |
| staff | Remove staff UI Cashier | NOT_EXERCISED |
| staff | Remove staff UI Captain | NOT_EXERCISED |
| staff | Remove staff UI Kitchen | NOT_EXERCISED |
| staff | Remove staff UI Manager | NOT_EXERCISED |
| staff | Schedule Shift | ACTIVATED |
| staff | Clock In | NOT_EXERCISED |
| staff | Clock Out | NOT_EXERCISED |
| staff | Add Rider | ACTIVATED |
| payments | Refresh | REPEATED_INSTANCE |
| payments | Show | NOT_EXERCISED |
| payments | Download CSV | ACTIVATED |
| payments | Request online payment activation | NOT_EXERCISED |
| payments | Update bank details | NOT_EXERCISED |
| reports | Report Design | ACTIVATED |
| reports | Preview Report | ACTIVATED |
| reports | Print Report | NOT_EXERCISED |
| reports | Download PDF | ACTIVATED |
| reports | Export CSV | ACTIVATED |
| reports | Today | NOT_EXERCISED |
| reports | Yesterday | NOT_EXERCISED |
| reports | Last 7 Days | NOT_EXERCISED |
| reports | Last 30 Days | NOT_EXERCISED |
| reports | This Month | NOT_EXERCISED |
| reports | Last Month | NOT_EXERCISED |
| reports | This Year | NOT_EXERCISED |
| reports | Custom Range | NOT_EXERCISED |
| reports | Filters | NOT_EXERCISED |
| reports | Overview | NOT_EXERCISED |
| reports | Sales | NOT_EXERCISED |
| reports | Menu | NOT_EXERCISED |
| reports | Financial | NOT_EXERCISED |
| reports | Operations | NOT_EXERCISED |
| printers | Configure Printer | ACTIVATED |
| printers | + Configure First Printer | NOT_EXERCISED |
| printers | Force Sync Now | NOT_EXERCISED |
| printers | Pair Local Core | NOT_EXERCISED |
| printers | Save & Connect | NOT_EXERCISED |
| printers | Test Ping & Latency | NOT_EXERCISED |
| printers | Process Queue Now | NOT_EXERCISED |
| receipts | Go to Settings | ACTIVATED |
| receipts | 80mm Standard POS | NOT_EXERCISED |
| receipts | 58mm Compact POS | NOT_EXERCISED |
| receipts | Save Receipt Settings | NOT_EXERCISED |
| receipts | Save & check | DISABLED |
| sync | Sync now | NOT_EXERCISED |
| sync | Pair Local Core | NOT_EXERCISED |
| sync | Connect | NOT_EXERCISED |
| sync | Clear and re-download | NOT_EXERCISED |
| sync | Publish menu | NOT_EXERCISED |
| sync | Refresh | ACTIVATED |
| settings | Save changes | NOT_EXERCISED |
| settings | Apply branch profile | NOT_EXERCISED |
| settings | Refresh device acknowledgement | ACTIVATED |
| settings | Refresh assistant access | ACTIVATED |
| settings | Reset | NOT_EXERCISED |
| settings | Save & Apply Across All Reports | NOT_EXERCISED |
| settings | Reset to 101 | NOT_EXERCISED |
| subscription | My Plan | NOT_EXERCISED |
| subscription | Billing & Invoices | NOT_EXERCISED |
| subscription | Compare Plans | NOT_EXERCISED |
| subscription | Activate Offline | NOT_EXERCISED |
| subscription | Change password | NOT_EXERCISED |
| subscription | Refresh | ACTIVATED |
| subscription | Generate Login | ACTIVATED |
| subscription | Copy ID | NOT_EXERCISED |
| backup | Backup to Cloud Now | NOT_EXERCISED |
| backup | Download Backup JSON | ACTIVATED |
| backup | Upload & Restore | ACTIVATED |
| backup | Reset Seed Data | DISABLED |
| support | New ticket | NOT_EXERCISED |
| downloads | This app hasn't had a version published yet | DISABLED |

## pos

| Page | Button / accessible label | Latest status |
| --- | --- | --- |
| Floor & Tables | Start fresh order | INVENTORIED |
| Floor & Tables | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| Floor & Tables | Sync now | INVENTORIED |
| Floor & Tables | Business Day & Shift Status — Click to manage | INVENTORIED |
| Floor & Tables | Notifications & System Events | INVENTORIED |
| Floor & Tables | Quick Help | INVENTORIED |
| Floor & Tables | Open JAMAN AI Assistant | INVENTORIED |
| Floor & Tables | User Profile & Session Options — All Systems OK | INVENTORIED |
| Floor & Tables | Billing | INVENTORIED |
| Floor & Tables | Orders | INVENTORIED |
| Floor & Tables | Tables | INVENTORIED |
| Floor & Tables | Collect | INVENTORIED |
| Floor & Tables | Billing / Menu | INVENTORIED |
| Floor & Tables | Floor & Tables | INVENTORIED |
| Floor & Tables | Live Orders | INVENTORIED |
| Floor & Tables | Bills & Invoices | INVENTORIED |
| Floor & Tables | Kitchen & KOT | INVENTORIED |
| Floor & Tables | Customers CRM | INVENTORIED |
| Floor & Tables | Shift & Cash | INVENTORIED |
| Floor & Tables | Day History | INVENTORIED |
| Floor & Tables | POS Reports | INVENTORIED |
| Floor & Tables | Inventory & Stock | INVENTORIED |
| Floor & Tables | Settings | INVENTORIED |
| Floor & Tables | Fewer tools | INVENTORIED |
| Floor & Tables | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| Floor & Tables | Print Queue | INVENTORIED |
| Floor & Tables | Manage Tables | INVENTORIED |
| Floor & Tables | All 1 | INVENTORIED |
| Floor & Tables | Available 1 | INVENTORIED |
| Floor & Tables | Occupied 0 | INVENTORIED |
| Floor & Tables | Billing 0 | INVENTORIED |
| Floor & Tables | Reserved 0 | INVENTORIED |
| Floor & Tables | All Zones | INVENTORIED |
| Floor & Tables | UI Dining Hall | INVENTORIED |
| Floor & Tables | + Open Table | INVENTORIED |
| Floor & Tables | Click to open Sales Reports | INVENTORIED |
| Floor & Tables | Click to view Live Orders | INVENTORIED |
| Floor & Tables | Click to open Floor Plan | INVENTORIED |
| Floor & Tables | Click to open Kitchen KOTs | INVENTORIED |
| Live Orders | Start fresh order | INVENTORIED |
| Live Orders | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| Live Orders | Sync now | INVENTORIED |
| Live Orders | Business Day & Shift Status — Click to manage | INVENTORIED |
| Live Orders | Notifications & System Events | INVENTORIED |
| Live Orders | Quick Help | INVENTORIED |
| Live Orders | Open JAMAN AI Assistant | INVENTORIED |
| Live Orders | User Profile & Session Options — All Systems OK | INVENTORIED |
| Live Orders | Billing | INVENTORIED |
| Live Orders | Orders | INVENTORIED |
| Live Orders | Tables | INVENTORIED |
| Live Orders | Collect | INVENTORIED |
| Live Orders | Billing / Menu | INVENTORIED |
| Live Orders | Floor & Tables | INVENTORIED |
| Live Orders | Live Orders | INVENTORIED |
| Live Orders | Bills & Invoices | INVENTORIED |
| Live Orders | Kitchen & KOT | INVENTORIED |
| Live Orders | Customers CRM | INVENTORIED |
| Live Orders | Shift & Cash | INVENTORIED |
| Live Orders | Day History | INVENTORIED |
| Live Orders | POS Reports | INVENTORIED |
| Live Orders | Inventory & Stock | INVENTORIED |
| Live Orders | Settings | INVENTORIED |
| Live Orders | Fewer tools | INVENTORIED |
| Live Orders | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| Live Orders | Print Queue | INVENTORIED |
| Live Orders | Active Session (0) | INVENTORIED |
| Live Orders | View complete historical orders across all past days | INVENTORIED |
| Live Orders | All orders | INVENTORIED |
| Live Orders | Outstanding bills · 0 · ₹0 | INVENTORIED |
| Live Orders | All Sources | INVENTORIED |
| Live Orders | QR Table | INVENTORIED |
| Live Orders | Counter POS | INVENTORIED |
| Live Orders | Self-Order Kiosk | INVENTORIED |
| Live Orders | Floor Captain | INVENTORIED |
| Live Orders | All | INVENTORIED |
| Live Orders | New | INVENTORIED |
| Live Orders | Confirmed | INVENTORIED |
| Live Orders | Preparing | INVENTORIED |
| Live Orders | Ready | INVENTORIED |
| Live Orders | Served | INVENTORIED |
| Live Orders | Completed | INVENTORIED |
| Live Orders | Click to open Sales Reports | INVENTORIED |
| Live Orders | Click to view Live Orders | INVENTORIED |
| Live Orders | Click to open Floor Plan | INVENTORIED |
| Live Orders | Click to open Kitchen KOTs | INVENTORIED |
| Bills & Invoices | Start fresh order | INVENTORIED |
| Bills & Invoices | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| Bills & Invoices | Sync now | INVENTORIED |
| Bills & Invoices | Business Day & Shift Status — Click to manage | INVENTORIED |
| Bills & Invoices | Notifications & System Events | INVENTORIED |
| Bills & Invoices | Quick Help | INVENTORIED |
| Bills & Invoices | Open JAMAN AI Assistant | INVENTORIED |
| Bills & Invoices | User Profile & Session Options — All Systems OK | INVENTORIED |
| Bills & Invoices | Billing | INVENTORIED |
| Bills & Invoices | Orders | INVENTORIED |
| Bills & Invoices | Tables | INVENTORIED |
| Bills & Invoices | Collect | INVENTORIED |
| Bills & Invoices | Billing / Menu | INVENTORIED |
| Bills & Invoices | Floor & Tables | INVENTORIED |
| Bills & Invoices | Live Orders | INVENTORIED |
| Bills & Invoices | Bills & Invoices | INVENTORIED |
| Bills & Invoices | Kitchen & KOT | INVENTORIED |
| Bills & Invoices | Customers CRM | INVENTORIED |
| Bills & Invoices | Shift & Cash | INVENTORIED |
| Bills & Invoices | Day History | INVENTORIED |
| Bills & Invoices | POS Reports | INVENTORIED |
| Bills & Invoices | Inventory & Stock | INVENTORIED |
| Bills & Invoices | Settings | INVENTORIED |
| Bills & Invoices | Fewer tools | INVENTORIED |
| Bills & Invoices | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| Bills & Invoices | Print Queue | INVENTORIED |
| Bills & Invoices | Export CSV | INVENTORIED |
| Bills & Invoices | Download PDF | INVENTORIED |
| Bills & Invoices | Today | INVENTORIED |
| Bills & Invoices | Yesterday | INVENTORIED |
| Bills & Invoices | This Week | INVENTORIED |
| Bills & Invoices | This Month | INVENTORIED |
| Bills & Invoices | All Bills | INVENTORIED |
| Bills & Invoices | Custom Date | INVENTORIED |
| Bills & Invoices | Filters | INVENTORIED |
| Bills & Invoices | Click to open Sales Reports | INVENTORIED |
| Bills & Invoices | Click to view Live Orders | INVENTORIED |
| Bills & Invoices | Click to open Floor Plan | INVENTORIED |
| Bills & Invoices | Click to open Kitchen KOTs | INVENTORIED |
| Kitchen & KOT | Start fresh order | INVENTORIED |
| Kitchen & KOT | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| Kitchen & KOT | Sync now | INVENTORIED |
| Kitchen & KOT | Business Day & Shift Status — Click to manage | INVENTORIED |
| Kitchen & KOT | Notifications & System Events | INVENTORIED |
| Kitchen & KOT | Quick Help | INVENTORIED |
| Kitchen & KOT | Open JAMAN AI Assistant | INVENTORIED |
| Kitchen & KOT | User Profile & Session Options — All Systems OK | INVENTORIED |
| Kitchen & KOT | Billing | INVENTORIED |
| Kitchen & KOT | Orders | INVENTORIED |
| Kitchen & KOT | Tables | INVENTORIED |
| Kitchen & KOT | Collect | INVENTORIED |
| Kitchen & KOT | Billing / Menu | INVENTORIED |
| Kitchen & KOT | Floor & Tables | INVENTORIED |
| Kitchen & KOT | Live Orders | INVENTORIED |
| Kitchen & KOT | Bills & Invoices | INVENTORIED |
| Kitchen & KOT | Kitchen & KOT | INVENTORIED |
| Kitchen & KOT | Customers CRM | INVENTORIED |
| Kitchen & KOT | Shift & Cash | INVENTORIED |
| Kitchen & KOT | Day History | INVENTORIED |
| Kitchen & KOT | POS Reports | INVENTORIED |
| Kitchen & KOT | Inventory & Stock | INVENTORIED |
| Kitchen & KOT | Settings | INVENTORIED |
| Kitchen & KOT | Fewer tools | INVENTORIED |
| Kitchen & KOT | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| Kitchen & KOT | Print Queue | INVENTORIED |
| Kitchen & KOT | All Stations | INVENTORIED |
| Kitchen & KOT | In Progress | INVENTORIED |
| Kitchen & KOT | Ready for Service | INVENTORIED |
| Kitchen & KOT | Completed | INVENTORIED |
| Kitchen & KOT | Click to open Sales Reports | INVENTORIED |
| Kitchen & KOT | Click to view Live Orders | INVENTORIED |
| Kitchen & KOT | Click to open Floor Plan | INVENTORIED |
| Kitchen & KOT | Click to open Kitchen KOTs | INVENTORIED |
| Customers CRM | Start fresh order | INVENTORIED |
| Customers CRM | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| Customers CRM | Sync now | INVENTORIED |
| Customers CRM | Business Day & Shift Status — Click to manage | INVENTORIED |
| Customers CRM | Notifications & System Events | INVENTORIED |
| Customers CRM | Quick Help | INVENTORIED |
| Customers CRM | Open JAMAN AI Assistant | INVENTORIED |
| Customers CRM | User Profile & Session Options — All Systems OK | INVENTORIED |
| Customers CRM | Billing | INVENTORIED |
| Customers CRM | Orders | INVENTORIED |
| Customers CRM | Tables | INVENTORIED |
| Customers CRM | Collect | INVENTORIED |
| Customers CRM | Billing / Menu | INVENTORIED |
| Customers CRM | Floor & Tables | INVENTORIED |
| Customers CRM | Live Orders | INVENTORIED |
| Customers CRM | Bills & Invoices | INVENTORIED |
| Customers CRM | Kitchen & KOT | INVENTORIED |
| Customers CRM | Customers CRM | INVENTORIED |
| Customers CRM | Shift & Cash | INVENTORIED |
| Customers CRM | Day History | INVENTORIED |
| Customers CRM | POS Reports | INVENTORIED |
| Customers CRM | Inventory & Stock | INVENTORIED |
| Customers CRM | Settings | INVENTORIED |
| Customers CRM | Fewer tools | INVENTORIED |
| Customers CRM | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| Customers CRM | Print Queue | INVENTORIED |
| Customers CRM | + New Customer | INVENTORIED |
| Customers CRM | Click to open Sales Reports | INVENTORIED |
| Customers CRM | Click to view Live Orders | INVENTORIED |
| Customers CRM | Click to open Floor Plan | INVENTORIED |
| Customers CRM | Click to open Kitchen KOTs | INVENTORIED |
| Shift & Cash | Start fresh order | INVENTORIED |
| Shift & Cash | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| Shift & Cash | Sync now | INVENTORIED |
| Shift & Cash | Business Day & Shift Status — Click to manage | INVENTORIED |
| Shift & Cash | Notifications & System Events | INVENTORIED |
| Shift & Cash | Quick Help | INVENTORIED |
| Shift & Cash | Open JAMAN AI Assistant | INVENTORIED |
| Shift & Cash | User Profile & Session Options — All Systems OK | INVENTORIED |
| Shift & Cash | Billing | INVENTORIED |
| Shift & Cash | Orders | INVENTORIED |
| Shift & Cash | Tables | INVENTORIED |
| Shift & Cash | Collect | INVENTORIED |
| Shift & Cash | Billing / Menu | INVENTORIED |
| Shift & Cash | Floor & Tables | INVENTORIED |
| Shift & Cash | Live Orders | INVENTORIED |
| Shift & Cash | Bills & Invoices | INVENTORIED |
| Shift & Cash | Kitchen & KOT | INVENTORIED |
| Shift & Cash | Customers CRM | INVENTORIED |
| Shift & Cash | Shift & Cash | INVENTORIED |
| Shift & Cash | Day History | INVENTORIED |
| Shift & Cash | POS Reports | INVENTORIED |
| Shift & Cash | Inventory & Stock | INVENTORIED |
| Shift & Cash | Settings | INVENTORIED |
| Shift & Cash | Fewer tools | INVENTORIED |
| Shift & Cash | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| Shift & Cash | Print Queue | INVENTORIED |
| Shift & Cash | + Open New Shift | INVENTORIED |
| Shift & Cash | Open Cashier Shift Now | INVENTORIED |
| Shift & Cash | All Shifts | INVENTORIED |
| Shift & Cash | Today | INVENTORIED |
| Shift & Cash | Yesterday | INVENTORIED |
| Shift & Cash | Last 7 Days | INVENTORIED |
| Shift & Cash | Last 30 Days | INVENTORIED |
| Shift & Cash | Click to open Sales Reports | INVENTORIED |
| Shift & Cash | Click to view Live Orders | INVENTORIED |
| Shift & Cash | Click to open Floor Plan | INVENTORIED |
| Shift & Cash | Click to open Kitchen KOTs | INVENTORIED |
| Day History | Start fresh order | INVENTORIED |
| Day History | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| Day History | Sync now | INVENTORIED |
| Day History | Business Day & Shift Status — Click to manage | INVENTORIED |
| Day History | Notifications & System Events | INVENTORIED |
| Day History | Quick Help | INVENTORIED |
| Day History | Open JAMAN AI Assistant | INVENTORIED |
| Day History | User Profile & Session Options — All Systems OK | INVENTORIED |
| Day History | Billing | INVENTORIED |
| Day History | Orders | INVENTORIED |
| Day History | Tables | INVENTORIED |
| Day History | Collect | INVENTORIED |
| Day History | Billing / Menu | INVENTORIED |
| Day History | Floor & Tables | INVENTORIED |
| Day History | Live Orders | INVENTORIED |
| Day History | Bills & Invoices | INVENTORIED |
| Day History | Kitchen & KOT | INVENTORIED |
| Day History | Customers CRM | INVENTORIED |
| Day History | Shift & Cash | INVENTORIED |
| Day History | Day History | INVENTORIED |
| Day History | POS Reports | INVENTORIED |
| Day History | Inventory & Stock | INVENTORIED |
| Day History | Settings | INVENTORIED |
| Day History | Fewer tools | INVENTORIED |
| Day History | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| Day History | Print Queue | INVENTORIED |
| Day History | Close Business Day | INVENTORIED |
| Day History | Today's Orders (0) | INVENTORIED |
| Day History | Day Details | INVENTORIED |
| Day History | Close Day | INVENTORIED |
| Day History | All Days | INVENTORIED |
| Day History | Today | INVENTORIED |
| Day History | Yesterday | INVENTORIED |
| Day History | Last 7 Days | INVENTORIED |
| Day History | Last 30 Days | INVENTORIED |
| Day History | This Month | INVENTORIED |
| Day History | View Day | INVENTORIED |
| Day History | Click to open Sales Reports | INVENTORIED |
| Day History | Click to view Live Orders | INVENTORIED |
| Day History | Click to open Floor Plan | INVENTORIED |
| Day History | Click to open Kitchen KOTs | INVENTORIED |
| POS Reports | Start fresh order | INVENTORIED |
| POS Reports | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| POS Reports | Sync now | INVENTORIED |
| POS Reports | Business Day & Shift Status — Click to manage | INVENTORIED |
| POS Reports | Notifications & System Events | INVENTORIED |
| POS Reports | Quick Help | INVENTORIED |
| POS Reports | Open JAMAN AI Assistant | INVENTORIED |
| POS Reports | User Profile & Session Options — All Systems OK | INVENTORIED |
| POS Reports | Billing | INVENTORIED |
| POS Reports | Orders | INVENTORIED |
| POS Reports | Tables | INVENTORIED |
| POS Reports | Collect | INVENTORIED |
| POS Reports | Billing / Menu | INVENTORIED |
| POS Reports | Floor & Tables | INVENTORIED |
| POS Reports | Live Orders | INVENTORIED |
| POS Reports | Bills & Invoices | INVENTORIED |
| POS Reports | Kitchen & KOT | INVENTORIED |
| POS Reports | Customers CRM | INVENTORIED |
| POS Reports | Shift & Cash | INVENTORIED |
| POS Reports | Day History | INVENTORIED |
| POS Reports | POS Reports | INVENTORIED |
| POS Reports | Inventory & Stock | INVENTORIED |
| POS Reports | Settings | INVENTORIED |
| POS Reports | Fewer tools | INVENTORIED |
| POS Reports | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| POS Reports | Print Queue | INVENTORIED |
| POS Reports | Preview full report document | INVENTORIED |
| POS Reports | Send report directly to configured POS report printer | INVENTORIED |
| POS Reports | Download direct PDF file without browser print dialogs | INVENTORIED |
| POS Reports | Export CSV | INVENTORIED |
| POS Reports | Today | INVENTORIED |
| POS Reports | Yesterday | INVENTORIED |
| POS Reports | 7 Days | INVENTORIED |
| POS Reports | 30 Days | INVENTORIED |
| POS Reports | This Month | INVENTORIED |
| POS Reports | This Year | INVENTORIED |
| POS Reports | Custom Date | INVENTORIED |
| POS Reports | Click to open Sales Reports | INVENTORIED |
| POS Reports | Click to view Live Orders | INVENTORIED |
| POS Reports | Click to open Floor Plan | INVENTORIED |
| POS Reports | Click to open Kitchen KOTs | INVENTORIED |
| Inventory & Stock | Start fresh order | INVENTORIED |
| Inventory & Stock | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| Inventory & Stock | Sync now | INVENTORIED |
| Inventory & Stock | Business Day & Shift Status — Click to manage | INVENTORIED |
| Inventory & Stock | Notifications & System Events | INVENTORIED |
| Inventory & Stock | Quick Help | INVENTORIED |
| Inventory & Stock | Open JAMAN AI Assistant | INVENTORIED |
| Inventory & Stock | User Profile & Session Options — All Systems OK | INVENTORIED |
| Inventory & Stock | Billing | INVENTORIED |
| Inventory & Stock | Orders | INVENTORIED |
| Inventory & Stock | Tables | INVENTORIED |
| Inventory & Stock | Collect | INVENTORIED |
| Inventory & Stock | Billing / Menu | INVENTORIED |
| Inventory & Stock | Floor & Tables | INVENTORIED |
| Inventory & Stock | Live Orders | INVENTORIED |
| Inventory & Stock | Bills & Invoices | INVENTORIED |
| Inventory & Stock | Kitchen & KOT | INVENTORIED |
| Inventory & Stock | Customers CRM | INVENTORIED |
| Inventory & Stock | Shift & Cash | INVENTORIED |
| Inventory & Stock | Day History | INVENTORIED |
| Inventory & Stock | POS Reports | INVENTORIED |
| Inventory & Stock | Inventory & Stock | INVENTORIED |
| Inventory & Stock | Settings | INVENTORIED |
| Inventory & Stock | Fewer tools | INVENTORIED |
| Inventory & Stock | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| Inventory & Stock | Print Queue | INVENTORIED |
| Inventory & Stock | All 100 | INVENTORIED |
| Inventory & Stock | Available 100 | INVENTORIED |
| Inventory & Stock | Unavailable 0 | INVENTORIED |
| Inventory & Stock | Low Stock 0 | INVENTORIED |
| Inventory & Stock | Out of Stock 0 | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 001 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 002 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 003 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 004 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 005 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 006 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 007 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 008 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 009 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 010 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 011 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 012 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 013 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 014 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 015 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 016 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 017 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 018 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 019 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 020 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 021 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 022 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 023 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 024 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 025 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 026 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 027 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 028 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 029 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 030 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 031 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 032 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 033 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 034 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 035 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 036 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 037 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 038 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 039 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 040 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 041 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 042 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 043 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 044 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 045 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 046 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 047 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 048 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 049 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 050 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 051 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 052 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 053 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 054 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 055 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 056 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 057 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 058 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 059 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 060 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 061 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 062 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 063 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 064 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 065 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 066 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 067 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 068 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 069 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 070 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 071 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 072 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 073 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 074 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 075 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 076 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 077 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 078 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 079 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 080 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 081 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 082 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 083 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 084 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 085 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 086 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 087 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 088 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 089 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 090 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 091 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 092 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 093 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 094 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 095 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 096 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 097 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 098 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 099 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Set UI Audit Dish 100 as unavailable for billing | INVENTORIED |
| Inventory & Stock | Click to open Sales Reports | INVENTORIED |
| Inventory & Stock | Click to view Live Orders | INVENTORIED |
| Inventory & Stock | Click to open Floor Plan | INVENTORIED |
| Inventory & Stock | Click to open Kitchen KOTs | INVENTORIED |
| Settings | Start fresh order | INVENTORIED |
| Settings | Search dishes, SKU, tables, bills, customers | INVENTORIED |
| Settings | Sync now | INVENTORIED |
| Settings | Business Day & Shift Status — Click to manage | INVENTORIED |
| Settings | Notifications & System Events | INVENTORIED |
| Settings | Quick Help | INVENTORIED |
| Settings | Open JAMAN AI Assistant | INVENTORIED |
| Settings | User Profile & Session Options — All Systems OK | INVENTORIED |
| Settings | Billing | INVENTORIED |
| Settings | Orders | INVENTORIED |
| Settings | Tables | INVENTORIED |
| Settings | Collect | INVENTORIED |
| Settings | Billing / Menu | INVENTORIED |
| Settings | Floor & Tables | INVENTORIED |
| Settings | Live Orders | INVENTORIED |
| Settings | Bills & Invoices | INVENTORIED |
| Settings | Kitchen & KOT | INVENTORIED |
| Settings | Customers CRM | INVENTORIED |
| Settings | Shift & Cash | INVENTORIED |
| Settings | Day History | INVENTORIED |
| Settings | POS Reports | INVENTORIED |
| Settings | Inventory & Stock | INVENTORIED |
| Settings | Settings | INVENTORIED |
| Settings | Fewer tools | INVENTORIED |
| Settings | JAMAN AI Assistant (Voice & Conversational POS Actions) | INVENTORIED |
| Settings | Print Queue | INVENTORIED |
| Settings | Staff practice + | INVENTORIED |
| Settings | Hardware & Printers | INVENTORIED |
| Settings | Reports & Design | INVENTORIED |
| Settings | Instant Bill | INVENTORIED |
| Settings | Local DB & Sync | INVENTORIED |
| Settings | Subscription & License | INVENTORIED |
| Settings | Pair Local Core | INVENTORIED |
| Settings | Connect | INVENTORIED |
| Settings | Clear and re-download | INVENTORIED |
| Settings | Use the restaurant default | DISABLED |
| Settings | Reset to 100% | INVENTORIED |
| Settings | (unnamed) | INVENTORIED |
| Settings | Low | INVENTORIED |
| Settings | Medium | INVENTORIED |
| Settings | High | INVENTORIED |
| Settings | Play Test Sound | INVENTORIED |
| Settings | 80mm | INVENTORIED |
| Settings | 58mm | INVENTORIED |
| Settings | Scan | INVENTORIED |
| Settings | Scan for connected physical & network printers | INVENTORIED |
| Settings | Click to open Sales Reports | INVENTORIED |
| Settings | Click to view Live Orders | INVENTORIED |
| Settings | Click to open Floor Plan | INVENTORIED |
| Settings | Click to open Kitchen KOTs | INVENTORIED |

## kiosk

| Page | Button / accessible label | Latest status |
| --- | --- | --- |

## captain

| Page | Button / accessible label | Latest status |
| --- | --- | --- |
| tables | Connection and alert settings | INVENTORIED |
| tables | Compose quick operational message to Kitchen, POS, or Manager | INVENTORIED |
| tables | Floor Notifications & Alerts | INVENTORIED |
| tables | U | INVENTORIED |
| tables | Dishes ready in kitchen waiting for pickup and delivery | INVENTORIED |
| tables | Tables asking for bill and settlement | INVENTORIED |
| tables | Kitchen orders exceeding 15 min preparation time | INVENTORIED |
| tables | Guest service requests: Water, Extra Plates, Cutlery, Cleaning | INVENTORIED |
| tables | Staff and Kitchen communications | INVENTORIED |
| tables | My Tables | INVENTORIED |
| tables | Active Orders | INVENTORIED |
| tables | Food Ready | INVENTORIED |
| tables | Messages | INVENTORIED |
| tables | Open More Tools: Live KOTs, Guest Requests, Diners CRM, Shift Stats, Settings | INVENTORIED |
| tables | Guest requests · 2 | INVENTORIED |
| tables | MY TABLES 0 Tables | INVENTORIED |
| tables | SEATED / DINING 0 Active | INVENTORIED |
| tables | FOOD READY 0 Deliver | INVENTORIED |
| tables | BILL REQUESTED 0 Billing | INVENTORIED |
| tables | AVAILABLE TABLES 1 of 1 | INVENTORIED |
| tables | All Sections | INVENTORIED |
| tables | UI Dining Hall | INVENTORIED |
| tables | All Floor Tables | INVENTORIED |
| tables | Seated & Dining | INVENTORIED |
| tables | Bill Requested | INVENTORIED |
| tables | OPEN TABLE | INVENTORIED |
| tables | Open JAMAN AI Floor Intelligence Assistant | INVENTORIED |
| tables | Accept — On My Way | INVENTORIED |
| Active Orders | Connection and alert settings | INVENTORIED |
| Active Orders | Compose quick operational message to Kitchen, POS, or Manager | INVENTORIED |
| Active Orders | Floor Notifications & Alerts | INVENTORIED |
| Active Orders | U | INVENTORIED |
| Active Orders | Dishes ready in kitchen waiting for pickup and delivery | INVENTORIED |
| Active Orders | Tables asking for bill and settlement | INVENTORIED |
| Active Orders | Kitchen orders exceeding 15 min preparation time | INVENTORIED |
| Active Orders | Guest service requests: Water, Extra Plates, Cutlery, Cleaning | INVENTORIED |
| Active Orders | Staff and Kitchen communications | INVENTORIED |
| Active Orders | My Tables | INVENTORIED |
| Active Orders | Active Orders | INVENTORIED |
| Active Orders | Food Ready | INVENTORIED |
| Active Orders | Messages | INVENTORIED |
| Active Orders | Open More Tools: Live KOTs, Guest Requests, Diners CRM, Shift Stats, Settings | INVENTORIED |
| Active Orders | Open JAMAN AI Floor Intelligence Assistant | INVENTORIED |
| Food Ready | Connection and alert settings | INVENTORIED |
| Food Ready | Compose quick operational message to Kitchen, POS, or Manager | INVENTORIED |
| Food Ready | Floor Notifications & Alerts | INVENTORIED |
| Food Ready | U | INVENTORIED |
| Food Ready | Dishes ready in kitchen waiting for pickup and delivery | INVENTORIED |
| Food Ready | Tables asking for bill and settlement | INVENTORIED |
| Food Ready | Kitchen orders exceeding 15 min preparation time | INVENTORIED |
| Food Ready | Guest service requests: Water, Extra Plates, Cutlery, Cleaning | INVENTORIED |
| Food Ready | Staff and Kitchen communications | INVENTORIED |
| Food Ready | My Tables | INVENTORIED |
| Food Ready | Active Orders | INVENTORIED |
| Food Ready | Food Ready | INVENTORIED |
| Food Ready | Messages | INVENTORIED |
| Food Ready | Open More Tools: Live KOTs, Guest Requests, Diners CRM, Shift Stats, Settings | INVENTORIED |
| Food Ready | Open JAMAN AI Floor Intelligence Assistant | INVENTORIED |
| Messages | Connection and alert settings | INVENTORIED |
| Messages | Compose quick operational message to Kitchen, POS, or Manager | INVENTORIED |
| Messages | Floor Notifications & Alerts | INVENTORIED |
| Messages | U | INVENTORIED |
| Messages | Dishes ready in kitchen waiting for pickup and delivery | INVENTORIED |
| Messages | Tables asking for bill and settlement | INVENTORIED |
| Messages | Kitchen orders exceeding 15 min preparation time | INVENTORIED |
| Messages | Guest service requests: Water, Extra Plates, Cutlery, Cleaning | INVENTORIED |
| Messages | Staff and Kitchen communications | INVENTORIED |
| Messages | My Tables | INVENTORIED |
| Messages | Active Orders | INVENTORIED |
| Messages | Food Ready | INVENTORIED |
| Messages | Messages | INVENTORIED |
| Messages | Open More Tools: Live KOTs, Guest Requests, Diners CRM, Shift Stats, Settings | INVENTORIED |
| Messages | Active Unread | INVENTORIED |
| Messages | All History | INVENTORIED |
| Messages | Resolved | INVENTORIED |
| Messages | 🍳 Kitchen | INVENTORIED |
| Messages | 💻 Counter POS | INVENTORIED |
| Messages | 👔 Manager | INVENTORIED |
| Messages | 📢 All Staff | INVENTORIED |
| Messages | ⚡ Customer waiting for order | INVENTORIED |
| Messages | ⚡ Extra water required | INVENTORIED |
| Messages | ⚡ Extra plates required | INVENTORIED |
| Messages | ⚡ Extra cutlery required | INVENTORIED |
| Messages | ⚡ Tissue / Napkins required | INVENTORIED |
| Messages | ⚡ Table cleaning required | INVENTORIED |
| Messages | ⚡ Food taking too long | INVENTORIED |
| Messages | ⚡ Customer complaint regarding food | INVENTORIED |
| Messages | ⚡ Manager assistance required at table | INVENTORIED |
| Messages | ⚡ Bill clarification required | INVENTORIED |
| Messages | ⚡ Item unavailable in kitchen | INVENTORIED |
| Messages | ⚡ Special customer allergy / diet request | INVENTORIED |
| Messages | ⚡ Kitchen clarification needed | INVENTORIED |
| Messages | ⚡ Order modification requested by guest | INVENTORIED |
| Messages | Send Message Broadcast | INVENTORIED |
| Messages | Open JAMAN AI Floor Intelligence Assistant | INVENTORIED |
| Live KOT Tickets | Connection and alert settings | INVENTORIED |
| Live KOT Tickets | Compose quick operational message to Kitchen, POS, or Manager | INVENTORIED |
| Live KOT Tickets | Floor Notifications & Alerts | INVENTORIED |
| Live KOT Tickets | U | INVENTORIED |
| Live KOT Tickets | Dishes ready in kitchen waiting for pickup and delivery | INVENTORIED |
| Live KOT Tickets | Tables asking for bill and settlement | INVENTORIED |
| Live KOT Tickets | Kitchen orders exceeding 15 min preparation time | INVENTORIED |
| Live KOT Tickets | Guest service requests: Water, Extra Plates, Cutlery, Cleaning | INVENTORIED |
| Live KOT Tickets | Staff and Kitchen communications | INVENTORIED |
| Live KOT Tickets | My Tables | INVENTORIED |
| Live KOT Tickets | Active Orders | INVENTORIED |
| Live KOT Tickets | Food Ready | INVENTORIED |
| Live KOT Tickets | Messages | INVENTORIED |
| Live KOT Tickets | Open More Tools: Live KOTs, Guest Requests, Diners CRM, Shift Stats, Settings | INVENTORIED |
| Live KOT Tickets | All KOTs | INVENTORIED |
| Live KOT Tickets | 🔴 Delayed (>15m) | INVENTORIED |
| Live KOT Tickets | Cooking | INVENTORIED |
| Live KOT Tickets | Ready to serve | INVENTORIED |
| Live KOT Tickets | Served | INVENTORIED |
| Live KOT Tickets | Open JAMAN AI Floor Intelligence Assistant | INVENTORIED |
| Guest Service Requests | Connection and alert settings | INVENTORIED |
| Guest Service Requests | Compose quick operational message to Kitchen, POS, or Manager | INVENTORIED |
| Guest Service Requests | Floor Notifications & Alerts | INVENTORIED |
| Guest Service Requests | U | INVENTORIED |
| Guest Service Requests | Dishes ready in kitchen waiting for pickup and delivery | INVENTORIED |
| Guest Service Requests | Tables asking for bill and settlement | INVENTORIED |
| Guest Service Requests | Kitchen orders exceeding 15 min preparation time | INVENTORIED |
| Guest Service Requests | Guest service requests: Water, Extra Plates, Cutlery, Cleaning | INVENTORIED |
| Guest Service Requests | Staff and Kitchen communications | INVENTORIED |
| Guest Service Requests | My Tables | INVENTORIED |
| Guest Service Requests | Active Orders | INVENTORIED |
| Guest Service Requests | Food Ready | INVENTORIED |
| Guest Service Requests | Messages | INVENTORIED |
| Guest Service Requests | Open More Tools: Live KOTs, Guest Requests, Diners CRM, Shift Stats, Settings | INVENTORIED |
| Guest Service Requests | + Log Guest Request | INVENTORIED |
| Guest Service Requests | Open JAMAN AI Floor Intelligence Assistant | INVENTORIED |
| Shift & Performance | Connection and alert settings | INVENTORIED |
| Shift & Performance | Compose quick operational message to Kitchen, POS, or Manager | INVENTORIED |
| Shift & Performance | Floor Notifications & Alerts | INVENTORIED |
| Shift & Performance | U | INVENTORIED |
| Shift & Performance | Dishes ready in kitchen waiting for pickup and delivery | INVENTORIED |
| Shift & Performance | Tables asking for bill and settlement | INVENTORIED |
| Shift & Performance | Kitchen orders exceeding 15 min preparation time | INVENTORIED |
| Shift & Performance | Guest service requests: Water, Extra Plates, Cutlery, Cleaning | INVENTORIED |
| Shift & Performance | Staff and Kitchen communications | INVENTORIED |
| Shift & Performance | My Tables | INVENTORIED |
| Shift & Performance | Active Orders | INVENTORIED |
| Shift & Performance | Food Ready | INVENTORIED |
| Shift & Performance | Messages | INVENTORIED |
| Shift & Performance | Open More Tools: Live KOTs, Guest Requests, Diners CRM, Shift Stats, Settings | INVENTORIED |
| Shift & Performance | End Shift & Sign Out | INVENTORIED |
| Shift & Performance | Open JAMAN AI Floor Intelligence Assistant | INVENTORIED |

## kds

| Page | Button / accessible label | Latest status |
| --- | --- | --- |
| active | Open JAMAN AI Kitchen Intelligence | INVENTORIED |
| active | All stations | INVENTORIED |
| active | (unnamed) | INVENTORIED |
| active | Switch station or log out | INVENTORIED |
| active | ACTIVE 0 | INVENTORIED |
| active | COOKING 0 | INVENTORIED |
| active | READY 0 | INVENTORIED |
| active | SERVED 0 | INVENTORIED |
| active | EXPO (PASS) 0 | INVENTORIED |
| Cooking | Open JAMAN AI Kitchen Intelligence | INVENTORIED |
| Cooking | All stations | INVENTORIED |
| Cooking | (unnamed) | INVENTORIED |
| Cooking | Switch station or log out | INVENTORIED |
| Cooking | ACTIVE 0 | INVENTORIED |
| Cooking | COOKING 0 | INVENTORIED |
| Cooking | READY 0 | INVENTORIED |
| Cooking | SERVED 0 | INVENTORIED |
| Cooking | EXPO (PASS) 0 | INVENTORIED |
| Ready | Open JAMAN AI Kitchen Intelligence | INVENTORIED |
| Ready | All stations | INVENTORIED |
| Ready | (unnamed) | INVENTORIED |
| Ready | Switch station or log out | INVENTORIED |
| Ready | ACTIVE 0 | INVENTORIED |
| Ready | COOKING 0 | INVENTORIED |
| Ready | READY 0 | INVENTORIED |
| Ready | SERVED 0 | INVENTORIED |
| Ready | EXPO (PASS) 0 | INVENTORIED |
| Served | Open JAMAN AI Kitchen Intelligence | INVENTORIED |
| Served | All stations | INVENTORIED |
| Served | (unnamed) | INVENTORIED |
| Served | Switch station or log out | INVENTORIED |
| Served | ACTIVE 0 | INVENTORIED |
| Served | COOKING 0 | INVENTORIED |
| Served | READY 0 | INVENTORIED |
| Served | SERVED 0 | INVENTORIED |
| Served | EXPO (PASS) 0 | INVENTORIED |
| Expo | Open JAMAN AI Kitchen Intelligence | INVENTORIED |
| Expo | All stations | INVENTORIED |
| Expo | (unnamed) | INVENTORIED |
| Expo | Switch station or log out | INVENTORIED |
| Expo | ACTIVE 0 | INVENTORIED |
| Expo | COOKING 0 | INVENTORIED |
| Expo | READY 0 | INVENTORIED |
| Expo | SERVED 0 | INVENTORIED |
| Expo | EXPO (PASS) 0 | INVENTORIED |
| Active | Open JAMAN AI Kitchen Intelligence | INVENTORIED |
| Active | All stations | INVENTORIED |
| Active | (unnamed) | INVENTORIED |
| Active | Switch station or log out | INVENTORIED |
| Active | ACTIVE 0 | INVENTORIED |
| Active | COOKING 0 | INVENTORIED |
| Active | READY 0 | INVENTORIED |
| Active | SERVED 0 | INVENTORIED |
| Active | EXPO (PASS) 0 | INVENTORIED |

## super

| Page | Button / accessible label | Latest status |
| --- | --- | --- |
| / | PLATFORM CONTROL CENTER | INVENTORIED |
| / | BUSINESS MANAGEMENT | INVENTORIED |
| / | SAAS MANAGEMENT | INVENTORIED |
| / | OPERATIONS & MDM | INVENTORIED |
| / | SECURITY & REPORTS | INVENTORIED |
| / | ACCOUNT | INVENTORIED |
| / | Notifications | INVENTORIED |
| / | Toggle dark mode | INVENTORIED |
| / | Log out of Super Admin | INVENTORIED |
| /restaurant-health | PLATFORM CONTROL CENTER | INVENTORIED |
| /restaurant-health | BUSINESS MANAGEMENT | INVENTORIED |
| /restaurant-health | SAAS MANAGEMENT | INVENTORIED |
| /restaurant-health | OPERATIONS & MDM | INVENTORIED |
| /restaurant-health | SECURITY & REPORTS | INVENTORIED |
| /restaurant-health | ACCOUNT | INVENTORIED |
| /restaurant-health | Notifications | INVENTORIED |
| /restaurant-health | Toggle dark mode | INVENTORIED |
| /restaurant-health | Log out of Super Admin | INVENTORIED |
| /restaurant-health | Refresh | INVENTORIED |
| /restaurant-health | All | INVENTORIED |
| /restaurant-health | At risk | INVENTORIED |
| /restaurant-health | Watch | INVENTORIED |
| /restaurant-health | Healthy | INVENTORIED |
| /announcements | PLATFORM CONTROL CENTER | INVENTORIED |
| /announcements | BUSINESS MANAGEMENT | INVENTORIED |
| /announcements | SAAS MANAGEMENT | INVENTORIED |
| /announcements | OPERATIONS & MDM | INVENTORIED |
| /announcements | SECURITY & REPORTS | INVENTORIED |
| /announcements | ACCOUNT | INVENTORIED |
| /announcements | Notifications | INVENTORIED |
| /announcements | Toggle dark mode | INVENTORIED |
| /announcements | Log out of Super Admin | INVENTORIED |
| /announcements | + New Announcement | INVENTORIED |
| /status-history | PLATFORM CONTROL CENTER | INVENTORIED |
| /status-history | BUSINESS MANAGEMENT | INVENTORIED |
| /status-history | SAAS MANAGEMENT | INVENTORIED |
| /status-history | OPERATIONS & MDM | INVENTORIED |
| /status-history | SECURITY & REPORTS | INVENTORIED |
| /status-history | ACCOUNT | INVENTORIED |
| /status-history | Notifications | INVENTORIED |
| /status-history | Toggle dark mode | INVENTORIED |
| /status-history | Log out of Super Admin | INVENTORIED |
| /status-history | + Open Incident | INVENTORIED |
| /margins | PLATFORM CONTROL CENTER | INVENTORIED |
| /margins | BUSINESS MANAGEMENT | INVENTORIED |
| /margins | SAAS MANAGEMENT | INVENTORIED |
| /margins | OPERATIONS & MDM | INVENTORIED |
| /margins | SECURITY & REPORTS | INVENTORIED |
| /margins | ACCOUNT | INVENTORIED |
| /margins | Notifications | INVENTORIED |
| /margins | Toggle dark mode | INVENTORIED |
| /margins | Log out of Super Admin | INVENTORIED |
| /margins | Save | INVENTORIED |
| /restaurants | PLATFORM CONTROL CENTER | INVENTORIED |
| /restaurants | BUSINESS MANAGEMENT | INVENTORIED |
| /restaurants | SAAS MANAGEMENT | INVENTORIED |
| /restaurants | OPERATIONS & MDM | INVENTORIED |
| /restaurants | SECURITY & REPORTS | INVENTORIED |
| /restaurants | ACCOUNT | INVENTORIED |
| /restaurants | Notifications | INVENTORIED |
| /restaurants | Toggle dark mode | INVENTORIED |
| /restaurants | Log out of Super Admin | INVENTORIED |
| /restaurants | Export CSV | INVENTORIED |
| /restaurants | + Quick create | INVENTORIED |
| /restaurants | Onboard Restaurant | INVENTORIED |
| /restaurants | All 2 | INVENTORIED |
| /restaurants | Active 2 | INVENTORIED |
| /restaurants | Suspended 0 | INVENTORIED |
| /restaurants | Trial 0 | INVENTORIED |
| /restaurants | No Plan | INVENTORIED |
| /restaurants | SaaS Cards View | INVENTORIED |
| /restaurants | Tabular View | INVENTORIED |
| /restaurants | More actions | INVENTORIED |
| /owners | PLATFORM CONTROL CENTER | INVENTORIED |
| /owners | BUSINESS MANAGEMENT | INVENTORIED |
| /owners | SAAS MANAGEMENT | INVENTORIED |
| /owners | OPERATIONS & MDM | INVENTORIED |
| /owners | SECURITY & REPORTS | INVENTORIED |
| /owners | ACCOUNT | INVENTORIED |
| /owners | Notifications | INVENTORIED |
| /owners | Toggle dark mode | INVENTORIED |
| /owners | Log out of Super Admin | INVENTORIED |
| /owners | Export CSV | INVENTORIED |
| /owners | All 2 | INVENTORIED |
| /owners | Active 2 | INVENTORIED |
| /owners | Pending 0 | INVENTORIED |
| /owners | Suspended 0 | INVENTORIED |
| /owners | More actions | INVENTORIED |
| /branches | PLATFORM CONTROL CENTER | INVENTORIED |
| /branches | BUSINESS MANAGEMENT | INVENTORIED |
| /branches | SAAS MANAGEMENT | INVENTORIED |
| /branches | OPERATIONS & MDM | INVENTORIED |
| /branches | SECURITY & REPORTS | INVENTORIED |
| /branches | ACCOUNT | INVENTORIED |
| /branches | Notifications | INVENTORIED |
| /branches | Toggle dark mode | INVENTORIED |
| /branches | Log out of Super Admin | INVENTORIED |
| /branches | Add Branch | INVENTORIED |
| /branches | All 4 | INVENTORIED |
| /branches | Active 4 | INVENTORIED |
| /branches | Inactive 0 | INVENTORIED |
| /branches | More actions | INVENTORIED |
| /branches | Previous page | DISABLED |
| /branches | Next page | DISABLED |
| /saas-management | PLATFORM CONTROL CENTER | INVENTORIED |
| /saas-management | BUSINESS MANAGEMENT | INVENTORIED |
| /saas-management | SAAS MANAGEMENT | INVENTORIED |
| /saas-management | OPERATIONS & MDM | INVENTORIED |
| /saas-management | SECURITY & REPORTS | INVENTORIED |
| /saas-management | ACCOUNT | INVENTORIED |
| /saas-management | Notifications | INVENTORIED |
| /saas-management | Toggle dark mode | INVENTORIED |
| /saas-management | Log out of Super Admin | INVENTORIED |
| /plans | PLATFORM CONTROL CENTER | INVENTORIED |
| /plans | BUSINESS MANAGEMENT | INVENTORIED |
| /plans | SAAS MANAGEMENT | INVENTORIED |
| /plans | OPERATIONS & MDM | INVENTORIED |
| /plans | SECURITY & REPORTS | INVENTORIED |
| /plans | ACCOUNT | INVENTORIED |
| /plans | Notifications | INVENTORIED |
| /plans | Toggle dark mode | INVENTORIED |
| /plans | Log out of Super Admin | INVENTORIED |
| /plans | Create Plan | INVENTORIED |
| /plans | All Plans 5 | INVENTORIED |
| /plans | Active 5 | INVENTORIED |
| /plans | Inactive 0 | INVENTORIED |
| /plans | Edit | INVENTORIED |
| /plans | Deactivate | INVENTORIED |
| /qr-ordering | PLATFORM CONTROL CENTER | INVENTORIED |
| /qr-ordering | BUSINESS MANAGEMENT | INVENTORIED |
| /qr-ordering | SAAS MANAGEMENT | INVENTORIED |
| /qr-ordering | OPERATIONS & MDM | INVENTORIED |
| /qr-ordering | SECURITY & REPORTS | INVENTORIED |
| /qr-ordering | ACCOUNT | INVENTORIED |
| /qr-ordering | Notifications | INVENTORIED |
| /qr-ordering | Toggle dark mode | INVENTORIED |
| /qr-ordering | Log out of Super Admin | INVENTORIED |
| /qr-ordering | Refresh fleet | INVENTORIED |
| /qr-ordering | All 2 | INVENTORIED |
| /qr-ordering | Active 2 | INVENTORIED |
| /qr-ordering | Disabled 0 | INVENTORIED |
| /qr-ordering | Limit reached 0 | INVENTORIED |
| /qr-ordering | Not entitled 0 | INVENTORIED |
| /qr-ordering | UI Audit Restaurant A | INVENTORIED |
| /qr-ordering | View | INVENTORIED |
| /qr-ordering | Manage | INVENTORIED |
| /qr-ordering | Disable QR ordering | INVENTORIED |
| /qr-ordering | UI Audit Restaurant B | INVENTORIED |
| /whatsapp-ordering | PLATFORM CONTROL CENTER | INVENTORIED |
| /whatsapp-ordering | BUSINESS MANAGEMENT | INVENTORIED |
| /whatsapp-ordering | SAAS MANAGEMENT | INVENTORIED |
| /whatsapp-ordering | OPERATIONS & MDM | INVENTORIED |
| /whatsapp-ordering | SECURITY & REPORTS | INVENTORIED |
| /whatsapp-ordering | ACCOUNT | INVENTORIED |
| /whatsapp-ordering | Notifications | INVENTORIED |
| /whatsapp-ordering | Toggle dark mode | INVENTORIED |
| /whatsapp-ordering | Log out of Super Admin | INVENTORIED |
| /whatsapp-ordering | Refresh | INVENTORIED |
| /ai-assistant | PLATFORM CONTROL CENTER | INVENTORIED |
| /ai-assistant | BUSINESS MANAGEMENT | INVENTORIED |
| /ai-assistant | SAAS MANAGEMENT | INVENTORIED |
| /ai-assistant | OPERATIONS & MDM | INVENTORIED |
| /ai-assistant | SECURITY & REPORTS | INVENTORIED |
| /ai-assistant | ACCOUNT | INVENTORIED |
| /ai-assistant | Notifications | INVENTORIED |
| /ai-assistant | Toggle dark mode | INVENTORIED |
| /ai-assistant | Log out of Super Admin | INVENTORIED |
| /ai-assistant | Add Custom Query | INVENTORIED |
| /ai-assistant | Save Global Thresholds | INVENTORIED |
| /ai-assistant | All Categories (32) | INVENTORIED |
| /ai-assistant | Today's Pulse (7) | INVENTORIED |
| /ai-assistant | Sales & Finance (4) | INVENTORIED |
| /ai-assistant | Payment Split (3) | INVENTORIED |
| /ai-assistant | Order Pipeline (4) | INVENTORIED |
| /ai-assistant | Kitchen & KOT (3) | INVENTORIED |
| /ai-assistant | Dining Tables (2) | INVENTORIED |
| /ai-assistant | Menu Analytics (3) | INVENTORIED |
| /ai-assistant | Stock & Inventory (2) | INVENTORIED |
| /ai-assistant | Customer CRM (1) | INVENTORIED |
| /ai-assistant | Staff & Shift (2) | INVENTORIED |
| /ai-assistant | ✨ Business Insights (1) | INVENTORIED |
| /ai-assistant | Edit Question | INVENTORIED |
| /catalog | PLATFORM CONTROL CENTER | INVENTORIED |
| /catalog | BUSINESS MANAGEMENT | INVENTORIED |
| /catalog | SAAS MANAGEMENT | INVENTORIED |
| /catalog | OPERATIONS & MDM | INVENTORIED |
| /catalog | SECURITY & REPORTS | INVENTORIED |
| /catalog | ACCOUNT | INVENTORIED |
| /catalog | Notifications | INVENTORIED |
| /catalog | Toggle dark mode | INVENTORIED |
| /catalog | Log out of Super Admin | INVENTORIED |
| /catalog | Last updated just now | INVENTORIED |
| /catalog | Import authentic preloaded Indian starter dishes and recipes | INVENTORIED |
| /catalog | Manage Categories | INVENTORIED |
| /catalog | Add Master Dish | INVENTORIED |
| /catalog | All Categories 0 | INVENTORIED |
| /catalog | SaaS Cards View | INVENTORIED |
| /catalog | Compact Table View | INVENTORIED |
| /catalog | Import Starter Library | INVENTORIED |
| /subscriptions | PLATFORM CONTROL CENTER | INVENTORIED |
| /subscriptions | BUSINESS MANAGEMENT | INVENTORIED |
| /subscriptions | SAAS MANAGEMENT | INVENTORIED |
| /subscriptions | OPERATIONS & MDM | INVENTORIED |
| /subscriptions | SECURITY & REPORTS | INVENTORIED |
| /subscriptions | ACCOUNT | INVENTORIED |
| /subscriptions | Notifications | INVENTORIED |
| /subscriptions | Toggle dark mode | INVENTORIED |
| /subscriptions | Log out of Super Admin | INVENTORIED |
| /subscriptions | Assign Subscription | INVENTORIED |
| /subscriptions | All 6 | INVENTORIED |
| /subscriptions | Active 6 | INVENTORIED |
| /subscriptions | Trial 0 | INVENTORIED |
| /subscriptions | Suspended 0 | INVENTORIED |
| /subscriptions | Renew | INVENTORIED |
| /subscriptions | Change Tier | INVENTORIED |
| /subscriptions | Suspend | INVENTORIED |
| /billing | PLATFORM CONTROL CENTER | INVENTORIED |
| /billing | BUSINESS MANAGEMENT | INVENTORIED |
| /billing | SAAS MANAGEMENT | INVENTORIED |
| /billing | OPERATIONS & MDM | INVENTORIED |
| /billing | SECURITY & REPORTS | INVENTORIED |
| /billing | ACCOUNT | INVENTORIED |
| /billing | Notifications | INVENTORIED |
| /billing | Toggle dark mode | INVENTORIED |
| /billing | Log out of Super Admin | INVENTORIED |
| /billing | Renewal invoices are also issued automatically; this runs the scan right now | INVENTORIED |
| /billing | Export CSV | DISABLED |
| /billing | Issue Invoice | INVENTORIED |
| /billing | Who owes | INVENTORIED |
| /billing | All invoices | INVENTORIED |
| /billing | Filters | INVENTORIED |
| /billing | View invoices | INVENTORIED |
| /billing | Previous page | DISABLED |
| /billing | Next page | DISABLED |
| /entitlements | PLATFORM CONTROL CENTER | INVENTORIED |
| /entitlements | BUSINESS MANAGEMENT | INVENTORIED |
| /entitlements | SAAS MANAGEMENT | INVENTORIED |
| /entitlements | OPERATIONS & MDM | INVENTORIED |
| /entitlements | SECURITY & REPORTS | INVENTORIED |
| /entitlements | ACCOUNT | INVENTORIED |
| /entitlements | Notifications | INVENTORIED |
| /entitlements | Toggle dark mode | INVENTORIED |
| /entitlements | Log out of Super Admin | INVENTORIED |
| /entitlements | All Modules | INVENTORIED |
| /entitlements | 1. POS & Fast Billing | INVENTORIED |
| /entitlements | 2. Payments & Cash Drawer | INVENTORIED |
| /entitlements | 3. Table & Floor Management | INVENTORIED |
| /entitlements | 4. Kitchen, KOT & KDS | INVENTORIED |
| /entitlements | 5. Menu & Inventory Management | INVENTORIED |
| /entitlements | 6. Reports, GST & Administration | INVENTORIED |
| /entitlements | 7. Connected Restaurant Ecosystem | INVENTORIED |
| /feature-catalog | PLATFORM CONTROL CENTER | INVENTORIED |
| /feature-catalog | BUSINESS MANAGEMENT | INVENTORIED |
| /feature-catalog | SAAS MANAGEMENT | INVENTORIED |
| /feature-catalog | OPERATIONS & MDM | INVENTORIED |
| /feature-catalog | SECURITY & REPORTS | INVENTORIED |
| /feature-catalog | ACCOUNT | INVENTORIED |
| /feature-catalog | Notifications | INVENTORIED |
| /feature-catalog | Toggle dark mode | INVENTORIED |
| /feature-catalog | Log out of Super Admin | INVENTORIED |
| /feature-catalog | + New Category | INVENTORIED |
| /feature-catalog | + New Feature | INVENTORIED |
| /feature-catalog | Edit Category | INVENTORIED |
| /feature-catalog | Edit | INVENTORIED |
| /feature-catalog | Deactivate | INVENTORIED |
| /feature-catalog | Delete | INVENTORIED |
| /reports | PLATFORM CONTROL CENTER | INVENTORIED |
| /reports | BUSINESS MANAGEMENT | INVENTORIED |
| /reports | SAAS MANAGEMENT | INVENTORIED |
| /reports | OPERATIONS & MDM | INVENTORIED |
| /reports | SECURITY & REPORTS | INVENTORIED |
| /reports | ACCOUNT | INVENTORIED |
| /reports | Notifications | INVENTORIED |
| /reports | Toggle dark mode | INVENTORIED |
| /reports | Log out of Super Admin | INVENTORIED |
| /reports | Export REVENUE CSV | INVENTORIED |
| /reports | Revenue Analytics | INVENTORIED |
| /reports | Restaurant Cohorts | INVENTORIED |
| /reports | Device Telemetry | INVENTORIED |
| /reports | Plan Distribution | INVENTORIED |
| /applications | PLATFORM CONTROL CENTER | INVENTORIED |
| /applications | BUSINESS MANAGEMENT | INVENTORIED |
| /applications | SAAS MANAGEMENT | INVENTORIED |
| /applications | OPERATIONS & MDM | INVENTORIED |
| /applications | SECURITY & REPORTS | INVENTORIED |
| /applications | ACCOUNT | INVENTORIED |
| /applications | Notifications | INVENTORIED |
| /applications | Toggle dark mode | INVENTORIED |
| /applications | Log out of Super Admin | INVENTORIED |
| /applications | Publish Version | INVENTORIED |
| /applications | Toggle Release History | INVENTORIED |
| /activation-keys | PLATFORM CONTROL CENTER | INVENTORIED |
| /activation-keys | BUSINESS MANAGEMENT | INVENTORIED |
| /activation-keys | SAAS MANAGEMENT | INVENTORIED |
| /activation-keys | OPERATIONS & MDM | INVENTORIED |
| /activation-keys | SECURITY & REPORTS | INVENTORIED |
| /activation-keys | ACCOUNT | INVENTORIED |
| /activation-keys | Notifications | INVENTORIED |
| /activation-keys | Toggle dark mode | INVENTORIED |
| /activation-keys | Log out of Super Admin | INVENTORIED |
| /activation-keys | Export CSV | DISABLED |
| /activation-keys | Generate Key | INVENTORIED |
| /activation-keys | By restaurant | INVENTORIED |
| /activation-keys | All keys | INVENTORIED |
| /activation-keys | View keys | INVENTORIED |
| /activation-keys | Previous page | DISABLED |
| /activation-keys | Next page | DISABLED |
| /payment-connections | PLATFORM CONTROL CENTER | INVENTORIED |
| /payment-connections | BUSINESS MANAGEMENT | INVENTORIED |
| /payment-connections | SAAS MANAGEMENT | INVENTORIED |
| /payment-connections | OPERATIONS & MDM | INVENTORIED |
| /payment-connections | SECURITY & REPORTS | INVENTORIED |
| /payment-connections | ACCOUNT | INVENTORIED |
| /payment-connections | Notifications | INVENTORIED |
| /payment-connections | Toggle dark mode | INVENTORIED |
| /payment-connections | Log out of Super Admin | INVENTORIED |
| /payment-connections | Save | INVENTORIED |
| /payment-connections | All 0 | INVENTORIED |
| /payment-connections | Pending Review | INVENTORIED |
| /payment-connections | Active | INVENTORIED |
| /payment-connections | Suspended | INVENTORIED |
| /payment-connections | Disconnected | INVENTORIED |
| /platform-payments | PLATFORM CONTROL CENTER | INVENTORIED |
| /platform-payments | BUSINESS MANAGEMENT | INVENTORIED |
| /platform-payments | SAAS MANAGEMENT | INVENTORIED |
| /platform-payments | OPERATIONS & MDM | INVENTORIED |
| /platform-payments | SECURITY & REPORTS | INVENTORIED |
| /platform-payments | ACCOUNT | INVENTORIED |
| /platform-payments | Notifications | INVENTORIED |
| /platform-payments | Toggle dark mode | INVENTORIED |
| /platform-payments | Log out of Super Admin | INVENTORIED |
| /platform-payments | Show statement | INVENTORIED |
| /payouts | PLATFORM CONTROL CENTER | INVENTORIED |
| /payouts | BUSINESS MANAGEMENT | INVENTORIED |
| /payouts | SAAS MANAGEMENT | INVENTORIED |
| /payouts | OPERATIONS & MDM | INVENTORIED |
| /payouts | SECURITY & REPORTS | INVENTORIED |
| /payouts | ACCOUNT | INVENTORIED |
| /payouts | Notifications | INVENTORIED |
| /payouts | Toggle dark mode | INVENTORIED |
| /payouts | Log out of Super Admin | INVENTORIED |
| /payouts | Run EOD batch now | INVENTORIED |
| /payouts | All | INVENTORIED |
| /payouts | Pending | INVENTORIED |
| /payouts | On hold | INVENTORIED |
| /payouts | Paid | INVENTORIED |
| /devices | PLATFORM CONTROL CENTER | INVENTORIED |
| /devices | BUSINESS MANAGEMENT | INVENTORIED |
| /devices | SAAS MANAGEMENT | INVENTORIED |
| /devices | OPERATIONS & MDM | INVENTORIED |
| /devices | SECURITY & REPORTS | INVENTORIED |
| /devices | ACCOUNT | INVENTORIED |
| /devices | Notifications | INVENTORIED |
| /devices | Toggle dark mode | INVENTORIED |
| /devices | Log out of Super Admin | INVENTORIED |
| /devices | Refresh | INVENTORIED |
| /devices | Export CSV | DISABLED |
| /devices | ONLINE 1 | INVENTORIED |
| /devices | DEGRADED 4 | INVENTORIED |
| /devices | OFFLINE 0 | INVENTORIED |
| /devices | NEVER SEEN 0 | INVENTORIED |
| /devices | REVOKED 0 | INVENTORIED |
| /devices | MDM LOCKED — | INVENTORIED |
| /devices | By restaurant | INVENTORIED |
| /devices | Needs attention | INVENTORIED |
| /devices | All devices | INVENTORIED |
| /devices | View 5 terminals | INVENTORIED |
| /devices | Previous page | DISABLED |
| /devices | Next page | DISABLED |
| /sync-monitor | PLATFORM CONTROL CENTER | INVENTORIED |
| /sync-monitor | BUSINESS MANAGEMENT | INVENTORIED |
| /sync-monitor | SAAS MANAGEMENT | INVENTORIED |
| /sync-monitor | OPERATIONS & MDM | INVENTORIED |
| /sync-monitor | SECURITY & REPORTS | INVENTORIED |
| /sync-monitor | ACCOUNT | INVENTORIED |
| /sync-monitor | Notifications | INVENTORIED |
| /sync-monitor | Toggle dark mode | INVENTORIED |
| /sync-monitor | Log out of Super Admin | INVENTORIED |
| /sync-monitor | Refresh | INVENTORIED |
| /sync-monitor | Live Sync Event Stream (0) | INVENTORIED |
| /sync-monitor | Sync Conflict Inspector (0 Active) | INVENTORIED |
| /backups | PLATFORM CONTROL CENTER | INVENTORIED |
| /backups | BUSINESS MANAGEMENT | INVENTORIED |
| /backups | SAAS MANAGEMENT | INVENTORIED |
| /backups | OPERATIONS & MDM | INVENTORIED |
| /backups | SECURITY & REPORTS | INVENTORIED |
| /backups | ACCOUNT | INVENTORIED |
| /backups | Notifications | INVENTORIED |
| /backups | Toggle dark mode | INVENTORIED |
| /backups | Log out of Super Admin | INVENTORIED |
| /backups | Refresh | INVENTORIED |
| /backups | Trigger Snapshot | INVENTORIED |
| /backups | All Snapshots 0 | INVENTORIED |
| /backups | Completed 0 | INVENTORIED |
| /backups | Failed 0 | INVENTORIED |
| /backups | Trigger First Snapshot | INVENTORIED |
| /sandboxes | PLATFORM CONTROL CENTER | INVENTORIED |
| /sandboxes | BUSINESS MANAGEMENT | INVENTORIED |
| /sandboxes | SAAS MANAGEMENT | INVENTORIED |
| /sandboxes | OPERATIONS & MDM | INVENTORIED |
| /sandboxes | SECURITY & REPORTS | INVENTORIED |
| /sandboxes | ACCOUNT | INVENTORIED |
| /sandboxes | Notifications | INVENTORIED |
| /sandboxes | Toggle dark mode | INVENTORIED |
| /sandboxes | Log out of Super Admin | INVENTORIED |
| /sandboxes | Refresh | INVENTORIED |
| /sandboxes | Clone New Sandbox | INVENTORIED |
| /offline-policy | PLATFORM CONTROL CENTER | INVENTORIED |
| /offline-policy | BUSINESS MANAGEMENT | INVENTORIED |
| /offline-policy | SAAS MANAGEMENT | INVENTORIED |
| /offline-policy | OPERATIONS & MDM | INVENTORIED |
| /offline-policy | SECURITY & REPORTS | INVENTORIED |
| /offline-policy | ACCOUNT | INVENTORIED |
| /offline-policy | Notifications | INVENTORIED |
| /offline-policy | Toggle dark mode | INVENTORIED |
| /offline-policy | Log out of Super Admin | INVENTORIED |
| /offline-policy | Refresh | INVENTORIED |
| /offline-policy | Grant Emergency Extension | INVENTORIED |
| /team | PLATFORM CONTROL CENTER | INVENTORIED |
| /team | BUSINESS MANAGEMENT | INVENTORIED |
| /team | SAAS MANAGEMENT | INVENTORIED |
| /team | OPERATIONS & MDM | INVENTORIED |
| /team | SECURITY & REPORTS | INVENTORIED |
| /team | ACCOUNT | INVENTORIED |
| /team | Notifications | INVENTORIED |
| /team | Toggle dark mode | INVENTORIED |
| /team | Log out of Super Admin | INVENTORIED |
| /team | Invite Teammate | INVENTORIED |
| /team | All (1) | INVENTORIED |
| /team | Super Admins | INVENTORIED |
| /team | Operations | INVENTORIED |
| /team | Support | INVENTORIED |
| /team | Finance | INVENTORIED |
| /team | Auditors | INVENTORIED |
| /support | PLATFORM CONTROL CENTER | INVENTORIED |
| /support | BUSINESS MANAGEMENT | INVENTORIED |
| /support | SAAS MANAGEMENT | INVENTORIED |
| /support | OPERATIONS & MDM | INVENTORIED |
| /support | SECURITY & REPORTS | INVENTORIED |
| /support | ACCOUNT | INVENTORIED |
| /support | Notifications | INVENTORIED |
| /support | Toggle dark mode | INVENTORIED |
| /support | Log out of Super Admin | INVENTORIED |
| /support | Inspect | INVENTORIED |
| /support | Inspect Live Diagnostics | INVENTORIED |
| /tickets | PLATFORM CONTROL CENTER | INVENTORIED |
| /tickets | BUSINESS MANAGEMENT | INVENTORIED |
| /tickets | SAAS MANAGEMENT | INVENTORIED |
| /tickets | OPERATIONS & MDM | INVENTORIED |
| /tickets | SECURITY & REPORTS | INVENTORIED |
| /tickets | ACCOUNT | INVENTORIED |
| /tickets | Notifications | INVENTORIED |
| /tickets | Toggle dark mode | INVENTORIED |
| /tickets | Log out of Super Admin | INVENTORIED |
| /tickets | Refresh | INVENTORIED |
| /tickets | New Ticket | INVENTORIED |
| /tickets | All 0 | INVENTORIED |
| /tickets | My work today 0 | INVENTORIED |
| /tickets | Unassigned 0 | INVENTORIED |
| /tickets | Created by me 0 | INVENTORIED |
| /tickets | Overdue 0 | INVENTORIED |
| /tickets | From restaurants 0 | INVENTORIED |
| /tickets | Create Ticket | INVENTORIED |
| /notifications | PLATFORM CONTROL CENTER | INVENTORIED |
| /notifications | BUSINESS MANAGEMENT | INVENTORIED |
| /notifications | SAAS MANAGEMENT | INVENTORIED |
| /notifications | OPERATIONS & MDM | INVENTORIED |
| /notifications | SECURITY & REPORTS | INVENTORIED |
| /notifications | ACCOUNT | INVENTORIED |
| /notifications | Notifications | INVENTORIED |
| /notifications | Toggle dark mode | INVENTORIED |
| /notifications | Log out of Super Admin | INVENTORIED |
| /notifications | Refresh | INVENTORIED |
| /notifications | Mark all read | DISABLED |
| /notifications | Unread 0 | INVENTORIED |
| /notifications | All | INVENTORIED |
| /notifications | Any severity | INVENTORIED |
| /notifications | Critical 0 | INVENTORIED |
| /notifications | Warning 0 | INVENTORIED |
| /notifications | Info 0 | INVENTORIED |
| /notifications | Previous page | DISABLED |
| /notifications | Next page | DISABLED |
| /audit-logs | PLATFORM CONTROL CENTER | INVENTORIED |
| /audit-logs | BUSINESS MANAGEMENT | INVENTORIED |
| /audit-logs | SAAS MANAGEMENT | INVENTORIED |
| /audit-logs | OPERATIONS & MDM | INVENTORIED |
| /audit-logs | SECURITY & REPORTS | INVENTORIED |
| /audit-logs | ACCOUNT | INVENTORIED |
| /audit-logs | Notifications | INVENTORIED |
| /audit-logs | Toggle dark mode | INVENTORIED |
| /audit-logs | Log out of Super Admin | INVENTORIED |
| /audit-logs | Export CSV | INVENTORIED |
| /audit-logs | Platform Login | INVENTORIED |
| /audit-logs | Details | INVENTORIED |
| /audit-logs | Platform Login Otp Sent | INVENTORIED |
| /audit-logs | Activation Key Redeemed | INVENTORIED |
| /audit-logs | Staff Signin | INVENTORIED |
| /audit-logs | Restaurant Admin Sign In | INVENTORIED |
| /audit-logs | Tenant Refresh Token Reuse | INVENTORIED |
| /audit-logs | Sync Staff User Changed | INVENTORIED |
| /audit-logs | Menu Published | INVENTORIED |
| /audit-logs | Previous | DISABLED |
| /audit-logs | Next | INVENTORIED |
| /system-health | PLATFORM CONTROL CENTER | INVENTORIED |
| /system-health | BUSINESS MANAGEMENT | INVENTORIED |
| /system-health | SAAS MANAGEMENT | INVENTORIED |
| /system-health | OPERATIONS & MDM | INVENTORIED |
| /system-health | SECURITY & REPORTS | INVENTORIED |
| /system-health | ACCOUNT | INVENTORIED |
| /system-health | Notifications | INVENTORIED |
| /system-health | Toggle dark mode | INVENTORIED |
| /system-health | Log out of Super Admin | INVENTORIED |
| /system-health | Re-check Now | INVENTORIED |
| /profile | PLATFORM CONTROL CENTER | INVENTORIED |
| /profile | BUSINESS MANAGEMENT | INVENTORIED |
| /profile | SAAS MANAGEMENT | INVENTORIED |
| /profile | OPERATIONS & MDM | INVENTORIED |
| /profile | SECURITY & REPORTS | INVENTORIED |
| /profile | ACCOUNT | INVENTORIED |
| /profile | Notifications | INVENTORIED |
| /profile | Toggle dark mode | INVENTORIED |
| /profile | Log out of Super Admin | INVENTORIED |
| /profile | Change password | INVENTORIED |
| /profile | Sign out all other sessions | INVENTORIED |
| /profile | Sign out | INVENTORIED |
| /profile | Revoke | INVENTORIED |

## qr-admin

| Page | Button / accessible label | Latest status |
| --- | --- | --- |
| Overview | View all branches for this restaurant | INVENTORIED |
| Overview | End of Day Financial Z-Report | INVENTORIED |
| Overview | Single-source-of-truth financial data consistency audit | INVENTORIED |
| Overview | JAMAN AI Operations Assistant | INVENTORIED |
| Overview | Notifications | INVENTORIED |
| Overview | Sign out of Restaurant Admin | INVENTORIED |
| Overview | TODAY | INVENTORIED |
| Overview | Today | INVENTORIED |
| Overview | Orders | INVENTORIED |
| Overview | Billing / Invoices | INVENTORIED |
| Overview | Payments & Split | INVENTORIED |
| Overview | Register shifts & cash | INVENTORIED |
| Overview | KITCHEN | INVENTORIED |
| Overview | Kitchen progress 1 | INVENTORIED |
| Overview | Kitchen tickets | INVENTORIED |
| Overview | MENU | INVENTORIED |
| Overview | Menu & Categories | INVENTORIED |
| Overview | Customisations & Tax | INVENTORIED |
| Overview | Offers & Coupons | INVENTORIED |
| Overview | Inventory & Recipes | INVENTORIED |
| Overview | Purchasing & Stock Control | INVENTORIED |
| Overview | TABLES | INVENTORIED |
| Overview | Floor / Tables | INVENTORIED |
| Overview | Reservations | INVENTORIED |
| Overview | QR Table Ordering ON | INVENTORIED |
| Overview | GUESTS & TEAM | INVENTORIED |
| Overview | Customers & loyalty | INVENTORIED |
| Overview | Team & permissions | INVENTORIED |
| Overview | REPORTS | INVENTORIED |
| Overview | Reports & Analytics | INVENTORIED |
| Overview | Activity history | INVENTORIED |
| Overview | DEVICES | INVENTORIED |
| Overview | Printers & Devices | INVENTORIED |
| Overview | Connections & sync | INVENTORIED |
| Overview | App Downloads | INVENTORIED |
| Overview | SETUP | INVENTORIED |
| Overview | Receipt & E-Bill | INVENTORIED |
| Overview | Restaurant Settings | INVENTORIED |
| Overview | Subscription Plans | INVENTORIED |
| Overview | Backup & Restore | INVENTORIED |
| Overview | Help & Support | INVENTORIED |
| Overview | Overview | INVENTORIED |
| Overview | QR Orders | INVENTORIED |
| Overview | Service Requests | INVENTORIED |
| Overview | Menu & Availability | INVENTORIED |
| Overview | Tables & QR | INVENTORIED |
| Overview | Customer Branding | INVENTORIED |
| Overview | Payment Settings | INVENTORIED |
| Overview | Ordering Rules | INVENTORIED |
| Overview | Advanced Features | INVENTORIED |
| Overview | Analytics | INVENTORIED |
| Overview | 1 table without an active QR code — set up Tables & QR → | INVENTORIED |
| Overview | 1. Publish menu | INVENTORIED |
| Overview | 2. Set up table QR | INVENTORIED |
| Overview | 3. Check payments | INVENTORIED |
| Overview | 4. Preview appearance | INVENTORIED |
| Overview | Show advanced tools | INVENTORIED |
| Overview | Check setup again | INVENTORIED |
| Overview | Open settings → | INVENTORIED |
| Overview | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
| Menu & Availability | View all branches for this restaurant | INVENTORIED |
| Menu & Availability | End of Day Financial Z-Report | INVENTORIED |
| Menu & Availability | Single-source-of-truth financial data consistency audit | INVENTORIED |
| Menu & Availability | JAMAN AI Operations Assistant | INVENTORIED |
| Menu & Availability | Notifications | INVENTORIED |
| Menu & Availability | Sign out of Restaurant Admin | INVENTORIED |
| Menu & Availability | TODAY | INVENTORIED |
| Menu & Availability | Today | INVENTORIED |
| Menu & Availability | Orders | INVENTORIED |
| Menu & Availability | Billing / Invoices | INVENTORIED |
| Menu & Availability | Payments & Split | INVENTORIED |
| Menu & Availability | Register shifts & cash | INVENTORIED |
| Menu & Availability | KITCHEN | INVENTORIED |
| Menu & Availability | Kitchen progress 1 | INVENTORIED |
| Menu & Availability | Kitchen tickets | INVENTORIED |
| Menu & Availability | MENU | INVENTORIED |
| Menu & Availability | Menu & Categories | INVENTORIED |
| Menu & Availability | Customisations & Tax | INVENTORIED |
| Menu & Availability | Offers & Coupons | INVENTORIED |
| Menu & Availability | Inventory & Recipes | INVENTORIED |
| Menu & Availability | Purchasing & Stock Control | INVENTORIED |
| Menu & Availability | TABLES | INVENTORIED |
| Menu & Availability | Floor / Tables | INVENTORIED |
| Menu & Availability | Reservations | INVENTORIED |
| Menu & Availability | QR Table Ordering ON | INVENTORIED |
| Menu & Availability | GUESTS & TEAM | INVENTORIED |
| Menu & Availability | Customers & loyalty | INVENTORIED |
| Menu & Availability | Team & permissions | INVENTORIED |
| Menu & Availability | REPORTS | INVENTORIED |
| Menu & Availability | Reports & Analytics | INVENTORIED |
| Menu & Availability | Activity history | INVENTORIED |
| Menu & Availability | DEVICES | INVENTORIED |
| Menu & Availability | Printers & Devices | INVENTORIED |
| Menu & Availability | Connections & sync | INVENTORIED |
| Menu & Availability | App Downloads | INVENTORIED |
| Menu & Availability | SETUP | INVENTORIED |
| Menu & Availability | Receipt & E-Bill | INVENTORIED |
| Menu & Availability | Restaurant Settings | INVENTORIED |
| Menu & Availability | Subscription Plans | INVENTORIED |
| Menu & Availability | Backup & Restore | INVENTORIED |
| Menu & Availability | Help & Support | INVENTORIED |
| Menu & Availability | Overview | INVENTORIED |
| Menu & Availability | QR Orders | INVENTORIED |
| Menu & Availability | Service Requests | INVENTORIED |
| Menu & Availability | Menu & Availability | INVENTORIED |
| Menu & Availability | Tables & QR | INVENTORIED |
| Menu & Availability | Customer Branding | INVENTORIED |
| Menu & Availability | Payment Settings | INVENTORIED |
| Menu & Availability | Ordering Rules | INVENTORIED |
| Menu & Availability | Advanced Features | INVENTORIED |
| Menu & Availability | Analytics | INVENTORIED |
| Menu & Availability | Publish current menu | INVENTORIED |
| Menu & Availability | Acknowledge — On My Way | INVENTORIED |
| Menu & Availability | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
| Overview | Kitchen progress | INVENTORIED |
| Menu & Availability | Kitchen progress | INVENTORIED |
| Tables & QR | View all branches for this restaurant | INVENTORIED |
| Tables & QR | End of Day Financial Z-Report | INVENTORIED |
| Tables & QR | Single-source-of-truth financial data consistency audit | INVENTORIED |
| Tables & QR | JAMAN AI Operations Assistant | INVENTORIED |
| Tables & QR | Notifications | INVENTORIED |
| Tables & QR | Sign out of Restaurant Admin | INVENTORIED |
| Tables & QR | TODAY | INVENTORIED |
| Tables & QR | Today | INVENTORIED |
| Tables & QR | Orders | INVENTORIED |
| Tables & QR | Billing / Invoices | INVENTORIED |
| Tables & QR | Payments & Split | INVENTORIED |
| Tables & QR | Register shifts & cash | INVENTORIED |
| Tables & QR | KITCHEN | INVENTORIED |
| Tables & QR | Kitchen progress | INVENTORIED |
| Tables & QR | Kitchen tickets | INVENTORIED |
| Tables & QR | MENU | INVENTORIED |
| Tables & QR | Menu & Categories | INVENTORIED |
| Tables & QR | Customisations & Tax | INVENTORIED |
| Tables & QR | Offers & Coupons | INVENTORIED |
| Tables & QR | Inventory & Recipes | INVENTORIED |
| Tables & QR | Purchasing & Stock Control | INVENTORIED |
| Tables & QR | TABLES | INVENTORIED |
| Tables & QR | Floor / Tables | INVENTORIED |
| Tables & QR | Reservations | INVENTORIED |
| Tables & QR | QR Table Ordering ON | INVENTORIED |
| Tables & QR | GUESTS & TEAM | INVENTORIED |
| Tables & QR | Customers & loyalty | INVENTORIED |
| Tables & QR | Team & permissions | INVENTORIED |
| Tables & QR | REPORTS | INVENTORIED |
| Tables & QR | Reports & Analytics | INVENTORIED |
| Tables & QR | Activity history | INVENTORIED |
| Tables & QR | DEVICES | INVENTORIED |
| Tables & QR | Printers & Devices | INVENTORIED |
| Tables & QR | Connections & sync | INVENTORIED |
| Tables & QR | App Downloads | INVENTORIED |
| Tables & QR | SETUP | INVENTORIED |
| Tables & QR | Receipt & E-Bill | INVENTORIED |
| Tables & QR | Restaurant Settings | INVENTORIED |
| Tables & QR | Subscription Plans | INVENTORIED |
| Tables & QR | Backup & Restore | INVENTORIED |
| Tables & QR | Help & Support | INVENTORIED |
| Tables & QR | Overview | INVENTORIED |
| Tables & QR | QR Orders | INVENTORIED |
| Tables & QR | Service Requests | INVENTORIED |
| Tables & QR | Menu & Availability | INVENTORIED |
| Tables & QR | Tables & QR | INVENTORIED |
| Tables & QR | Customer Branding | INVENTORIED |
| Tables & QR | Payment Settings | INVENTORIED |
| Tables & QR | Ordering Rules | INVENTORIED |
| Tables & QR | Advanced Features | INVENTORIED |
| Tables & QR | Analytics | INVENTORIED |
| Tables & QR | Add table | INVENTORIED |
| Tables & QR | Generate selected QR codes | DISABLED |
| Tables & QR | Print selected (0) | DISABLED |
| Tables & QR | No active QR codes yet — add a table and generate its code first. | DISABLED |
| Tables & QR | A code with no table, for menu cards | INVENTORIED |
| Tables & QR | Rename table UI01 | INVENTORIED |
| Tables & QR | Generate QR | INVENTORIED |
| Tables & QR | Switch this table on or off | INVENTORIED |
| Tables & QR | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
| QR Orders | View all branches for this restaurant | INVENTORIED |
| QR Orders | End of Day Financial Z-Report | INVENTORIED |
| QR Orders | Single-source-of-truth financial data consistency audit | INVENTORIED |
| QR Orders | JAMAN AI Operations Assistant | INVENTORIED |
| QR Orders | Notifications | INVENTORIED |
| QR Orders | Sign out of Restaurant Admin | INVENTORIED |
| QR Orders | TODAY | INVENTORIED |
| QR Orders | Today | INVENTORIED |
| QR Orders | Orders | INVENTORIED |
| QR Orders | Billing / Invoices | INVENTORIED |
| QR Orders | Payments & Split | INVENTORIED |
| QR Orders | Register shifts & cash | INVENTORIED |
| QR Orders | KITCHEN | INVENTORIED |
| QR Orders | Kitchen progress | INVENTORIED |
| QR Orders | Kitchen tickets | INVENTORIED |
| QR Orders | MENU | INVENTORIED |
| QR Orders | Menu & Categories | INVENTORIED |
| QR Orders | Customisations & Tax | INVENTORIED |
| QR Orders | Offers & Coupons | INVENTORIED |
| QR Orders | Inventory & Recipes | INVENTORIED |
| QR Orders | Purchasing & Stock Control | INVENTORIED |
| QR Orders | TABLES | INVENTORIED |
| QR Orders | Floor / Tables | INVENTORIED |
| QR Orders | Reservations | INVENTORIED |
| QR Orders | QR Table Ordering ON | INVENTORIED |
| QR Orders | GUESTS & TEAM | INVENTORIED |
| QR Orders | Customers & loyalty | INVENTORIED |
| QR Orders | Team & permissions | INVENTORIED |
| QR Orders | REPORTS | INVENTORIED |
| QR Orders | Reports & Analytics | INVENTORIED |
| QR Orders | Activity history | INVENTORIED |
| QR Orders | DEVICES | INVENTORIED |
| QR Orders | Printers & Devices | INVENTORIED |
| QR Orders | Connections & sync | INVENTORIED |
| QR Orders | App Downloads | INVENTORIED |
| QR Orders | SETUP | INVENTORIED |
| QR Orders | Receipt & E-Bill | INVENTORIED |
| QR Orders | Restaurant Settings | INVENTORIED |
| QR Orders | Subscription Plans | INVENTORIED |
| QR Orders | Backup & Restore | INVENTORIED |
| QR Orders | Help & Support | INVENTORIED |
| QR Orders | Overview | INVENTORIED |
| QR Orders | QR Orders | INVENTORIED |
| QR Orders | Service Requests | INVENTORIED |
| QR Orders | Menu & Availability | INVENTORIED |
| QR Orders | Tables & QR | INVENTORIED |
| QR Orders | Customer Branding | INVENTORIED |
| QR Orders | Payment Settings | INVENTORIED |
| QR Orders | Ordering Rules | INVENTORIED |
| QR Orders | Advanced Features | INVENTORIED |
| QR Orders | Analytics | INVENTORIED |
| QR Orders | Refresh | INVENTORIED |
| QR Orders | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
| Payment Settings | View all branches for this restaurant | INVENTORIED |
| Payment Settings | End of Day Financial Z-Report | INVENTORIED |
| Payment Settings | Single-source-of-truth financial data consistency audit | INVENTORIED |
| Payment Settings | JAMAN AI Operations Assistant | INVENTORIED |
| Payment Settings | Notifications | INVENTORIED |
| Payment Settings | Sign out of Restaurant Admin | INVENTORIED |
| Payment Settings | TODAY | INVENTORIED |
| Payment Settings | Today | INVENTORIED |
| Payment Settings | Orders | INVENTORIED |
| Payment Settings | Billing / Invoices | INVENTORIED |
| Payment Settings | Payments & Split | INVENTORIED |
| Payment Settings | Register shifts & cash | INVENTORIED |
| Payment Settings | KITCHEN | INVENTORIED |
| Payment Settings | Kitchen progress | INVENTORIED |
| Payment Settings | Kitchen tickets | INVENTORIED |
| Payment Settings | MENU | INVENTORIED |
| Payment Settings | Menu & Categories | INVENTORIED |
| Payment Settings | Customisations & Tax | INVENTORIED |
| Payment Settings | Offers & Coupons | INVENTORIED |
| Payment Settings | Inventory & Recipes | INVENTORIED |
| Payment Settings | Purchasing & Stock Control | INVENTORIED |
| Payment Settings | TABLES | INVENTORIED |
| Payment Settings | Floor / Tables | INVENTORIED |
| Payment Settings | Reservations | INVENTORIED |
| Payment Settings | QR Table Ordering ON | INVENTORIED |
| Payment Settings | GUESTS & TEAM | INVENTORIED |
| Payment Settings | Customers & loyalty | INVENTORIED |
| Payment Settings | Team & permissions | INVENTORIED |
| Payment Settings | REPORTS | INVENTORIED |
| Payment Settings | Reports & Analytics | INVENTORIED |
| Payment Settings | Activity history | INVENTORIED |
| Payment Settings | DEVICES | INVENTORIED |
| Payment Settings | Printers & Devices | INVENTORIED |
| Payment Settings | Connections & sync | INVENTORIED |
| Payment Settings | App Downloads | INVENTORIED |
| Payment Settings | SETUP | INVENTORIED |
| Payment Settings | Receipt & E-Bill | INVENTORIED |
| Payment Settings | Restaurant Settings | INVENTORIED |
| Payment Settings | Subscription Plans | INVENTORIED |
| Payment Settings | Backup & Restore | INVENTORIED |
| Payment Settings | Help & Support | INVENTORIED |
| Payment Settings | Overview | INVENTORIED |
| Payment Settings | QR Orders | INVENTORIED |
| Payment Settings | Service Requests | INVENTORIED |
| Payment Settings | Menu & Availability | INVENTORIED |
| Payment Settings | Tables & QR | INVENTORIED |
| Payment Settings | Customer Branding | INVENTORIED |
| Payment Settings | Payment Settings | INVENTORIED |
| Payment Settings | Ordering Rules | INVENTORIED |
| Payment Settings | Advanced Features | INVENTORIED |
| Payment Settings | Analytics | INVENTORIED |
| Payment Settings | Save payment instructions | DISABLED |
| Payment Settings | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
| Ordering Rules | View all branches for this restaurant | INVENTORIED |
| Ordering Rules | End of Day Financial Z-Report | INVENTORIED |
| Ordering Rules | Single-source-of-truth financial data consistency audit | INVENTORIED |
| Ordering Rules | JAMAN AI Operations Assistant | INVENTORIED |
| Ordering Rules | Notifications | INVENTORIED |
| Ordering Rules | Sign out of Restaurant Admin | INVENTORIED |
| Ordering Rules | TODAY | INVENTORIED |
| Ordering Rules | Today | INVENTORIED |
| Ordering Rules | Orders | INVENTORIED |
| Ordering Rules | Billing / Invoices | INVENTORIED |
| Ordering Rules | Payments & Split | INVENTORIED |
| Ordering Rules | Register shifts & cash | INVENTORIED |
| Ordering Rules | KITCHEN | INVENTORIED |
| Ordering Rules | Kitchen progress | INVENTORIED |
| Ordering Rules | Kitchen tickets | INVENTORIED |
| Ordering Rules | MENU | INVENTORIED |
| Ordering Rules | Menu & Categories | INVENTORIED |
| Ordering Rules | Customisations & Tax | INVENTORIED |
| Ordering Rules | Offers & Coupons | INVENTORIED |
| Ordering Rules | Inventory & Recipes | INVENTORIED |
| Ordering Rules | Purchasing & Stock Control | INVENTORIED |
| Ordering Rules | TABLES | INVENTORIED |
| Ordering Rules | Floor / Tables | INVENTORIED |
| Ordering Rules | Reservations | INVENTORIED |
| Ordering Rules | QR Table Ordering ON | INVENTORIED |
| Ordering Rules | GUESTS & TEAM | INVENTORIED |
| Ordering Rules | Customers & loyalty | INVENTORIED |
| Ordering Rules | Team & permissions | INVENTORIED |
| Ordering Rules | REPORTS | INVENTORIED |
| Ordering Rules | Reports & Analytics | INVENTORIED |
| Ordering Rules | Activity history | INVENTORIED |
| Ordering Rules | DEVICES | INVENTORIED |
| Ordering Rules | Printers & Devices | INVENTORIED |
| Ordering Rules | Connections & sync | INVENTORIED |
| Ordering Rules | App Downloads | INVENTORIED |
| Ordering Rules | SETUP | INVENTORIED |
| Ordering Rules | Receipt & E-Bill | INVENTORIED |
| Ordering Rules | Restaurant Settings | INVENTORIED |
| Ordering Rules | Subscription Plans | INVENTORIED |
| Ordering Rules | Backup & Restore | INVENTORIED |
| Ordering Rules | Help & Support | INVENTORIED |
| Ordering Rules | Overview | INVENTORIED |
| Ordering Rules | QR Orders | INVENTORIED |
| Ordering Rules | Service Requests | INVENTORIED |
| Ordering Rules | Menu & Availability | INVENTORIED |
| Ordering Rules | Tables & QR | INVENTORIED |
| Ordering Rules | Customer Branding | INVENTORIED |
| Ordering Rules | Payment Settings | INVENTORIED |
| Ordering Rules | Ordering Rules | INVENTORIED |
| Ordering Rules | Advanced Features | INVENTORIED |
| Ordering Rules | Analytics | INVENTORIED |
| Ordering Rules | + Add hours | INVENTORIED |
| Ordering Rules | Save ordering rules | DISABLED |
| Ordering Rules | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
| Analytics | View all branches for this restaurant | INVENTORIED |
| Analytics | End of Day Financial Z-Report | INVENTORIED |
| Analytics | Single-source-of-truth financial data consistency audit | INVENTORIED |
| Analytics | JAMAN AI Operations Assistant | INVENTORIED |
| Analytics | Notifications | INVENTORIED |
| Analytics | Sign out of Restaurant Admin | INVENTORIED |
| Analytics | TODAY | INVENTORIED |
| Analytics | Today | INVENTORIED |
| Analytics | Orders | INVENTORIED |
| Analytics | Billing / Invoices | INVENTORIED |
| Analytics | Payments & Split | INVENTORIED |
| Analytics | Register shifts & cash | INVENTORIED |
| Analytics | KITCHEN | INVENTORIED |
| Analytics | Kitchen progress | INVENTORIED |
| Analytics | Kitchen tickets | INVENTORIED |
| Analytics | MENU | INVENTORIED |
| Analytics | Menu & Categories | INVENTORIED |
| Analytics | Customisations & Tax | INVENTORIED |
| Analytics | Offers & Coupons | INVENTORIED |
| Analytics | Inventory & Recipes | INVENTORIED |
| Analytics | Purchasing & Stock Control | INVENTORIED |
| Analytics | TABLES | INVENTORIED |
| Analytics | Floor / Tables | INVENTORIED |
| Analytics | Reservations | INVENTORIED |
| Analytics | QR Table Ordering ON | INVENTORIED |
| Analytics | GUESTS & TEAM | INVENTORIED |
| Analytics | Customers & loyalty | INVENTORIED |
| Analytics | Team & permissions | INVENTORIED |
| Analytics | REPORTS | INVENTORIED |
| Analytics | Reports & Analytics | INVENTORIED |
| Analytics | Activity history | INVENTORIED |
| Analytics | DEVICES | INVENTORIED |
| Analytics | Printers & Devices | INVENTORIED |
| Analytics | Connections & sync | INVENTORIED |
| Analytics | App Downloads | INVENTORIED |
| Analytics | SETUP | INVENTORIED |
| Analytics | Receipt & E-Bill | INVENTORIED |
| Analytics | Restaurant Settings | INVENTORIED |
| Analytics | Subscription Plans | INVENTORIED |
| Analytics | Backup & Restore | INVENTORIED |
| Analytics | Help & Support | INVENTORIED |
| Analytics | Overview | INVENTORIED |
| Analytics | QR Orders | INVENTORIED |
| Analytics | Service Requests | INVENTORIED |
| Analytics | Menu & Availability | INVENTORIED |
| Analytics | Tables & QR | INVENTORIED |
| Analytics | Customer Branding | INVENTORIED |
| Analytics | Payment Settings | INVENTORIED |
| Analytics | Ordering Rules | INVENTORIED |
| Analytics | Advanced Features | INVENTORIED |
| Analytics | Analytics | INVENTORIED |
| Analytics | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
| Advanced Features | View all branches for this restaurant | INVENTORIED |
| Advanced Features | End of Day Financial Z-Report | INVENTORIED |
| Advanced Features | Single-source-of-truth financial data consistency audit | INVENTORIED |
| Advanced Features | JAMAN AI Operations Assistant | INVENTORIED |
| Advanced Features | Notifications | INVENTORIED |
| Advanced Features | Sign out of Restaurant Admin | INVENTORIED |
| Advanced Features | TODAY | INVENTORIED |
| Advanced Features | Today | INVENTORIED |
| Advanced Features | Orders | INVENTORIED |
| Advanced Features | Billing / Invoices | INVENTORIED |
| Advanced Features | Payments & Split | INVENTORIED |
| Advanced Features | Register shifts & cash | INVENTORIED |
| Advanced Features | KITCHEN | INVENTORIED |
| Advanced Features | Kitchen progress | INVENTORIED |
| Advanced Features | Kitchen tickets | INVENTORIED |
| Advanced Features | MENU | INVENTORIED |
| Advanced Features | Menu & Categories | INVENTORIED |
| Advanced Features | Customisations & Tax | INVENTORIED |
| Advanced Features | Offers & Coupons | INVENTORIED |
| Advanced Features | Inventory & Recipes | INVENTORIED |
| Advanced Features | Purchasing & Stock Control | INVENTORIED |
| Advanced Features | TABLES | INVENTORIED |
| Advanced Features | Floor / Tables | INVENTORIED |
| Advanced Features | Reservations | INVENTORIED |
| Advanced Features | QR Table Ordering ON | INVENTORIED |
| Advanced Features | GUESTS & TEAM | INVENTORIED |
| Advanced Features | Customers & loyalty | INVENTORIED |
| Advanced Features | Team & permissions | INVENTORIED |
| Advanced Features | REPORTS | INVENTORIED |
| Advanced Features | Reports & Analytics | INVENTORIED |
| Advanced Features | Activity history | INVENTORIED |
| Advanced Features | DEVICES | INVENTORIED |
| Advanced Features | Printers & Devices | INVENTORIED |
| Advanced Features | Connections & sync | INVENTORIED |
| Advanced Features | App Downloads | INVENTORIED |
| Advanced Features | SETUP | INVENTORIED |
| Advanced Features | Receipt & E-Bill | INVENTORIED |
| Advanced Features | Restaurant Settings | INVENTORIED |
| Advanced Features | Subscription Plans | INVENTORIED |
| Advanced Features | Backup & Restore | INVENTORIED |
| Advanced Features | Help & Support | INVENTORIED |
| Advanced Features | Overview | INVENTORIED |
| Advanced Features | QR Orders | INVENTORIED |
| Advanced Features | Service Requests | INVENTORIED |
| Advanced Features | Menu & Availability | INVENTORIED |
| Advanced Features | Tables & QR | INVENTORIED |
| Advanced Features | Customer Branding | INVENTORIED |
| Advanced Features | Payment Settings | INVENTORIED |
| Advanced Features | Ordering Rules | INVENTORIED |
| Advanced Features | Advanced Features | INVENTORIED |
| Advanced Features | Analytics | INVENTORIED |
| Advanced Features | Settings | INVENTORIED |
| Advanced Features | Translations | INVENTORIED |
| Advanced Features | Promotions | INVENTORIED |
| Advanced Features | Feedback | INVENTORIED |
| Advanced Features | Alerts | INVENTORIED |
| Advanced Features | Collections | INVENTORIED |
| Advanced Features | License | INVENTORIED |
| Advanced Features | Save changes | DISABLED |
| Advanced Features | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
| Service Requests | View all branches for this restaurant | INVENTORIED |
| Service Requests | End of Day Financial Z-Report | INVENTORIED |
| Service Requests | Single-source-of-truth financial data consistency audit | INVENTORIED |
| Service Requests | JAMAN AI Operations Assistant | INVENTORIED |
| Service Requests | Notifications | INVENTORIED |
| Service Requests | Sign out of Restaurant Admin | INVENTORIED |
| Service Requests | TODAY | INVENTORIED |
| Service Requests | Today | INVENTORIED |
| Service Requests | Orders | INVENTORIED |
| Service Requests | Billing / Invoices | INVENTORIED |
| Service Requests | Payments & Split | INVENTORIED |
| Service Requests | Register shifts & cash | INVENTORIED |
| Service Requests | KITCHEN | INVENTORIED |
| Service Requests | Kitchen progress | INVENTORIED |
| Service Requests | Kitchen tickets | INVENTORIED |
| Service Requests | MENU | INVENTORIED |
| Service Requests | Menu & Categories | INVENTORIED |
| Service Requests | Customisations & Tax | INVENTORIED |
| Service Requests | Offers & Coupons | INVENTORIED |
| Service Requests | Inventory & Recipes | INVENTORIED |
| Service Requests | Purchasing & Stock Control | INVENTORIED |
| Service Requests | TABLES | INVENTORIED |
| Service Requests | Floor / Tables | INVENTORIED |
| Service Requests | Reservations | INVENTORIED |
| Service Requests | QR Table Ordering ON | INVENTORIED |
| Service Requests | GUESTS & TEAM | INVENTORIED |
| Service Requests | Customers & loyalty | INVENTORIED |
| Service Requests | Team & permissions | INVENTORIED |
| Service Requests | REPORTS | INVENTORIED |
| Service Requests | Reports & Analytics | INVENTORIED |
| Service Requests | Activity history | INVENTORIED |
| Service Requests | DEVICES | INVENTORIED |
| Service Requests | Printers & Devices | INVENTORIED |
| Service Requests | Connections & sync | INVENTORIED |
| Service Requests | App Downloads | INVENTORIED |
| Service Requests | SETUP | INVENTORIED |
| Service Requests | Receipt & E-Bill | INVENTORIED |
| Service Requests | Restaurant Settings | INVENTORIED |
| Service Requests | Subscription Plans | INVENTORIED |
| Service Requests | Backup & Restore | INVENTORIED |
| Service Requests | Help & Support | INVENTORIED |
| Service Requests | Overview | INVENTORIED |
| Service Requests | QR Orders | INVENTORIED |
| Service Requests | Service Requests | INVENTORIED |
| Service Requests | Menu & Availability | INVENTORIED |
| Service Requests | Tables & QR | INVENTORIED |
| Service Requests | Customer Branding | INVENTORIED |
| Service Requests | Payment Settings | INVENTORIED |
| Service Requests | Ordering Rules | INVENTORIED |
| Service Requests | Advanced Features | INVENTORIED |
| Service Requests | Analytics | INVENTORIED |
| Service Requests | Request Service requests | INVENTORIED |
| Service Requests | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
| Customer Branding | View all branches for this restaurant | INVENTORIED |
| Customer Branding | End of Day Financial Z-Report | INVENTORIED |
| Customer Branding | Single-source-of-truth financial data consistency audit | INVENTORIED |
| Customer Branding | JAMAN AI Operations Assistant | INVENTORIED |
| Customer Branding | Notifications | INVENTORIED |
| Customer Branding | Sign out of Restaurant Admin | INVENTORIED |
| Customer Branding | TODAY | INVENTORIED |
| Customer Branding | Today | INVENTORIED |
| Customer Branding | Orders | INVENTORIED |
| Customer Branding | Billing / Invoices | INVENTORIED |
| Customer Branding | Payments & Split | INVENTORIED |
| Customer Branding | Register shifts & cash | INVENTORIED |
| Customer Branding | KITCHEN | INVENTORIED |
| Customer Branding | Kitchen progress | INVENTORIED |
| Customer Branding | Kitchen tickets | INVENTORIED |
| Customer Branding | MENU | INVENTORIED |
| Customer Branding | Menu & Categories | INVENTORIED |
| Customer Branding | Customisations & Tax | INVENTORIED |
| Customer Branding | Offers & Coupons | INVENTORIED |
| Customer Branding | Inventory & Recipes | INVENTORIED |
| Customer Branding | Purchasing & Stock Control | INVENTORIED |
| Customer Branding | TABLES | INVENTORIED |
| Customer Branding | Floor / Tables | INVENTORIED |
| Customer Branding | Reservations | INVENTORIED |
| Customer Branding | QR Table Ordering ON | INVENTORIED |
| Customer Branding | GUESTS & TEAM | INVENTORIED |
| Customer Branding | Customers & loyalty | INVENTORIED |
| Customer Branding | Team & permissions | INVENTORIED |
| Customer Branding | REPORTS | INVENTORIED |
| Customer Branding | Reports & Analytics | INVENTORIED |
| Customer Branding | Activity history | INVENTORIED |
| Customer Branding | DEVICES | INVENTORIED |
| Customer Branding | Printers & Devices | INVENTORIED |
| Customer Branding | Connections & sync | INVENTORIED |
| Customer Branding | App Downloads | INVENTORIED |
| Customer Branding | SETUP | INVENTORIED |
| Customer Branding | Receipt & E-Bill | INVENTORIED |
| Customer Branding | Restaurant Settings | INVENTORIED |
| Customer Branding | Subscription Plans | INVENTORIED |
| Customer Branding | Backup & Restore | INVENTORIED |
| Customer Branding | Help & Support | INVENTORIED |
| Customer Branding | Overview | INVENTORIED |
| Customer Branding | QR Orders | INVENTORIED |
| Customer Branding | Service Requests | INVENTORIED |
| Customer Branding | Menu & Availability | INVENTORIED |
| Customer Branding | Tables & QR | INVENTORIED |
| Customer Branding | Customer Branding | INVENTORIED |
| Customer Branding | Payment Settings | INVENTORIED |
| Customer Branding | Ordering Rules | INVENTORIED |
| Customer Branding | Advanced Features | INVENTORIED |
| Customer Branding | Analytics | INVENTORIED |
| Customer Branding | Use default logo | INVENTORIED |
| Customer Branding | Use menu cover | INVENTORIED |
| Customer Branding | Save branding | INVENTORIED |
| Customer Branding | Discard changes | INVENTORIED |
| Customer Branding | Place order · ₹299 | DISABLED |
| Customer Branding | Open JAMAN AI Restaurant Intelligence | INVENTORIED |
