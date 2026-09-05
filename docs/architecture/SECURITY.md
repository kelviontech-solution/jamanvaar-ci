# JAMANVAAR Security & Kiosk Lockdown Specifications

## 1. Public Kiosk Lockdown & Hardening

The customer touch kiosk (`/apps/kiosk-user`) operates in a restricted execution context:

- **Fullscreen Execution**: Pinned window configuration with no titlebar, minimize, or close buttons.
- **Input Interception**: Disables F1-F12 keyboard combinations, context menus (right-click), Alt+Tab, and OS navigation shortcuts.
- **Zero Technical Error Leakage**: All backend or peripheral errors are caught gracefully and presented as polite customer notices ("Something went wrong, please try again") rather than raw technical stack traces.

---

## 2. Session Isolation & Memory Scrubbing

- **Automatic Inactivity Countdown**: Inactivity warning triggers after 45 seconds of idle time. If not dismissed within 15 seconds, the session completely purges:
  - Active cart items
  - Customer phone numbers & loyalty data
  - Temporary modifier states
  - Payment transaction tokens
- **Post-Order Auto Reset**: Following successful order confirmation, the kiosk automatically scrubs session memory and returns to the Welcome Screen.

---

## 3. Credential & Secrets Security

- No plaintext payment secrets, private keys, or passwords are stored in the local SQLite database.
- Payment gateway secrets are injected strictly via secure OS environment variables or encrypted keychain stores.
