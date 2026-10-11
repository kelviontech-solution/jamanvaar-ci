#!/usr/bin/env bash
set -euo pipefail
for name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_PASSWORD ANDROID_KEY_ALIAS ANDROID_SIGNING_CERT_SHA256; do
  if [[ -z "${!name:-}" ]]; then echo "Missing release signing configuration: $name" >&2; exit 1; fi
done
root="${1:?Android generated project path required}"
tools="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1)"
[[ -x "$tools/apksigner" && -x "$tools/zipalign" && -x "$tools/aapt" ]]
keystore="$(mktemp)"
trap 'rm -f -- "$keystore"' EXIT
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$keystore"
chmod 600 "$keystore"
mapfile -t apks < <(find "$root/app/build/outputs/apk" -path '*/release/*' -name '*.apk' ! -name '*signed.apk' ! -name '*aligned.apk')
[[ ${#apks[@]} -eq 1 ]] || { echo 'Expected exactly one arm64 release APK' >&2; exit 1; }
mkdir -p "$root/verified-release"
"$tools/zipalign" -f -p 4 "${apks[0]}" "$root/verified-release/aligned.apk"
"$tools/apksigner" sign --ks "$keystore" --ks-key-alias "$ANDROID_KEY_ALIAS" --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEY_PASSWORD --out "$root/verified-release/jamanvaar-release.apk" "$root/verified-release/aligned.apk"
verification="$("$tools/apksigner" verify --verbose --print-certs "$root/verified-release/jamanvaar-release.apk")"
fingerprint="$(printf '%s\n' "$verification" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | tr -d ':' | tr '[:upper:]' '[:lower:]')"
expected="$(printf '%s' "$ANDROID_SIGNING_CERT_SHA256" | tr -d ':' | tr '[:upper:]' '[:lower:]')"
[[ "$fingerprint" == "$expected" ]] || { echo 'Unexpected Android signing certificate' >&2; exit 1; }
if "$tools/aapt" dump badging "$root/verified-release/jamanvaar-release.apk" | grep -q 'application-debuggable'; then echo 'Debuggable APK rejected' >&2; exit 1; fi
node .github/scripts/verify-android-identity.mjs "$root/verified-release/jamanvaar-release.apk" "$root" "$tools/aapt"
rm -f -- "$root/verified-release/aligned.apk"
