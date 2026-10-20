# Password recovery: QR Admin and Restaurant/Kiosk Admin

20 October 2026

## Problems confirmed

- QR recovery asked for a new password and the email code on the same screen, without password confirmation or a resend button.
- The server's existing rules were **15-minute code validity and a 60-second resend wait**, not one code per 15 minutes. Requests during the wait returned success without sending another message; the UI gave no useful indication of that wait.
- A completed reset left the previous send timestamp behind. SMTP failures were swallowed without releasing that request's code/cooldown or recording delivery failure.
- The API's default rate-limit error exposed `ThrottlerException` wording.
- Old platform branding settings could append the shipped placeholder support email and example telephone number to real emails.

## Implemented behavior

**Restaurant ID → email code → verify code → new password + confirmation → success → sign in.** QR Admin and Restaurant/Kiosk Admin use the same recovery component.

- Code expires after **15 minutes**. Resend becomes available after **60 seconds**, with its own countdown. An accepted resend replaces the previous code. Expired or exhausted challenges can be replaced immediately, subject to the existing IP limits.
- Verification exchanges the code for a random, single-use credential lasting **up to 5 minutes**, bounded by the original code expiry. Only its hash is persisted. It cannot be used as a login token. Password fields appear only after server verification.
- Reset clears the recovery state, send timestamp and account login lockout, and revokes refresh sessions. Another recovery can start immediately after a completed reset.
- Row locks serialize concurrent send/verify/reset operations, preventing duplicate effects or two successful consumptions of one challenge.
- Failed SMTP delivery to every configured recovery address invalidates only that request's challenge and releases its cooldown. A late failure cannot clear a newer request. Failure is recorded in the audit log. The response still does not wait on SMTP, preserving existing protection against account discovery through response timing.
- UI says a code was **requested**, rather than claiming the inbox has received it. Inbox/spam guidance, current Restaurant ID, expiry and resend controls stay visible.
- Rate-limit message: **“Too many attempts. Please wait a minute and try again.”** Existing rate limits remain enforced.
- Footer uses **kelviontech@gmail.com** for fresh installs and the known shipped placeholder addresses on existing installs. The example `+91 98765 43210` number is omitted. Intentionally configured custom support contacts remain configurable.
- Password instructions match the existing backend policy: at least 10 characters, a letter and a number or symbol, avoiding common passwords.
- Existing clients that submit OTP + password directly remain compatible. New clients use the verification credential. No database migration is needed; verification credentials reuse the existing hashed reset field with a distinct prefix.

## Verification

**39 tests passed in 4 files**:

- Password reset: legacy reset, expiry, single use, wrong attempts, resend timing, repeated recovery, replacement codes, delivery failure, expired verified sessions, parallel sends, parallel verification and parallel completion.
- Owner login: existing code-based recovery and sign-in, lockout, and real per-IP throttle with the friendly 429 message.
- Branding: fresh defaults, legacy placeholder repair and preservation/escaping of custom contact details.
- Platform settings: existing validation and notice behavior.

**Chrome browser checks passed at 1440 px and 390 px**, for both QR Admin and the Restaurant/Kiosk Admin panel. Verified separate steps, resend countdown, old-code refusal, matching password confirmation, success, no horizontal overflow, expiry recovery and friendly throttle feedback. The browser uses real UI components with isolated API fixtures and an accelerated browser clock; it sends no real emails and changes no real passwords.

API and Restaurant Admin/QR production builds passed, including TypeScript checks. The frontend retains existing large-chunk build warnings. This session did **not** deploy to the production server or verify delivery through its actual SMTP provider.

Reproduce:

```powershell
# cloud/api (uses the project's guarded test database configuration)
npx vitest run test/password-reset.e2e.spec.ts test/owner-login.e2e.spec.ts src/modules/platform-settings/branding.service.spec.ts test/platform-notice.e2e.spec.ts
npm run build

# apps/restaurant-system/pos-admin
npm run build

# Repository root; port 5545 and installed Chrome required
node docs/reports/password-recovery-2026-10-20/browser-check.cjs
```

Evidence: [browser results](browser-results.json), [mobile email-code step](qr-code-390.png), [desktop password step](qr-password-1440.png), [owner panel](owner-password-390.png).

## Deployment and acceptance

Deploy the **API and Restaurant Admin frontend**, including its QR entry, together. The support-contact default in Super Admin is also updated for its next build. No signing keys, package IDs or database schema were changed.

After deployment, request a real recovery, wait 60 seconds, resend, verify the newest email code, enter matching passwords, then sign in. Start another recovery to confirm repeat delivery. If delivery fails, check SMTP/provider logs and the `TENANT_PASSWORD_RESET_DELIVERY_FAILED` audit event; the source tests do not establish production inbox delivery.

## Changed implementation files

- `cloud/api/src/app.module.ts`
- `cloud/api/src/modules/tenant-auth/{tenant-auth.service.ts,tenant-auth.controller.ts,dto/login.dto.ts}`
- `cloud/api/src/modules/notifications/email-templates.ts`
- `cloud/api/src/modules/platform-settings/{branding.service.ts,setting-schemas.ts,branding.service.spec.ts}`
- `cloud/api/prisma/seed.ts`
- `cloud/api/test/{password-reset.e2e.spec.ts,owner-login.e2e.spec.ts}`
- `apps/restaurant-system/pos-admin/src/cloud/cloudClient.ts`
- `apps/restaurant-system/pos-admin/src/components/auth/{OwnerPasswordRecovery.tsx,owner-password-recovery.css,ForgotPasswordPanel.tsx}`
- `apps/restaurant-system/pos-admin/src/qr/QrWorkspace.tsx`
- `cloud/super-admin-web/src/pages/Settings/PlatformBrandingCard.tsx`

Earlier onboarding changes in the working tree are documented separately in [the onboarding report](../onboarding-access-2026-10-20/REPORT.md).
