# Wrench — AWS Bridge Deployment Guide (`amitkhatri-prod` / `m7i-flex.large`)

This guide is specifically tailored to the target server defined in [AWS_DEPLOYMENT_MASTER_PLAN.md](AWS_DEPLOYMENT_MASTER_PLAN.md).

---

## 1. Target Server Infrastructure Snapshot

| Specification | Configuration |
|---|---|
| **Instance ID** | `i-09cb4321863636d82` |
| **Instance Type** | `m7i-flex.large` (2 vCPU, 8 GiB RAM, 50 GiB gp3 SSD) |
| **Operating System** | Ubuntu Server 24.04 LTS (x86_64) |
| **Elastic IP (Static)** | **`13.202.225.48`** |
| **Private IP** | `172.31.44.235` |
| **Security Group** | `launch-wizard-1` (SSH 22 from My IP, HTTP 80 & HTTPS 443 open to `0.0.0.0/0`) |
| **SSH Key** | `C:\Users\Mihir Darji\.ssh\mihir-personal.pem` |
| **Docker / Compose** | Docker `29.8.1` & Compose `v5.5.1` *(already pre-installed)* |

---

## 2. Multi-Site Port Map & Resource Budget

To run smoothly alongside `amitkhatri` and other sub-stacks on this 8 GiB RAM server, Wrench uses a dedicated port block and strict RAM limits:

| Stack / Project | DB Port | Backend Port | Web / Public Port | Wrench Memory Limit |
|---|---|---|---|---|
| `kelviontech.in` | `5432` | `8000` | `3000` | — |
| `restaurent.kelviontech.in` | `5433` | `8001` | `3001` | — |
| `amitkhatri.co.in` | — | — | `8080` (or `80/443`) | — |
| **Wrench** *(College Project)* | **`5435`** *(loopback)* | **`8005`** *(loopback)* | **`8085`** | **Max ~1.2 GiB (typical ~350 MB)** |

- **Log Rotation**: Capped at `10 MB` per file with a maximum of 3 files per container (`max-size: "10m"`, `max-file: "3"`), ensuring the 50 GB root disk never runs out of space.
- **Single Worker ASGI**: Runs Uvicorn with `--workers 1` to guarantee single-process WebSocket fan-out consistency and minimal RAM footprint.

---

## 3. Step-by-Step Deployment on the AWS VM

### Step 1: Connect via SSH
From your local PowerShell terminal:
```powershell
ssh -i "$HOME\.ssh\mihir-personal.pem" ubuntu@13.202.225.48
```

---

### Step 2: Clone Wrench via GitHub Deploy Key
*(The server's deploy key `~/.ssh/github_deploy` is already added to GitHub account `Mihir-dev2511`).*

```bash
cd /home/ubuntu
git clone git@github.com:Krutarth9858/Wrench.git wrench
cd wrench
```
*(Or clone via HTTPS if preferred).*

---

### Step 3: Setup Production Environment
```bash
cp .env.example .env
nano .env
```

The pre-configured defaults are already mapped to:
- `PORT=8085`
- `DB_PORT=5435`
- `BACKEND_PORT=8005`
- `ALLOW_DEV_STUBS_IN_PROD=true`
- `AUTO_SEED=true`

Review or update passwords as desired, then save (`Ctrl+O`, `Enter`, `Ctrl+X`).

---

### Step 4: Build & Launch Containers
```bash
make deploy
```

What `make deploy` executes:
1. `git pull` (Pulls latest code).
2. Builds `wrench_backend` (Python 3.11 slim).
3. Builds `wrench_frontend` (Vite 5 React SPA + internal Nginx).
4. Launches `wrench_db`, `wrench_backend`, and `wrench_frontend`.
5. Automatic startup sequence:
   - Backend waits for PostgreSQL health.
   - Runs `alembic upgrade head` (creates all database tables automatically).
   - Runs `seed_initial.py` (provisions Admin and demo accounts).

---

### Step 5: Verify System Health
```bash
make check
```

Expected Output:
```text
=== [1/3] Checking Docker Container Status ===
wrench_db         Up (healthy)
wrench_backend    Up
wrench_frontend   Up (0.0.0.0:8085->80/tcp)

=== [2/3] Checking Backend Health Endpoint ===
{"status":"ok"} -> Backend is HEALTHY

=== [3/3] Checking Frontend Web Access ===
 -> Frontend is SERVING HTTP 200
```

---

## 4. Two Ways to Access Wrench (Without Buying Any Domain)

### Method A: Direct Port Access (`:8085`)
1. In the AWS EC2 Console, open Security Group `launch-wizard-1`.
2. Add an **Inbound Rule**:
   - **Type**: Custom TCP
   - **Port**: `8085`
   - **Source**: `0.0.0.0/0` (Anywhere)
3. Open in your browser:
   ```
   http://13.202.225.48:8085
   ```

---

### Method B: Zero-Cost Wildcard Domain (`nip.io` via Port 80)
Because Security Group `launch-wizard-1` already opens Port 80, you can route through host Nginx using free wildcard DNS:

1. Copy the included `nip.io` virtual host to Nginx:
   ```bash
   sudo cp nginx/wrench.nipio.conf /etc/nginx/sites-available/wrench.nipio.conf
   sudo ln -s /etc/nginx/sites-available/wrench.nipio.conf /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```
2. Open in your browser immediately (no DNS purchase or propagation needed!):
   ```
   http://wrench.13.202.225.48.nip.io
   ```

---

## 5. Seeded Demo Logins

| Role | Email | Password | Access Details |
|---|---|---|---|
| **Super Admin** | `admin@wrench.com` | `AdminSecure2026!` | Admin oversight, mechanic verification |
| **Mechanic** | `apex.mechanic@wrench.com` | `Password123!` | "Apex Auto Care" garage dashboard, live dispatch |
| **Customer** | `kaushal@wrench.com` | `Password123!` | Book nearby mechanic, AI diagnostic chatbot, vehicle management |

*Interactive Swagger Documentation:*
```
http://13.202.225.48:8085/docs
# OR
http://wrench.13.202.225.48.nip.io/docs
```

---

## 6. Daily Operations Cheat Sheet

| Command | Action |
|---|---|
| `make deploy` | Safe update: pull latest commit, rebuild images, and restart |
| `make check` | Run full health diagnostic check on database, backend, and frontend |
| `make logs` | Tail logs of all containers simultaneously |
| `make logs-backend` | Tail FastAPI backend logs |
| `make logs-frontend` | Tail Frontend access and Nginx logs |
| `make logs-db` | Tail PostgreSQL database logs |
| `make restart` | Quick restart without rebuilding images (after `.env` edits) |
| `make stop` | Stop all 3 Wrench containers |
| `make seed` | Re-run initial database seeder |
| `make create-admin` | Interactively create an additional super-admin user |
| `make db-shell` | Open interactive `psql` console inside `wrench_db` |
| `make prune` | Reclaim host disk space by purging unused Docker layers |
