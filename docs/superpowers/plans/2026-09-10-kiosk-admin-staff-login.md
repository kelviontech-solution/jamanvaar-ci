# Kiosk Admin Real Staff Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Kiosk Admin's local-only demo-credential login with real `OWNER`/`MANAGER` tenant-user authentication that survives indefinitely via silent background refresh.

**Architecture:** Additive extensions to the existing `tenant-auth` backend module (two opt-in request fields, no new endpoints, no new guard, no new Prisma model) plus a new, independent client-side session layer in Kiosk Admin (`cloudClient.ts`) that does not touch the existing device-activation flow or the shared cross-app `SessionPersistence` utility.

**Tech Stack:** NestJS + Prisma (backend, unchanged stack), React + Tauri + plain `fetch` (Kiosk Admin, unchanged stack). No new dependencies anywhere.

**Spec:** `docs/superpowers/specs/2026-09-10-kiosk-admin-staff-login-design.md`

## Global Constraints

- Only `OWNER` and `MANAGER` tenant-user roles may complete this login; `STAFF` is rejected server-side (`ForbiddenException`), not just hidden in the UI.
- Every new backend field/behavior is opt-in (`returnRefreshToken`, `adminOnly`, or "caller supplied a body `refreshToken`") — no existing caller of `/tenant-auth/login`, `/refresh`, or `/logout` changes behavior unless it explicitly asks for the new behavior.
- The refresh token returned in a JSON body (instead of only the `httpOnly` cookie) is a deliberate, scoped trade-off for this one non-browser client — never make it the default/unconditional behavior.
- Kiosk Admin's existing device-activation flow (`connectDeviceStep1`/`connectDeviceStep2`, the `KIOSK_ADMIN` `Device` row, its bearer token) is untouched — this plan adds a second, independent authentication layer alongside it.
- Do not modify `packages/business/src/session_persistence.ts` or any other app's use of it (POS/Captain/KDS) — Kiosk Admin's new session state lives entirely in its own `cloudClient.ts` storage keys.
- Kiosk Admin has no test runner configured (`apps/kiosk-system/kiosk-admin/package.json` has no `vitest`/`jest`) — frontend verification in this plan is `tsc`/`vite build` success plus explicit manual steps in the Tauri dev environment, not automated tests. Do not add a test framework as part of this plan.

---

## Task 1: Backend — additive tenant-auth extensions

