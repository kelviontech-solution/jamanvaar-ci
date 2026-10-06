import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  TableRepository,
  CustomerRepository,
  StaffRepository,
  InventoryRepository,
  RecipeRepository,
  PrinterRepository,
  MenuRepository,
  OrderRepository,
  LicenseRepository
} from '../packages/database/src';
import { ReportGeneratorService, EntitlementService } from '../packages/business/src';

describe('JAMANVAAR Restaurant Admin Center — Full CRUD, Persistence & Reporting Suite', () => {
  beforeEach(() => {
    db.resetToDefaultSeed();
  });

  it('1. TableRepository: Full CRUD on Dining Tables & Occupancy Status', () => {
    const created = TableRepository.createTable({
      tableNumber: '42',
      capacity: 6,
      zone: 'Garden Terrace',
      floor: 2,
      status: 'AVAILABLE'
    });

    expect(created.tableNumber).toBe('42');
    expect(created.capacity).toBe(6);
    expect(created.zone).toBe('Garden Terrace');

    const fetched = TableRepository.getTableById(created.id);
    expect(fetched).toBeDefined();
    expect(fetched?.tableNumber).toBe('42');

    const updated = TableRepository.updateTable(created.id, { capacity: 8 });
    expect(updated?.capacity).toBe(8);

    const statusUpdated = TableRepository.updateTableStatus(created.id, 'OCCUPIED');
    expect(statusUpdated?.status).toBe('OCCUPIED');

    const deleted = TableRepository.deleteTable(created.id);
    expect(deleted).toBe(true);
    expect(TableRepository.getTableById(created.id)).toBeUndefined();
  });

  it('2. CustomerRepository: Full CRUD on CRM Customer Profiles & Loyalty Rewards', () => {
    const cust = CustomerRepository.createCustomer({
      name: 'Rohan Mehta',
      phone: '+91 9988776655',
      loyaltyPoints: 100
    });

    expect(cust.name).toBe('Rohan Mehta');
    // B2-043: createCustomer normalizes to a bare 10-digit number (normalizeIndianPhone strips
    // the +91 prefix) so every lookup matches regardless of how the number was typed in.
    expect(cust.phone).toBe('9988776655');
    expect(cust.loyaltyPoints).toBe(100);

    const updated = CustomerRepository.updateCustomer(cust.phone, { name: 'Rohan K. Mehta' });
    expect(updated?.name).toBe('Rohan K. Mehta');

    CustomerRepository.addPoints(cust.phone, 50);
    expect(CustomerRepository.getAccount(cust.phone)?.loyaltyPoints).toBe(150);

    const redeemed = CustomerRepository.redeemPoints(cust.phone, 75);
    expect(redeemed).toBe(true);
    expect(CustomerRepository.getAccount(cust.phone)?.loyaltyPoints).toBe(75);

    const deleted = CustomerRepository.deleteCustomer(cust.phone);
    expect(deleted).toBe(true);
    expect(CustomerRepository.getAccount(cust.phone)).toBeUndefined();
  });

  it('3. StaffRepository: Full CRUD on Users, Roles & Credentials', async () => {
    const staff = await StaffRepository.createUser({
      fullName: 'Vikram Sarabhai',
      username: 'vikrams',
      roleId: 'MANAGER',
      phone: '+91 9876543210',
      email: 'vikram@jamanvaar.local'
    });

    expect(staff.fullName).toBe('Vikram Sarabhai');
    expect(staff.username).toBe('vikrams');
    expect(staff.roleId).toBe('MANAGER');

    const updated = StaffRepository.updateUser(staff.id, { roleId: 'OWNER' });
    expect(updated?.roleId).toBe('OWNER');

    // security-audit MED-12: "delete" now deactivates rather than removing the row —
    // a hard local removal is invisible to entity-sync (no delete/tombstone semantics
    // for STAFF_USER), so a terminated employee's PIN used to keep working forever on
    // every other terminal that had already synced their record. Deactivating instead
    // means `isActive: false` propagates through the normal sync path.
    const deleted = StaffRepository.deleteUser(staff.id);
    expect(deleted).toBe(true);
    expect(StaffRepository.getUserById(staff.id)?.isActive).toBe(false);
  });

  it('4. InventoryRepository & RecipeRepository: Raw Stock & Automatic BOM Deductions', () => {
    const rawPaneer = InventoryRepository.createItem({
      name: 'Farm Fresh Paneer',
      sku: 'RAW-PAN-99',
      category: 'Dairy',
      unit: 'kg',
      currentStock: 20,
      minStockLevel: 5,
      reorderLevel: 8,
      costPerUnit: 250,
      supplierName: 'Gujarat Dairy Co'
    });

    expect(rawPaneer!.currentStock).toBe(20);
    expect(rawPaneer!.status).toBe('IN_STOCK');

    // Create dish and recipe
    const dish = MenuRepository.createMenuItem({
      name: 'Paneer Lababdar Special',
      sku: 'DSH-PL-01',
      price: 320,
      categoryId: db.categories[0].id,
      kitchenStation: 'Main Kitchen'
    });

    const recipe = RecipeRepository.createRecipe({
      menuItemId: dish.id,
      menuItemName: dish.name,
      ingredients: [
        {
          inventoryItemId: rawPaneer!.id,
          inventoryItemName: rawPaneer!.name,
          quantityPerPortion: 0.25, // 250g paneer per portion
          unit: 'kg'
        }
      ]
    });

    expect(recipe.ingredients.length).toBe(1);

    // Placing an order automatically triggers BOM recipe inventory deduction
    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: '1',
      items: [
        {
          id: 'item-paneer-1',
          orderId: 'temp-1',
          menuItemId: dish.id,
          name: dish.name,
          sku: dish.sku,
          unitPrice: dish.price,
          quantity: 2,
          totalPrice: 640,
          modifiers: []
        }
      ],
      subtotal: 640,
      taxAmount: 32,
      discountAmount: 0,
      totalAmount: 672,
      paymentMethod: 'CASH',
      paymentStatus: 'SUCCESS',
      orderStatus: 'CONFIRMED'
    });

    const updatedPaneer = InventoryRepository.getItemById(rawPaneer!.id);
    expect(updatedPaneer?.currentStock).toBe(19.5); // 20 - 0.5kg auto-deducted
  });

  it('5. PrinterRepository: Multi-Station Thermal Printer Configuration', () => {
    const printer = PrinterRepository.createPrinter({
      name: 'Main Counter Thermal 80mm',
      interfaceType: 'USB',
      port: 'USB002',
      paperSize: '80mm',
      isDefault: true
    });

    expect(printer.name).toBe('Main Counter Thermal 80mm');
    expect(printer.paperSize).toBe('80mm');
    expect(printer.isDefault).toBe(true);

    const updated = PrinterRepository.updatePrinter(printer.id, { port: '192.168.1.150', interfaceType: 'NETWORK_LAN' });
    expect(updated?.port).toBe('192.168.1.150');
    expect(updated?.interfaceType).toBe('NETWORK_LAN');

    const deleted = PrinterRepository.deletePrinter(printer.id);
    expect(deleted).toBe(true);
    expect(PrinterRepository.getPrinterById(printer.id)).toBeUndefined();
  });

  it('6. ReportGeneratorService: Period Filtering & Transaction CSV Generation', () => {
    // Generate order for testing
    OrderRepository.createOrder({
      orderType: 'DINE_IN',
      tableNumber: '5',
      customerName: 'Anand Patel',
      customerPhone: '+91 9825000000',
      items: [
        {
          id: 'item-curry-1',
          orderId: 'temp-2',
          menuItemId: db.menuItems[0].id,
          name: db.menuItems[0].name,
          sku: db.menuItems[0].sku,
          unitPrice: db.menuItems[0].price,
          quantity: 1,
          totalPrice: db.menuItems[0].price,
          modifiers: []
        }
      ],
      subtotal: db.menuItems[0].price,
      cgstAmount: 10,
      sgstAmount: 10,
      taxAmount: 20,
      discountAmount: 0,
      totalAmount: db.menuItems[0].price + 20,
      paymentMethod: 'UPI',
      paymentStatus: 'SUCCESS',
      orderStatus: 'COMPLETED'
    });

    const todayReport = ReportGeneratorService.getReportForPeriod('TODAY');
    expect(todayReport.summary.ordersCount).toBeGreaterThanOrEqual(1);
    expect(todayReport.summary.paymentBreakdown.upi).toBeGreaterThanOrEqual(1);

    const thirtyDaysReport = ReportGeneratorService.getReportForPeriod('30_DAYS');
    expect(thirtyDaysReport.summary.ordersCount).toBeGreaterThanOrEqual(1);

    const csvData = ReportGeneratorService.exportTransactionsCsv(db.orders);
    expect(csvData).toContain('JAMANVAAR RESTAURANT');
    expect(csvData).toContain('Invoice / Order Number');
    expect(csvData).toContain('CGST');
    expect(csvData).toContain('SGST');
  });

  it('7. Licensing & Entitlements: Plan 1 (₹5,000) vs Plan 2 (₹7,000)', () => {
    // Activate Plan 1 CORE (₹5,000)
    const corePlan = LicenseRepository.activatePlan('CORE');
    expect(corePlan.tier).toBe('CORE');
    expect(corePlan.price).toBe(5000);
    expect(corePlan.entitlements.posTerminal).toBe(true);
    expect(corePlan.entitlements.restaurantAdmin).toBe(true);
    expect(corePlan.entitlements.captainApp).toBe(false);

    const captainCheckCore = EntitlementService.checkCaptainAppAccess();
    expect(captainCheckCore.allowed).toBe(false);
    expect(captainCheckCore.message).toContain('₹7,000');

    // Activate Plan 2 PRO (₹7,000)
    const proPlan = LicenseRepository.activatePlan('PRO');
    expect(proPlan.tier).toBe('PRO');
    expect(proPlan.price).toBe(7000);
    expect(proPlan.entitlements.captainApp).toBe(true);
    expect(proPlan.entitlements.advancedCaptainReports).toBe(true);

    const captainCheckPro = EntitlementService.checkCaptainAppAccess();
    expect(captainCheckPro.allowed).toBe(true);
  });
});
