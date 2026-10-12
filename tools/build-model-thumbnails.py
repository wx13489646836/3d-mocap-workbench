from PIL import Image,ImageChops
from pathlib import Path
root=Path('outputs/XR-Animator-Studio/models')
for model,name in [('default','AliciaSolid'),('robert','Robert'),('polybot','Polybot'),('realman','RocketboxMale')]:
 image=Image.open(root/(model+'-render.png')).convert('RGB')
 diff=ImageChops.difference(image,Image.new('RGB',image.size,(32,51,76)))
 mask=diff.convert('L').point(lambda p:255 if p>25 else 0)
 box=mask.getbbox() or (0,0,image.width,image.height)
 x0,y0,x1,y1=box;cx=(x0+x1)/2;cy=(y0+y1)/2;height=(y1-y0)+48;width=max((x1-x0)+48,height*80/104);height=max(height,width*104/80)
 thumb=image.crop((round(cx-width/2),round(cy-height/2),round(cx+width/2),round(cy+height/2))).resize((320,416),Image.Resampling.LANCZOS)
 thumb.save(root/(name+'.png'))
