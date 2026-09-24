import { describe, it, expect, beforeEach } from 'vitest';
import { stripControlCharsForPrint } from '@jamanvaar/utils';
import { db, OrderRepository } from '@jamanvaar/database';
import { PrinterService } from '@jamanvaar/api';

/**
 * B2-063: ESC/POS command injection (CWE-77-style). A raw control-byte sequence in a free-text
 * field (dish name, customer name, ...) that reaches the printer's byte stream would be executed
 * as a real printer command, not printed as text — e.g. the standard "kick cash drawer" command
 * 0x1B 0x70 0x00 0x19 0xFA. Fixed at the single wrapEscPos() choke point both printer services
 * share, right before the encoded bytes are sent to hardware.
 */
describe('B2-063: ESC/POS command injection is neutralised before reaching the printer', () => {
  beforeEach(() => db.resetToDefaultSeed());

  it('strips ESC, NUL and other C0 control bytes but keeps newlines, tabs and ordinary printable characters', () => {
    // eslint-disable-next-line no-control-regex
    const evil = 'Evil Dish \x1bp\x00\x19\xfa End';
    const cleaned = stripControlCharsForPrint(evil);
    expect(cleaned).not.toContain('\x1b');
    expect(cleaned).not.toContain('\x00');
    expect(cleaned).not.toContain('\x19');
    // \xfa (U+00FA, "ú") is an ordinary printable character, not a control byte — it survives,
    // same as any other accented letter a real dish name might legitimately contain.
    expect(cleaned).toBe('Evil Dish p\xfa End');

    const withFormatting = 'Line one\nLine two\tTabbed';
    expect(stripControlCharsForPrint(withFormatting)).toBe(withFormatting);
  });

  it('a dish name carrying the real "kick cash drawer" ESC/POS command never reaches the printer byte stream with the command bytes intact', () => {
    const category = db.categories[0];
    // eslint-disable-next-line no-control-regex
    const evilName = 'Evil Dish \x1bp\x00\x19\xfa End';
    db.menuItems.push({
      id: 'menu-item-b2063-test',
      categoryId: category.id,
      name: evilName,
      sku: 'EVIL-02',
      price: 199,
      dietaryType: 'VEG',
      spiceLevel: 'MILD',
      description: '',
      isAvailable: true
    } as any);

    const order = OrderRepository.createOrder({
      orderType: 'DINE_IN',
      items: [
        {
          id: 'oi-evil',
          orderId: '',
          menuItemId: 'menu-item-b2063-test',
          name: evilName,
          sku: 'EVIL-02',
          modifiers: [],
          quantity: 1,
          unitPrice: 199,
          totalPrice: 199,
          kitchenStatus: 'PENDING'
        }
      ],
      subtotal: 199,
      discountAmount: 0,
      cgstAmount: 5,
      sgstAmount: 5,
      taxAmount: 10,
      totalAmount: 209,
      paymentMethod: 'CASH',
      orderStatus: 'COMPLETED',
      source_type: 'POS'
    });

    const bytes = PrinterService.generateEscPosBytecode(order);
    // The real ESC-p-NUL-0x19-0xFA drawer-kick sequence must not appear anywhere in the byte
    // stream sent to hardware, even though init (0x1B 0x40) and cut (0x1D 0x56...) commands the
    // app itself adds legitimately are still present.
    const bytesArr = Array.from(bytes);
    const kickSequence = [0x1b, 0x70, 0x00, 0x19, 0xfa];
    const containsKickSequence = bytesArr.some((_, i) => kickSequence.every((b, j) => bytesArr[i + j] === b));
    expect(containsKickSequence).toBe(false);

    // The dish name's own visible text still made it onto the ticket, just without the control bytes.
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('Evil Dish');
    expect(text).toContain('End');

    db.menuItems = db.menuItems.filter((m) => m.id !== 'menu-item-b2063-test');
  });
});
