# UX Consistency Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire JAMANVAAR's already-configured but unused `jaman-*` Tailwind color tokens into real use across 6 apps, migrate hand-rolled empty-state UI onto the existing shared `packages/ui` components in 4 apps, and visually align Super Admin's separate component system — with zero behavior or visible-color change (this is plumbing, not a redesign).

**Architecture:** A small reusable Node script performs the same-value hex→token substitution mechanically, run once per app. Empty-state migrations are per-app, per-instance manual swaps onto `packages/ui`'s existing `EmptyState` component, preserving each screen's copy and actions exactly. Super Admin's CSS custom properties and `ui.tsx`/`ui.css` get hand-adjusted to match the shared visual shape (icon-box size/radius/background, title size) since its color values already match.

**Tech Stack:** Node.js (script), Tailwind CSS, React/TypeScript, vitest, `@jamanvaar/ui`.

**Spec:** `docs/superpowers/specs/2026-09-17-ux-consistency-phase1-design.md`

## Global Constraints

- No visible color change: every token substitution must render the identical computed color it replaces. Any hex value found that is *close to but not exactly equal to* one of the 10 known token values must be flagged as a comment in the task's commit message, not silently mapped to the nearest token.
- No copy changes: empty-state migrations preserve each screen's existing title/description/action text and button behavior exactly.
- No new dependencies: `@jamanvaar/ui` is already a listed dependency in all 4 apps touched by the empty-state workstream — confirmed, no `package.json` changes needed there.
- Every task ends with `tsc --noEmit` clean on the touched app and the full root `npx vitest run` suite at the established 398/398 baseline (re-run after each task, not just once at the end — regressions must be caught immediately, not batched).
- The 10 known brand hex values and their token names (used throughout this plan):

  | Hex | Token name | Tailwind class root |
  | :-- | :-- | :-- |
  | `#0B253A` | `navy` | `jaman-navy` |
  | `#0B2B39` | `deepNavy` | `jaman-deepNavy` |
  | `#E66817` | `saffron` | `jaman-saffron` |
  | `#F97316` | `orange` | `jaman-orange` |
  | `#FBF9F5` | `ivory` | `jaman-ivory` |
  | `#FAF7F2` | `cream` | `jaman-cream` |
  | `#00A99D` | `teal` | `jaman-teal` |
  | `#0D9488` | `darkTeal` | `jaman-darkTeal` |
  | `#EBE6DD` | `border` | `jaman-border` |
  | `#1E3A4C` | `darkBorder` | `jaman-darkBorder` |

---

### Task 1: Add missing color tokens to kiosk-admin and kiosk-user Tailwind configs

`apps/kiosk-system/kiosk-admin/tailwind.config.js` and `apps/kiosk-system/kiosk-user/tailwind.config.js` currently only define 5 of the 10 tokens (`navy`, `saffron`, `ivory`, `teal`, `border`) while the other 5 apps (pos-admin, pos, captain, kds) define all 10. Bring these two configs up to parity so the same token map applies uniformly in Tasks 7–8.

**Files:**
- Modify: `apps/kiosk-system/kiosk-admin/tailwind.config.js`
- Modify: `apps/kiosk-system/kiosk-user/tailwind.config.js`

**Interfaces:**
- Produces: `jaman-deepNavy`, `jaman-orange`, `jaman-cream`, `jaman-darkTeal`, `jaman-darkBorder` Tailwind utility classes, now available in both apps (used by Tasks 7–8).

- [ ] **Step 1: Update kiosk-admin's config**

Replace the `colors.jaman` block in `apps/kiosk-system/kiosk-admin/tailwind.config.js` (currently 5 keys) with the full 10-key block, copied verbatim from `apps/restaurant-system/pos/tailwind.config.js`:

```js
      colors: {
        jaman: {
          navy: '#0B253A',
          deepNavy: '#0B2B39',
          saffron: '#E66817',
          orange: '#F97316',
          ivory: '#FBF9F5',
          cream: '#FAF7F2',
          teal: '#00A99D',
          darkTeal: '#0D9488',
          border: '#EBE6DD',
          darkBorder: '#1E3A4C'
        }
      }
```

- [ ] **Step 2: Update kiosk-user's config**

Apply the identical change to `apps/kiosk-system/kiosk-user/tailwind.config.js`.

- [ ] **Step 3: Verify both apps still build**

Run:
```
cd apps/kiosk-system/kiosk-admin && npx tsc --noEmit -p .
cd apps/kiosk-system/kiosk-user && npx tsc --noEmit -p .
```
Expected: no output (clean) from both. This is a config-only change — no source file touches the new tokens yet, so nothing should break.

- [ ] **Step 4: Commit**

```bash
git add apps/kiosk-system/kiosk-admin/tailwind.config.js apps/kiosk-system/kiosk-user/tailwind.config.js
git commit -m "chore(kiosk-admin,kiosk-user): complete jaman color token palette to match other 5 apps"
```

---

### Task 2: Build and test the token-replacement script

