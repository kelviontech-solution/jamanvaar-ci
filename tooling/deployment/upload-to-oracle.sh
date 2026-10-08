#!/usr/bin/env bash
# Uploads a staged set of JAMANVAAR installers to the Oracle production box's downloads
# directory (served by nginx's /downloads/ location -- see
# nginx/oracle-testing-proxy.conf and docs/deployment/RELEASE_HOSTING.md).
#
# Must be run by whoever holds SSH access to the box (the `om` alias documented in
# docs/deployment/ORACLE_KELVIONTECH_PROD_2_SETUP.md) -- this cannot run from an
# unprivileged sandbox with no SSH key for that host.
#
# Usage:
#   tooling/release/upload-to-oracle.sh <version> <staging-dir>
#
# <staging-dir> must contain exactly these 10 files (e.g. produced by renaming the
# artifacts downloaded from a GitHub Actions run -- see
# docs/deployment/RELEASE_HOSTING.md's "Per-release steps"):
#   pos.exe  pos-admin.exe  kiosk.exe  captain.exe  kds.exe
#   pos.apk  pos-admin.apk  kiosk.apk  captain.apk  kds.apk

set -euo pipefail

VERSION="${1:?Usage: upload-to-oracle.sh <version> <staging-dir>}"
STAGING_DIR="${2:?Usage: upload-to-oracle.sh <version> <staging-dir>}"
REMOTE_HOST="om"
REMOTE_DIR="/opt/jamanvaar/downloads/${VERSION}"

FILES=(pos.exe pos-admin.exe kiosk.exe captain.exe kds.exe pos.apk pos-admin.apk kiosk.apk captain.apk kds.apk)

for f in "${FILES[@]}"; do
  if [ ! -f "${STAGING_DIR}/${f}" ]; then
    echo "Missing expected file: ${STAGING_DIR}/${f}" >&2
    exit 1
  fi
done

echo "Creating ${REMOTE_DIR} on the server..."
ssh "$REMOTE_HOST" "mkdir -p ${REMOTE_DIR}"

echo "Uploading ${#FILES[@]} files..."
for f in "${FILES[@]}"; do
  scp "${STAGING_DIR}/${f}" "${REMOTE_HOST}:${REMOTE_DIR}/jamanvaar-${f}"
done

echo ""
echo "Done. Public URLs (use these in Super Admin's Publish Version form):"
for f in "${FILES[@]}"; do
  echo "  https://system.kelviontech.in/downloads/${VERSION}/jamanvaar-${f}"
done
