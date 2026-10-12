from pathlib import Path
from PIL import Image,ImageChops
import json
root=Path('outputs/XR-Animator-Studio')
checks=[]
for model in ['default','robert','polybot','realman']:
 im=Image.open(root/'models'/f'{model}-render.png').convert('RGB')
 mask=ImageChops.difference(im,Image.new('RGB',im.size,(32,51,76))).convert('L').point(lambda p:255 if p>15 else 0)
 box=mask.getbbox();count=sum(mask.histogram()[1:]);ok=bool(box and count>2000 and box[0]>10 and box[1]>10 and box[2]<im.width-10 and box[3]<im.height-10)
 checks.append({'model':model,'visiblePixels':count,'bounds':box,'fullyVisible':ok})
result={'ok':all(c['fullyVisible'] for c in checks),'checks':checks}
(root/'model-render-check.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
