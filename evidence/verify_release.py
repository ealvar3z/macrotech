"""Reproducible local-only unit/build checks; writes redacted verification logs.
No dependency installs, application servers, cloud commands, or email providers.
"""
import ast,json,os,re,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence'/'verification';OUT.mkdir(parents=True,exist_ok=True)
results=[]
def run(name,args,cwd=ROOT,env=None):
    started=time.monotonic()
    result=subprocess.run(args,cwd=cwd,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=240)
    (OUT/f'{name}.log').write_text(result.stdout,encoding='utf-8')
    summary={'check':name,'exit':result.returncode,'seconds':round(time.monotonic()-started,2)}
    tests=re.search(r'# tests (\d+)',result.stdout) or re.search(r'Ran (\d+) tests',result.stdout)
    if tests:summary['tests']=int(tests[1])
    results.append(summary);print(json.dumps(summary),flush=True)
    return result.returncode
run('desktop_build',['npm','run','build'],ROOT/'dashboard')
run('python_offline',[sys.executable,'-B','evidence/run_offline.py',str(ROOT)])
run('desktop_selftest',[sys.executable,'-B','evidence/selftest_offline.py'])
backend=ROOT/'staging_backend'
run('backend_typecheck',['npm','run','typecheck'],backend)
for component in ('api','worker'):
    env=dict(os.environ);env['NODE_OPTIONS']='--require='+str(ROOT/'evidence/offline-node.cjs')
    test_files=[str(f.relative_to(backend)) for f in sorted((backend/component/'src').glob('*.test.ts'))]
    run(component+'_offline',['node','--test','--test-reporter=tap','--import=tsx',*test_files],backend,env)
run('backend_build',['npm','run','build'],backend)
run('document_samples',[sys.executable,'-B','evidence/create_samples.py'])
files=[*ROOT.glob('*.py'),*ROOT.glob('*.pyw'),*(ROOT/'macrotech_demo').glob('*.py')]
for file in files:ast.parse(file.read_text(encoding='utf-8-sig'),filename=str(file))
results.append({'check':'python_source_parse','exit':0,'files':len(files)})
(OUT/'results.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
sys.exit(any(result['exit']!=0 for result in results))
