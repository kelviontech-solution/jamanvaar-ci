# Kiosk touch receipt delivery — 8 October 2026

## Confirmed cause

The confirmation screen armed an independent 3.5-second return timer after printing and speech finished. Opening an email or WhatsApp modal did not cancel it. Resetting the normal inactivity timer also did not cancel it. Consequently, the kiosk could clear its session while a customer entered an address or waited for the send response. The old receipt inputs also required a physical keyboard or a device-provided keyboard.

## Implemented behavior

- Email opens a navy, ivory and orange popup containing its own QWERTY touch keyboard, digits, punctuation, Shift, backspace, clear and common domain shortcuts. Customers can reposition the cursor to correct their address.
- WhatsApp opens a numeric touch keypad with the +91 prefix, ten-digit validation, clear and backspace.
- The field suppresses the native software keyboard. Physical keyboard entry and paste remain supported when available.
- Send stays disabled for an invalid recipient. An active request disables duplicate sends, editing, Cancel and dismissing the popup.
- Successful requests show a persistent, explicit success panel with **Back to receipt** and **Done · Next customer** actions. Failed requests show an error, preserve the recipient and allow an explicit retry.
- Confirmation returns automatically after 15 seconds without interaction, once printing and speech have settled. Opening a receipt or handoff popup cancels that timer; closing the popup gives a fresh window. Interaction restarts it.
- Normal configured inactivity warnings and session clearing remain in effect for an abandoned popup. Inactivity is paused while delivery is in progress. Recipient input clears when the popup unmounts, and the full session reset clears receipt state.
- Existing server-generated PDF delivery, WhatsApp integration and bounded order-sync recovery are retained. No production backend or delivery configuration was changed.

## Verification

**25/25 focused tests passed**: nine new keyboard/modal/timer regression checks plus sixteen existing bill-delivery checks. These cover caret correction, recipient validation, duplicate taps, slow requests, failed requests, explicit retry, success acknowledgement, clearing the next recipient, and timer cancellation/rearming.

**6/6 Playwright browser scenarios passed**, using the compiled customer Kiosk and an isolated API/database:

1. Actual cash-at-counter checkout completed entirely by touch.
2. Email was entered through the touch keyboard, including punctuation and correction; the popup survived more than 15 seconds.
3. A real receipt API generated a 2,282-byte PDF attachment. A deliberately delayed response kept sending controls disabled, followed by visible success held for another 17 seconds. One email request was made.
4. WhatsApp numeric entry retained the phone number after a simulated provider failure; an explicit retry succeeded.
5. Recipient state cleared on reopening. No horizontal page overflow was found at 390×844, 768×1024, 1080×1920 and 1366×768; recipient and send controls remained reachable. Screenshots were inspected.
6. The untouched confirmation returned to the welcome screen. No uncaught browser page errors were recorded.

Kiosk TypeScript and Vite production build passed. Git whitespace check passed. Vite retains its existing large-chunk advisory.

## Evidence and limits

- [Browser results](BROWSER_RESULTS.json)
- [Email touch keyboard](evidence/email-touch-keyboard.png)
- [Email success](evidence/email-success.png)
- [WhatsApp keypad](evidence/whatsapp-keypad.png)
- [Portrait layout](evidence/email-390x844.png)
- Test and build logs: `logs/kiosk-touch-receipt-tests.log`, `logs/kiosk-touch-receipt-build.log`, `logs/kiosk-touch-receipt-browser.log`.

Email provider transport was captured locally; no external email was sent. WhatsApp provider responses were simulated. These checks verify the touchscreen workflow and the actual email/PDF API, not production SMTP or WhatsApp delivery. The isolated fixture also emitted background 400/403 responses for unrelated requests; the six scenario results are not a claim that every kiosk API passed. No AWS deployment or physical kiosk hardware test was performed.

## Files

- `apps/kiosk-system/kiosk-user/src/App.tsx`
- `apps/kiosk-system/kiosk-user/src/KioskReceiptDeliveryDialog.tsx`
- `apps/kiosk-system/kiosk-user/src/useKioskConfirmationReturn.ts`
- `tests/kiosk_receipt_touch.test.tsx`
- `tooling/qa/browser-kiosk-touch-receipt.cjs`
- `tooling/qa/browser-audit-server.cjs` — isolated email capture support only.
