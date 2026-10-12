"""Latest-frame-only bridge: framed Electron BGRA -> DirectShow virtual camera."""
import sys, pathlib, struct, threading, time, json, os, traceback
sys.path.insert(0,str(pathlib.Path(__file__).with_name('python')))
import numpy as np
from PIL import Image
import pyvirtualcam
width,height=map(int,sys.argv[1:3])
latest=None
finished=False
def read_exact(n):
    data=bytearray()
    while len(data)<n:
        part=sys.stdin.buffer.read(n-len(data))
        if not part: return None
        data.extend(part)
    return data
def receive():
    global latest,finished
    try:
        while True:
            header=read_exact(12)
            if header is None: break
            size,w,h=struct.unpack('<III',header)
            if size!=w*h*4 or size>3840*2160*4: raise ValueError('Invalid frame')
            data=read_exact(size)
            if data is None: break
            image=Image.frombytes('RGBA',(w,h),bytes(data),'raw','BGRA').convert('RGB')
            if image.size!=(width,height): image=image.resize((width,height),Image.Resampling.BILINEAR)
            latest=np.asarray(image)
    finally: finished=True
def report(**values): print(json.dumps(values),flush=True)
try:
    with pyvirtualcam.Camera(width=width,height=height,fps=30,backend='unitycapture',device='Avatar Camera') as cam:
        report(ready=True,device=cam.device)
        reader=threading.Thread(target=receive);reader.start()
        last=time.monotonic(); frames=0
        while not finished:
            if latest is not None: cam.send(latest);frames+=1
            if latest is None: time.sleep(1/30)
            else: cam.sleep_until_next_frame()
            now=time.monotonic()
            if now-last>=1:
                report(fps=round(frames/(now-last),1));last=now;frames=0
        reader.join()
        cam.send(np.zeros((height,width,3),dtype=np.uint8))
        time.sleep(.1)
except Exception as e:
    pathlib.Path(__file__).with_name('last-error.log').write_text(traceback.format_exc(),encoding='utf-8')
    report(error=str(e));os._exit(1)
