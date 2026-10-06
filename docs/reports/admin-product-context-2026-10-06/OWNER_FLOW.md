# Owner login and application flow

Restaurant Admin and Kiosk Admin share one server and owner account on port 5176, with separate workspaces:

- `http://localhost:5176/restaurant-admin/dashboard` — restaurant operations.
- `http://localhost:5176/kiosk-admin/dashboard` — customer kiosk management.
- `http://localhost:5176/` or the existing `/pos-admin/` entry — restores this restaurant's last enabled workspace, opens its sole enabled app, or offers a chooser when both are enabled.

1. Set your owner password using the welcome email, if this is a new account.
2. Sign in with Restaurant ID and owner password. On a new device, expand **Connecting a new device? Add your admin key** and enter the key on the same form, or provide it when prompted. Connected devices do not need a fresh key after refresh or normal logout/login.
3. A Kiosk Admin key opens Kiosk Admin. Your subscription determines which apps you may use.
4. If both products are included, use **Switch application** in the header. Each workspace remembers its own page.
5. In Kiosk Admin: Menu Templates → Menu & Categories / Customisations & Tax → Appearance → Payments & Payouts → Terminals. Receipts, printers, staff, orders, kitchen, feedback and sync have their own navigation entries.

Customer Kiosk, POS, KDS and Captain retain their separate terminal activation and staff flows. Switching owner workspaces does not activate another terminal or consume another key. Menu data is shared; appearance and operational navigation remain distinct.

Production nginx aliases `/restaurant-admin/` and `/kiosk-admin/` target the existing pos-admin service. Deploy the updated console/API and apply the updated nginx configuration together to use these routes on a live server. Source changes alone do not update AWS.
