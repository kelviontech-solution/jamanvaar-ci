import sys, json, re, hashlib, subprocess
from pathlib import Path

root, output = map(Path, sys.argv[1:3])
paths = subprocess.check_output(['git','ls-files'], cwd=root, text=True).splitlines()
code_extensions = {'.ts','.tsx','.rs','.cjs','.mjs','.py','.sql'}
records, manifests, routes, secrets = [], [], [], []
for name in paths:
    p = root / name
    if not p.is_file(): continue
    if p.name == 'package.json' and '/node_modules/' not in name:
        data = json.loads(p.read_text(encoding='utf-8'))
        manifests.append({'path':name,'name':data.get('name'),'scripts':data.get('scripts',{}),'dependencies':list(data.get('dependencies',{}))})
    if p.suffix not in code_extensions and p.suffix not in {'.json','.yml','.yaml','.toml','.md'}: continue
    text = p.read_text(encoding='utf-8', errors='replace')
    lines = text.splitlines()
    if p.suffix in code_extensions:
        records.append({'path':name,'lines':len(lines),'anyCount':len(re.findall(r'\bany\b',text)),'todoCount':len(re.findall(r'\b(TODO|FIXME)\b',text))})
    if name.endswith('.controller.ts'):
        routes.append({'path':name,'routes':len(re.findall(r'@(Get|Post|Put|Patch|Delete)\s*\(',text)), 'hasGuardDecorator':'@UseGuards' in text, 'hasZod':'ZodValidationPipe' in text})
    # Candidate detection only; no raw credential values ever leave the source.
    for i,line in enumerate(lines,1):
        patterns = {
          'private-key-marker':r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
          'aws-access-key-shape':r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
          'provider-secret-shape':r'\b(?:sk_live_|ghp_|github_pat_)[A-Za-z0-9_]{16,}',
          'credentialed-database-url':r'(?:postgres(?:ql)?|mysql)://[^\s:/]+:[^\s@]+@',
        }
        for kind,pat in patterns.items():
            if re.search(pat,line): secrets.append({'path':name,'line':i,'kind':kind,'status':'candidate, requires classification; value redacted'})
schema = (root/'cloud/api/prisma/schema.prisma').read_text()
models = [{'name':m.group(1),'restaurantOwned':'restaurantId' in m.group(2),'branchField':'branchId' in m.group(2)} for m in re.finditer(r'model\s+(\w+)\s*\{(.*?)\n\}',schema,re.S)]
enabled, forced = set(),set()
for p in sorted((root/'cloud/api/prisma/migrations').glob('*/migration.sql')):
    t=p.read_text()
    enabled.update(re.findall(r'ALTER TABLE\s+"(\w+)"\s+ENABLE ROW LEVEL SECURITY',t,re.I))
    forced.update(re.findall(r'ALTER TABLE\s+"(\w+)"\s+FORCE ROW LEVEL SECURITY',t,re.I))
    for previous, current in re.findall(r'ALTER TABLE\s+"(\w+)"\s+RENAME TO\s+"(\w+)"',t,re.I):
        if previous in enabled: enabled.remove(previous); enabled.add(current)
        if previous in forced: forced.remove(previous); forced.add(current)
result={'revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'trackedFiles':len(paths),'lockSha256':hashlib.sha256((root/'package-lock.json').read_bytes()).hexdigest(),'manifests':manifests,'sourceFileCount':len(records),'sourceLines':sum(r['lines'] for r in records),'largestModules':sorted(records,key=lambda r:r['lines'],reverse=True)[:35],'anyCountsByArea':{area:sum(r['anyCount'] for r in records if r['path'].startswith(area)) for area in ['cloud/api/src','cloud/super-admin-web/src','apps/restaurant-system/pos/','apps/restaurant-system/pos-admin/','apps/restaurant-system/captain/','apps/restaurant-system/kds/','apps/kiosk-system/','apps/qr-guest/','packages/']},'controllers':routes,'testFiles':[n for n in paths if re.search(r'\.(test|spec)\.(ts|tsx|cjs)$',n)],'models':models,'rlsDeclaredEnabled':sorted(enabled),'rlsDeclaredForced':sorted(forced),'tenantModelsWithoutDeclaredRls':[m['name'] for m in models if m['restaurantOwned'] and m['name'] not in enabled],'secretCandidates':secrets,'artifactPaths':[n for n in paths if Path(n).suffix.lower() in {'.exe','.msi','.apk','.aab','.dll','.map'}]}
output.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps({'revision':result['revision'],'trackedFiles':len(paths),'manifests':len(manifests),'sourceFileCount':len(records),'sourceLines':result['sourceLines'],'controllers':len(routes),'tests':len(result['testFiles']),'models':len(models),'secretCandidates':len(secrets),'tenantModelsWithoutDeclaredRls':result['tenantModelsWithoutDeclaredRls'],'largestModules':result['largestModules'][:10]},indent=2))
