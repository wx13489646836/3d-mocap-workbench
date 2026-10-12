from PIL import Image
from pathlib import Path
im=Image.open('assets/app-icon.png').convert('RGBA')
im.save('assets/app-icon.ico',format='ICO',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
im.resize((512,512),Image.Resampling.LANCZOS).save('assets/app-icon-512.png')
with Image.open('assets/app-icon.ico') as ico:
 print('ICO sizes:',sorted(ico.ico.sizes()))
 print('PNG:',im.size,im.mode,'alpha:',im.getchannel('A').getextrema())
