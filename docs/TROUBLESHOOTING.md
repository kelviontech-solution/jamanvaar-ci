# JAMANVAAR Troubleshooting & Diagnostics Guide

## 1. Common Hardware & System Diagnostics

### 1. Thermal Printer Not Printing
- **Symptom**: Receipt does not print upon order confirmation.
- **Diagnostic**: Go to **Admin → Hardware & Printers → Run Test Print**.
- **Remedy**:
  1. Check paper roll orientation and ensure thermal side is facing print head.
  2. Verify USB cable connection or ping LAN static IP address.
  3. Ensure printer paper cover is securely clicked shut.

### 2. Kiosk Marked Inactive / Locked
- **Symptom**: Kiosk displays "Kiosk Temporarily Unavailable".
- **Remedy**:
  1. Open Admin Control Plane → Kiosks.
  2. Find the target terminal and click **Unlock Kiosk** or **Exit Maintenance Mode**.

### 3. Outbox Events Stuck in Pending
- **Symptom**: Sync outbox count remains greater than 0.
- **Remedy**:
  1. Open Admin → Sync Center.
  2. Click **Force Outbox Flush**.
  3. Verify network gateway and DNS reachability.
