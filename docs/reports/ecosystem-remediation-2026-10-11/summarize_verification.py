"""Produce an evidence index without reading environment files or private QA configuration."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re, subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EV = HERE / 'evidence'

def read(path):
    data = path.read_bytes()
    return data.decode('utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig')

def test_log(name):
    path = EV / name
    if not path.exists(): return {'status': 'NOT_RUN', 'evidence': name}
    text = re.sub(r'\x1b\[[0-9;]*m', '', read(path))
    files = re.findall(r'^\s*Test Files\s+(.+)$', text, re.M)
    tests = re.findall(r'^\s*Tests\s+(.+)$', text, re.M)
    return {'status': ('FAIL' if 'failed' in files[-1] else 'PASS') if files else 'RUNNING_OR_INCOMPLETE', 'files': files[-1].strip() if files else None, 'tests': tests[-1].strip() if tests else None, 'evidence': name}

audit_prod = json.loads(read(EV/'npm-audit-production-final.json'))
audit_all = json.loads(read(EV/'npm-audit-all-final.json'))
rust = []
for app, name in [('pos','rust-pos-audit.json'),('pos-admin','rust-pos-admin-audit.json'),('kiosk-user','rust-kiosk-user-audit.json'),('kds','rust-audit-kds.json'),('captain','rust-audit-captain.json')]:
    data = json.loads(read(EV/name))
    rust.append({'app':app, 'vulnerabilities':data['vulnerabilities']['count'], 'warnings':{key:len(value) for key,value in data.get('warnings',{}).items()}, 'evidence':name})
(EV/'RUST_AUDIT_SUMMARY.json').write_text(json.dumps(rust, indent=2)+'\n')
tests = {name:test_log(name) for name in ['root-full-confirmed.log','api-full-confirmed.log','api-security-confirmed.log','api-boundary-final.log','core-canonical-final.log','root-final-failures.log','receipt-authority-final.log','api-receipt-authority-final.log']}
builds = json.loads(read(EV/'FRONTEND_BUILDS.json'))
signature = json.loads(read(EV/'ARTIFACT_SIGNATURES.json'))
reverse = json.loads(read(EV/'REVERSE_ENGINEERING.json'))
verification = {
    'generatedAt':datetime.now(timezone.utc).isoformat(),
    'scope':'Changed workspace; local QA only; no production deployment or public release',
    'tests':tests,
    'validationSequence':'Full suites passed before the final receipt-authority guard change; focused core/configuration/API checks and both typechecks/API build followed that change.',
    'frontendBuilds':builds,
    'productionNpmAdvisories':audit_prod['metadata']['vulnerabilities'],
    'allNpmAdvisories':audit_all['metadata']['vulnerabilities'],
    'rustAudits':rust,
    'syncLoad':json.loads(read(EV/'SYNC_LOAD.json')),
    'reverseEngineering':{'windowsExeCount':len(reverse['windows']), 'managedClrMetadataCount':sum(x.get('managedClrMetadata',False) for x in reverse['windows']), 'bundles':len(reverse['bundles']), 'availableJamanvaarApks':len(reverse['availableApks']), 'authenticodeValidCount':sum(x['authenticodeStatus']=='Valid' for x in signature), 'signatureInspections':len(signature)},
    'notVerified':['Production deployment and DB migrations','Docker runtime and mounted-volume permissions','GitHub quality/release workflow execution','Trusted signed release and upgrade tests','Android build/device and APK penetration test','Real payment-provider sandbox/refund acceptance','Production capacity and backup restore rehearsal'],
    'runtimeDependencies':json.loads(read(EV/'RUNTIME_DEPENDENCIES.json')),
    'additionalEvidence':['root-types-final.log','api-types-final.log','api-build-final.log','build-pos-final.log','native-kds-check-final.log','TRACKED_BUILD_CLEANUP.json','SBOM.cdx.json']
}
(HERE/'VERIFICATION.json').write_text(json.dumps(verification, indent=2)+'\n')
baseline = json.loads(read(ROOT/'docs/reports/ecosystem-assessment-2026-10-11/SCORECARD.json'))
values = {'security':[8,8,9,7,8,6,8,6,7,8], 'quality':[7,6,8,9,8,8,6,7,8,8], 'saas':[9,8,8,8,6,6]}
card = {'date':'2026-10-11', 'baselineRevision':baseline['revision'], 'remediationRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(), 'status':'PROVISIONAL_WORKSPACE_REASSESSMENT', 'confidence':'High for probed local boundaries; moderate for repository-wide conclusions; production/native acceptance pending', 'weights':baseline['weights'], 'ecosystem':{}}
for category, scores in values.items():
    dimensions = baseline['weights'][category]
    card['ecosystem'][category] = {'baselineScore':baseline['ecosystem'][category]['score'], 'score':round(sum(w*s for (_,w),s in zip(dimensions,scores))/100,1), 'dimensions':{label:s for (label,_),s in zip(dimensions,scores)}}
(HERE/'SCORECARD.json').write_text(json.dumps(card,indent=2)+'\n')
statuses = {'SEC-01':'VERIFIED_LOCAL','SEC-02':'VERIFIED_LOCAL','SEC-03':'VERIFIED_LOCAL','SEC-04':'VERIFIED_LOCAL_POLICY; DEPLOYMENT_PENDING','SEC-05':'IMPLEMENTED; SIGNED_RELEASE_AND_DEVICE_ACCEPTANCE_PENDING','SEC-06':'IMPLEMENTED; CONTAINER_ACCEPTANCE_PENDING','SEC-07':'IMPLEMENTED; ANDROID_ACCEPTANCE_PENDING','SEC-08':'PARTIAL; BROWSER_AND_NON_WINDOWS_STORAGE_REMAIN','DEP-01':'PRODUCTION_SCAN_CLEAR; DEVELOPMENT_ALERTS_REMAIN','ART-01':'RELEASE_GATE_IMPLEMENTED; HISTORICAL_ARTIFACTS_UNCHANGED','QUAL-01':'VERIFIED_LOCAL','QUAL-02':'SEE_FINAL_VERIFICATION','QUAL-03':'VERIFIED_LOCAL','QUAL-04':'PARTIAL; LARGE_MODULES_REMAIN','QUAL-05':'VERIFIED_LOCAL','QUAL-06':'VERIFIED_TRACKING_CLEANUP; LOCAL_FILES_PRESERVED','QUAL-07':'VERIFIED_LOCAL','SAAS-01':'VERIFIED_LOCAL; RECEIVER_DEDUP_REQUIRED','SAAS-02':'LOCAL_LOAD_MEASURED; LARGE_TENANT_CAPACITY_OPEN','SAAS-03':'GATES_IMPLEMENTED; CI_EXECUTION_PENDING','CFG-01':'IMPLEMENTED; RELEASE_CONFIGURATION_PENDING'}
if all(x['status']=='PASS' for x in tests.values()): statuses['QUAL-02']='VERIFIED_LOCAL; SEE_VALIDATION_SEQUENCE'
old = json.loads(read(ROOT/'docs/reports/ecosystem-assessment-2026-10-11/FINDINGS.json'))
(HERE/'FINDINGS_CLOSURE.json').write_text(json.dumps([{'id':x['id'],'title':x['title'],'status':statuses[x['id']]} for x in old],indent=2)+'\n')
paths = subprocess.check_output(['git','-c','core.safecrlf=false','diff','--name-only','HEAD'],cwd=ROOT,text=True,stderr=subprocess.DEVNULL).splitlines()+subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines()
hashes = {}
for name in sorted(set(paths)):
    path = ROOT/name
    if path.parent == HERE and path.name in ['SOURCE_MANIFEST.json','SCORECARD.json','VERIFICATION.json','FINDINGS_CLOSURE.json']: continue
    if not path.is_file() or '/target/' in name or '/evidence/' in name or name.startswith(('logs/','.jamanvaar/')) or path.name.startswith('.env'): continue
    if path.suffix not in ['.ts','.tsx','.json','.rs','.kt','.yml','.ps1','.sh','.cjs','.py','.toml'] and path.name not in ['Dockerfile','Makefile']: continue
    hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
(HERE/'SOURCE_MANIFEST.json').write_text(json.dumps({'scope':'Changed source/configuration files, including pre-existing user edits; excludes credentials, generated target and evidence files','files':hashes},indent=2)+'\n')
print(json.dumps({'tests':tests, 'scores':{k:v['score'] for k,v in card['ecosystem'].items()}, 'sourceFiles':len(hashes)},indent=2))
