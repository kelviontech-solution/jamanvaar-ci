# 🚀 JAMANVAAR GitHub Release Publishing Guide (v1.0.0)

This guide walks you through publishing the generated Windows installers to **GitHub Releases** on your repository: `https://github.com/om7867/kiosk`.

---

## 📂 Release Assets Created in `release/`

The following production files are ready in `release/` (and copied to your Desktop):

| File | Size | Role |
| :--- | :--- | :--- |
| **`JAMANVAAR-POS-Setup.exe`** | 27.04 MB | Windows Installer for POS Counter Terminal |
| **`JAMANVAAR-POS-Admin-Setup.exe`** | 27.03 MB | Windows Installer for POS Admin / KDS / Inventory |
| **`JAMANVAAR-Kiosk-Setup.exe`** | 30.23 MB | Windows Installer for Touchscreen Customer Kiosk |
| **`JAMANVAAR-Kiosk-Admin-Setup.exe`** | 30.27 MB | Windows Installer for Kiosk Fleet Admin |
| **`JAMANVAAR-Windows-Apps-v1.0.0.zip`** | 114.42 MB | Combined Package with all 4 installers + README |
| **`SHA256SUMS.txt`** | 479 B | File integrity checksums |

---

## 🌐 Step-by-Step GitHub Release Instructions

1. Go to your repository: [**github.com/om7867/kiosk/releases/new**](https://github.com/om7867/kiosk/releases/new)
2. **Choose a tag**: Type `v1.0.0` and click *Create new tag: v1.0.0 on publish*.
3. **Release title**: `JAMANVAAR v1.0.0 — Official Windows Desktop Release`
4. **Release description** (Copy and paste the template below):

```markdown
# 🍽️ JAMANVAAR Restaurant Operating System — Windows Release (v1.0.0)
*by KELVIONTECH*

Official 1-click Windows installers for the complete JAMANVAAR restaurant terminal suite.

### 📥 Download Applications

- 🟠 **[JAMANVAAR-POS-Setup.exe](https://github.com/om7867/kiosk/releases/download/v1.0.0/JAMANVAAR-POS-Setup.exe)** — High-Speed POS Counter Billing & Cash Drawer
- 🔵 **[JAMANVAAR-POS-Admin-Setup.exe](https://github.com/om7867/kiosk/releases/download/v1.0.0/JAMANVAAR-POS-Admin-Setup.exe)** — Management HQ, Live KDS Kitchen Display & Inventory
- 🟢 **[JAMANVAAR-Kiosk-Setup.exe](https://github.com/om7867/kiosk/releases/download/v1.0.0/JAMANVAAR-Kiosk-Setup.exe)** — Customer Self-Ordering Touchscreen Terminal
- 🟣 **[JAMANVAAR-Kiosk-Admin-Setup.exe](https://github.com/om7867/kiosk/releases/download/v1.0.0/JAMANVAAR-Kiosk-Admin-Setup.exe)** — Kiosk Fleet Control & Catalog Manager

📦 **[JAMANVAAR-Windows-Apps-v1.0.0.zip](https://github.com/om7867/kiosk/releases/download/v1.0.0/JAMANVAAR-Windows-Apps-v1.0.0.zip)** — Combined ZIP containing all 4 installers.

---

### ✨ Features
- **1-Click Native Installation**: No Node.js or development servers required.
- **Automatic Shortcuts**: Creates official desktop and Start Menu shortcuts.
- **100% Offline-First**: Zero localhost errors; runs on-premise without cloud latency.
- **Windows Integration**: Clean uninstallation via Windows Installed Apps.

---
*Verify file checksums using SHA256SUMS.txt attached below.*
```

5. **Attach binaries**: Drag and drop the 6 files from `C:\Users\OM Sanjhira\OneDrive\Desktop\k2\release\` into the binary upload box.
6. Click **Publish release**.
