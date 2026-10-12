from PIL import Image
import json
from pathlib import Path
root=Path('.')
checks=[]
for name,size,color in [('background-custom-test',(1200,675),(18,52,86)),('output-green-test',(1280,720),(0,255,0)),('output-minimized-test',(1280,720),(0,0,255)),('output-stopped-test',(1280,720),(0,0,0)),('output-hd-test',(1920,1080),(0,0,255))]:
 im=Image.open(root/(name+'.png')).convert('RGB')
 ok=im.size==size and im.getpixel((10,10))==color
 if 'stopped' in name: ok=im.size==size and im.getpixel((10,10))!=(0,0,255)
 elif 'output' in name: ok=ok and im.getpixel((im.width//2,im.height//2))!=color
 checks.append(dict(name=name,size=im.size,corner=im.getpixel((10,10)),ok=ok))
print(json.dumps(checks,indent=2));(root/'output-pixel-check.json').write_text(json.dumps(checks,indent=2))
assert all(c['ok'] for c in checks)