**Files:**
- Create: `scripts/replace-brand-color-tokens.mjs`
- Create: `scripts/__fixtures__/replace-brand-color-tokens.fixture.tsx` (scratch fixture used only for Step 1–2, deleted in Step 5)

**Interfaces:**
- Produces: a CLI script invoked as `node scripts/replace-brand-color-tokens.mjs <path-to-app-src-glob-root>`, used by Tasks 3–8. Exits with a summary line `Replaced N occurrences across M files.` printed to stdout.

- [ ] **Step 1: Write the fixture and expected-output check**

Create `scripts/__fixtures__/replace-brand-color-tokens.fixture.tsx`:

```tsx
export const Fixture = () => (
  <div className="bg-[#0B253A] text-[#E66817] border-[#EBE6DD]/60 shadow-[#0B253A]/25">
    <span className="from-[#0B2B39] to-[#F97316] ring-[#00A99D]/20 fill-[#0D9488] border-l-[#1E3A4C]">
      <p className="bg-[#FBF9F5] text-[#faf7f2]">lowercase hex test</p>
    </span>
  </div>
);
```

- [ ] **Step 2: Write the script**

```js
#!/usr/bin/env node
// Mechanically replaces raw Tailwind arbitrary-hex brand-color utilities
// (e.g. bg-[#0B253A]) with the equivalent named jaman-* token utility
// (bg-jaman-navy), for the 10 known brand hex values. Same computed
// color, different source — a refactor, not a redesign. Case-insensitive
// on the hex digits; preserves any /NN opacity suffix.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const TOKEN_MAP = {
  '0B253A': 'navy',
  '0B2B39': 'deepNavy',
  E66817: 'saffron',
  F97316: 'orange',
  FBF9F5: 'ivory',
  FAF7F2: 'cream',
  '00A99D': 'teal',
  '0D9488': 'darkTeal',
  EBE6DD: 'border',
  '1E3A4C': 'darkBorder'
};

const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

function buildPattern() {
  const hexAlternation = Object.keys(TOKEN_MAP).join('|');
  // group 1: utility prefix (e.g. "bg", "border-l", "text")
  // group 2: the hex digits (case-insensitive)
  // group 3: optional "/NN" opacity suffix
  return new RegExp(`([a-zA-Z][a-zA-Z-]*)-\\[#(${hexAlternation})\\](\\/\\d+)?`, 'gi');
}

function replaceInContent(content) {
  const pattern = buildPattern();
  let count = 0;
  const result = content.replace(pattern, (match, prefix, hex, opacity = '') => {
    const canonicalHex = Object.keys(TOKEN_MAP).find((h) => h.toLowerCase() === hex.toLowerCase());
    if (!canonicalHex) return match; // defensive: unknown hex, leave untouched
    count += 1;
    return `${prefix}-jaman-${TOKEN_MAP[canonicalHex]}${opacity}`;
  });
  return { result, count };
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      walk(full, files);
    } else if (EXTENSIONS.has(extname(full))) {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const root = process.argv[2];
  if (!root) {
    console.error('Usage: node scripts/replace-brand-color-tokens.mjs <root-dir>');
    process.exit(1);
  }
  const files = walk(root);
  let totalCount = 0;
  let filesChanged = 0;
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const { result, count } = replaceInContent(content);
    if (count > 0) {
      writeFileSync(file, result, 'utf8');
      totalCount += count;
      filesChanged += 1;
    }
  }
  console.log(`Replaced ${totalCount} occurrences across ${filesChanged} files.`);
}

main();
```

- [ ] **Step 3: Run the script against the fixture to verify correctness**

Run:
```
node scripts/replace-brand-color-tokens.mjs scripts/__fixtures__
cat scripts/__fixtures__/replace-brand-color-tokens.fixture.tsx
```
Expected output line: `Replaced 9 occurrences across 1 files.`
Expected fixture content after the run:
```tsx
export const Fixture = () => (
  <div className="bg-jaman-navy text-jaman-saffron border-jaman-border/60 shadow-jaman-navy/25">
    <span className="from-jaman-deepNavy to-jaman-orange ring-jaman-teal/20 fill-jaman-darkTeal border-l-jaman-darkBorder">
      <p className="bg-jaman-ivory text-jaman-cream">lowercase hex test</p>
    </span>
  </div>
);
```
Verify the lowercase `#faf7f2` correctly mapped to `jaman-cream` (case-insensitive match works) and the `/60`, `/25`, `/20` opacity suffixes were preserved.

- [ ] **Step 4: Re-run the script a second time to confirm idempotency**

