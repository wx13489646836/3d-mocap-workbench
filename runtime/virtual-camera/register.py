"""Register the bundled MIT DirectShow filter for this Windows user only."""
import pathlib, winreg
NAME = 'Avatar Camera'
CLSID = '{5C2CD55C-92AD-4999-8666-912BD3E70010}'
CATEGORY = '{860BB310-5D01-11D0-BD3B-00A0C911CE86}'
base = 'Software\\Classes\\CLSID\\'
dll = str(pathlib.Path(__file__).with_name('UnityCaptureFilter64.dll').resolve())
try:
    with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT,'CLSID\\'+CLSID+r'\InprocServer32') as k:
        existing=winreg.QueryValueEx(k,'')[0]
        if pathlib.Path(existing).resolve()!=pathlib.Path(dll):
            raise RuntimeError('已有其他 Unity Capture 虚拟相机占用设备，未覆盖其注册信息')
except FileNotFoundError: pass
def put(key, name, value):
    with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER,key,0,winreg.KEY_WRITE) as k:
        winreg.SetValueEx(k,name,0,winreg.REG_SZ,value)
for guid, label in [(CLSID,NAME),('{5C2CD55C-92AD-4999-8666-912BD3E70011}',NAME+'配置')]:
    put(base+guid,'',label)
    put(base+guid+r'\InprocServer32','',dll)
    put(base+guid+r'\InprocServer32','ThreadingModel','Both')
instance=base+CATEGORY+'\\Instance\\'+CLSID
put(instance,'FriendlyName',NAME)
put(instance,'CLSID',CLSID)
put(instance,'DevicePath','studio:virtual-camera')
print(NAME)
