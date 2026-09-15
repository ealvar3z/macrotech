"""Local release assembler and heuristic credential scan; never prints values.
Run after verification. Excludes dependencies, runtime data, credentials and EXEs.
Not a substitute for security review or a vulnerability advisory database.
"""
import hashlib,json,re,subprocess,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent
EXCLUDED_DIRS={'node_modules','.git','__pycache__','.windows-builder','READY_TO_TEST','.firebase','screenshots'}
def eligible(path):
    relative=path.relative_to(ROOT)
    if relative.parts[0]=='Macrotech Quotations' or any(part in EXCLUDED_DIRS or part.startswith('Macrotech Quotation Pilot Review') for part in relative.parts):return False
    if path.is_symlink() or not path.is_file():return False
    if path.suffix.lower() in {'.exe','.dll','.pyc','.pem','.key','.p12','.pfx','.zip'}:return False
    if path.name.startswith('.env') and path.name!='.env.example':return False
    if re.search(r'(credentials|service.account|oauth.tokens?|token)\.json$',path.name,re.I):return False
    return True
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
files=sorted(p for p in ROOT.rglob('*') if eligible(p))
patterns={
    'private_key_material':re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{20,}'),
    'google_access_token':re.compile(rb'\bya29\.[A-Za-z0-9_-]{25,}'),
    'google_refresh_token':re.compile(rb'\b1//[A-Za-z0-9_-]{25,}'),
    'oauth_client_secret':re.compile(rb'\bGOCSPX-[A-Za-z0-9_-]{20,}'),
    'google_api_key_review':re.compile(rb'\bAIza[A-Za-z0-9_-]{30,}'),
    'aws_access_key':re.compile(rb'\bAKIA[A-Z0-9]{16}\b'),
    'github_token':re.compile(rb'\bgh[pousr]_[A-Za-z0-9]{30,}')
}
findings=[]
for file in files:
    data=file.read_bytes()
    for kind,pattern in patterns.items():
        if pattern.search(data):findings.append({'path':str(file.relative_to(ROOT)),'kind':kind})
report={'scope':'Release-eligible files, including compiled assets; heuristic only; no credential values logged.',
        'files_scanned':len(files),'findings':findings,'status':'REVIEW_REQUIRED' if findings else 'NO_MATCHES',
        'excluded':'Dependencies, runtime caches/output, EXE/DLL, key containers, environment and credential files. No files removed from original sources.'}
(ROOT/'evidence/verification/credential_scan.json').write_text(json.dumps(report,indent=2)+'\n')
if findings:print(json.dumps(report));sys.exit('Packaging stopped: credential-pattern findings require review.')
results=json.loads((ROOT/'evidence/verification/results.json').read_text())
if any(check['exit']!=0 for check in results):sys.exit('Packaging stopped: verification is not clean.')
comparison_run=subprocess.run([sys.executable,'-B',str(ROOT/'evidence/compare_v090_baseline.py')],cwd=ROOT)
if comparison_run.returncode:sys.exit('Packaging stopped: v0.9.0 primary-baseline comparison failed.')
comparison=json.loads((ROOT/'evidence/verification/v090_regression_comparison.json').read_text())
if comparison.get('status')!='PASS':sys.exit('Packaging stopped: v0.9.0 regression evidence is not clean.')
baseline=ROOT.parent.parent/'readiness/Macrotech_v0.9.0_PreApproval_Readiness'
baseline_manifest=json.loads((baseline/'SOURCE_SHA256.json').read_text())
bad=[name for name,want in baseline_manifest.items() if not (baseline/name).is_file() or digest(baseline/name)!=want]
if bad:sys.exit('Baseline integrity mismatch; packaging stopped.')
baseline_report={'primary_development_baseline':'0.9.0-readiness.2','successor':'0.10.0-tallies.1',
    'verified_original_files':len(baseline_manifest),'mismatches':bad,
    'baseline_test_counts':{'python':101,'api':82,'worker':28},
    'note':'v0.8.0 is retained only as historical rollback ancestry.'}
(ROOT/'evidence/verification/baseline_preserved.json').write_text(json.dumps(baseline_report,indent=2)+'\n')
historical=ROOT.parent.parent/'build/Macrotech_v0.8.0_Employee_Workflow_Pilot'
historical_manifest=json.loads((historical/'SOURCE_SHA256.json').read_text())
historical_bad=[name for name,want in historical_manifest.items() if not (historical/name).is_file() or digest(historical/name)!=want]
if historical_bad:sys.exit('Historical v0.8.0 rollback integrity mismatch; packaging stopped.')
files=sorted(p for p in ROOT.rglob('*') if eligible(p) and p.name!='SOURCE_SHA256.json')
manifest={str(p.relative_to(ROOT)):digest(p) for p in files}
(ROOT/'SOURCE_SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n')
files.append(ROOT/'SOURCE_SHA256.json')
archive=OUT/(ROOT.name+'.zip')
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as zipped:
    for file in files:zipped.write(file,str(Path(ROOT.name)/file.relative_to(ROOT)))
with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    for name,want in manifest.items():assert hashlib.sha256(zipped.read(str(Path(ROOT.name)/name))).hexdigest()==want
hash_value=digest(archive)
(OUT/(archive.name+'.sha256')).write_text(f'{hash_value}  {archive.name}\n')
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'files':len(files),'sha256':hash_value,
    'primary_baseline':'0.9.0-readiness.2','baseline_files_verified':len(baseline_manifest),
    'v090_regression_tests':{'python':101,'api':82,'worker':28},
    'historical_v080_files_verified':len(historical_manifest),'credential_patterns':report['status']}))
