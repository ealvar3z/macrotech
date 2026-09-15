import os,socket,sys,unittest,tempfile
from pathlib import Path
root=Path(sys.argv[1]).resolve()
os.environ['LOCALAPPDATA']=tempfile.mkdtemp(prefix='macrotech-audit-')
def blocked(*a,**k):raise RuntimeError('AUDIT: network is disabled')
socket.create_connection=blocked
socket.socket.connect=blocked
socket.socket.connect_ex=blocked
sys.path.insert(0,str(root))
suite=unittest.defaultTestLoader.discover(str(root/'tests'))
r=unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(not r.wasSuccessful())
