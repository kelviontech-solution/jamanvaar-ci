import { describe, it, expect } from "vitest";
import { localPickupParts } from "./qr-operations.service";
import { qrItemPerformance } from "./qr-menu-analytics";
describe("QR operations boundaries", () => {
  it("distinguishes both instants in an autumn DST overlap", () => {
    const first = localPickupParts(
      new Date("2026-11-01T05:30:00Z"),
      "America/New_York",
    );
    const second = localPickupParts(
      new Date("2026-11-01T06:30:00Z"),
      "America/New_York",
    );
    expect(first.minute).toBe(90);
    expect(second.minute).toBe(90);
    expect(first.label).not.toBe(second.label);
  });
  it("uses restaurant dates rather than UTC for fractional-offset pickup slots", () => {
    expect(
      localPickupParts(new Date("2026-10-10T20:30:00Z"), "Asia/Kolkata"),
    ).toMatchObject({ date: "2026-10-11", minute: 120 });
  });
  it("conserves integer collections and refunds across proportional item allocations", () => {
    const items = qrItemPerformance(
      [
        {
          id: "o",
          status: "COMPLETED",
          items: [
            { menuItemId: "a", name: "A", quantity: 1, lineTotal: 33 },
            { menuItemId: "b", name: "B", quantity: 2, lineTotal: 67 },
          ],
        },
      ],
      [
        { orderId: "o", kind: "COLLECTION", amount: 101 },
        { orderId: "o", kind: "REFUND", amount: 99 },
      ],
      [],
    );
    expect(items.reduce((n, i) => n + i.collectedPaise, 0)).toBe(101);
    expect(items.reduce((n, i) => n + i.refundedPaise, 0)).toBe(99);
    expect(items.reduce((n, i) => n + i.netCollectedPaise, 0)).toBe(2);
    expect(items.every((i) => i.profitPaise === null)).toBe(true);
  });
  it("does not count cancelled drafts as ordered dishes", () => {
    expect(
      qrItemPerformance(
        [
          {
            status: "DRAFT",
            items: [{ name: "A", quantity: 10, lineTotal: 100 }],
          },
          {
            status: "CANCELLED",
            items: [{ name: "B", quantity: 10, lineTotal: 100 }],
          },
        ],
        [],
        [],
      ),
    ).toEqual([]);
  });
  it("keeps discounts, repeated dish order counts and full legacy refunds consistent", () => {
    const [row] = qrItemPerformance(
      [
        {
          id: "legacy",
          status: "REFUNDED",
          paymentStatus: "REFUNDED",
          totalAmount: 80,
          discountAmount: 20,
          items: [
            { menuItemId: "a", name: "Meal", quantity: 1, lineTotal: 50 },
            { menuItemId: "a", name: "Meal", quantity: 1, lineTotal: 50 },
            {
              menuItemId: "b",
              name: "Cancelled",
              quantity: 1,
              lineTotal: 20,
              kitchenStatus: "CANCELLED",
            },
          ],
        },
      ],
      [],
      [],
    );
    expect(row).toMatchObject({
      id: "a",
      orderCount: 1,
      orderedQuantity: 2,
      discountPaise: 20,
      netOrderedValuePaise: 80,
      collectedPaise: 80,
      refundedPaise: 80,
      netCollectedPaise: 0,
    });
  });
});
