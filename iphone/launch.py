#!/usr/bin/env python3
"""Run only the iPhone controller/voice service; editors launch separately."""
import argparse,os,sys,time,pathlib,subprocess,signal,re,socket
ROOT=pathlib.Path(__file__).resolve().parent
os.chdir(ROOT)
parser=argparse.ArgumentParser();parser.add_argument('--target',choices=['excalidraw','blender'],default='excalidraw');args=parser.parse_args()
RUNTIME=ROOT/'runtime';RUNTIME.mkdir(exist_ok=True);children=[]
def stop(*unused):
 for p in reversed(children):
  try:os.killpg(p.pid,signal.SIGTERM)
  except ProcessLookupError:pass
 sys.exit(0)
signal.signal(signal.SIGINT,stop);signal.signal(signal.SIGTERM,stop)
def start(command,name):
 log=open(RUNTIME/(name+'.log'),'a');env=dict(os.environ,TARGET=args.target)
 p=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env);children.append(p)
for port in (3002,4310):
 with socket.socket() as s:
  if s.connect_ex(('127.0.0.1',port))==0:sys.exit(f'Port {port} is already occupied.')
hsec=pathlib.Path.home()/'.local/bin/hsec'
status=subprocess.check_output([str(hsec),'status'],text=True)
if 'unlocked' not in status:
 subprocess.run([str(hsec),'unlock','--method','ssh','--ssh-key',str(pathlib.Path.home()/'.ssh/id_ed25519')],check=True,stdout=subprocess.DEVNULL)
start(['npm','run','dev'],'web')
start([str(hsec),'exec','--only','OPENAI_API_KEY','--','node','native/server.mjs'],'bridge')
(RUNTIME/'public-url.txt').unlink(missing_ok=True);(RUNTIME/'tunnel.log').write_text('')
cloud=RUNTIME/'bin/cloudflared'
if cloud.exists():start([str(cloud),'tunnel','--url','http://127.0.0.1:4310','--no-autoupdate'],'tunnel')
print('iPhone pairing: http://127.0.0.1:3002 | Target: '+args.target,flush=True)
paired=False
while True:
 if cloud.exists() and not paired:
  match=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',(RUNTIME/'tunnel.log').read_text())
  if match:(RUNTIME/'public-url.txt').write_text(match[0]);paired=True;print('Secure iPhone link ready.',flush=True)
 if any(p.poll() is not None for p in children):print('Controller component stopped; see runtime logs.',flush=True);stop()
 time.sleep(1)
