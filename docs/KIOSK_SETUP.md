# JAMANVAAR Kiosk First-Run & Hardware Provisioning Guide

## 1. First-Run Setup Checklist

When provisioning a new self-ordering kiosk terminal:

1. **Unbox & Mount Hardware**:
   - Commercial touch panel (1080x1920 portrait or 1920x1080 landscape).
   - 80mm ESC/POS direct thermal receipt printer connected via USB or static LAN IP.
   - PineLabs / Mosambee / Ingenico Smart POS card terminal.
   - High-speed Ethernet connection or stable 5GHz Wi-Fi.

2. **Launch Application & First-Time Activation**:
   - Launch `JAMANVAAR Touch Kiosk.exe`.
   - On initial boot, enter:
     - **Restaurant ID**: `rest-jamanvaar-main`
     - **Outlet Code**: `AHM-01`
     - **Terminal Identifier**: `KIOSK-01`
   - Touch **Activate Terminal**.

3. **Verify Peripheral Diagnostics**:
   - Thermal Printer: Run test print slip (verifies 80mm width and auto-cutter).
   - Payment Terminal: Verify UPI QR display and card reader readiness.
   - Local Database Cache: Verify download of full menu catalog and active promo codes.
