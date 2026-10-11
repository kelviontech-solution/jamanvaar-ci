"""Read-only inspection of this repository's artifacts. Never executes installers or prints recovered strings/secrets."""
from pathlib import Path
import hashlib, json, struct, re

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).parent / 'evidence'
baseline = json.loads((ROOT / 'docs/reports/ecosystem-assessment-2026-10-11/evidence/AVAILABLE_ARTIFACTS.json').read_text(encoding='utf-8-sig'))
result = []
for entry in baseline:
    path = ROOT / entry['path']
    if path.suffix.lower() != '.exe' or not path.exists(): continue
    data = path.read_bytes()
    record = {'path': entry['path'], 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    try:
        pe = struct.unpack_from('<I', data, 0x3c)[0]
        if data[pe:pe+4] != b'PE\0\0': raise ValueError('Not PE')
        header = pe + 24
        magic = struct.unpack_from('<H', data, header)[0]
        directories = header + (112 if magic == 0x20b else 96)
        clr = struct.unpack_from('<II', data, directories + 14 * 8)
        record['managedClrMetadata'] = clr != (0, 0)
        record['pdbDebugMarkers'] = data.count(b'RSDS')
        record['recoverableAsciiStrings'] = len(re.findall(rb'[\x20-\x7e]{8,}', data))
        record['recoverableUtf16Strings'] = len(re.findall(rb'(?:[\x20-\x7e]\x00){8,}', data))
        record['privateKeyPemMarkers'] = len(re.findall(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', data))
        record['sourceCommitVerified'] = False
    except (struct.error, ValueError): record['format'] = 'PE inspection failed'
    result.append(record)
bundles = []
for folder in [*ROOT.glob('apps/*/*/dist'), ROOT/'apps/qr-guest/dist', ROOT/'cloud/super-admin-web/dist']:
    if not folder.exists(): continue
    js = list(folder.rglob('*.js'))
    source_maps = list(folder.rglob('*.map'))
    private_keys = sum(len(re.findall(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', p.read_bytes())) for p in js)
    bundles.append({'path': folder.relative_to(ROOT).as_posix(), 'javascriptFiles': len(js), 'sourceMaps': len(source_maps), 'privateKeyPemMarkers': private_keys, 'javascriptInspectable': True})
apk = [p.relative_to(ROOT).as_posix() for folder in [ROOT/'release', *ROOT.glob('apps/*/*/src-tauri/gen/android/app/build/outputs')] if folder.exists() for p in folder.rglob('*.apk')]
output = {'scope': 'local historical artifacts and available frontend dist folders; not a mobile device penetration test', 'windows': result, 'bundles': bundles, 'availableApks': apk}
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'REVERSE_ENGINEERING.json').write_text(json.dumps(output, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'windowsInspected': len(result), 'managedClrExecutables': sum(r.get('managedClrMetadata', False) for r in result), 'apkCount': len(apk), 'bundlesInspected': len(bundles)}))
