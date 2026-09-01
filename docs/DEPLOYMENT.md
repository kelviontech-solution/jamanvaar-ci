# JAMANVAAR Windows Deployment & Packaging Guide

## 1. Building Windows Executables & Installers

JAMANVAAR uses **Tauri 2.x** with the Microsoft Webview2 runtime to produce lightweight, high-performance native Windows installers (`.msi` / `.exe`).

### Prerequisites on Build Machine:
- Windows 10/11 (64-bit)
- Rust & Cargo (`rustup default stable-x86_64-pc-windows-msvc`)
- Visual Studio C++ Build Tools
- Node.js >= 18

---

## 2. Build Commands

### Step 1: Install Dependencies & Compile Web Assets
```bash
npm install
npm run build
```

### Step 2: Build Native Windows Binaries via Tauri
```bash
# Build Admin Desktop Application
cd apps/kiosk-admin
npx tauri build

# Build Customer Touch Kiosk Application
cd ../kiosk-user
npx tauri build
```

The compiled installer artifacts will be generated under:
`apps/kiosk-admin/src-tauri/target/release/bundle/msi/`
`apps/kiosk-user/src-tauri/target/release/bundle/msi/`

---

## 3. Windows Assigned Access (Kiosk Mode) Setup

For production hardware deployments, configure the customer application with Windows Assigned Access:
1. Open Windows **Settings → Accounts → Other users → Set up a kiosk**.
2. Select **JAMANVAAR Touch Kiosk** as the dedicated kiosk application.
3. Configure auto-login on device startup.
