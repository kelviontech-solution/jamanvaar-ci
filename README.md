<div align="center">

# 🍽️ JAMANVAAR Restaurant Operating System
### *by KELVIONTECH*

**Enterprise Offline-First Restaurant Suite for High-Speed Billing, Kitchen Display, Touch Kiosk & Fleet Control**

[![Release](https://img.shields.io/badge/Release-v1.0.0-orange.svg)](https://github.com/om7867/kiosk/releases)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-blue.svg)](https://github.com/om7867/kiosk)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](https://github.com/om7867/kiosk)
[![Architecture](https://img.shields.io/badge/Mode-100%25%20Offline--First-emerald.svg)](https://github.com/om7867/kiosk)

</div>

---

## 📦 Windows Desktop Downloads (GitHub Release)

Download the required official Windows installer directly from the [**Latest GitHub Release (v1.0.0)**](https://github.com/om7867/kiosk/releases):

| Terminal Application | Download Installer | Primary Role |
| :--- | :--- | :--- |
| 💳 **JAMANVAAR POS** | [**`JAMANVAAR-POS-Setup.exe`**](https://github.com/om7867/kiosk/releases) | High-speed counter billing, dine-in table layout, split bills, cash drawer & thermal printing |
| 📊 **JAMANVAAR POS Admin** | [**`JAMANVAAR-POS-Admin-Setup.exe`**](https://github.com/om7867/kiosk/releases) | Real-time kitchen display (KDS), manager analytics, recipe management & inventory ledger |
| 📱 **JAMANVAAR Kiosk** | [**`JAMANVAAR-Kiosk-Setup.exe`**](https://github.com/om7867/kiosk/releases) | Self-ordering customer touchscreen kiosk with modifiers, upsell combos & instant token display |
| ⚙️ **JAMANVAAR Kiosk Admin** | [**`JAMANVAAR-Kiosk-Admin-Setup.exe`**](https://github.com/om7867/kiosk/releases) | Fleet control for kiosk devices, digital menu catalogs, visual themes & kiosk terminal status |

> 📦 **Dealer / Multi-Terminal Suite:**  
> Download [**`JAMANVAAR-Windows-Apps-v1.0.0.zip`**](https://github.com/om7867/kiosk/releases) to get all 4 installers packaged together.

---

## 🚀 Easy 1-Click Installation (No Developer Setup)

Customers and dealers do **NOT** need Node.js, terminal commands, or development servers.

1. **Download** the desired `.exe` installer from GitHub Releases.
2. **Double-click** the `Setup.exe` installer.
3. Click **Install Now**.
4. The installer automatically:
   - Sets up the isolated application in `%LOCALAPPDATA%\Programs\JAMANVAAR\`.
   - Creates a **Desktop Shortcut** with the official JAMANVAAR logo.
   - Adds a **Start Menu** entry under `JAMANVAAR`.
   - Registers Windows uninstallation in `Settings -> Apps -> Installed Apps`.
5. Launch directly from your Desktop shortcut!

---

## 🔒 Enterprise Offline Architecture

- **Zero Localhost Popups**: Applications boot immediately in native standalone window frames.
- **100% Offline-First**: Operates seamlessly without active cloud/internet connectivity.
- **Embedded Real-Time State**: Synchronizes menu items, orders, table occupancy, and KDS tickets locally across the restaurant LAN.

---

## 💻 Running Development Servers

To run the platform servers and developer applications, refer to the complete [**Server Launch Guide (RUN_SERVERS.md)**](./docs/development/RUN_SERVERS.md):

```bash
# Launch ALL 9 platform services concurrently (Cloud + All Terminals)
npm run dev:all

# Launch Cloud SaaS Suite only (API :4000 + Super Admin Web :5180)
npm run dev:cloud

# Launch Restaurant Terminal Suite (POS + Admin + KDS + Captain + Kiosk + Sync)
npm run dev

# Or on Windows, simply double-click:
start-all-servers.bat
```

---

## 🛠️ Building From Source

```bash
# Clone the repository
git clone https://github.com/om7867/kiosk.git
cd kiosk

# Install dependencies
npm install

# Build all production frontends
npm run build

# Generate all 4 standalone Windows Setup.exe installers & GitHub Release ZIP
node tooling/installers/build_windows_installers.cjs
```

---

<div align="center">
  <sub>© 2026 JAMANVAAR by KELVIONTECH. All rights reserved.</sub>
</div>
