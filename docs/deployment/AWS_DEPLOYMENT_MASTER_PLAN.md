# AWS Bridge Deployment — Master Reference

Written 2026-09-24. This is the **temporary bridge** while the Oracle
`kelviontech-prod` VM is disabled (exceeded the new Always Free 2 OCPU/12GB
Ampere limit — see that incident separately). Target: Oracle back in service
in **~15 days** (by ~2026-10-09), once ₹10k is available to upgrade Oracle to
Pay-As-You-Go. This AWS account is not meant to be permanent.

---

## 1. AWS account & billing

| | |
|---|---|
| Account email | `mihirdarji2511@gmail.com` |
| Account ID | `638151077932` |
| Plan | **Paid** (not the restricted "Free (6mo)" plan — chosen deliberately for full service access) |
| Region | **Asia Pacific (Mumbai) `ap-south-1`** — always confirm top-right before doing anything; EC2/IPs/keys/security groups are region-scoped |
| Signup credit | **$100.00**, credit ID `10067757279`, expires 2026-09-24 **2027** (1 year) |
| Budget alert | **Zero-spend budget** created — emails `mihirdarji2511@gmail.com` the moment spend exceeds $0.01. **Notification only, does not auto-stop anything.** |
| Runway | `m7i-flex.large` at $0.10075/hr ≈ **41 days** of 24/7 runtime on the $100 credit — comfortable margin over the 15-day target |

**GitHub account used for deploy keys:** `Mihir-dev2511` (personal account, not
an org). Existing key `kelviontech-prod server` (added 2026-07-27) is the
Oracle box's deploy key — unrelated to this AWS box, left as-is.

---

## 2. Current live instance — `amitkhatri-prod`

