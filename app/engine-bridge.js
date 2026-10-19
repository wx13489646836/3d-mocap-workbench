(() => {
  let captureAllowed=false;
  // Studio owns device selection. The legacy picker exposes numeric devices only
  // through its keyboard catch-all branch, so it cannot be rendered as buttons.
  let captureBusy=false,captureError='',captureSource='',captureDevices=[],captureMode='Full Body';
  let capturePreview='',capturePreviewAt=0,poseUpdates=0,faceUpdates=0;
  window.addEventListener('SA_camera_poseNet_update',()=>poseUpdates++);
  window.addEventListener('SA_camera_facemesh_update',()=>faceUpdates++);
  const captureModes=['Face','Body','Body+Hands','Face+Body','Full Body','Full Body Holistic'];
  const cameraLive=()=>!!System._browser.camera.stream?.getVideoTracks().some(t=>t.readyState==='live');
  function stopTracking(){
    const c=System._browser.camera;
    c.facemesh.enabled=false;c.poseNet.enabled=false;c.handpose.enabled=false;
  }
  function releaseInput(){
    const c=System._browser.camera;
    stopTracking();c.hide();c.video?.pause();c.stream?.getTracks().forEach(t=>t.stop());
    if(c.video){c.video.srcObject=null;c.video.removeAttribute('src');c.video.load();}
    c.stream=c.video_track=c.deviceId=null;captureSource='';capturePreview='';
  }
  function cameraError(error){
    const messages={NotAllowedError:'摄像头权限被拒绝。请在 Windows 设置 → 隐私和安全性 → 摄像头中允许桌面应用访问。',NotFoundError:'未检测到摄像头，请连接设备后刷新列表。',NotReadableError:'摄像头无法读取，可能正被其他软件占用。请关闭占用程序后重试。',OverconstrainedError:'摄像头不支持当前采集参数，请改用自动分辨率。',SecurityError:'当前环境禁止访问摄像头，请检查系统权限。'};
    return messages[error.name]||error.message||'视频输入启动失败，请重试。';
  }
  async function listCameras(){
    const devices=await navigator.mediaDevices.enumerateDevices();
    captureDevices=devices.filter(d=>d.kind==='videoinput').map((d,i)=>({id:d.deviceId,label:d.label||'摄像头 '+(i+1)}));
    return captureDevices;
  }
  async function waitForVideo(video){
    video.muted=true;video.playsInline=true;
    await new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);video.removeEventListener('loadeddata',loaded);video.removeEventListener('error',failed);error?reject(error):resolve();};
      const loaded=()=>{if(video.readyState>=2&&video.videoWidth>0)finish();};
      const failed=()=>finish(Error('无法解码视频，请选择可播放的 MP4 / WebM 文件。'));
      const timer=setTimeout(()=>finish(Error('未收到视频画面，请检查设备是否被占用或重新连接。')),10000);
      video.addEventListener('loadeddata',loaded);video.addEventListener('error',failed);loaded();
    });
    await video.play();
  }
  async function startInput(payload){
    const c=System._browser.camera;
    if(payload.file){
      releaseInput();c._update_camera_reset();c.init_stream(payload.file);
      await waitForVideo(c.video);captureSource='file';
      return;
    }
    const sizes={auto:null,'480p':[640,480],'720p':[1280,720],'1080p':[1920,1080]};
    if(!Object.hasOwn(sizes,payload.resolution||'auto'))throw Error('无效的采集分辨率');
    const video={frameRate:{ideal:30}};
    if(payload.deviceId)video.deviceId={exact:payload.deviceId};
    const size=sizes[payload.resolution||'auto'];
    if(size){video.width={ideal:size[0]};video.height={ideal:size[1]};}
    releaseInput();
    let expired=false,timer;
    const pending=navigator.mediaDevices.getUserMedia({video,audio:false}).then(stream=>{
      if(expired){stream.getTracks().forEach(t=>t.stop());throw Error('摄像头启动已超时');}
      return stream;
    });
    let stream;
    try{
      stream=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('摄像头响应超时，请检查系统权限或设备占用后重试。'));},15000);})]);
    }finally{clearTimeout(timer);}
    try{
      c._update_camera_reset();c.set_constraints();c.video_flipped=payload.mirror===true;c.init_stream(stream);
      c.deviceId=stream.getVideoTracks()[0].getSettings().deviceId||payload.deviceId||null;
      await waitForVideo(c.video);
      // init_stream alone does not initialize the legacy inference canvas size.
      // Match the decoded source so capture frames have non-zero dimensions.
      c.target_width=c.video.videoWidth;c.target_height=c.video.videoHeight;c.reset_video_canvas();captureSource='camera';
      stream.getVideoTracks()[0].addEventListener('ended',()=>{
        if(c.stream===stream){stopTracking();captureSource='';capturePreview='';captureError='摄像头已断开，请重新连接设备后刷新列表。';}
      });
      await listCameras();
    }catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
  }
  function captureState(){
    const c=System._browser.camera,v=c.video,live=cameraLive()||captureSource==='file'&&!!v?.currentSrc;
    if(!live&&c.ML_enabled&&!captureBusy)stopTracking();
    if(live&&v?.readyState>=2&&['camera','tracking'].includes(activeSection)&&Date.now()-capturePreviewAt>500){
      capturePreviewAt=Date.now();
      try{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=Math.round(320*v.videoHeight/v.videoWidth);canvas.getContext('2d').drawImage(v,0,0,canvas.width,canvas.height);capturePreview=canvas.toDataURL('image/jpeg',.65);}catch{capturePreview='';}
    }
    const settings=c.video_track?.getSettings()||{};
    return {busy:captureBusy,error:captureError,devices:captureDevices,deviceId:c.deviceId||'',label:c.video_track?.label||'',source:captureSource,
      width:live?v?.videoWidth||0:0,height:live?v?.videoHeight||0:0,fps:settings.frameRate||0,preview:live?capturePreview:'',mirror:!!c.video_flipped,mode:captureMode,
      detected:!!(c.poseNet.data_detected||c.facemesh.data_detected),trackingFps:c.ML_enabled?Math.round(c.ML_fps||0):0,poseUpdates,faceUpdates};
  }
  async function captureCommand(command,payload){
    if(command==='camera-list'){await listCameras();return;}
    if(captureBusy)throw Error('采集操作正在进行，请稍候');
    if(command!=='capture-stop'&&!captureAllowed)throw Error('请手动开启采集');
    if(command==='tracking-start'&&staticModel)throw Error('当前模型仅供展示，请切换带人形骨骼的人物后再开启动捕。');
    captureBusy=true;captureError='';
    try{
      if(command==='capture-stop'){
        if(!['camera','tracking'].includes(payload.target))throw Error('无效的停止目标');
        if(payload.target==='camera')releaseInput();else stopTracking();
        return;
      }
      if(command==='tracking-start'&&!captureModes.includes(payload.mode))throw Error('请选择有效的动捕模式');
      const c=System._browser.camera;
      if(command==='camera-start'||!cameraLive()&&captureSource!=='file')await startInput(payload);
      if(command==='tracking-start'){
        if(c.bodyPix.enabled)throw Error('请先关闭人像分割，再开启动作捕捉。');
        if(c.video?.paused)await c.video.play();
        const initial=payload.mode==='Face'?faceUpdates:poseUpdates;
        await c.streamer_mode.init_mocap(payload.mode);captureMode=payload.mode;
        const started=Date.now();
        while((payload.mode==='Face'?faceUpdates:poseUpdates)<=initial){
          if(!cameraLive()&&captureSource!=='file')throw Error('视频输入已断开，请重新连接摄像头。');
          if(Date.now()-started>30000){stopTracking();throw Error('动捕模型未能返回识别结果。请重试或切换追踪模式。');}
          await new Promise(resolve=>setTimeout(resolve,100));
        }
      }
    }catch(error){
      if(command==='camera-start'||!cameraLive()&&captureSource!=='file')releaseInput();
      captureError=cameraError(error);throw Error(captureError);
    }finally{captureBusy=false;}
  }
  let staticModel=null;
  let importedName=null,importedPath=null;
  let pbrPreviewRoot=null,pbrPreviewRig=null,pbrPreviewEligible=false;
  function syncPbrPreview(){
    const x=MMD_SA.THREEX;if(!x?.enabled||!x.scene)return;
    const root=staticModel?.scene||x.models[0]?.model?.scene;
    if(root!==pbrPreviewRoot){
      pbrPreviewRoot=root;pbrPreviewEligible=false;
      root?.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material]){
        if(!m?.isMeshStandardMaterial||!/^tripo_mat_/i.test(m.name))continue;
        pbrPreviewEligible=true;
        // Older local conversions emitted an invalid specularColorFactor=2.
        // Repair the cached material too, without modifying texture color.
        if(m.specularColor&&Math.max(m.specularColor.r,m.specularColor.g,m.specularColor.b)>1){
          m.specularColor.setRGB(Math.min(1,m.specularColor.r),Math.min(1,m.specularColor.g),Math.min(1,m.specularColor.b));m.needsUpdate=true;
        }
      }});
    }
    if(pbrPreviewEligible&&!pbrPreviewRig){
      const T=x.THREE,g=pbrPreviewRig=new T.Group();g.name='StudioTripoPbrLighting';
      g.add(new T.HemisphereLight(0xffffff,0xe5d9ce,1.2));
      for(const [intensity,position] of [[1.8,[-15,20,30]],[.6,[20,10,15]]]){
        const light=new T.DirectionalLight(0xffffff,intensity);light.position.fromArray(position);g.add(light,light.target);
      }
      x.scene.add(g);
    }
    if(pbrPreviewRig){
      // Do not double-light a user-selected HDR environment, or cached avatars.
      pbrPreviewRig.visible=!!(pbrPreviewEligible&&root?.visible&&root.parent&&!x.scene.environment&&(staticModel||!MMD_SA.hide_3D_avatar));
      if(pbrPreviewRig.visible)pbrPreviewRig.position.copy(MMD_SA._trackball_camera.target);
    }
  }
  function fitPbrPreview(){
    syncPbrPreview();if(!pbrPreviewEligible||!pbrPreviewRoot)return;
    const T=MMD_SA.THREEX.THREE,t=MMD_SA._trackball_camera,b=new T.Box3().setFromObject(pbrPreviewRoot),size=b.getSize(new T.Vector3());
    if(!Number.isFinite(size.y)||size.y<=0)return;
    const center=b.getCenter(new T.Vector3()),direction=new T.Vector3().copy(t.object.position).sub(t.target).normalize();
    const vfov=t.object.fov*Math.PI/180,hfov=2*Math.atan(Math.tan(vfov/2)*MMD_SA.THREEX.camera.obj.aspect);
    const distance=Math.max(size.y/(2*Math.tan(vfov/2)),size.x/(2*Math.tan(hfov/2)))/.84+size.z*.3;
    t.target.copy(center);t.object.position.copy(new T.Vector3().copy(center).addScaledVector(direction,distance));t.update?.();
  }
  window.addEventListener('SA_MMD_before_render',syncPbrPreview);
  function clearStaticModel(){
    if(!staticModel)return;
    MMD_SA.THREEX.scene.remove(staticModel.scene);
    staticModel.scene.traverse(o=>{o.geometry?.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>{if(m){m.map?.dispose();m.dispose();}});});
    staticModel=null;MMD_SA.hide_3D_avatar=false;
  }
  async function importStatic(file,displayName){
    const loaded=await MMD_SA.THREEX.GLTF_loader.loadAsync(toFileProtocol(file));
    const THREE=MMD_SA.THREEX.THREE,scene=loaded.scene;
    const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(![size.x,size.y,size.z].every(Number.isFinite)||Math.max(size.x,size.y,size.z)<=0){scene.traverse(o=>o.geometry?.dispose());throw Error('静态模型没有可显示的网格');}
    const scale=20/(size.y>1e-6?size.y:Math.max(size.x,size.y,size.z));scene.scale.multiplyScalar(scale);
    scene.position.copy(MMD_SA._trackball_camera.target).sub(center.multiplyScalar(scale));
    scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    clearStaticModel();MMD_SA.THREEX.scene.add(scene);MMD_SA.hide_3D_avatar=true;
    staticModel={scene,name:displayName||String(file).split(/[\\/]/).pop()};
    MMD_SA.reset_camera();
  }
  let background={enabled:false,color:'#00ff00'},savedBackground=null;
  function applyBackground(){
    if(!background.enabled)return;
    document.body.style.background=background.color;
    const host=document.getElementById('LdesktopBG_host');if(host)host.style.display='none';
    const video=document.getElementById('VdesktopBG');if(video){video.pause();video.style.visibility='hidden';}
    if(MMD_SA.Wallpaper3D)MMD_SA.Wallpaper3D.visible=false;
    if(MMD_SA_options.user_camera?.display)MMD_SA_options.user_camera.display.webcam_as_bg=false;
    if(MMD_SA.THREEX?.scene)MMD_SA.THREEX.scene.background=null;
  }
  function setBackground(next){
    if(!/^#[0-9a-f]{6}$/i.test(next.color))throw Error('颜色格式无效');
    const host=document.getElementById('LdesktopBG_host'),video=document.getElementById('VdesktopBG');
    if(next.enabled&&!background.enabled)savedBackground={host:host?.style.display,video:video?.style.visibility,playing:video&&!video.paused,wallpaper:MMD_SA.Wallpaper3D?.visible,webcam:MMD_SA_options.user_camera?.display?.webcam_as_bg,scene:MMD_SA.THREEX?.scene?.background};
    if(!next.enabled&&background.enabled&&savedBackground){
      if(host)host.style.display=savedBackground.host||'';
      if(video){video.style.visibility=savedBackground.video||'';if(savedBackground.playing)video.play().catch(()=>{});}
      if(MMD_SA.Wallpaper3D)MMD_SA.Wallpaper3D.visible=savedBackground.wallpaper;
      if(MMD_SA_options.user_camera?.display)MMD_SA_options.user_camera.display.webcam_as_bg=savedBackground.webcam;
      if(MMD_SA.THREEX?.scene)MMD_SA.THREEX.scene.background=savedBackground.scene;
      savedBackground=null;
    }
    background={enabled:next.enabled===true,color:next.color};applyBackground();
  }
  const clean=value=>String(value??'').replace(/<[^>]*>/g,'').replace(/\\[A-Za-z]+/g,'').trim();
  const titles={pose:'动作与姿态',camera:'视频输入',tracking:'动作捕捉',settings:'场景与设置',vmc:'VMC 连接'};
  const events={pose:'_POSE_',camera:'_SELFIE_',tracking:'_FACEMESH_',settings:'_FACEMESH_OPTIONS_',vmc:'_VMC_PROTOCOL_'};
  let activeSection='overview',revision=0,visualMode=false;
  const visualControllers=new Map();
  function visualState(){
    visualControllers.clear();
    const root=MMD_SA.THREEX?.GUI?.obj?.visual_effects;
    if(!root)return null;
    const walk=(gui,path)=>({title:gui._title||'设置',controls:(gui.controllers||[]).flatMap((c,index)=>{
      if(c._name==='Hide Controls'||c._hidden)return [];
      const id=path+'/c'+index;visualControllers.set(id,c);
      const classes=c.domElement?.classList;
      const type=['boolean','number','color','option','function','string'].find(t=>classes?.contains(t));
      if(!type)return [];
      let value=type==='function'?null:c.getValue();
      if(type==='color'&&typeof value==='number')value='#'+value.toString(16).padStart(6,'0');
      if(type==='color'&&(Array.isArray(value)||typeof value==='object'))return [];
      return [{id,label:c._name||c.property,type,value,min:c._min,max:c._max,step:c._step,disabled:!!c._disabled,options:type==='option'?(c._names||[]).map((label,i)=>({label,index:i,selected:c._values?.[i]===value})):undefined}];
    }),folders:(gui.folders||[]).map((g,index)=>walk(g,path+'/f'+index))});
    return walk(root,'visual');
  }
  function setVisual(payload){
    visualState();const c=visualControllers.get(payload.id);if(!visualMode||!c||c._disabled)throw Error('视觉设置已更新，请重新选择');
    const type=['boolean','number','color','option','function','string'].find(t=>c.domElement.classList.contains(t));
    if(type==='function'){c.domElement.querySelector('button').click();return;}
    let value=payload.value;
    if(type==='number'){value=Number(value);if(!Number.isFinite(value))throw Error('请输入有效数值');if(c._min!=null)value=Math.max(c._min,value);if(c._max!=null)value=Math.min(c._max,value);}
    if(type==='boolean')value=value===true;
    if(type==='color'&&!/^#[0-9a-f]{6}$/i.test(String(value)))throw Error('颜色格式无效');
    if(type==='option'){const i=Number(payload.optionIndex);if(!Number.isInteger(i)||!c._values||i<0||i>=c._values.length)throw Error('选项无效');value=c._values[i];}
    c.setValue(value);c._callOnFinishChange?.();revision++;
  }
  let bootClicked=false;
  let defaultAvatarPath='';
  function poseCatalog(){
    const c=System._browser.camera;
    const listIndex=c.poseNet.enabled||c.VMC_receiver.mocap_enabled||c.VMC_receiver.bone_enabled?2:1;
    const motion=MMD_SA.MMD.motionManager;
    return (MMD_SA_options._XRA_pose_list?.[listIndex]||[]).map((m,index)=>({
      id:m.name+'|'+(m.is_full_body?'full':'upper'),index,name:m.name,label:m.info||m.name,
      selected:m.name===motion.filename&&(m.name!=='stand_simple'||!!m.is_full_body===!motion.para_SA.motion_tracking_upper_body_only)
    }));
  }
  function ready(){return !!(window.MMD_SA?.MMD_started && window.MMD_SA?.MMD?.motionManager && window.MMD_SA_options?.Dungeon?.run_event && window.System?._browser?.camera);}
  function state(legacyMode=false){
    document.title='3D动捕工作台 · 高级设置';
    window.XRStudio.nativeUIVisible=legacyMode;
    document.documentElement.dataset.studioNativeUi=legacyMode?'visible':'hidden';
    if(!ready())return {ready:false,camera:false,tracking:false,diagnostics:{mmd:!!window.MMD_SA,manager:!!window.MMD_SA?.MMD?.motionManager,dungeon:!!window.MMD_SA_options?.Dungeon?.run_event,camera:!!window.System?._browser?.camera,frames:document.querySelectorAll('iframe').length,bootClicked,clickables:[...document.querySelectorAll('button,input,[onclick],a')].map(e=>({id:e.id,text:e.textContent?.slice(0,70),onclick:e.getAttribute('onclick')})),hidden:document.hidden}};
    const d=MMD_SA_options.Dungeon,c=System._browser.camera;
    document.body.style.background=legacyMode?'transparent':'#20334c';
    applyBackground();
    for(const gui of Object.values(MMD_SA.THREEX?.GUI?.obj||{}))if(gui?.domElement){gui.domElement.style.visibility=legacyMode?'':'hidden';gui.domElement.style.pointerEvents=legacyMode?'':'none';}
    const branches=Array.isArray(d.dialogue_branch_mode)?d.dialogue_branch_mode:[];
    const sb=MMD_SA.SpeechBubble?.list?.[0];
    const lines=(sb?.msg_line||[]).map(clean).filter(Boolean);
    const options=[];
    for(const b of branches){
      if(b.key==='any')continue;
      const key=Array.isArray(b.key)?b.key[0]:b.key;
      const escaped=String(key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const ownLines=(MMD_SA.SpeechBubble?.list?.[b.sb_index||0]?.msg_line||[]).map(clean);
      const match=ownLines.find(line=>new RegExp('^'+escaped+'[.．、:]\\s*','i').test(line));
      options.push({key,sbIndex:b.sb_index||0,label:match?match.replace(new RegExp('^'+escaped+'[.．、:]\\s*','i'),''):b.is_closing_event?'返回':activeSection==='pose'&&key==='N'?'下一页动作':'选项 '+key,closing:!!b.is_closing_event});
    }
    const menu=options.length?{title:titles[activeSection]||'高级设置',lines,options,revision,event:d._event_active?.id,acceptsInput:branches.some(b=>b.key==='any')}:null;
    const capture=captureState();
    const filename=MMD_SA.MMD.motionManager.filename||'';
    for(const id of ['Ldungeon_UI','Ldungeon_inventory','Lquick_menu','Lnumpad']){const el=document.getElementById(id);if(el)el.style.display=legacyMode?'':'none';}
    if(!legacyMode)MMD_SA.SpeechBubble?.list?.forEach(s=>s.hide?.());
    if(!defaultAvatarPath)defaultAvatarPath=MMD_SA.THREEX?.models?.[0]?.model_path||'';
    const activePath=MMD_SA.THREEX?.models?.[0]?.model_path||MMD_SA_options.model_path;
    const model=clean(String(activePath||'').split(/[\\/]/).pop());
    const builtin={'AliciaSolid.vrm':['default','默认少女'],'Robert.vrm':['robert','罗伯特'],'Polybot.vrm':['polybot','小方机器人'],'RocketboxMale.vrm':['realman','写实男性']}[model];
    return {ready:true,camera:!!(cameraLive()||capture.source==='file'&&capture.width>0),tracking:!!c.ML_enabled,paused:!!c.video?.paused,avatarVisible:staticModel?staticModel.scene.visible:!MMD_SA.hide_3D_avatar,motion:staticModel?'展示模式（当前无法动捕）':filename,model:staticModel?staticModel.name:(activePath===importedPath?importedName:null)||builtin?.[1]||(/DUMMY/i.test(model)?'默认人物':model),modelId:staticModel?'static':builtin?.[0]||'custom',staticModel:!!staticModel,captureAllowed,capture,menu:visualMode?null:menu,poses:activeSection==='pose'&&!staticModel?poseCatalog():null,visualEffects:visualMode?visualState():null,section:activeSection};
  }
  function dismiss(){const d=MMD_SA_options.Dungeon;d.dialogue_branch_mode=null;d.run_event();MMD_SA.SpeechBubble?.list?.forEach(s=>s.hide?.());revision++;}
  async function choose(key,sbIndex=0){
    const d=MMD_SA_options.Dungeon;
    const b=d.dialogue_branch_mode?.find(b=>(b.sb_index||0)===sbIndex&&(Array.isArray(b.key)?b.key.includes(key):String(b.key)===String(key)));
    if(!b)throw Error('菜单已更新，请重新选择');
    if(staticModel&&['pose','tracking'].includes(activeSection)&&!b.is_closing_event)throw Error('当前模型没有可用的人形骨骼映射，不能应用动作或动捕。请切换内置人物或导入带骨骼的 VRM / PMX。');
    if(activeSection==='settings'&&String(key)==='3'&&sbIndex===0&&b.event_id?.func?.toString().includes('GUI.obj.visual_effects')&&d._event_active?.id==='_FACEMESH_OPTIONS_'){
      visualMode=true;
      if(MMD_SA.THREEX.enabled&&!MMD_SA.THREEX.PPE.initialized)await MMD_SA.THREEX.PPE.init();
      if(!MMD_SA.THREEX.GUI.obj.visual_effects)throw Error('视觉效果控件尚未准备好');
      return;
    }
    if(!captureAllowed && ['_SELFIE_','_FACEMESH_'].includes(d._event_active?.id) && !b.is_closing_event)throw Error('采集操作暂未启用');
    const sb=MMD_SA.SpeechBubble.list[b.sb_index||0];sb._branch_key_=null;
    if(!b.keep_dialogue_branch_list)d.dialogue_branch_mode=b.sb_index||0;
    b.func?.();
    if(b.event_id!=null||b.branch_index!=null||b.event_index!=null)d.run_event(b.event_id,b.branch_index,b.event_index||0);else d.run_event();
    revision++;
  }
  window.XRStudio={dispatch:async(command,payload={})=>{
    if(command==='state')return state(payload.legacyMode);
    if(command==='boot'){
      const start=document.getElementById('LMMD_StartButton');
      if(start){bootClicked=true;start.click();}
      return state();
    }
    if(!ready())throw Error('引擎正在载入，请稍后');
    captureAllowed=payload.captureAllowed===true;
    if(command==='view-reset'){
      MMD_SA.reset_camera();fitPbrPreview();
    }else if(command==='pose-select'){
      if(staticModel)throw Error('当前模型没有可用的人形骨骼映射，无法应用动作');
      if(activeSection!=='pose')throw Error('请先打开动作与姿态');
      const entry=poseCatalog().find(p=>p.id===payload.id);if(!entry)throw Error('动作列表已更新，请重新选择');
      const busy=await MMD_SA_options.Dungeon_options.item_base.pose._change_motion_(entry.index,true);
      if(busy)throw Error('请显示人物，并等待当前动作载入完成后重试');
      MMD_SA_options.Dungeon.run_event('_POSE_',0,0);revision++;
    }else if(command==='background-set'){
      setBackground(payload);
    }else if(command==='section'){
      visualMode=false;
      dismiss();activeSection=payload.id;
      if(['camera','tracking'].includes(activeSection))await listCameras();
      if(events[activeSection]&&!['camera','tracking'].includes(activeSection)){
        if(activeSection==='settings')MMD_SA_options.Dungeon.events._FACEMESH_OPTIONS_[0]._show_other_options_=true;
        MMD_SA_options.Dungeon.run_event(events[activeSection],0,0);
      }
      revision++;
    }else if(command==='model-select'){
      importedName=importedPath=null;clearStaticModel();
      if(!MMD_SA.THREEX.enabled)throw Error('当前渲染模式不支持内置人物切换');
      const path=payload.id==='default'?defaultAvatarPath:payload.file;
      if(!path)throw Error('人物文件尚未准备好');
      MMD_SA_options.THREEX_options.model_path_extra ||= [];
      await MMD_SA.THREEX.VRM.load_extra(path);
      const started=Date.now();
      while(MMD_SA.THREEX.models[0]?.model_path!==path){if(Date.now()-started>10000)throw Error('人物切换超时，请重试');await new Promise(r=>setTimeout(r,50));}
      MMD_SA.hide_3D_avatar=false;revision++;
    }else if(['camera-list','camera-start','tracking-start','capture-stop'].includes(command)){
      await captureCommand(command,payload);
    }else if(command==='choose')await choose(payload.key,payload.sbIndex||0);
    else if(command==='visual-set')setVisual(payload);
    else if(command==='visual-close'){visualMode=false;}
    else if(command==='dismiss'){visualMode=false;dismiss();}
    else if(command==='pause'){
      const v=System._browser.camera.video;if(!System._browser.camera.initialized)throw Error('没有正在运行的视频输入');
      if(v.paused)await v.play();else v.pause();
    }else if(command==='avatar'){if(staticModel)staticModel.scene.visible=!staticModel.scene.visible;else MMD_SA.hide_3D_avatar=!MMD_SA.hide_3D_avatar;System._browser.update_tray();}
    else if(command==='import'){
      if(typeof SA_DragDropEMU!=='function')throw Error('导入接口尚未就绪');
      if(payload.kind==='static')await importStatic(payload.file,payload.displayName);
      else if(/\.vrm$/i.test(payload.file)||/\.glb$/i.test(payload.file)){
        clearStaticModel();MMD_SA_options.THREEX_options.model_path_extra ||= [];
        await Promise.race([MMD_SA.THREEX.VRM.load_extra(payload.file),new Promise((_,reject)=>setTimeout(()=>reject(Error('人物加载超时，请检查模型格式')),30000))]);
        MMD_SA.hide_3D_avatar=false;importedPath=payload.file;importedName=payload.displayName||null;
        fitPbrPreview();
      }else {clearStaticModel();await SA_DragDropEMU(payload.file);}
    }else if(command==='engine-key'){
      const branch=MMD_SA_options.Dungeon.dialogue_branch_mode?.find(b=>!b.sb_index&&b.key==='any');
      if(!branch)throw Error('当前设置不接受输入');
      const text=String(payload.value||'');if(text.length>512)throw Error('输入过长');
      branch.func({key:text,code:'StudioInput',keyCode:0,preventDefault(){},stopPropagation(){}});revision++;
    }
    return {ok:true,state:state(payload.legacyMode)};
  },nativeUIVisible:false};
  document.documentElement.dataset.studioNativeUi='hidden';
  const nativeUIStyle=document.createElement('style');
  nativeUIStyle.textContent='html[data-studio-native-ui="hidden"] :is(#Ldungeon_UI,#Ldungeon_inventory,#Lquick_menu,#Lnumpad,.lil-gui){visibility:hidden!important;pointer-events:none!important}';
  document.head.append(nativeUIStyle);
})();