**Files:**
- Modify: `cloud/api/src/modules/tenant-auth/dto/login.dto.ts`
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts`
- Modify: `cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts`
- Test: `cloud/api/test/tenant-auth.e2e.spec.ts` (extend the existing suite)

**Interfaces:**
- Produces: `tenantLoginSchema` gains two optional boolean fields (`returnRefreshToken`, `adminOnly`); `POST /api/v1/tenant-auth/login` response includes `refreshToken`/`refreshTokenExpiresAt` when `returnRefreshToken: true` was sent; `POST /api/v1/tenant-auth/refresh` accepts an optional `{ refreshToken }` body field and returns the rotated `refreshToken`/`refreshTokenExpiresAt` in the body when the caller supplied one in the body; `POST /api/v1/tenant-auth/logout` also revokes a refresh token supplied via `{ refreshToken }` in the body (not just the cookie). These are consumed by Task 2's `cloudClient.ts`.

- [ ] **Step 1: Write the failing tests**

Append these test cases to `cloud/api/test/tenant-auth.e2e.spec.ts`, inside the existing `describe('Tenant authentication + authorization', ...)` block (after the existing "logs in with correct credentials..." test, before "rejects a garbage/invalid bearer token"):

```ts
  it('returnRefreshToken: true includes the refresh token directly in the response body', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword, returnRefreshToken: true });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeTypeOf('string');
    expect(res.body.refreshTokenExpiresAt).toBeTypeOf('string');
    // Still sets the cookie too — additive, not a replacement for browser callers.
    const refreshCookie = extractCookie(res.headers['set-cookie'], 'jamanvaar_tenant_refresh');
    expect(refreshCookie).toBeDefined();
  });

  it('without returnRefreshToken, the response body has no refreshToken field (regression guard)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
  });

  it('adminOnly: true rejects a STAFF login with 403', async () => {
    const ownerLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword });
    const ownerToken = ownerLoginRes.body.accessToken;

    const staffEmail = `test-adminonly-staff-${Date.now()}@example.com`;
    const staffPassword = 'staff-correct-horse-battery';
    const createRes = await authed('post', '/api/v1/tenant/me/users', ownerToken).send({
      email: staffEmail,
      fullName: 'Front Desk Staff',
      role: 'STAFF',
      password: staffPassword
    });
    expect(createRes.status).toBe(201);

    const staffLoginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: staffEmail, password: staffPassword, adminOnly: true });
    expect(staffLoginRes.status).toBe(403);
  });

  it('adminOnly: true succeeds for OWNER and for MANAGER', async () => {
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword, adminOnly: true });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.user.role).toBe('OWNER');

    const ownerToken = ownerRes.body.accessToken;
    const managerEmail = `test-adminonly-manager-${Date.now()}@example.com`;
    const managerPassword = 'manager-correct-horse-battery';
    await authed('post', '/api/v1/tenant/me/users', ownerToken).send({
      email: managerEmail,
      fullName: 'Shift Manager',
      role: 'MANAGER',
      password: managerPassword
    });

    const managerRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: managerEmail, password: managerPassword, adminOnly: true });
    expect(managerRes.status).toBe(200);
    expect(managerRes.body.user.role).toBe('MANAGER');
  });

  it('refresh accepts a body refreshToken when no cookie is present, and rotates it', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword, returnRefreshToken: true });
    const originalRefreshToken = loginRes.body.refreshToken;

    // No cookie jar on this bare `request(...)` call — proves the body path works standalone.
    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/refresh')
      .send({ refreshToken: originalRefreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeTypeOf('string');
    expect(refreshRes.body.refreshToken).toBeTypeOf('string');
    expect(refreshRes.body.refreshToken).not.toBe(originalRefreshToken);
  });

  it('logout revokes a refresh token supplied via body (no cookie), confirmed by a subsequent refresh failing', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/login')
      .send({ restaurantId, email: ownerEmail, password: ownerPassword, returnRefreshToken: true });
    const accessToken = loginRes.body.accessToken;
    const refreshToken = loginRes.body.refreshToken;

    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app.getHttpServer())
      .post('/api/v1/tenant-auth/refresh')
      .send({ refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts`
Expected: FAIL — `returnRefreshToken`/`adminOnly` are not yet accepted fields (Zod strips unknown keys silently by default, so the login calls will still succeed but the new assertions on `res.body.refreshToken`, the 403 for STAFF, and the body-based refresh/logout will fail).

- [ ] **Step 3: Add the two DTO fields**

In `cloud/api/src/modules/tenant-auth/dto/login.dto.ts`, modify `tenantLoginSchema`:

```ts
export const tenantLoginSchema = z.object({
  restaurantId: z.string().uuid().optional(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required'),
  deviceId: z.string().optional(),
  deviceToken: z.string().optional(),
  deviceType: z.enum(['POS', 'CAPTAIN', 'KDS', 'KIOSK', 'POS_ADMIN', 'KIOSK_ADMIN']).optional(),
  appVersion: z.string().optional(),
  // Opt-in: include the refresh token directly in the response body, for
  // cross-origin non-browser clients (e.g. Kiosk Admin's Tauri webview) that
  // can't rely on the httpOnly/sameSite=lax cookie on cross-origin fetch.
  returnRefreshToken: z.boolean().optional(),
  // Opt-in: reject this login unless the matched user's role is OWNER or MANAGER.
  adminOnly: z.boolean().optional()
});
export type TenantLoginDto = z.infer<typeof tenantLoginSchema>;
```

Also add a minimal schema for the refresh endpoint's new optional body field, right after `activateDeviceSchema`:

```ts
export const tenantRefreshSchema = z.object({
  refreshToken: z.string().optional()
});
export type TenantRefreshDto = z.infer<typeof tenantRefreshSchema>;
```

- [ ] **Step 4: Add the `adminOnly` role check to the service**

In `cloud/api/src/modules/tenant-auth/tenant-auth.service.ts`, inside `login()`, immediately after the existing block that throws on restaurant status (`if (matchedUser.restaurant.status !== 'ACTIVE' ...)`) and before the `// Check device activation state` comment, insert:

```ts
    if (dto.adminOnly && matchedUser.role !== 'OWNER' && matchedUser.role !== 'MANAGER') {
      throw new ForbiddenException('This login is restricted to restaurant owners and managers.');
    }
```

(`ForbiddenException` is already imported in this file.)

- [ ] **Step 5: Wire the controller — login, refresh, logout**

In `cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts`:

Update the `login()` method:

```ts
  @Post('login')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(tenantLoginSchema))
  async login(
    @Body() body: TenantLoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(body);
    if (result.status === 'LOGIN_SUCCESS') {
      this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
      if (body.returnRefreshToken) {
        return { ...result, refreshToken: result.refreshToken, refreshTokenExpiresAt: result.refreshTokenExpiresAt };
      }
      const { refreshToken, refreshTokenExpiresAt, ...withoutRefreshToken } = result;
      return withoutRefreshToken;
    }
    return result;
  }
```

Update the imports at the top of the file to include `tenantRefreshSchema` and `TenantRefreshDto`:

```ts
import {
  createTenantStaffUserSchema,
  setInitialPasswordSchema,
  setTenantUserStatusSchema,
  tenantChangePasswordSchema,
  tenantLoginSchema,
  activateDeviceSchema,
  tenantRefreshSchema,
  TenantLoginDto,
  ActivateDeviceDto,
  TenantRefreshDto
} from './dto/login.dto';
```

Update the `refresh()` method:

```ts
  @Post('refresh')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(tenantRefreshSchema))
  async refresh(
    @Req() req: Request,
    @Body() body: TenantRefreshDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] ?? body.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    if (body.refreshToken) {
      return { accessToken: result.accessToken, user: result.user, refreshToken: result.refreshToken, refreshTokenExpiresAt: result.refreshTokenExpiresAt };
    }
    return { accessToken: result.accessToken, user: result.user };
  }
```

Update the `logout()` method:

```ts
  @Post('logout')
  @HttpCode(200)
  @UseGuards(TenantAuthGuard)
  async logout(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
    @CurrentTenantUser() user: User
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] ?? body?.refreshToken;
    if (refreshToken) {
      await this.authService.logout(refreshToken, user.restaurantId, user.id);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/tenant-auth' });
    return { success: true };
  }
```

Note: `result.refreshToken` typed as required on `TenantLoginResult`/`TenantAuthResponse` — check `tenant-auth.service.ts`'s `TenantLoginSuccess`/`TenantAuthResponse` type before destructuring in `login()`'s "without returnRefreshToken" branch above; if `refreshTokenExpiresAt` isn't always present on every `TenantAuthResponse` variant (`ACTIVATION_REQUIRED` doesn't have it), guard the destructure appropriately (e.g. only reachable inside the `if (result.status === 'LOGIN_SUCCESS')` branch above, which is already the case in the code shown — the `ACTIVATION_REQUIRED`/other-status path returns `result` unchanged on the last line, untouched).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts`
Expected: PASS — all 28 tests in the file (22 existing + 6 new).

- [ ] **Step 7: Run the broader regression check**

Run: `cd cloud/api && npx vitest run test/tenant-auth.e2e.spec.ts test/activation-redeem.e2e.spec.ts test/billing-applications-support.e2e.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: all pass, typecheck clean — these are the other suites most likely to exercise `tenant-auth/login` indirectly (device activation flows).

- [ ] **Step 8: Commit**

```bash
git add cloud/api/src/modules/tenant-auth/dto/login.dto.ts cloud/api/src/modules/tenant-auth/tenant-auth.service.ts cloud/api/src/modules/tenant-auth/tenant-auth.controller.ts cloud/api/test/tenant-auth.e2e.spec.ts
git commit -m "feat(tenant-auth): add opt-in body-returned refresh token and admin-only login"
```

---

## Task 2: Kiosk Admin — cloudClient.ts staff session layer

**Files:**
- Modify: `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts`

**Interfaces:**
- Consumes: `POST /tenant-auth/login` (with `returnRefreshToken`/`adminOnly`), `POST /tenant-auth/refresh` (body `refreshToken`), `POST /tenant-auth/logout` (bearer + body `refreshToken`) — all from Task 1.
- Produces: `staffLogin(restaurantId: string, email: string, password: string): Promise<{ fullName: string; role: string }>`, `staffLogout(): Promise<void>`, `getTenantAccessToken(): string | null`, `isStaffLoggedIn(): boolean`, `getStaffUser(): { fullName: string; role: string } | null`, `startSilentRefresh(): void`, `stopSilentRefresh(): void`, `getConnectedRestaurantId(): string | null` — all consumed by Task 3's `App.tsx` changes.

- [ ] **Step 1: Add the new storage keys, module state, and `getConnectedRestaurantId`**

In `apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts`, after the existing key constants (`RESTAURANT_ID_KEY`, `DEVICE_LABEL_KEY`, `DEVICE_TOKEN_KEY`), add:

```ts
const TENANT_REFRESH_TOKEN_KEY = 'jamanvaar_kiosk_admin_tenant_refresh';
const TENANT_USER_KEY = 'jamanvaar_kiosk_admin_tenant_user';

/** In-memory only — a 15-minute-lived access token has no business surviving a reload. */
let tenantAccessToken: string | null = null;
let silentRefreshTimer: ReturnType<typeof setInterval> | null = null;

export function getConnectedRestaurantId(): string | null {
  try {
    return localStorage.getItem(RESTAURANT_ID_KEY);
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add `staffLogin`, `getTenantAccessToken`, `isStaffLoggedIn`, `getStaffUser`**

Append to the same file:

```ts
export interface StaffUser {
  fullName: string;
  role: string;
}

function persistTenantSession(refreshToken: string, user: StaffUser): void {
  try {
    localStorage.setItem(TENANT_REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(TENANT_USER_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable — this run keeps working, but won't survive a reload.
  }
}

function clearTenantSession(): void {
  tenantAccessToken = null;
  try {
    localStorage.removeItem(TENANT_REFRESH_TOKEN_KEY);
    localStorage.removeItem(TENANT_USER_KEY);
  } catch {
    // Storage unavailable — nothing to clean up.
  }
}

export function getTenantAccessToken(): string | null {
  return tenantAccessToken;
}

export function isStaffLoggedIn(): boolean {
  try {
    return localStorage.getItem(TENANT_REFRESH_TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function getStaffUser(): StaffUser | null {
  try {
    const raw = localStorage.getItem(TENANT_USER_KEY);
    return raw ? (JSON.parse(raw) as StaffUser) : null;
  } catch {
    return null;
  }
}

/**
 * Real OWNER/MANAGER login — separate from and unrelated to
 * connectDeviceStep1/2's one-time device-activation flow above. Uses
 * tenant-auth's "direct" login path (no deviceType/deviceId), which returns
 * session tokens without touching device-activation state at all.
 */
export async function staffLogin(restaurantId: string, email: string, password: string): Promise<StaffUser> {
  const res = await fetch(`${API_BASE}/api/v1/tenant-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      email: email.trim(),
      password,
      returnRefreshToken: true,
      adminOnly: true
    })
  });

  const data = await parseJsonResponse(res);
  if (!res.ok) {
    throw new CloudApiError(data?.message ?? `Login failed (${res.status})`, res.status);
  }

  tenantAccessToken = data.accessToken;
  const user: StaffUser = { fullName: data.user.fullName, role: data.user.role };
  persistTenantSession(data.refreshToken, user);
  startSilentRefresh();
  return user;
}

export async function staffLogout(): Promise<void> {
  const refreshToken = (() => {
    try {
      return localStorage.getItem(TENANT_REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  })();

  stopSilentRefresh();

  if (tenantAccessToken && refreshToken) {
    try {
      await fetch(`${API_BASE}/api/v1/tenant-auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantAccessToken}`
        },
        body: JSON.stringify({ refreshToken })
      });
    } catch {
      // Offline or server unreachable — local logout still proceeds below.
    }
  }

  clearTenantSession();
}
```

- [ ] **Step 3: Add `startSilentRefresh`/`stopSilentRefresh`**

Append to the same file:

```ts
const SILENT_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // well inside the 15-minute access-token TTL

async function refreshTenantSession(): Promise<boolean> {
  const refreshToken = (() => {
    try {
      return localStorage.getItem(TENANT_REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  })();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/v1/tenant-auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const data = await parseJsonResponse(res);
    if (!res.ok) {
      clearTenantSession();
      return false;
    }
    tenantAccessToken = data.accessToken;
    if (data.refreshToken) {
      try {
        localStorage.setItem(TENANT_REFRESH_TOKEN_KEY, data.refreshToken);
      } catch {
        // Storage unavailable — the in-memory access token still refreshed for this run.
      }
    }
    return true;
  } catch {
    // Network error — leave the existing (possibly still-valid) state alone; retry next tick.
    return true;
  }
}

/** Call once at app init if isStaffLoggedIn(), and again right after staffLogin(). */
export function startSilentRefresh(): void {
  if (silentRefreshTimer) return;
  void refreshTenantSession();
  silentRefreshTimer = setInterval(() => {
    void refreshTenantSession();
  }, SILENT_REFRESH_INTERVAL_MS);
}

export function stopSilentRefresh(): void {
  if (silentRefreshTimer) {
    clearInterval(silentRefreshTimer);
    silentRefreshTimer = null;
  }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/kiosk-system/kiosk-admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/kiosk-system/kiosk-admin/src/cloud/cloudClient.ts
git commit -m "feat(kiosk-admin): add real tenant-user staff session layer to cloudClient"
```

---

## Task 3: Kiosk Admin — wire the login gate to real auth

**Files:**
- Modify: `apps/kiosk-system/kiosk-admin/src/App.tsx`

**Interfaces:**
- Consumes: `staffLogin`, `staffLogout`, `isStaffLoggedIn`, `getStaffUser`, `startSilentRefresh`, `getConnectedRestaurantId` from Task 2's `cloudClient.ts`.

- [ ] **Step 1: Update the cloudClient import**

At line 62, change:

```ts
import { connectDeviceStep1, connectDeviceStep2, isDeviceConnected, CloudApiError } from './cloud/cloudClient';
```

to:

```ts
import {
  connectDeviceStep1,
  connectDeviceStep2,
  isDeviceConnected,
  CloudApiError,
  staffLogin,
  staffLogout,
  isStaffLoggedIn,
  getStaffUser,
  startSilentRefresh,
  getConnectedRestaurantId
} from './cloud/cloudClient';
```

- [ ] **Step 2: Replace the login state and handlers**

Replace the block at lines 209–270 (from `// Kiosk Admin Authentication State` through the end of `handleKioskAdminLogout`) with:

```ts
  // Kiosk Admin Authentication State — restored from a real tenant-user session
  const [isKioskAdminLoggedIn, setIsKioskAdminLoggedIn] = useState<boolean>(() => isStaffLoggedIn());
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    if (isStaffLoggedIn()) {
      startSilentRefresh();
    }
  }, []);

  const handleKioskAdminLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Please enter email and password.');
      return;
    }

    const restaurantId = getConnectedRestaurantId();
    if (!restaurantId) {
      setAuthError('This terminal is not connected to a restaurant yet.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');
    try {
      await staffLogin(restaurantId, authEmail, authPassword);
      setIsKioskAdminLoggedIn(true);
      setAuthPassword('');
    } catch (err) {
      setAuthError(err instanceof CloudApiError ? err.message : 'Login failed. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleKioskAdminLogout = () => {
    setIsKioskAdminLoggedIn(false);
    setAuthPassword('');
    void staffLogout();
  };
```

(`useEffect` is already imported from React elsewhere in this file — confirm at the top-of-file React import; if not already present in the destructured import list, add it there rather than importing it separately.)

- [ ] **Step 3: Update the login screen JSX**

Replace the block from `<button type="button" onClick={handleQuickDemoKioskAdmin} ...>` (the Quick Demo Login button, lines 1008–1015) through the end of the `<form>` (line 1085) with:

```tsx
        <form onSubmit={handleKioskAdminLogin} className="space-y-3.5 pt-2">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5 text-left">
              Email *
            </label>
            <input
              type="email"
              value={authEmail}
              onChange={(e) => {
                setAuthEmail(e.target.value);
                setAuthError('');
              }}
              placeholder="owner@yourrestaurant.com"
              className="w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#0B253A] font-semibold focus:outline-hidden transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Password *</label>
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="text-[11px] text-[#E66817] hover:underline font-bold"
              >
                {showPassword ? 'Hide Password' : 'Show Password'}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={authPassword}
                onChange={(e) => {
                  setAuthPassword(e.target.value);
                  setAuthError('');
                }}
                placeholder="Enter your password"
                className="w-full bg-[#FAF7F2] border border-[#EBE6DD] focus:border-[#E66817] focus:bg-white rounded-2xl px-4 py-3 text-sm text-[#0B253A] font-semibold focus:outline-hidden transition-colors"
              />
            </div>
          </div>

          {authError && (
            <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-center flex items-center justify-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <p className="text-xs text-slate-500 text-center pt-0.5">
            Owners and managers only. Contact your Restaurant Admin if you need access.
          </p>

          <button
            type="submit"
            disabled={authBusy}
            className="w-full py-3.5 rounded-2xl bg-[#E66817] hover:bg-[#EA580C] text-white font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-md shadow-orange-500/20 active:scale-[0.99] cursor-pointer mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {authBusy ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
```

This removes the `handleQuickDemoKioskAdmin` demo-login button and the "PIN: kiosk-admin / admin123" hint line entirely, and removes the `rememberMe` checkbox (the design decision is that the session simply stays logged in via silent refresh — there is no "don't remember me" mode to offer, so the control had no real behavior to control). Delete the now-unused `handleQuickDemoKioskAdmin` function and the `rememberMe` state declaration (both above the block replaced in Step 2, or wherever they still remain) if a search shows nothing else in the file references them.

- [ ] **Step 4: Search for any other reference to the removed identifiers**

Run: `cd apps/kiosk-system/kiosk-admin && grep -n "authUsername\|handleQuickDemoKioskAdmin\|rememberMe\|SessionPersistence" src/App.tsx`
Expected: no remaining references (if `SessionPersistence` import at the top of the file becomes unused as a result, remove that import too — check the diff doesn't leave a dangling unused import that `tsc`/`vite build` would flag).

- [ ] **Step 5: Verify it compiles and builds**

Run: `cd apps/kiosk-system/kiosk-admin && npx tsc --noEmit && npx vite build`
Expected: no errors.

- [ ] **Step 6: Manual verification in the Tauri dev environment**

Run: `cd apps/kiosk-system/kiosk-admin && npm run dev` (and separately start the `cloud/api` dev server if it isn't already running, pointed at a database with a real restaurant + OWNER account — e.g. the seeded demo restaurant from `cloud/api/prisma/seed.ts`, credentials printed by `npm run seed`'s output).

Verify, in order:
1. With no existing Kiosk Admin session, the login screen shows email/password fields (no demo-login button, no PIN hint).
2. Logging in with the seeded demo restaurant's owner email/password succeeds and reaches the main admin UI.
3. Logging in with a STAFF-role account (create one via the Restaurant Admin flow or `POST /api/v1/tenant/me/users` if convenient) is rejected with the server's "restricted to restaurant owners and managers" message.
4. Reloading the app after a successful login stays logged in (no re-prompt) — confirms the refresh token round-trip works.
5. Logging out returns to the login screen, and reloading afterward does NOT restore the session (confirms local state was actually cleared and the server-side token was actually revoked, not just a client-side flag flip).
6. The existing device-connection flow (if this terminal isn't already connected: `connectDeviceStep1`/`connectDeviceStep2` via the activation-key screen) still works, independently of the new login — connecting a device and logging in as staff are two separate, unrelated steps.

- [ ] **Step 7: Commit**

```bash
git add apps/kiosk-system/kiosk-admin/src/App.tsx
git commit -m "feat(kiosk-admin): replace demo-credential login with real OWNER/MANAGER auth"
```

## Self-Review Notes

**Spec coverage:** DTO/service/controller extensions (Task 1), `cloudClient.ts` session layer including silent refresh and `getConnectedRestaurantId` (Task 2), `App.tsx` login-gate replacement including removal of the demo-login button and PIN hint (Task 3) — every section of the spec has a task. The spec's "Non-goals" (no POS/Captain/KDS changes, no password-reset UI, no new-account-creation UI) correctly have no corresponding task.

**Placeholder scan:** no TBD/TODO; every step has complete code. Task 3 Step 3 includes an explicit instruction to search for and remove now-dead code (`handleQuickDemoKioskAdmin`, `rememberMe`, a possibly-unused `SessionPersistence` import) rather than leaving it as dead weight, with a concrete grep command to verify rather than a vague "clean up" instruction.

**Type consistency:** `StaffUser { fullName: string; role: string }` (Task 2) is exactly what Task 3's `getStaffUser()` call sites expect. `staffLogin`/`staffLogout`/`isStaffLoggedIn`/`getConnectedRestaurantId`/`startSilentRefresh` signatures match between Task 2's production code and Task 3's import/usage. The backend response shape Task 2's `staffLogin`/`refreshTenantSession` parse (`data.accessToken`, `data.user.fullName`, `data.user.role`, `data.refreshToken`) matches exactly what Task 1's controller changes actually return.