| | |
|---|---|
| Console name | `Mihir-personal` *(generic name, consider renaming)* |
| Instance ID | `i-09cb4321863636d82` |
| Instance type | `m7i-flex.large` — 2 vCPU, 8 GiB RAM |
| AMI | Ubuntu Server 24.04 LTS (HVM), SSD, x86_64 — `ami-006f82a1d5a27da54` |
| Availability Zone | `ap-south-1a` |
| **Elastic IP (static)** | **`13.202.225.48`** — always use this, not the auto-assigned public IP, which changes on stop/start |
| Private IP | `172.31.44.235` |
| Storage | 50 GiB gp3 root volume (upsized from the 8 GiB default — needed for multi-project Docker images) |
| Security group | `launch-wizard-1` — SSH(22) from **My IP only**, HTTP(80) + HTTPS(443) from `0.0.0.0/0` |
| Key pair | `mihir-personal.pem`, ED25519, stored at `C:\Users\Mihir Darji\.ssh\mihir-personal.pem` |
| Docker | `29.8.1` (came pre-installed on this AMI — installer script wasn't actually needed) |
| Docker Compose | `v5.5.1` |
| Rebooted once | to apply kernel update (7.0.0-1013-aws) — done before anything was deployed |

**SSH:**
```powershell
ssh -i "$HOME\.ssh\mihir-personal.pem" ubuntu@13.202.225.48
```

**GitHub deploy key for this box** (added to `Mihir-dev2511` account, not a
repo-scoped deploy key, same tradeoff as the Oracle box):
```
~/.ssh/github_deploy        # private
~/.ssh/github_deploy.pub    # public — titled "amitkhatri-aws server" on GitHub
```
`~/.ssh/config` on the server has a `Host github.com` block pointing at it.

---

## 3. amitkhatri.co.in — status

- Repo: `git@github.com:om7867/AMIT_KHATRI_WEBSITE.git`, branch `main`
- Cloned to `~/amitkhatri` on the server
- **Verified identical to local `D:\Company\AMIT_KHATRI_WEBSITE_NEW`** — commit
  `762e9faf6233f1e7d50adc2eb1da1dc58783eeae` (2026-08-19) matches exactly on
  both sides
- Restoring from `D:\Company\AMITKHATRI_SERVER_BACKUP_20260812\` (Aug 12
  snapshot — user confirmed traffic since then is negligible, acceptable gap)
- DNS: `amitkhatri.co.in`, `www`, `admin` A records → `13.202.225.48`
  (propagation may still be in progress)
- **Architecture note:** on Oracle this ran as a sub-stack behind
  KelvionTech's shared nginx (`172.17.0.1:8080`). On this dedicated AWS box
  there's no shared nginx in front, so `deploy/docker-compose.oracle.yml`
  needs its `web` service ports changed from `172.17.0.1:8080:80` to a direct
  `80:80` (+ 443 once cert is in place)
- `config_bundle.tar.gz` has a Let's Encrypt cert valid to **2026-10-10** —
  worth trying to reuse directly rather than re-issuing via certbot, to save
  time. Contains secrets (TLS key + all `.env` files) — never commit/share it.

**Not yet done as of this doc:** DB restore (`pg_restore`), uploads restore,
compose adaptation for direct port binding, bringing the stack up, verifying
`amitkhatri.co.in` resolves and serves.

---

## 4. Remaining projects — not yet touched

Confirmed to exist, **not yet deployed anywhere on AWS**. Traffic profile per
user: amitkhatri ~100 users/day (the only real load), everything else ~1-2/day.

| Project | Local path | Services (from `docker-compose.yml`) | Notes |
|---|---|---|---|
| kiosk | `C:\Users\Mihir Darji\Desktop\Resources\product\kiosk` | NestJS API (Prisma) + super-admin-web (Vite) | **No docker-compose yet — not containerized.** Needs one written before it can follow this same pattern. |
| whatsapp | `C:\Users\Mihir Darji\Desktop\Resources\product\whatsapp` | postgres + redis + minio + backend + frontend | Heaviest — 5 containers. Postgres has explicit `mem_limit: 1g, cpus: 1.5`. |
| whatsappweb | `C:\Users\Mihir Darji\Desktop\Resources\Personal\whatsappweb` | 1 container (`web`, image `vartalaap-web:latest`) | Name suggests possible browser-automation (Puppeteer/whatsapp-web.js) — **verify actual RAM use before assuming it's light**, same class of risk as amitkhatri's Playwright. |
| Wrench | `C:\Users\Mihir Darji\Desktop\Resources\clg\Wrench` | db(postgres15) + backend + frontend | **LIVE at https://wrench.amitkhatri.co.in** (Host port 8085 -> proxied via `amitkhatri-web-1` Nginx with Let's Encrypt SSL). |
| kelviontech.in | `D:\kelvion\KelvionTech` | db + backend + frontend + nginx | Own shared nginx + certbot layer (this is the one that hosted the others via `172.17.0.1:8xxx` on Oracle). |
| restaurent.kelviontech.in | `D:\kelvion\KelvionTech` (same repo) | own db + backend + frontend | Ports 5433/8001/3001 on Oracle to avoid clashing with kelviontech.in's 5432/8000/3000. |
| jamanwar.kelviontech.in | `C:\jamanwar\Jamanvar` | 1 container (`web`, Next.js) — possibly more, not fully checked | Lightest known. |

**Sizing plan when adding these:** don't guess up front. Bring each online one
at a time on the same `amitkhatri-prod` box, watch `docker stats` after each,
resize (`stop → change instance type → start`, no data loss, same IP) only if
actually needed. Given the low traffic on 7 of 8 projects, RAM (container
count) is the constraint, not CPU.

**If reproducing the Oracle multi-site pattern on this box eventually:**
KelvionTech's own nginx+certbot becomes the shared front door, and each other
project's nginx binds to `172.17.0.1:<unique port>` instead of 80/443 directly
— exactly the pattern already proven in `deploy/kelvion-amitkhatri.conf` and
`nginx/restaurent.kelviontech.in.conf`. Revisit amitkhatri's compose (point 3
above) if this box becomes the permanent multi-site host instead of a
short-term amitkhatri-only bridge.

---

## 5. Open questions for next session

- [ ] Finish amitkhatri.co.in restore (DB, uploads, compose port fix, bring up, verify)
- [ ] Confirm whether the carried-over Let's Encrypt cert (valid to Oct 10) still works, or needs re-issuing
- [ ] Decide: deploy the other 7 projects onto *this same* AWS box, or wait for Oracle (15-day target) and only use AWS for amitkhatri?
- [ ] kiosk needs a `docker-compose.yml` written — doesn't have one yet
- [ ] Verify whatsappweb's real RAM footprint before assuming it's "light"
- [ ] Once Oracle is fixed: decide whether to keep this AWS box running (cost) or tear it down and migrate amitkhatri back
