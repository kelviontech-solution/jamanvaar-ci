/**
 * B2-063: ESC/POS command injection (CWE-77-style: untrusted text reaching a raw device
 * protocol). Every receipt/KOT is built by concatenating free-text fields (dish name,
 * description, modifier names, customer name, Chef Notes, coupon codes, combo names — anything
 * that ends up on a printed document) into one plain-text string, which is then encoded
 * byte-for-byte and sent straight to the physical printer. ESC/POS control commands are
 * themselves raw control-character byte sequences (e.g. `0x1B 0x70 0x00 0x19 0xFA` — the
 * standard "kick cash drawer" command), so a name containing one is executed by the printer as
 * a real command the moment anything containing it is printed: kicking the cash drawer, forcing
 * arbitrary QR/barcode generation, or on some firmwares a factory-reset/self-test sequence that
 * hangs the device. Confirmed live: a dish named `Evil Dish <ESC>p\x00\x19\xFA End` was accepted
 * with no validation and stored byte-for-byte.
 *
 * The fix is applied at the single point every receipt/KOT byte stream passes through right
 * before being sent to hardware (`wrapEscPos` in both `packages/api/src/printer.ts` and
 * `apps/restaurant-system/pos/src/services/printerService.ts`) rather than at each individual
 * free-text field — a boundary fix catches every current *and future* field that ends up on a
 * printed document, the same lesson B2-061's CSV fix already applied (one canonical choke point
 * beats patching call sites one at a time).
 */

/**
 * Strips control characters from text before it is encoded into a raw printer byte stream.
 * Keeps `\n` and `\t` (real formatting the receipt/KOT templates rely on) and every printable
 * character; removes every other C0 control byte (0x00-0x1F), DEL (0x7F), and the C1 control
 * range (0x80-0x9F) — the bytes ESC/POS command sequences are built from.
 */
export function stripControlCharsForPrint(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
}
