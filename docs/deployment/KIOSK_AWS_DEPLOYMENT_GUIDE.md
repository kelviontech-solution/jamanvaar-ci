# kiosk (cloud/api + super-admin-web) — AWS Bridge Deployment Guide

This guide is tailored to the target server defined in
[AWS_DEPLOYMENT_MASTER_PLAN.md](AWS_DEPLOYMENT_MASTER_PLAN.md), and mirrors
[DEPLOYMENT_AWS_GUIDE.md](DEPLOYMENT_AWS_GUIDE.md) (Wrench)'s own shape so both stacks are
operated the same way. Target domain: **`system.kelviontech.in`**.

Only `cloud/api` (NestJS backend) and `cloud/super-admin-web` (the Platform Control Center)
are deployed here. Everything else in this monorepo (pos-admin, POS, Captain, KDS, Kiosk,
Kiosk Admin) is a Tauri desktop or PWA app that runs on each restaurant's own hardware, not
something that gets deployed to a domain — those terminals just need to be configured to
point at `https://system.kelviontech.in` as their cloud API, once it's live.

---

## 1. What's different from Wrench's deployment, and why

kiosk's database connection has a hard safety gate Wrench's doesn't: **cloud/api refuses to
boot in production if it's connected to Postgres as a superuser or a BYPASSRLS role**
(`src/prisma/rls-role.ts`, a deliberate design choice — a superuser bypasses Row-Level
Security even when it's `FORCE`d, which is the real tenant-isolation boundary for this
multi-restaurant platform). The official `postgres` Docker image's bootstrap user
(`POSTGRES_USER`) is always a superuser by construction, so this compose file creates a
**second, non-superuser role** (`jamanvaar_app`) the first time the `db` container starts,
and cloud/api connects as that one instead. See `cloud/api/prisma/docker-init-app-role.sh`
and `cloud/api/prisma/setup-app-role.sql` (the same thing, for a bare-metal install).

cloud/api also refuses to boot in production with a weak/placeholder `JWT_ACCESS_SECRET`,
missing or `localhost`/`*` `CORS_ALLOWED_ORIGINS`, or (if set at all) a malformed
`BACKUP_ENCRYPTION_KEY_B64` or weak `JAMANVAAR_SERVICE_SECRET` — all enforced at boot, not
just documented. If a deploy fails immediately with "Unsafe production configuration," the
error message lists exactly which `.env` value is wrong.

---

## 2. Target Server Infrastructure Snapshot

Same box as Wrench — see [AWS_DEPLOYMENT_MASTER_PLAN.md](AWS_DEPLOYMENT_MASTER_PLAN.md) §2
for the full detail (Elastic IP `13.202.225.48`, SSH key, Docker version, etc.).

---

## 3. Multi-Site Port Map

Extends the table in [DEPLOYMENT_AWS_GUIDE.md](DEPLOYMENT_AWS_GUIDE.md) §2:

| Stack / Project | DB Port | Backend Port | Web / Public Port |
|---|---|---|---|
| `kelviontech.in` | `5432` | `8000` | `3000` |
| `restaurent.kelviontech.in` | `5433` | `8001` | `3001` |
| `amitkhatri.co.in` | — | — | `8080` (or `80/443`) |
| Wrench | `5435` | `8005` | `8085` |
| **kiosk** (`system.kelviontech.in`) | **`5436`** *(loopback)* | **`8010`** *(loopback)* | **`8090`** |

Before deploying, confirm on the actual box that nothing else has since taken `5436`,
`8010` or `8090` (`sudo ss -tlnp | grep -E ':(5436|8010|8090)'` should print nothing).

---

## 4. Step-by-Step Deployment on the AWS VM

### Step 1: Connect via SSH
```powershell
ssh -i "$HOME\.ssh\mihir-personal.pem" ubuntu@13.202.225.48
```

### Step 2: Clone kiosk via GitHub Deploy Key
```bash
cd /home/ubuntu
git clone git@github.com:om7867/kiosk.git kiosk
cd kiosk
```
If this server's deploy key (`~/.ssh/github_deploy`, already on GitHub account
`Mihir-dev2511`) isn't authorized against this specific repo yet, add it as a deploy key
on `om7867/kiosk` first (GitHub repo → Settings → Deploy keys), the same tradeoff already
accepted for the other repos on this box.

### Step 3: Set Up Production Environment
```bash
cp .env.example .env
nano .env
```

Fill in, at minimum, everything `.env.example` marks `:?...must be set`:
- `POSTGRES_BOOTSTRAP_PASSWORD`, `APP_DB_PASSWORD` — `openssl rand -hex 24` each, different values.
- `JWT_ACCESS_SECRET` and the rest of the real secrets — generate with:
  ```bash
  node cloud/api/scripts/generate-production-env.js
  ```
  This writes fresh random values to a file **outside** the repo and never prints them to
  the terminal history. Copy what it generates into `.env`.
- `CORS_ALLOWED_ORIGINS=https://system.kelviontech.in`

Everything else in `.env.example` (Razorpay, SMTP, backups, the WhatsApp connector,
license signing) is genuinely optional — cloud/api degrades each one to a clear, logged
"not configured" state rather than crashing, until a restaurant on this deployment
actually needs it.

