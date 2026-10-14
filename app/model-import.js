const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {spawn}=require('child_process');
const JSZip=require('../engine/AT_SystemAnimator_v110350.gadget/js/jszip.js');
const native=/\.(vrm|pmx|pmd|vmd|bvh)$/i;
const supported=/\.(vrm|pmx|pmd|vmd|bvh|fbx|obj|glb|gltf|stl|ply|blend)$/i;
function blenderPath(){
 const roots=[path.join(process.env.ProgramFiles||'C:/Program Files','Blender Foundation'),path.join(process.env.LOCALAPPDATA||'','Programs','Blender Foundation')];
 for(const root of roots){if(!fs.existsSync(root))continue;for(const folder of fs.readdirSync(root).filter(n=>{const v=n.match(/(\d+)\.(\d+)/);return v&&(Number(v[1])>4||Number(v[1])===4&&Number(v[2])>=2);}).sort((a,b)=>{const av=a.match(/(\d+)\.(\d+)/),bv=b.match(/(\d+)\.(\d+)/);return Number(bv[1])-Number(av[1])||Number(bv[2])-Number(av[2]);})){const exe=path.join(root,folder,'blender.exe');if(fs.existsSync(exe))return exe;}}
 throw Error('导入此格式需要 Blender 4.2 或更新版。请安装 Blender 后重试；VRM、PMX、PMD 和动作文件仍可直接导入。');
}
module.exports=async(file,{progress=()=>{},select=async files=>files[0]}={})=>{
 progress('正在检查文件…');
 if(!fs.existsSync(file))throw Error('模型文件不存在，请重新选择');
 const folder=path.join(__dirname,'../imports',crypto.randomUUID());
 if(path.extname(file).toLowerCase()==='.zip'){
  let zip;try{zip=await JSZip.loadAsync(fs.readFileSync(file));}catch{throw Error('压缩包无法读取，请确认 ZIP 文件没有损坏');}
  const entries=Object.values(zip.files).filter(e=>!e.dir&&!e.name.startsWith('__MACOSX/')&&!e.name.split('/').pop().startsWith('._'));
  const candidates=entries.map(e=>e.name).filter(n=>supported.test(n));
  if(!candidates.length)throw Error('ZIP 中没有支持的模型或动作文件。支持 OBJ、FBX、GLB、GLTF、STL、PLY、BLEND、VRM、PMX、PMD、VMD 和 BVH。');
  let chosen=candidates.length===1?candidates[0]:await select(candidates);
  if(!chosen)return {cancelled:true};
  // Native ZIP handlers retain their established loading and animation behavior.
  if(native.test(chosen)&&candidates.length===1)return {file,kind:'native'};
  progress('正在解压模型与贴图…');fs.mkdirSync(folder,{recursive:true});
  let total=0;
  for(const entry of entries){
   const target=path.resolve(folder,entry.name.replace(/\\/g,'/'));
   if(!target.startsWith(path.resolve(folder)+path.sep))throw Error('ZIP 内包含不安全的文件路径');
   const data=await entry.async('nodebuffer');total+=data.length;
   if(total>1024*1024*1024)throw Error('压缩包解压后超过 1 GB，请先手动解压再选择模型');
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);
  }
  file=path.resolve(folder,chosen.replace(/\\/g,'/'));
 }
 if(native.test(file))return {file,kind:'native'};
 if(!supported.test(file))throw Error('此文件格式尚不支持，请选择支持的模型格式');
 // Already prepared GLB/VRM containers need no conversion.
 if(/\.glb$/i.test(file)){
  const data=fs.readFileSync(file);if(data.length<20||data.toString('ascii',0,4)!=='glTF')throw Error('GLB 文件无效');
  const doc=JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
  if(doc.extensions?.VRMC_vrm||doc.extensions?.VRM)return {file,kind:'native'};
  if(!doc.skins?.length)return {file,kind:'static',displayName:path.basename(file),note:'静态模型，无人形骨骼'};
 }
 const exe=blenderPath();fs.mkdirSync(folder,{recursive:true});
 progress('Blender 正在读取模型、贴图与骨骼…');
 const args=['--background','--disable-autoexec','--python',path.join(__dirname,'model-convert.py'),'--',file,folder];
 await new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let log='',settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
  const timer=setTimeout(()=>{child.kill();finish(Error('模型转换超时，请简化模型或贴图后重试'));},180000);
  const collect=data=>{log=(log+data.toString()).slice(-12000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
  child.on('error',()=>finish(Error('Blender 无法启动，请检查安装路径')));
  child.on('exit',code=>{
   const resultFile=path.join(folder,'result.json');
   if(code!==0||!fs.existsSync(resultFile)){fs.writeFileSync(path.join(folder,'conversion.log'),log);finish(Error('模型转换失败，请确认文件完整，并将贴图和 MTL 放在模型旁边。详细日志：'+path.join(folder,'conversion.log')));}else finish();
  });
 });
 const result=JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8'));
 if(result.error)throw Error(result.error);
 progress(result.kind==='native'?'人形骨骼已映射，正在加载动捕人物…':'正在加载模型预览…');
 return {...result,displayName:path.basename(file)};
};
module.exports.blenderPath=blenderPath;
