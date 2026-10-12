import re,json,urllib.parse,pathlib
s=pathlib.Path('engine/AT_SystemAnimator_v110350.gadget/TEMP/_config_local/XR Animator.js').read_text(encoding='utf-8-sig')
m=re.search(r'"LABEL_XRA_settings"\s*:\s*"([^"]+)"',s)
data=json.loads(urllib.parse.unquote(m.group(1)))
found=[]
def walk(v,p=''):
 if isinstance(v,dict):
  for k,x in v.items():
   key=p+'.'+k
   if re.search('token|password|secret|api.?key|authorization',k,re.I) and x: found.append(key)
   walk(x,key)
 elif isinstance(v,list):
  for i,x in enumerate(v):walk(x,p+str(i))
walk(data)
print('nonempty credential fields:',found)
assert not found
