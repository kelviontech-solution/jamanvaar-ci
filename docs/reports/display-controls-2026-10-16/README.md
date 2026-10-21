# Display visibility settings and POS language picker

The floating Display control is now optional through each application's existing
settings surface. It defaults to ON. OFF removes the control from the rendered UI;
it reserves no layout space. The existing size/contrast modes, presets, and floating
position remain available when enabled.

| Application | Setting location |
| --- | --- |
| POS Counter | Settings → Hardware & Printers → Accessible display |
| Restaurant Admin / Kiosk Admin | Settings → Accessible display |
| Captain | Connection and alert settings |
| KDS | Display & station timing |
| Customer Kiosk | PIN-protected Staff Mode |
| QR Admin | Existing feature Settings |

The POS language picker above Print Queue now fills the available sidebar width,
with the existing warm cream fill, navy text, orange language icon, rounded border,
and subdued dropdown indicator. Its 44px touch target, language options, persistence,
and shared language-update behavior are retained. Other language pickers keep their
existing appearance.

## Persistence and access

Visibility uses the existing device-local localStorage convention, with a key of
`jamanvaar-display-button:v1:<application>:<restaurant>` (scope values are encoded).
POS, Restaurant Admin, Kiosk Admin, QR Admin, Kiosk, Captain, and KDS have separate
application identifiers. Restaurant identity comes from each application's existing
device binding. Unbound installations have a separate default scope. Identity changes
refresh through the existing DeviceGate subscription; Admin product navigation also
refreshes the scope. Storage events synchronize other tabs.

Reads and writes are synchronous, so there is no pending network save or asynchronous
loading state. The UI changes only after localStorage accepts a write. Load errors
show a retry action; save errors retain the previous saved visibility and show an
error. Hiding the launcher does not reset the existing display preset. Preset selectors
in Settings and the floating panel remain synchronized.

This is a local presentation preference, consistent with the existing accessible
display preferences. No server endpoint, database table, backend authorization,
role grant, or Super Admin configuration changed. Each toggle uses the existing
authenticated settings/staff access path, including the kiosk Staff Mode PIN gate.

## Files changed

- [DisplayPreferences.tsx](../../../packages/ui/src/DisplayPreferences.tsx): shared
  launcher condition, settings switch, feedback, and synchronized preset selectors.
- [displayButtonPreference.ts](../../../packages/ui/src/displayButtonPreference.ts):
  scoped local preference reads/writes and subscriptions.
- [StaffLanguage.tsx](../../../packages/ui/src/StaffLanguage.tsx) and
  [PosSidebar.tsx](../../../apps/restaurant-system/pos/src/components/layout/PosSidebar.tsx):
  opt-in POS sidebar styling, retaining the existing language handler.
- Existing app entry points initialize their own scope. POS Settings, Admin Settings,
  Captain connection settings, KDS display settings, Kiosk Staff Mode, and QR Settings
  render the shared control.
- [display_button_preferences.test.tsx](../../../tests/display_button_preferences.test.tsx):
  default visibility, all four POS/Admin combinations, application and tenant isolation,
  navigation, refresh/remount persistence, cross-tab updates, device identity changes,
  load/save failures, display modes, and language behavior.

## Verification

- 36 tests passed: 17 new shared preference/language tests, 17 existing kiosk display
  settings tests, and 2 existing POS cart/billing tests.
- Type checks passed for POS, Restaurant Admin (including QR), Kiosk User, Captain,
  and KDS.
- 19 real-App browser checks passed: 13 POS and 6 Restaurant Admin. These cover
  settings visibility, toggling, reload persistence, existing Display-panel opening,
  larger-text mode, language persistence, and POS widths of 1440, 1280, and 1024px.
- No horizontal POS overflow or uncaught browser errors occurred. Existing footer
  indicators were visually checked in the rendered POS.
- `git diff --check` passed. ESLint is not installed in local node_modules.

Browser verification used isolated seed data and local staff sessions. Required Admin
read APIs returned test fixtures; all other external/API traffic was blocked. No live
restaurant settings, orders, bills, payments, or user sessions were changed. Python and
the Playwright package are unavailable here, so verification reused the repository's
Chromium/CDP harness approach.

## Rendered evidence

- [POS language picker](after-pos-language-1440.png)
- [Narrow-screen language picker](after-pos-language-1024.png)
- [POS settings](after-pos-settings-final.png) / [Display OFF](after-pos-settings-off.png)
- [Restaurant Admin settings](after-admin-settings-final.png) / [Display OFF](after-admin-settings-off.png)
- [POS browser results](pos-results.json), [Admin browser results](admin-results.json)
