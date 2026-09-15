"""Read-only verification of an extracted source release, including on Windows."""
import hashlib,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'SOURCE_SHA256.json').read_text(encoding='utf-8'))
failures=[]
for name,expected in manifest.items():
    path=root/name
    if root not in path.resolve().parents or not path.is_file() or path.is_symlink():
        failures.append(name);continue
    if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:failures.append(name)
print(json.dumps({'files':len(manifest),'mismatched_or_missing_paths':failures,'status':'FAIL' if failures else 'PASS'}))
sys.exit(bool(failures))
