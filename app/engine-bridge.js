(() => {
  let captureAllowed=false;
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
    const filename=MMD_SA.MMD.motionManager.filename||'';
    for(const id of ['Ldungeon_UI','Ldungeon_inventory','Lquick_menu','Lnumpad']){const el=document.getElementById(id);if(el)el.style.display=legacyMode?'':'none';}
    if(!legacyMode)MMD_SA.SpeechBubble?.list?.forEach(s=>s.hide?.());
    if(!defaultAvatarPath)defaultAvatarPath=MMD_SA.THREEX?.models?.[0]?.model_path||'';
    const activePath=MMD_SA.THREEX?.models?.[0]?.model_path||MMD_SA_options.model_path;
    const model=clean(String(activePath||'').split(/[\\/]/).pop());
    const builtin={'AliciaSolid.vrm':['default','默认少女'],'Robert.vrm':['robert','罗伯特'],'Polybot.vrm':['polybot','小方机器人'],'RocketboxMale.vrm':['realman','写实男性']}[model];
    return {ready:true,camera:!!(c.initialized&&(c.stream?c.stream.getVideoTracks().some(t=>t.readyState==='live'):c.video?.currentSrc)),tracking:!!c.ML_enabled,paused:!!c.video?.paused,avatarVisible:!MMD_SA.hide_3D_avatar,motion:filename,model:builtin?.[1]||(/DUMMY/i.test(model)?'默认人物':model),modelId:builtin?.[0]||'custom',captureAllowed,menu:visualMode?null:menu,poses:activeSection==='pose'?poseCatalog():null,visualEffects:visualMode?visualState():null,section:activeSection};
  }
  function dismiss(){const d=MMD_SA_options.Dungeon;d.dialogue_branch_mode=null;d.run_event();MMD_SA.SpeechBubble?.list?.forEach(s=>s.hide?.());revision++;}
  async function choose(key,sbIndex=0){
    const d=MMD_SA_options.Dungeon;
    const b=d.dialogue_branch_mode?.find(b=>(b.sb_index||0)===sbIndex&&(Array.isArray(b.key)?b.key.includes(key):String(b.key)===String(key)));
    if(!b)throw Error('菜单已更新，请重新选择');
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
      MMD_SA.reset_camera();
    }else if(command==='pose-select'){
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
      if(events[activeSection]){
        if(activeSection==='settings')MMD_SA_options.Dungeon.events._FACEMESH_OPTIONS_[0]._show_other_options_=true;
        MMD_SA_options.Dungeon.run_event(events[activeSection],0,0);
      }
      revision++;
    }else if(command==='model-select'){
      if(!MMD_SA.THREEX.enabled)throw Error('当前渲染模式不支持内置人物切换');
      const path=payload.id==='default'?defaultAvatarPath:payload.file;
      if(!path)throw Error('人物文件尚未准备好');
      MMD_SA_options.THREEX_options.model_path_extra ||= [];
      await MMD_SA.THREEX.VRM.load_extra(path);
      const started=Date.now();
      while(MMD_SA.THREEX.models[0]?.model_path!==path){if(Date.now()-started>10000)throw Error('人物切换超时，请重试');await new Promise(r=>setTimeout(r,50));}
      MMD_SA.hide_3D_avatar=false;revision++;
    }else if(command==='capture-stop'){
      const c=System._browser.camera;
      MMD_SA_options.Dungeon.events._FACEMESH_OPTIONS_[2][0].func();
      if(payload.target==='camera'){
        c.hide();c.video?.pause();c.stream?.getTracks().forEach(t=>t.stop());
        if(c.video){c.video.srcObject=null;c.video.removeAttribute('src');}
        c.stream=c.video_track=c.deviceId=null;
      }
      visualMode=false;dismiss();
    }else if(command==='choose')await choose(payload.key,payload.sbIndex||0);
    else if(command==='visual-set')setVisual(payload);
    else if(command==='visual-close'){visualMode=false;}
    else if(command==='dismiss'){visualMode=false;dismiss();}
    else if(command==='pause'){
      const v=System._browser.camera.video;if(!System._browser.camera.initialized)throw Error('没有正在运行的视频输入');
      if(v.paused)await v.play();else v.pause();
    }else if(command==='avatar'){MMD_SA.hide_3D_avatar=!MMD_SA.hide_3D_avatar;System._browser.update_tray();}
    else if(command==='import'){
      if(typeof SA_DragDropEMU!=='function')throw Error('导入接口尚未就绪');
      await SA_DragDropEMU(payload.file);
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
