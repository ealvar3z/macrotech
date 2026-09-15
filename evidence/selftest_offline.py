"""Run the unpackaged desktop self-test with isolated state and network blocked."""
import os,runpy,socket,sys,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def blocked(*a,**k):raise RuntimeError('OFFLINE_SELF_TEST: network prohibited')
socket.socket.connect=blocked;socket.create_connection=blocked;socket.socket.connect_ex=blocked
with tempfile.TemporaryDirectory(prefix='macrotech-selftest-') as local:
    os.environ['LOCALAPPDATA']=local;sys.path.insert(0,str(root));sys.argv=[str(root/'web_app.pyw'),'--self-test']
    runpy.run_path(str(root/'web_app.pyw'),run_name='__main__')
