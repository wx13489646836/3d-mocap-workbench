from pathlib import Path
import subprocess,hashlib,json,datetime
paths=subprocess.check_output(['git','ls-files','-z']).decode('utf-8').split('\0')
files=[]
for name in paths:
 if not name:continue
 p=Path(name);h=hashlib.sha256()
 with p.open('rb') as f:
  while data:=f.read(1048576):h.update(data)
 files.append({'path':name,'bytes':p.stat().st_size,'sha256':h.hexdigest()})
result={'project':'3D动捕工作台','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files,'file_count':len(files),'total_bytes':sum(f['bytes'] for f in files)}
Path('BACKUP-MANIFEST.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'files':len(files),'MB':round(result['total_bytes']/1024**2,1)}))
