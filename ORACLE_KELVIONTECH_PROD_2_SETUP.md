# Oracle Cloud — `kelviontech-prod-2` Setup

**Plan history, 2026-10-04 (same day, settled by end of day):** briefly
considered deploying the full platform to the AWS box instead (SSH to
this box was unreliable mid-session, dynamic ISP IP vs. the locked-down
security list) — but the AWS box is shared with amitkhatri/Wrench/
kelviontech.in/the WhatsApp connector and was down to ~824MB free RAM /
9.9GB free disk, too tight to safely build 7 more images there without
risking those other live sites. **Settled back on this Oracle box**:
dedicated, empty, isolated — a full independent stack (its own db +
backend + all 8 frontend apps) deploys here with zero risk to AWS. See
`docker-compose.yml`'s `proxy` service (Compose profile `oracle`) and
`nginx/oracle-testing-proxy.conf` for the resulting path-based routing
scheme on this box's bare reserved IP.

---

Written 2026-10-04. Second Oracle Always Free account, set up because the
original `kelviontech-prod` VM (on a different Oracle account/tenancy) was
disabled for exceeding its Ampere Always Free allowance. This is separate
from the temporary AWS bridge box (`amitkhatri-prod`, see
`AWS_DEPLOYMENT_MASTER_PLAN.md`) — that one hosts a different site
(amitkhatri.co.in) and is unrelated to this VM.

**Repo clone / deploy key / actual stack deployment was not done yet** —
this doc covers infrastructure provisioning only, completed 2026-10-03.

---

## 1. Account limits — important correction

This tenancy's Always Free Ampere allowance is **2 OCPU / 12 GB**, not the
standard 4 OCPU / 24 GB Oracle advertises generically in its console
banners. (The old `kelviontech-prod` VM was disabled after exceeding its
limit, and the account appears to have a reduced allotment on re-signup.)
**Always provision Ampere shapes at 2 OCPU / 12 GB on this account** —
going higher risks the same shutdown that took out the original VM.

Running 2 OCPU/12GB 24/7 all month uses ~1,488 of the 3,000 OCPU-hour
budget and ~8,928 of the 18,000 GB-hour budget — comfortably under half,
so no risk of hitting the cap even running continuously.

---

## 2. Compute instance

| | |
|---|---|
| Console name | `kelviontech-prod-2` |
| Region | `ap-mumbai-1` (India West, Mumbai) |
| Compartment | `maheshwariom789 (root)` |
| Shape | `VM.Standard.A1.Flex` (Ampere, ARM/aarch64) — **2 OCPU, 12 GB RAM** |
| Image | Canonical Ubuntu 24.04 (full, **not** Minimal), build `2026.09.18-0`, aarch64 |
| Availability/Fault domain | AD-1 / FD-1 |
| Boot volume | 75 GB, Balanced performance (10 VPU) — within the 200 GB Always Free block storage pool |
| **Reserved public IP (static)** | **`130.210.16.150`** — always use this, not the ephemeral IP it started with (`92.4.89.141`, since released) |
| Private IP | `10.0.0.191` |
| Docker | `29.8.2`, installed via `get.docker.com` convenience script (not preinstalled on this image, unlike the AWS AMI) |
| Docker Compose | plugin installed alongside (`docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin`, `docker-ce-rootless-extras`, `docker-buildx-plugin`) |
| `ubuntu` user | added to `docker` group (`usermod -aG docker ubuntu`) — no `sudo` needed for docker commands |
| Kernel | rebooted once to apply `7.0.0-1013-oracle` after first `apt upgrade` |

**SSH (alias `om` added to `~/.ssh/config`):**
```powershell
ssh om
```
Full form if needed:
```powershell
ssh -i "$HOME\.ssh\kelvion-om.key" ubuntu@130.210.16.150
```

Private key location: `C:\Users\Mihir Darji\.ssh\kelvion-om.key` (+ `.pub`).
Generated during instance creation via OCI's "Generate a key pair for me"
option, downloaded immediately (Oracle only shows it once), then moved out
of Downloads and permission-locked with `icacls`.

`~/.ssh/config` now has three aliases total:
- `kelvion` — old Oracle VM (currently down)
- `om` — this new Oracle VM
- `aws` — the AWS bridge box (`amitkhatri-prod`, `13.202.225.48`)

---

## 3. Networking

| Resource | Name | Detail |
|---|---|---|
| VCN | `kelviontech-2-vcn` | CIDR `10.0.0.0/16`, no IPv6 |
| Subnet | `kelviontech-2-public-subnet` | CIDR `10.0.0.0/24`, Public (Regional) |
| Internet Gateway | `kelviontech-2-igw` | — |
| Route Table | Default Route Table for `kelviontech-2-vcn` | `0.0.0.0/0` → `kelviontech-2-igw` |
| VNIC | `kelviontech-2-vnic` | Primary VNIC on the public subnet, public IPv4 assignment enabled |

**Security List rules (Default Security List for kelviontech-2-vcn):**

| Port | Source | Purpose |
|---|---|---|
| 80 (TCP) | `0.0.0.0/0` | HTTP |
| 443 (TCP) | `0.0.0.0/0` | HTTPS |
| 22 (TCP) | `106.194.79.11/32` | SSH, restricted to home/office IP (was `0.0.0.0/0` by default, locked down after confirming SSH access worked) |

**Note:** if the home/office ISP IP changes (dynamic IPv4), rule above will
need updating or SSH access will be lost — console's Instance Console
Connection is the fallback recovery path if locked out.

### Reserved Public IP — how it was attached (non-obvious steps)

Oracle doesn't let you convert an ephemeral public IP to reserved in
place via a single toggle. The working sequence was:

1. Networking → IP Management → **Reserved public IPs** → **Create
   Reserved Public IP** first, as its own standalone object (this
   produced `130.210.16.150`, initially unattached).
2. Compute → instance → Networking tab → Primary VNIC → **IP
   administration** tab → find the private IP row → **⋯ → Edit**.
3. Only **after** a reserved IP already exists unattached in the
   compartment does the "Edit Private IP Address" dialog show **"Reserved
   public IP"** as a third radio option (alongside "No public IP" /
   "Ephemeral public IP"). Select it → "Select Existing Reserved IP
   Address" → pick the one created in step 1.
4. Click **Update** — the instance's public IP switches from the
   ephemeral address to the reserved one immediately, no downtime beyond
   a brief SSH reconnect.

(The instance's own "Attached VNICs" page and the reserved IP's own `⋯`
menu do **not** have a direct "Attach" action — the edit path above, on
the private IP itself, is the only way.)

---

## 4. Outstanding — next session

- [ ] Generate a **fresh GitHub deploy key** on this box (don't reuse the
      AWS box's `github_deploy` key or the old Oracle VM's key — title it
      clearly on GitHub, e.g. "kelviontech-prod-2 server", same pattern as
      the AWS deploy key)
- [ ] Clone the kiosk repo
- [ ] Confirm exactly which stack/services this VM is meant to run (full
      `kelviontech-prod` replacement vs. a narrower scope) — not decided
      yet as of this doc
- [ ] Restore `.env` files / TLS cert bundle if reusable from an existing
      backup, or re-issue via certbot
- [ ] Adjust `docker-compose` port bindings for direct `80:80`/`443:443`
      exposure (no shared nginx in front on this dedicated box, same
      consideration as the AWS bridge box)