Run the same command again:
```
node scripts/replace-brand-color-tokens.mjs scripts/__fixtures__
```
Expected: `Replaced 0 occurrences across 0 files.` — proves the script is safe to re-run (won't double-transform already-converted classes, since `jaman-navy` no longer matches the `\[#HEX\]` pattern).

- [ ] **Step 5: Delete the fixture**

```bash
rm scripts/__fixtures__/replace-brand-color-tokens.fixture.tsx
rmdir scripts/__fixtures__
```

- [ ] **Step 6: Commit**

```bash
git add scripts/replace-brand-color-tokens.mjs
git commit -m "chore: add mechanical brand-color-token replacement script"
```

---

### Task 3: Apply token replacement to pos-admin

**Files:**
- Modify: all `.ts`/`.tsx`/`.css` files under `apps/restaurant-system/pos-admin/src` containing arbitrary-hex brand-color classes (~2,515 occurrences per the design doc's count; exact set determined by running the script, not enumerated here).

**Interfaces:**
- Consumes: `scripts/replace-brand-color-tokens.mjs` (Task 2).

- [ ] **Step 1: Run the script**

```
node scripts/replace-brand-color-tokens.mjs apps/restaurant-system/pos-admin/src
```
Note the printed `Replaced N occurrences across M files.` count for the commit message.

- [ ] **Step 2: Confirm no arbitrary-hex brand classes remain**

```
grep -rEo "[a-zA-Z-]+-\[#(0B253A|0B2B39|E66817|F97316|FBF9F5|FAF7F2|00A99D|0D9488|EBE6DD|1E3A4C)\]" apps/restaurant-system/pos-admin/src -i
```
Expected: no output (zero matches). If any remain, they're inside a template-literal or dynamically-constructed className string the regex couldn't reach — locate each manually and convert by hand to the matching `jaman-*` class before proceeding.

- [ ] **Step 3: Type-check**

```
cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p .
```
Expected: clean (no output).

- [ ] **Step 4: Run the full test suite**

```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing (the established baseline) — this is a pure class-name refactor with no behavior change, so no test should be affected.

- [ ] **Step 5: Commit**

```bash
git add apps/restaurant-system/pos-admin/src
git commit -m "refactor(pos-admin): wire jaman-* color tokens into use, replacing raw hex"
```

---

### Task 4: Apply token replacement to pos

Same procedure as Task 3, applied to `apps/restaurant-system/pos/src` (~1,790 occurrences per the design doc's count).

**Files:**
- Modify: all `.ts`/`.tsx`/`.css` files under `apps/restaurant-system/pos/src` containing arbitrary-hex brand-color classes.

- [ ] **Step 1: Run the script**
```
node scripts/replace-brand-color-tokens.mjs apps/restaurant-system/pos/src
```
- [ ] **Step 2: Confirm no arbitrary-hex brand classes remain**
```
grep -rEo "[a-zA-Z-]+-\[#(0B253A|0B2B39|E66817|F97316|FBF9F5|FAF7F2|00A99D|0D9488|EBE6DD|1E3A4C)\]" apps/restaurant-system/pos/src -i
```
Expected: no output.
- [ ] **Step 3: Type-check**
```
cd apps/restaurant-system/pos && npx tsc --noEmit -p .
```
- [ ] **Step 4: Run the full test suite**
```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing.
- [ ] **Step 5: Commit**
```bash
git add apps/restaurant-system/pos/src
git commit -m "refactor(pos): wire jaman-* color tokens into use, replacing raw hex"
```

---

### Task 5: Apply token replacement to captain

Same procedure, applied to `apps/restaurant-system/captain/src` (~470 occurrences).

**Files:**
- Modify: all `.ts`/`.tsx`/`.css` files under `apps/restaurant-system/captain/src`.

- [ ] **Step 1: Run the script**
```
node scripts/replace-brand-color-tokens.mjs apps/restaurant-system/captain/src
```
- [ ] **Step 2: Confirm no arbitrary-hex brand classes remain**
```
grep -rEo "[a-zA-Z-]+-\[#(0B253A|0B2B39|E66817|F97316|FBF9F5|FAF7F2|00A99D|0D9488|EBE6DD|1E3A4C)\]" apps/restaurant-system/captain/src -i
```
- [ ] **Step 3: Type-check**
```
cd apps/restaurant-system/captain && npx tsc --noEmit -p .
```
- [ ] **Step 4: Run the full test suite**
```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing.
- [ ] **Step 5: Commit**
```bash
git add apps/restaurant-system/captain/src
git commit -m "refactor(captain): wire jaman-* color tokens into use, replacing raw hex"
```

---

### Task 6: Apply token replacement to kds

Same procedure, applied to `apps/restaurant-system/kds/src` (~58 occurrences — smallest of the six).

**Files:**
- Modify: `apps/restaurant-system/kds/src/App.tsx` and any other `.ts`/`.tsx`/`.css` files under `apps/restaurant-system/kds/src`.

- [ ] **Step 1: Run the script**
```
node scripts/replace-brand-color-tokens.mjs apps/restaurant-system/kds/src
```
- [ ] **Step 2: Confirm no arbitrary-hex brand classes remain**
```
grep -rEo "[a-zA-Z-]+-\[#(0B253A|0B2B39|E66817|F97316|FBF9F5|FAF7F2|00A99D|0D9488|EBE6DD|1E3A4C)\]" apps/restaurant-system/kds/src -i
```
- [ ] **Step 3: Type-check**
```
cd apps/restaurant-system/kds && npx tsc --noEmit -p .
```
- [ ] **Step 4: Run the full test suite**
```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing.
- [ ] **Step 5: Commit**
```bash
git add apps/restaurant-system/kds/src
git commit -m "refactor(kds): wire jaman-* color tokens into use, replacing raw hex"
```

---

### Task 7: Apply token replacement to kiosk-admin

Same procedure, applied to `apps/kiosk-system/kiosk-admin/src` (~1,183 occurrences). Depends on Task 1 (full token palette must exist in this app's config first).

**Files:**
- Modify: `apps/kiosk-system/kiosk-admin/src/App.tsx` and any other `.ts`/`.tsx`/`.css` files under `apps/kiosk-system/kiosk-admin/src`.

- [ ] **Step 1: Run the script**
```
node scripts/replace-brand-color-tokens.mjs apps/kiosk-system/kiosk-admin/src
```
- [ ] **Step 2: Confirm no arbitrary-hex brand classes remain**
```
grep -rEo "[a-zA-Z-]+-\[#(0B253A|0B2B39|E66817|F97316|FBF9F5|FAF7F2|00A99D|0D9488|EBE6DD|1E3A4C)\]" apps/kiosk-system/kiosk-admin/src -i
```
- [ ] **Step 3: Type-check**
```
cd apps/kiosk-system/kiosk-admin && npx tsc --noEmit -p .
```
- [ ] **Step 4: Run the full test suite**
```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing.
- [ ] **Step 5: Commit**
```bash
git add apps/kiosk-system/kiosk-admin/src
git commit -m "refactor(kiosk-admin): wire jaman-* color tokens into use, replacing raw hex"
```

---

### Task 8: Apply token replacement to kiosk-user

Same procedure, applied to `apps/kiosk-system/kiosk-user/src` (~390 occurrences). Depends on Task 1.

**Files:**
- Modify: `apps/kiosk-system/kiosk-user/src/App.tsx` and any other `.ts`/`.tsx`/`.css` files under `apps/kiosk-system/kiosk-user/src`.

- [ ] **Step 1: Run the script**
```
node scripts/replace-brand-color-tokens.mjs apps/kiosk-system/kiosk-user/src
```
- [ ] **Step 2: Confirm no arbitrary-hex brand classes remain**
```
grep -rEo "[a-zA-Z-]+-\[#(0B253A|0B2B39|E66817|F97316|FBF9F5|FAF7F2|00A99D|0D9488|EBE6DD|1E3A4C)\]" apps/kiosk-system/kiosk-user/src -i
```
- [ ] **Step 3: Type-check**
```
cd apps/kiosk-system/kiosk-user && npx tsc --noEmit -p .
```
- [ ] **Step 4: Run the full test suite**
```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing.
- [ ] **Step 5: Commit**
```bash
git add apps/kiosk-system/kiosk-user/src
git commit -m "refactor(kiosk-user): wire jaman-* color tokens into use, replacing raw hex"
```

---

### Task 9: Migrate pos-admin's hand-rolled empty states to the shared `EmptyState`

`packages/ui`'s `EmptyState` (`packages/ui/src/StateFeedback.tsx`) accepts `title?`, `description?`, `actionText?`, `onAction?`, `icon?`, `className?` and already renders an icon-in-rounded-square wrapper + title + description + optional action button. Migrate 4 confirmed instances (plus 1 minor icon-less one) in pos-admin, preserving each screen's copy/icon/action exactly — the icon's own color styling is dropped in favor of the shared wrapper's standard treatment (this is the intended consistency win, not a regression).

**Files:**
- Modify: `apps/restaurant-system/pos-admin/src/components/orders/OrdersModule.tsx:502-519` (plus the rest of that button block, not shown in the excerpt below — read the file first to capture it in full)
- Modify: `apps/restaurant-system/pos-admin/src/components/billing/BillingInvoicesModule.tsx:856-870`
- Modify: `apps/restaurant-system/pos-admin/src/components/customers/CustomersCrmModule.tsx:523-541` and `:901-904`
- Modify: `apps/restaurant-system/pos-admin/src/components/kitchen/KitchenKotModule.tsx:242-253`

**Interfaces:**
- Consumes: `EmptyState` from `@jamanvaar/ui` (already listed as a dependency in `apps/restaurant-system/pos-admin/package.json`).

- [ ] **Step 1: Read each target file's current empty-state block in full**

Before editing, read `OrdersModule.tsx` around line 502-540 (the button block continues past line 519 in the excerpt captured during planning), `BillingInvoicesModule.tsx` around 856-870, `CustomersCrmModule.tsx` around 523-545 and 895-910, and `KitchenKotModule.tsx` around 242-253 — to capture each one's full current JSX (including any code past what's summarized here) before replacing it.

- [ ] **Step 2: Migrate `OrdersModule.tsx`**

Replace the empty-state block (starting `{filteredDaySummaries.length === 0 && (` through its closing `)}`) with:

```tsx
{filteredDaySummaries.length === 0 && (
  <EmptyState
    icon={<ShoppingBag className="w-8 h-8" />}
    title="No Orders Found"
    description="There are no customer orders matching the selected date period or search query."
    actionText="Reset Filters"
    onAction={() => {
      setFilterPreset('TODAY');
      setDaysSearchQuery('');
    }}
  />
)}
```

Add `EmptyState` to the `@jamanvaar/ui` import list at the top of the file. If the original button block had more than one action (verify in Step 1), keep any additional buttons as siblings rendered directly after the `<EmptyState>` element rather than dropping them.

- [ ] **Step 3: Migrate `BillingInvoicesModule.tsx`**

Replace the block (`{filteredOrders.length === 0 ? (` through its matching `) : (`) with:

```tsx
{filteredOrders.length === 0 ? (
  <EmptyState
    icon={<Receipt className="w-8 h-8" />}
    title="No Invoices or Orders Found"
    description="No transaction records matched the selected date scope, tender filters, or search criteria."
    actionText="Clear Filters & Show All Records"
    onAction={handleClearAllFilters}
  />
) : (
```

Add `EmptyState` to this file's `@jamanvaar/ui` import list.

- [ ] **Step 4: Migrate `CustomersCrmModule.tsx`'s main empty state**

This one branches on `customers.length === 0` vs. a filtered-empty state — compute the title/description/action before rendering `EmptyState` rather than duplicating the component call:

```tsx
{filteredCustomers.length === 0 ? (
  <EmptyState
    icon={<Users className="w-8 h-8" />}
    title={customers.length === 0 ? 'No Guest Profiles Yet' : 'No Customer Profiles Found'}
    description={
      customers.length === 0
        ? 'Real guest profiles appear here automatically once a customer is attached to an order at POS, Kiosk, or Captain — no demo data is shown until then.'
        : 'No guest records matched the selected dining segment, tag filter, or search query.'
    }
    actionText={customers.length > 0 ? 'Reset Filters' : undefined}
    onAction={customers.length > 0 ? handleResetCrmFilters : undefined}
  />
) : (
```

Read the original filtered-branch button's `onClick` handler in Step 1 and use its exact logic as the body of `handleResetCrmFilters` (either an existing named function in the file, or inline the original `onClick` body directly in place of `handleResetCrmFilters`).

- [ ] **Step 5: Migrate `CustomersCrmModule.tsx`'s minor billing-history empty state**

At line ~901-904, replace the plain `<div>No previous order bills recorded for this mobile number yet.</div>`-style block with:

```tsx
<EmptyState description="No previous order bills recorded for this mobile number yet." />
```

(No title/icon/action needed — `EmptyState`'s defaults handle the icon, and an empty title is acceptable to omit since the component's `title` prop is optional; if the original block's styling implies a title is expected visually, instead pass `title="No Billing History"` to match the pattern used elsewhere in this file.)

- [ ] **Step 6: Migrate `KitchenKotModule.tsx`**

Replace the block (`{filteredKots.length === 0 ? (` through its matching `) : (`) with:

```tsx
{filteredKots.length === 0 ? (
  <EmptyState
    icon={<ChefHat className="w-8 h-8" />}
    title="Your Kitchen is Clear"
    description="No active KOT tickets are waiting right now for the selected station or status."
  />
) : (
```

Add `EmptyState` to this file's `@jamanvaar/ui` import list.

- [ ] **Step 7: Type-check**

```
cd apps/restaurant-system/pos-admin && npx tsc --noEmit -p .
```
Expected: clean. If `ShoppingBag`, `Receipt`, `Users`, or `ChefHat` (lucide-react icons) aren't already imported in a given file, add them to that file's `lucide-react` import line.

- [ ] **Step 8: Run the full test suite**

```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing. If any pos-admin test asserts on the exact empty-state DOM structure (e.g. querying for a specific class name that no longer exists), update that test's selector to match the new `EmptyState`-rendered markup rather than skip it.

- [ ] **Step 9: Commit**

```bash
git add apps/restaurant-system/pos-admin/src/components/orders/OrdersModule.tsx apps/restaurant-system/pos-admin/src/components/billing/BillingInvoicesModule.tsx apps/restaurant-system/pos-admin/src/components/customers/CustomersCrmModule.tsx apps/restaurant-system/pos-admin/src/components/kitchen/KitchenKotModule.tsx
git commit -m "refactor(pos-admin): migrate hand-rolled empty states onto shared EmptyState component"
```

---

### Task 10: Migrate pos's hand-rolled empty states to the shared `EmptyState`

**Files:**
- Modify: `apps/restaurant-system/pos/src/components/tables/PosFloorPlan.tsx:329-346` (two-tier: no tables configured, and no filter match)
- Modify: `apps/restaurant-system/pos/src/components/menu/PosMenuManagerModal.tsx:692-699`
- Modify: `apps/restaurant-system/pos/src/components/days/PosDayOrdersModal.tsx:248-253`
- Modify: `apps/restaurant-system/pos/src/components/shift/PosShiftAndCashView.tsx:755-759`

**Interfaces:**
- Consumes: `EmptyState` from `@jamanvaar/ui` (already a dependency of `apps/restaurant-system/pos/package.json`).

- [ ] **Step 1: Read each target file's current empty-state block in full**

Read `PosFloorPlan.tsx` around 329-360 (both tiers), `PosMenuManagerModal.tsx` around 692-700, `PosDayOrdersModal.tsx` around 248-256, and `PosShiftAndCashView.tsx` around 755-762.

- [ ] **Step 2: Migrate `PosFloorPlan.tsx`'s two tiers**

Replace the first tier (`{tables.length === 0 ? (` block) with:

```tsx
{tables.length === 0 ? (
  <EmptyState
    icon={<AlertTriangle className="w-8 h-8" />}
    title="No Tables Configured"
    description="No dining tables found. Please configure your floor layout in Settings."
    actionText="Configure Tables"
    onAction={() => setActiveTab("SETTINGS")}
  />
) : filteredTables.length === 0 ? (
  <EmptyState
    icon={<LayoutGrid className="w-8 h-8" />}
    title="No tables match this filter"
    actionText="Clear Filters"
    onAction={() => { setSelectedZone("ALL"); setStatusFilter("ALL"); }}
  />
) : (
```

Add `EmptyState` to this file's `@jamanvaar/ui` import list.

- [ ] **Step 3: Migrate `PosMenuManagerModal.tsx`**

Replace the block (`{filteredItems.length === 0 ? (` through its matching `) : (`) with:

```tsx
{filteredItems.length === 0 ? (
  <EmptyState
    icon={<Utensils className="w-8 h-8" />}
    title="No dishes match your search"
    description="Try changing your category filter, search query, or import authentic dishes from the Preloaded Starter Library."
  />
) : (
```

Add `EmptyState` to this file's `@jamanvaar/ui` import list.

- [ ] **Step 4: Migrate `PosDayOrdersModal.tsx`**

Replace the block (`{filteredOrders.length === 0 && (` through its closing `)}`) with:

```tsx
{filteredOrders.length === 0 && (
  <EmptyState
    icon={<ShoppingBag className="w-8 h-8" />}
    title="No orders matched your filters"
    description='Try clearing your search query or selecting "All Statuses"'
  />
)}
```

Add `EmptyState` to this file's `@jamanvaar/ui` import list.

- [ ] **Step 5: Migrate `PosShiftAndCashView.tsx`**

Replace the plain text block at line ~755-759 with:

```tsx
<EmptyState description="No historical shifts found for the selected filter." />
```

Add `EmptyState` to this file's `@jamanvaar/ui` import list.

- [ ] **Step 6: Type-check**

```
cd apps/restaurant-system/pos && npx tsc --noEmit -p .
```
Add any missing lucide-react icon imports (`AlertTriangle`, `LayoutGrid`, `Utensils`, `ShoppingBag`) as needed per file.

- [ ] **Step 7: Run the full test suite**

```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing.

- [ ] **Step 8: Commit**

```bash
git add apps/restaurant-system/pos/src/components/tables/PosFloorPlan.tsx apps/restaurant-system/pos/src/components/menu/PosMenuManagerModal.tsx apps/restaurant-system/pos/src/components/days/PosDayOrdersModal.tsx apps/restaurant-system/pos/src/components/shift/PosShiftAndCashView.tsx
git commit -m "refactor(pos): migrate hand-rolled empty states onto shared EmptyState component"
```

---

### Task 11: Migrate captain's hand-rolled empty states to the shared `EmptyState`

`CaptainTableWorkspaceModal.tsx`'s empty state has **two** action buttons ("+ Open Menu & Add Dishes" and "Repeat Previous Order"), which exceeds `EmptyState`'s single `actionText`/`onAction` pair — keep the second button as a sibling rendered immediately after `<EmptyState>` rather than dropping it or changing the component's API.

**Files:**
- Modify: `apps/restaurant-system/captain/src/components/tables/CaptainFloorView.tsx:282-330`
- Modify: `apps/restaurant-system/captain/src/components/tables/CaptainTableWorkspaceModal.tsx:235-307`

**Interfaces:**
- Consumes: `EmptyState` from `@jamanvaar/ui` (already a dependency of `apps/restaurant-system/captain/package.json`).

- [ ] **Step 1: Read each target file's current empty-state block in full**

Read `CaptainFloorView.tsx` around 282-335 and `CaptainTableWorkspaceModal.tsx` around 235-315 to capture the full button blocks (including the "Repeat Previous Order" button's complete `onClick` body, which handles a failure case per the earlier research — `setRepeatOrderError(...)`).

- [ ] **Step 2: Migrate `CaptainFloorView.tsx`**

Replace the else-branch block (after `{filteredTables.length > 0 ? ( ... ) : (` through its closing `)}`) with:

```tsx
<EmptyState
  icon={<UtensilsCrossed className="w-8 h-8" />}
  title="No tables match your current filter"
  description={
    tableFilter === 'BILL_REQUESTED'
      ? 'No tables currently have pending bill requests on this floor.'
      : tableFilter === 'FOOD_READY'
      ? 'No tables currently have ready dishes waiting in the kitchen.'
      : 'Try adjusting your zone or search criteria to view more floor tables.'
  }
  actionText="Reset Filters"
  onAction={() => {
    setTableFilter('ALL_TABLES');
    setSelectedZone('ALL');
    setLocalSearch('');
  }}
/>
```

Add `EmptyState` to this file's `@jamanvaar/ui` import list.

- [ ] **Step 3: Migrate `CaptainTableWorkspaceModal.tsx`**

Replace the else-branch block (after `{cartItems.length > 0 ? ( ... ) : (` through its closing `)}`) with `EmptyState` for the icon/title, keeping both buttons as siblings below it (the primary "Open Menu" action can also live in `EmptyState`'s own `actionText`/`onAction`, with the secondary "Repeat Previous Order" button rendered directly after):

```tsx
<>
  <EmptyState
    icon={<UtensilsCrossed className="w-8 h-8" />}
    description={`No dishes added to Table ${table.tableNumber} yet.`}
    actionText="+ Open Menu & Add Dishes"
    onAction={() => setActiveWorkspaceTab('MENU')}
  />
  <div className="flex justify-center -mt-2">
    <button
      type="button"
      onClick={() => {
        const repeated = repeatPreviousOrder(table.tableNumber);
        if (!repeated) {
          setRepeatOrderError('No previous completed order found for this table.');
        }
      }}
      className="px-4 py-2 rounded-xl bg-jaman-cream border border-jaman-border hover:bg-jaman-border/30 text-jaman-navy font-black text-xs transition-colors cursor-pointer"
    >
      Repeat Previous Order
    </button>
  </div>
</>
```

Add `EmptyState` to this file's `@jamanvaar/ui` import list. Preserve the original button's exact `onClick` body from Step 1's read (the snippet above reflects what was captured during planning — confirm it matches before finalizing, since the original may continue past what's shown here).

- [ ] **Step 4: Type-check**

```
cd apps/restaurant-system/captain && npx tsc --noEmit -p .
```

- [ ] **Step 5: Run the full test suite**

```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/restaurant-system/captain/src/components/tables/CaptainFloorView.tsx apps/restaurant-system/captain/src/components/tables/CaptainTableWorkspaceModal.tsx
git commit -m "refactor(captain): migrate hand-rolled empty states onto shared EmptyState component"
```

---

### Task 12: Migrate kds's hand-rolled empty state to the shared `EmptyState`

**Files:**
- Modify: `apps/restaurant-system/kds/src/App.tsx:783-794`

**Interfaces:**
- Consumes: `EmptyState` from `@jamanvaar/ui` (already a dependency of `apps/restaurant-system/kds/package.json`).

- [ ] **Step 1: Read the target block in full**

Read `App.tsx` around line 780-800 (note: line numbers will have shifted from the earlier research snapshot due to Task 6's replacements and any other work already applied to this file this session — locate the block by its `{/* Empty State */}` comment and `filteredKots.length === 0` condition rather than trusting the exact line numbers).

- [ ] **Step 2: Migrate**

Replace the block with:

```tsx
{/* Empty State */}
{filteredKots.length === 0 && (
  <div className="col-span-full">
    <EmptyState
      icon={<ChefHat className="w-8 h-8" />}
      title="All Kitchen Orders Cleared"
      description="No tickets currently waiting for preparation at this station. New orders sent from POS terminals or Captain tablets will appear here instantly."
    />
  </div>
)}
```

(The `col-span-full` wrapper is preserved since it's a CSS grid layout concern from the parent grid, not part of the empty-state's own visual identity.) Add `EmptyState` to this file's `@jamanvaar/ui` import list.

- [ ] **Step 3: Type-check**

```
cd apps/restaurant-system/kds && npx tsc --noEmit -p .
```

- [ ] **Step 4: Run the full test suite**

```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2 && npx vitest run tests/
```
Expected: 398/398 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/restaurant-system/kds/src/App.tsx
git commit -m "refactor(kds): migrate hand-rolled empty state onto shared EmptyState component"
```

---

### Task 13: Super Admin visual alignment

Super Admin's CSS custom properties (`cloud/super-admin-web/src/styles.css`) already use color values pixel-identical to the `jaman-*` tokens (`--jv-primary: #0b253a` = `jaman-navy`, `--jv-accent: #e66817` = `jaman-saffron`, `--jv-border: #ebe6dd` = `jaman-border`, `--jv-teal: #00a99d` = `jaman-teal`) — no color changes needed there. The gap is structural: its `.empty-state-icon-box` is 52px/14px-radius/`--jv-bg-muted` background vs. `packages/ui`'s `EmptyState` icon box at 64px/16px-radius/`#FBF9F5` background, and its title is 16px vs. 18px. Align these so the two systems read as the same design language.

**Files:**
- Modify: `cloud/super-admin-web/src/styles.css` (add one new token, adjust `.empty-state-icon-box` and `.empty-state h3`)
- Modify: `cloud/super-admin-web/src/components/ui.tsx` (swap the `ErrorState` `!` glyph for a `lucide-react` `AlertCircle` icon, matching `packages/ui`'s `ErrorState`)

- [ ] **Step 1: Add the ivory token to `styles.css`**

In the `:root` block, add a new custom property next to `--jv-bg` (around line 25 of the current file):

```css
  --jv-bg: #faf8f5;
  --jv-bg-muted: #f4efe6;
  --jv-ivory: #fbf9f5; /* == jaman-ivory, used for EmptyState icon-box background to match packages/ui */
```

- [ ] **Step 2: Align `.empty-state-icon-box`**

Change:
```css
.empty-state-icon-box {
  width: 52px;
  height: 52px;
  border-radius: var(--jv-radius-lg);
  background: var(--jv-bg-muted);
  border: 1px solid var(--jv-border);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  color: var(--jv-text-secondary);
}
```
to:
```css
.empty-state-icon-box {
  width: 64px;
  height: 64px;
  border-radius: var(--jv-radius-xl);
  background: var(--jv-ivory);
  border: 1px solid var(--jv-border);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
  color: var(--jv-text-secondary);
}
```
(`--jv-radius-xl` is already defined as `18px`, closest existing token to `packages/ui`'s `rounded-2xl` at `16px` — close enough that introducing a new radius token isn't warranted for a 2px difference.)

- [ ] **Step 3: Align `.empty-state h3`**

Change `font-size: 16px;` to `font-size: 18px;` in the `.empty-state h3` rule, matching `packages/ui`'s `text-lg` (18px) title size.

- [ ] **Step 4: Swap the ErrorState icon**

In `cloud/super-admin-web/src/components/ui.tsx`, find the `ErrorState` function (~line 98-120). Add `AlertCircle` to this file's existing `lucide-react` import line, then replace:

```tsx
      <div className="empty-state-icon-box" style={{ background: '#fef2f2', color: '#dc2626', fontWeight: 800 }}>
        !
      </div>
```
with:
```tsx
      <div className="empty-state-icon-box" style={{ background: '#fef2f2', color: '#dc2626' }}>
        <AlertCircle className="w-6 h-6" />
      </div>
```
(matching `packages/ui`'s `ErrorState`, which uses `<AlertCircle className="w-8 h-8" />` inside its own icon box — `w-6 h-6` here since Super Admin's icon box is smaller.)

- [ ] **Step 5: Visually verify**

Run the app locally (`cd cloud/super-admin-web && npm run dev`) and navigate to a page with a real empty state (e.g. Support Tickets or Staging Sandboxes, both noted in `PLATFORM_STATUS_AND_ROADMAP.md` as having genuine empty states already) and a page that can show `ErrorState` (trigger by stopping the API or checking a page with a deliberately-failing fetch). Confirm the icon box now reads visually closer to `packages/ui`'s pattern (bigger, ivory-toned, rounder) and the error icon shows a circle-alert glyph instead of a bare `!`.

- [ ] **Step 6: Type-check**

```
cd cloud/super-admin-web && npx tsc --noEmit -p .
```

- [ ] **Step 7: Commit**

```bash
git add cloud/super-admin-web/src/styles.css cloud/super-admin-web/src/components/ui.tsx
git commit -m "style(super-admin-web): align EmptyState/ErrorState visual shape with packages/ui pattern"
```

---

### Task 14: Final verification and roadmap update

**Files:**
- Modify: `PLATFORM_STATUS_AND_ROADMAP.md` (mark Phase 1 complete, update the experience-assessment section)

**Interfaces:**
- Consumes: nothing new — this is a verification and documentation task closing out the plan.

- [ ] **Step 1: Type-check all 7 touched apps in one pass**

```
cd c:\Users\OM Sanjhira\OneDrive\Desktop\k2
for app in apps/restaurant-system/pos apps/restaurant-system/pos-admin apps/restaurant-system/captain apps/restaurant-system/kds apps/kiosk-system/kiosk-admin apps/kiosk-system/kiosk-user cloud/super-admin-web; do echo "=== $app ==="; (cd "$app" && npx tsc --noEmit -p .); done
```
Expected: no errors from any of the 7 apps.

- [ ] **Step 2: Run the full root test suite one final time**

```
npx vitest run tests/
```
Expected: 398/398 passing.

- [ ] **Step 3: Confirm zero remaining raw brand-hex utilities across all 6 Tailwind apps**

```
grep -rEo "[a-zA-Z-]+-\[#(0B253A|0B2B39|E66817|F97316|FBF9F5|FAF7F2|00A99D|0D9488|EBE6DD|1E3A4C)\]" apps -i
```
Expected: no output.

- [ ] **Step 4: Update `PLATFORM_STATUS_AND_ROADMAP.md`**

In §4/§6 (or wherever it reads most naturally), add a note that Phase 1 (visual/interaction consistency) is complete: brand color tokens are now wired into real use across all 6 Tailwind-based apps, empty/loading/error states are consolidated onto `packages/ui`'s shared components in pos-admin/pos/captain/kds, and Super Admin's separate system is visually aligned. Note that Phases 2–4 (click-reduction, mobile/responsive, onboarding) remain open and each needs its own brainstorm/spec/plan cycle when reached.

- [ ] **Step 5: Commit**

```bash
git add PLATFORM_STATUS_AND_ROADMAP.md
git commit -m "docs: mark UX Consistency Phase 1 complete in platform roadmap"
```
