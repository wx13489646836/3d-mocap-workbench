import bpy,json,pathlib,struct
from PIL import Image
root=pathlib.Path('work/rocketbox-male').resolve();dest=pathlib.Path('outputs/XR-Animator-Studio/models/RocketboxMale.vrm').resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(root/'Male_Adult_01_facial.fbx'))
for obj in bpy.data.objects:
 obj.animation_data_clear()
 if obj.type=='MESH' and obj.data.shape_keys:
  obj.data.shape_keys.animation_data_clear()
  for key in obj.data.shape_keys.key_blocks:key.value=0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# Convert the source A-pose into the T-pose expected by humanoid retargeting.
# Bake the same deformation into every shape key so facial expressions survive.
import numpy as np
from mathutils import Vector,Matrix
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for pb in arm.pose.bones:pb.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
for side,sign in [('L',1),('R',-1)]:
 for part in ['UpperArm','Forearm','Hand']:
  pb=arm.pose.bones[f'Bip01 {side} {part}'];bpy.context.view_layer.update()
  child={'UpperArm':'Forearm','Forearm':'Hand','Hand':'Finger2'}[part]
  direction=arm.pose.bones[f'Bip01 {side} {child}'].head-pb.head
  q=direction.rotation_difference(Vector((sign,0,0)))
  head=pb.head.copy();pb.matrix=Matrix.Translation(head)@q.to_matrix().to_4x4()@Matrix.Translation(-head)@pb.matrix
bpy.context.view_layer.update()
for obj in [o for o in bpy.data.objects if o.type=='MESH']:
 n=len(obj.data.vertices);transforms=np.zeros((n,4,4),dtype=np.float32);totals=np.zeros(n,dtype=np.float32)
 group_matrices={}
 for group in obj.vertex_groups:
  pb=arm.pose.bones.get(group.name)
  if pb:group_matrices[group.index]=np.array(obj.matrix_world.inverted()@arm.matrix_world@(pb.matrix@pb.bone.matrix_local.inverted())@arm.matrix_world.inverted()@obj.matrix_world,dtype=np.float32)
 for vertex in obj.data.vertices:
  for entry in vertex.groups:
   if entry.group in group_matrices:transforms[vertex.index]+=group_matrices[entry.group]*entry.weight;totals[vertex.index]+=entry.weight
 missing=totals<1e-5;transforms[missing]=np.eye(4,dtype=np.float32);totals[missing]=1;transforms/=totals[:,None,None]
 keys=obj.data.shape_keys.key_blocks if obj.data.shape_keys else []
 basis=None
 for key in keys:
  coords=np.empty(n*3,dtype=np.float32);key.data.foreach_get('co',coords);coords=coords.reshape((n,3));homogeneous=np.concatenate([coords,np.ones((n,1),dtype=np.float32)],axis=1)
  baked=np.einsum('nij,nj->ni',transforms,homogeneous)[:,:3];key.data.foreach_set('co',baked.ravel())
  if basis is None:basis=baked
 if basis is not None:obj.data.vertices.foreach_set('co',basis.ravel())
 obj.data.update()
bpy.context.view_layer.objects.active=arm;arm.select_set(True)
bpy.ops.object.mode_set(mode='POSE');bpy.ops.pose.armature_apply(selected=False);bpy.ops.object.mode_set(mode='OBJECT')
for material in bpy.data.materials:
 kind='opacity' if 'opacity' in material.name else ('head' if 'head' in material.name else 'body')
 material.use_nodes=True;nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
 output=nodes.new('ShaderNodeOutputMaterial');bsdf=nodes.new('ShaderNodeBsdfPrincipled');links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
 bsdf.inputs['Roughness'].default_value=.72;bsdf.inputs['Metallic'].default_value=0
 def load_texture(suffix):
  source=root/f'm002_{kind}_{suffix}.tga';png=source.with_suffix('.png');Image.open(source).save(png)
  texture=nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(png),check_existing=True);return texture
 color=load_texture('color');links.new(color.outputs['Color'],bsdf.inputs['Base Color'])
 if kind=='opacity':
  links.new(color.outputs['Alpha'],bsdf.inputs['Alpha']);material.surface_render_method='DITHERED';material.use_transparent_shadow=True
 else:
  texture=load_texture('normal');texture.image.colorspace_settings.name='Non-Color';normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.65;links.new(texture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
 material.diffuse_color=(1,1,1,1)
tmp=root/'rocketbox.glb'
bpy.ops.export_scene.gltf(filepath=str(tmp),export_format='GLB',export_animations=False,export_morph=True,export_morph_normal=True,export_skins=True,export_materials='EXPORT',export_yup=True,export_image_format='AUTO')
raw=tmp.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length]);binary=raw[28+length:]
names={n.get('name'):i for i,n in enumerate(doc['nodes'])}
mapping={'hips':'Bip01 Pelvis','spine':'Bip01 Spine','chest':'Bip01 Spine1','upperChest':'Bip01 Spine2','neck':'Bip01 Neck','head':'Bip01 Head','leftEye':'Bip01 LEye','rightEye':'Bip01 REye','jaw':'Bip01 MJaw'}
for side,letter in [('left','L'),('right','R')]:
 for role,bone in [('Shoulder','Clavicle'),('UpperArm','UpperArm'),('LowerArm','Forearm'),('Hand','Hand'),('UpperLeg','Thigh'),('LowerLeg','Calf'),('Foot','Foot'),('Toes','Toe0')]:mapping[side+role]=f'Bip01 {letter} {bone}'
 for digit,number in [('Thumb',0),('Index',1),('Middle',2),('Ring',3),('Little',4)]:
  segments=['Metacarpal','Proximal','Distal'] if digit=='Thumb' else ['Proximal','Intermediate','Distal']
  for segment,suffix in zip(segments,['','1','2']):mapping[side+digit+segment]=f'Bip01 {letter} Finger{number}{suffix}'