### Step 4: Build & Launch Containers
```bash
make deploy
```
What this does: `git pull`, then `docker compose up -d --build --remove-orphans`, which
(in order): starts `db` (creating the `jamanvaar_app` role on first boot only), waits for
it to report healthy, starts `backend` (which runs `prisma migrate deploy` — applying
every migration in `cloud/api/prisma/migrations/`, non-interactively — then the real
server), then starts `frontend` once `backend` exists.

### Step 5: Verify
```bash
make check
```
Expected:
```text
=== [1/3] Checking Docker Container Status ===
kiosk_db         Up (healthy)
kiosk_backend    Up
kiosk_frontend   Up (0.0.0.0:8090->80/tcp)

=== [2/3] Checking Backend Health (direct, loopback-only) ===
 -> Backend is UP (401/200 on an auth-gated route is correct)

=== [3/3] Checking Frontend Web Access ===
 -> Frontend is SERVING HTTP 200
```

### Step 6: Seed the platform (first deploy only)
```bash
make seed
```
Runs `prisma/seed.ts` — the feature catalog, default plans, and the first Super Admin
account for `system.kelviontech.in`. Left alone, that account's email is
`superadmin@jamanvaar.app` and its password is a **random one, generated and printed to
this terminal exactly once** — copy it immediately, it's never stored anywhere. Set
`SEED_SUPER_ADMIN_EMAIL`/`SEED_SUPER_ADMIN_PASSWORD` in `.env` beforehand instead if a
specific, known login is wanted (e.g. for CI).

---

## 5. Going Live on `system.kelviontech.in`

**Corrected after actually inspecting the live box** (2026-10-01): there is no host-level
nginx here at all -- `systemctl status nginx` shows it `failed`/not running. The real
shared front door on 80/443 is the **`kelviontech-nginx-1` Docker container**
(`~/kelviontech/docker-compose.yml`), the same one already fronting amitkhatri, Wrench,
restaurant, jamanwar, vartalaap and whatsapp-app, each via its own static conf file in
`~/kelviontech/nginx/conf.d/`. system.kelviontech.in joins that same directory, not a
separate host-level `/etc/nginx/sites-available/`. `sudo nginx -t`/`systemctl reload nginx`
do not apply here -- use `docker exec kelviontech-nginx-1 nginx -t`/`-s reload` instead.

1. **DNS first**: point `system.kelviontech.in` (A record) at `13.202.225.48`. Wait for
   propagation (`dig system.kelviontech.in` from your own machine) before continuing.
2. **Bootstrap config** (before a certificate exists):
   ```bash
   cp ~/kiosk/nginx/system.kelviontech.in.bootstrap.conf ~/kelviontech/nginx/conf.d/system.kelviontech.in.conf
   docker exec kelviontech-nginx-1 nginx -t && docker exec kelviontech-nginx-1 nginx -s reload
   ```
   `nginx -t` tests **every** site's config on this shared container, not just this one --
   if it fails, do not reload; every other live domain on this box is still running the
   previous, working config until a reload actually happens.
3. **Issue the certificate**, using the same certbot container every other subdomain here
   already shares (not a bare `certbot` on the host -- there isn't one installed for this
   purpose; the box's own `~/kelviontech/scripts/enable-ssl.sh` only covers kelviontech.in's
   own bare domain + www + admin, not other projects' subdomains):
   ```bash
   cd ~/kelviontech
   docker compose run --rm --entrypoint certbot certbot certonly \
     --webroot -w /var/www/certbot -d system.kelviontech.in \
     --email <your real email> --agree-tos --non-interactive
   ```
4. **Switch to the real HTTPS config**:
   ```bash
   cp ~/kiosk/nginx/system.kelviontech.in.conf ~/kelviontech/nginx/conf.d/system.kelviontech.in.conf
   docker exec kelviontech-nginx-1 nginx -t && docker exec kelviontech-nginx-1 nginx -s reload
   ```
5. Open `https://system.kelviontech.in` — should show the Super Admin sign-in screen.

The `certbot` container already running in `~/kelviontech`'s own compose stack renews every
cert in the shared `certbot_conf` volume automatically, including this one, twice a day;
nothing extra needed per-domain.

---

## 6. Daily Operations Cheat Sheet

| Command | Action |
|---|---|
| `make deploy` | Safe update: pull latest commit, rebuild images, restart |
| `make check` | Health check on database, backend, frontend |
| `make logs` | Tail logs of all three containers |
| `make logs-backend` / `make logs-frontend` / `make logs-db` | Tail one container's logs |
| `make restart` | Quick restart without rebuilding (after an `.env` edit) |
| `make stop` | Stop all three containers |
| `make migrate` | Apply pending Prisma migrations without restarting the whole stack |
| `make seed` | Re-run the platform seed |
| `make db-shell` | Open `psql` as `jamanvaar_app` (not the bootstrap superuser) |
| `make prune` | Reclaim host disk space by purging unused Docker layers |

---

## 7. What this guide does NOT cover

- Configuring the other apps in this monorepo (pos-admin, POS, Captain, KDS, Kiosk
  terminals) to point at `https://system.kelviontech.in` — that's a per-app build-time
  config change, separate from this server-side deployment.
- Deploying `product/whatsapp` (needed if any restaurant on this deployment connects the
  WhatsApp ordering channel) — a separate repo, separate deployment, its own domain.
- Load/scale testing at real restaurant traffic levels on this shared, 8 GiB bridge box.
