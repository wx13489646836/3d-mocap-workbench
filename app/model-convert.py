import bpy,pathlib,json,struct,sys,math,numpy as np
from mathutils import Matrix,Vector
args=sys.argv[sys.argv.index('--')+1:];source=pathlib.Path(args[0]);out=pathlib.Path(args[1]);out.mkdir(parents=True,exist_ok=True)
def run():
 bpy.ops.wm.read_factory_settings(use_empty=True)
 ext=source.suffix.lower()
 if ext=='.fbx':bpy.ops.import_scene.fbx(filepath=str(source))
 elif ext=='.obj':bpy.ops.wm.obj_import(filepath=str(source))
 elif ext in ['.glb','.gltf']:bpy.ops.import_scene.gltf(filepath=str(source))
 elif ext=='.stl':bpy.ops.wm.stl_import(filepath=str(source))
 elif ext=='.ply':bpy.ops.wm.ply_import(filepath=str(source))
 elif ext=='.blend':bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
 else:raise ValueError('不支持的模型格式')
 meshes=[o for o in bpy.data.objects if o.type=='MESH' and len(o.data.vertices)>0]
 if not meshes:
  if ext=='.fbx' and len(bpy.data.actions):return {'file':str(source),'kind':'native','note':'FBX 动作文件'}
  raise ValueError('模型没有可显示的网格')
 arms=[o for o in bpy.data.objects if o.type=='ARMATURE'];arm=arms[0] if len(arms)==1 else None
 mapping={}
 if arm:
  def norm(n):return n.lower().split(':')[-1].replace('_','').replace(' ','').replace('.','')
  bones={norm(b.name):b.name for b in arm.data.bones}
  def find(role,candidates):
   for c in candidates:
    if c in bones:mapping[role]=bones[c];return
  for r,aliases in {'hips':['hips','pelvis','bip01pelvis'],'spine':['spine','bip01spine'],'chest':['spine1','chest','bip01spine1'],'upperChest':['spine2','upperchest','bip01spine2'],'neck':['neck','bip01neck'],'head':['head','bip01head']}.items():find(r,aliases)
  for side,short in [('left','l'),('right','r')]:
   for role,mixamo,other in [('Shoulder','shoulder','clavicle'),('UpperArm','arm','upperarm'),('LowerArm','forearm','lowerarm'),('Hand','hand','hand'),('UpperLeg','upleg','thigh'),('LowerLeg','leg','calf'),('Foot','foot','foot'),('Toes','toebase','toes')]:find(side+role,[side+mixamo,side+other,other+short,short+other,'bip01'+short+other])
   for digit,src in [('Thumb','thumb'),('Index','index'),('Middle','middle'),('Ring','ring'),('Little','pinky')]:
    for i,segment in enumerate(['Metacarpal','Proximal','Distal'] if digit=='Thumb' else ['Proximal','Intermediate','Distal'],1):find(side+digit+segment,[side+'hand'+src+str(i),side+src+str(i)])
 required=['hips','spine','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot']
 weighted=arm and all(any(mod.type=='ARMATURE' and mod.object==arm for mod in o.modifiers) and len(o.vertex_groups) for o in meshes)
 humanoid=bool(weighted and all(r in mapping for r in required))
 for o in bpy.data.objects:
  o.animation_data_clear()
  if o.type=='MESH' and o.data.shape_keys:
   o.data.shape_keys.animation_data_clear()
   for k in o.data.shape_keys.key_blocks:k.value=0
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes+arms:o.select_set(True)
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 if humanoid:
  for pb in arm.pose.bones:pb.matrix_basis=Matrix.Identity(4)
  bpy.context.view_layer.update()
  for side in ['left','right']:
   # Determine the arm direction from the skeleton instead of assuming handedness.
   hip=arm.pose.bones[mapping['hips']].head
   shoulder=arm.pose.bones[mapping[side+'UpperArm']].head
   sign=1 if shoulder.x>hip.x else -1
   for role,child in [('UpperArm','LowerArm'),('LowerArm','Hand')]:
    bpy.context.view_layer.update();pb=arm.pose.bones[mapping[side+role]];delta=arm.pose.bones[mapping[side+child]].head-pb.head
    if delta.length<1e-6:continue
    q=delta.rotation_difference(Vector((sign,0,0)));head=pb.head.copy();pb.matrix=Matrix.Translation(head)@q.to_matrix().to_4x4()@Matrix.Translation(-head)@pb.matrix
  bpy.context.view_layer.update()
  for obj in meshes:
   n=len(obj.data.vertices);transforms=np.zeros((n,4,4),dtype=np.float32);totals=np.zeros(n,dtype=np.float32);gm={}
   for g in obj.vertex_groups:
    pb=arm.pose.bones.get(g.name)
    if pb:gm[g.index]=np.array(obj.matrix_world.inverted()@arm.matrix_world@(pb.matrix@pb.bone.matrix_local.inverted())@arm.matrix_world.inverted()@obj.matrix_world,dtype=np.float32)
   for v in obj.data.vertices:
    for e in v.groups:
     if e.group in gm:transforms[v.index]+=gm[e.group]*e.weight;totals[v.index]+=e.weight
   missing=totals<1e-5;transforms[missing]=np.eye(4);totals[missing]=1;transforms/=totals[:,None,None]
   containers=list(obj.data.shape_keys.key_blocks) if obj.data.shape_keys else [obj.data]
   for k in containers:
    data=k.data if hasattr(k,'data') else k.vertices
    co=np.empty(n*3,dtype=np.float32);data.foreach_get('co',co);h=np.concatenate([co.reshape((n,3)),np.ones((n,1),dtype=np.float32)],axis=1);baked=np.einsum('nij,nj->ni',transforms,h)[:,:3];data.foreach_set('co',baked.ravel())
   if obj.data.shape_keys:obj.data.vertices.foreach_set('co',np.array([list(v.co) for v in obj.data.shape_keys.key_blocks[0].data],dtype=np.float32).ravel())
   obj.data.update()
  bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='POSE');bpy.ops.pose.armature_apply(selected=False);bpy.ops.object.mode_set(mode='OBJECT')
 # Include textures, safely resolving FBX companion texture folders.
 missingTextures=[]
 for image in bpy.data.images:
  if image.source!='FILE' or image.packed_file:continue
  original=pathlib.Path(bpy.path.abspath(image.filepath));candidate=original
  if not candidate.is_file():
   matches=list(source.parent.rglob(original.name));candidate=matches[0] if matches else original
  if candidate.is_file():image.filepath=str(candidate);image.reload();image.pack()
  else:missingTextures.append(original.name)
 materialCorrections=[]
 if ext=='.fbx':
  # Tripo's legacy Phong export inherits a ReflectionFactor template of 1.
  # Blender maps it to PBR metallic=1 even though this material explicitly
  # declares Reflectivity=0. Do not override authored PBR/metallic materials.
  from io_scene_fbx import parse_fbx
  fbx_root,_=parse_fbx.parse(str(source));nonmetal=set()
  for objects in fbx_root.elems:
   if objects.id!=b'Objects':continue
   for item in objects.elems:
    if item.id!=b'Material':continue
    name=item.props[1].split(b'\x00')[0].decode('utf-8','replace')
    if not name.startswith('tripo_mat_'):continue
    shader=next((c.props[0] for c in item.elems if c.id==b'ShadingModel'),b'')
    props={p.props[0]:p.props[4:] for c in item.elems if c.id==b'Properties70' for p in c.elems if p.id==b'P'}
    if shader.lower()==b'phong' and props.get(b'Reflectivity')==[0.0] and b'ReflectionFactor' not in props and not any(b'metal' in k.lower() for k in props):nonmetal.add(name)
  opaque_images={}
  for material in bpy.data.materials:
   if not material.use_nodes:continue
   for node in material.node_tree.nodes:
    if node.type!='BSDF_PRINCIPLED':continue
    if material.name in nonmetal and not node.inputs['Metallic'].is_linked:
     node.inputs['Metallic'].default_value=0
     # Legacy Phong's missing refraction index is imported as IOR=1 and
     # doubled specular. Use the standard dielectric baseline for PBR.
     if not node.inputs['IOR'].is_linked:node.inputs['IOR'].default_value=1.5
     if not node.inputs['Specular IOR Level'].is_linked:node.inputs['Specular IOR Level'].default_value=.5
     materialCorrections.append({'material':material.name,'correction':'legacy_phong_nonmetal'})
    alpha=node.inputs['Alpha']
    # A 32-bit diffuse PNG does not imply translucency. Preserve genuine
    # alpha textures and node networks; remove only proven constant opacity.
    if len(alpha.links)!=1:continue
    link=alpha.links[0];image=link.from_node.image if link.from_node.type=='TEX_IMAGE' and link.from_socket.name=='Alpha' else None
    if image is None or not image.has_data:continue
    key=image.as_pointer()
    if key not in opaque_images:
     pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels)
     opaque_images[key]=bool(len(pixels) and np.all(pixels[3::4]>=1-1e-6));del pixels
    if opaque_images[key]:
     material.node_tree.links.remove(link);alpha.default_value=1
     materialCorrections.append({'material':material.name,'correction':'fully_opaque_texture'})
 bpy.ops.object.select_all(action='DESELECT')
 for o in meshes+arms:o.select_set(True)
 target=out/'model.glb';bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_morph=True,export_morph_normal=True,export_yup=True)
 result={'file':str(target),'kind':'static','note':'没有可识别的人形骨骼，仅供模型展示','missingTextures':missingTextures,'materialCorrections':materialCorrections}
 if humanoid:
  raw=target.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:];names={n.get('name'):i for i,n in enumerate(doc['nodes'])};human={r:{'node':names[b]} for r,b in mapping.items() if b in names}
  expr={}
  aliases={'blink':['blink','eyeclose','eyesclosed'],'blinkLeft':['blinkleft','eyecloseleft'],'blinkRight':['blinkright','eyecloseright'],'aa':['aa','a','mouthopen','jawopen'],'ih':['ih','i'],'ou':['ou','u'],'ee':['ee','e'],'oh':['oh','o'],'happy':['happy','smile'],'sad':['sad'],'angry':['angry'],'surprised':['surprised'],'relaxed':['relaxed']}
  for exp,options in aliases.items():
   binds=[]
   for i,node in enumerate(doc['nodes']):
    if 'mesh' not in node:continue
    targets=doc['meshes'][node['mesh']].get('extras',{}).get('targetNames',[])
    for j,name in enumerate(targets):
     if name.lower().replace('_','').replace(' ','') in options:binds.append({'node':i,'index':j,'weight':1})
   if binds:expr[exp]={'isBinary':False,'morphTargetBinds':binds}
  doc.setdefault('extensions',{})['VRMC_vrm']={'specVersion':'1.0','meta':{'name':source.stem,'version':'1.0','authors':['Original author unspecified'],'copyrightInformation':'Local conversion; original source license remains applicable.','licenseUrl':'https://vrm.dev/licenses/1.0/','avatarPermission':'onlyAuthor','commercialUsage':'personalNonProfit','creditNotation':'required','allowRedistribution':False,'modification':'allowModification'},'humanoid':{'humanBones':human},'expressions':{'preset':expr}}
  doc.setdefault('extensionsUsed',[]).append('VRMC_vrm');payload=json.dumps(doc,separators=(',',':')).encode();payload+=b' '*((-len(payload))%4);binary+=b'\0'*((-len(binary))%4)
  vrm=out/'model.vrm';vrm.write_bytes(struct.pack('<III',0x46546c67,2,28+len(payload)+len(binary))+struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(binary),0x004e4942)+binary)
  result.update(file=str(vrm),kind='native',note='已自动转换为人形动捕模型',humanoidBones=len(human),expressions=list(expr))
 return result
try:result=run()
except Exception as e:
 import traceback;traceback.print_exc();result={'error':'模型转换失败：'+str(e)}
(out/'result.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