human={role:{'node':names[name]} for role,name in mapping.items() if name in names}
assert len(human)>=50, len(human)
presets={
 'aa':[('SR_21_Jaw_Open',.9)],'ih':[('SR_21_Jaw_Open',.25),('SR_34_Mouth_Smile_Left',.4),('SR_35_Mouth_Smile_Right',.4)],
 'ou':[('SR_31_Mouth_Pout',.9),('SR_21_Jaw_Open',.3)],'ee':[('SR_21_Jaw_Open',.45),('SR_34_Mouth_Smile_Left',.5),('SR_35_Mouth_Smile_Right',.5)],'oh':[('SR_23_Mouth_Ape_Shape',.7),('SR_21_Jaw_Open',.65)],
 'blink':[('SR_05_Eye_Left_Blink',1),('SR_12_Eye_Right_Blink',1)],'blinkLeft':[('SR_05_Eye_Left_Blink',1)],'blinkRight':[('SR_12_Eye_Right_Blink',1)],
 'happy':[('SR_34_Mouth_Smile_Left',.7),('SR_35_Mouth_Smile_Right',.7)],'sad':[('SR_32_Mouth_Sad_Left',.6),('SR_33_Mouth_Sad_Right',.6)],'angry':[('SR_04_Eye_Frown',.6)],'relaxed':[],'surprised':[('SR_11_Eye_Left_Wide',.7),('SR_18_Eye_Right_Wide',.7),('SR_21_Jaw_Open',.3)]}
expressions={}
for preset,shapes in presets.items():
 binds=[]
 for index,node in enumerate(doc['nodes']):
  if 'mesh' not in node:continue
  mesh=doc['meshes'][node['mesh']];targets=mesh.get('extras',{}).get('targetNames',[])
  for name,weight in shapes:
   if name in targets:binds.append({'node':index,'index':targets.index(name),'weight':weight})
 expressions[preset]={'morphTargetBinds':binds,'isBinary':False}
assert expressions['aa']['morphTargetBinds'] and expressions['blink']['morphTargetBinds']
vrm={'specVersion':'1.0','meta':{'name':'Rocketbox Realistic Male','version':'1.0','authors':['Microsoft','Rocketbox Studios'],'copyrightInformation':'Microsoft Rocketbox; adapted to VRM with PBR materials and expression mapping. MIT license retained.','licenseUrl':'https://vrm.dev/licenses/1.0/','otherLicenseUrl':'https://github.com/microsoft/Microsoft-Rocketbox/blob/master/LICENSE.md','avatarPermission':'everyone','allowExcessivelyViolentUsage':True,'allowExcessivelySexualUsage':True,'commercialUsage':'corporation','allowPoliticalOrReligiousUsage':True,'allowAntisocialOrHateUsage':True,'creditNotation':'required','allowRedistribution':True,'modification':'allowModificationRedistribution'},'humanoid':{'humanBones':human},'expressions':{'preset':expressions},'lookAt':{'type':'bone','offsetFromHeadBone':[0,0,0],'rangeMapHorizontalInner':{'inputMaxValue':30,'outputScale':10},'rangeMapHorizontalOuter':{'inputMaxValue':30,'outputScale':10},'rangeMapVerticalDown':{'inputMaxValue':30,'outputScale':10},'rangeMapVerticalUp':{'inputMaxValue':30,'outputScale':10}}}
doc.setdefault('extensions',{})['VRMC_vrm']=vrm;doc.setdefault('extensionsUsed',[]).append('VRMC_vrm')
doc['asset']['copyright']='Microsoft Rocketbox — MIT License; see Rocketbox-LICENSE.txt'
payload=json.dumps(doc,separators=(',',':')).encode('utf8');payload+=b' '*((-len(payload))%4);binary+=b'\0'*((-len(binary))%4)
out=struct.pack('<III',0x46546c67,2,28+len(payload)+len(binary))+struct.pack('<II',len(payload),0x4e4f534a)+payload+struct.pack('<II',len(binary),0x004e4942)+binary;dest.write_bytes(out)
print(json.dumps({'file':str(dest),'size':len(out),'bones':len(human),'expressions':{k:len(v['morphTargetBinds']) for k,v in expressions.items()},'materials':len(doc.get('materials',[]))}))
