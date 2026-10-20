# POS floating Display control removed

Removed the compact `DisplayPreferences` render and its unused import from the POS
entry point, `apps/restaurant-system/pos/src/main.tsx`. Display preference
initialization remains. No footer spacing was reserved for the fixed control, so
no footer or CSS changes were needed.

The Display Button toggle and its persistence remain unchanged in Settings.
The screen-size slider and Standard, Larger text, and Contrast modes still work
there. The POS floating control stays absent even when the saved toggle is ON.
Other applications' floating controls and layouts are unchanged by this request.

Verified the real POS at 1440×900, 1280×768, and 1024×768 using an isolated browser
and seed data, with external/API traffic blocked:

- 21 browser checks passed, including no floating control after reload, intact
  footer metrics, unchanged operational shortcuts, and working Settings controls.
- 19 existing display-preference/language and POS cart/billing tests passed.
- POS TypeScript and `git diff --check` passed.
- No horizontal overflow or uncaught browser errors occurred.

[POS footer](after-counter-1440.png), [Settings](after-settings.png),
[browser results](results.json).
