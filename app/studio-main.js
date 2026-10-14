const path = require('path');
const fs = require('fs');
module.exports = ({electron, app, engine}) => {
  require('./stdio-guard')();
  // The upstream animation loop initializes only in a visible native window.
  // Keep its surface alive but transparent and non-interactive; Studio owns input.
  engine.setOpacity(0);
  engine.setIgnoreMouseEvents(true);
  engine.showInactive();
  const {BrowserWindow, ipcMain, dialog} = electron;
  const appIcon=path.join(__dirname,'../assets/app-icon.ico');
  app.setAppUserModelId('cn.avatar.workbench');
  app.setName('3D动捕工作台');
  engine.setIcon(appIcon);
  const builtinModels=JSON.parse(fs.readFileSync(path.join(__dirname,'../models/catalog.json'),'utf8'));
  const videoOutput=require('./video-output')();
  const settingsFile=path.join(__dirname,'../user-data/studio-settings.json');
  let background={enabled:false,color:'#00ff00'},backgroundApplied=false;
  try{const saved=JSON.parse(fs.readFileSync(settingsFile,'utf8')).background;if(/^#[0-9a-f]{6}$/i.test(saved?.color))background={enabled:saved.enabled===true,color:saved.color};}catch{}
  const studio = new BrowserWindow({title:'3D动捕工作台',icon:appIcon, width:1380,height:860,minWidth:1040,minHeight:680,backgroundColor:'#edf1f6',show:false,
    webPreferences:{preload:path.join(__dirname,'studio-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  studio.removeMenu();
  studio.loadFile(path.join(__dirname,'studio.html'));
  studio.on('ready-to-show',()=>studio.show());
  studio.on('closed',()=>{videoOutput.stop();clearInterval(timer);clearInterval(frameTimer);app.quit();});
  app.on('before-quit',()=>videoOutput.stop());
  engine.webContents.setBackgroundThrottling(false);
  let inFlight=false,frameInFlight=false,lastState={ready:false},captureAllowed=false,legacyMode=false,previewPaused=false,awaitingFrame=0,frameId=0,frameSentAt=0;
  const metrics={frames:0,acks:0,captureMs:[],encodeMs:[],bytes:0};
  let baselineMode=false,subscriptionActive=false,lastSubscriptionAt=0;
  const canSend=()=>!studio.isDestroyed()&&!engine.isDestroyed()&&!studio.isMinimized()&&!previewPaused&&!frameInFlight&&(!awaitingFrame||Date.now()-frameSentAt>=1500)&&Date.now()-frameSentAt>=(baselineMode?160:30);
  const sendFrame=(frame,captureMs)=>{
    frameSentAt=Date.now();
    const captured=performance.now();
    const buffer=baselineMode?frame.toPNG():frame.toJPEG(82);
    metrics.captureMs.push(captureMs);metrics.encodeMs.push(performance.now()-captured);metrics.frames++;metrics.bytes+=buffer.length;
    if(metrics.captureMs.length>1000){metrics.captureMs.shift();metrics.encodeMs.shift();}
    awaitingFrame=++frameId;
    studio.webContents.send('studio:frame',{id:frameId,bytes:buffer,mime:baselineMode?'image/png':'image/jpeg'});
  };
  const invoke = async(command,payload={}) => {
    const result=await engine.webContents.executeJavaScript(`window.XRStudio ? window.XRStudio.dispatch(${JSON.stringify(command)},${JSON.stringify({...payload,captureAllowed,legacyMode})}) : ({ready:false})`);
    if(command==='state')return {...result,legacyOpen:legacyMode,background,videoOutput:videoOutput.state()};
    if(result?.state)Object.assign(result.state,{legacyOpen:legacyMode,background,videoOutput:videoOutput.state()});
    return result;
  };
  const setLegacy=open=>{
    legacyMode=open;engine.setAlwaysOnTop(false);engine.setOpacity(open?1:0);engine.setIgnoreMouseEvents(!open);
    if(open)engine.show();else{engine.showInactive();studio.focus();}
  };
  const actions = new Set(['state','section','choose','dismiss','pause','avatar','capture-access','import','legacy','engine-key','preview-pause','visual-set','visual-close','capture-stop','model-select','background-set','output-start','output-stop','pose-select','view-reset']);
  ipcMain.on('studio:viewport-input',(event,input)=>{
    if(event.sender!==studio.webContents||!lastState.ready||engine.isDestroyed()||legacyMode)return;
    if(!['mouseDown','mouseMove','mouseUp','mouseWheel'].includes(input?.type)||!Number.isFinite(input.u)||!Number.isFinite(input.v))return;
    const [width,height]=engine.getContentSize();
    const forwarded={type:input.type,x:Math.round(Math.max(0,Math.min(1,input.u))*(width-1)),y:Math.round(Math.max(0,Math.min(1,input.v))*(height-1)),modifiers:input.control?['control']:[]};
    if(input.type==='mouseWheel'){if(!Number.isFinite(input.deltaY))return;Object.assign(forwarded,{deltaX:0,deltaY:Math.max(-120,Math.min(120,input.deltaY)),canScroll:true});}
    else {
      // The native overlay forwards only left presses; Ctrl+left is its pan gesture.
      if(input.button==='right')forwarded.modifiers=['control'];
      Object.assign(forwarded,{button:input.button==='right'?'left':input.button==='middle'?'middle':'left',clickCount:1});
    }
    engine.webContents.sendInputEvent(forwarded);
  });
  ipcMain.handle('studio:command',async(event,command,payload={})=>{
    try {
    if(event.sender!==studio.webContents || !actions.has(command)) throw Error('不支持的操作');
    if(command==='background-set'){
      if(!/^#[0-9a-f]{6}$/i.test(payload.color)||typeof payload.enabled!=='boolean')throw Error('请输入六位颜色代码，例如 #00FF00');
      const next={enabled:payload.enabled,color:payload.color.toLowerCase()};
      await invoke(command,next);background=next;backgroundApplied=true;
      fs.mkdirSync(path.dirname(settingsFile),{recursive:true});fs.writeFileSync(settingsFile,JSON.stringify({background},null,2));
      return {ok:true,state:await invoke('state')};
    }
    if(command==='output-start'){
      if(!lastState.ready)throw Error('人物引擎就绪后才能开启视频输出');
      if(!['720p','1080p'].includes(payload.resolution))throw Error('输出分辨率无效');
      await videoOutput.start(payload.resolution);return {ok:true,state:await invoke('state')};
    }
    if(command==='output-stop'){videoOutput.stop();return {ok:true,state:await invoke('state')};}
    if(command==='model-select'){
      const model=builtinModels.find(m=>m.id===payload.id);if(!model)throw Error('人物选项无效');
      return invoke(command,{id:model.id,file:model.file?path.join(__dirname,'../models',model.file):null});
    }
    if(command==='preview-pause'){previewPaused=payload.paused===true;return {ok:true};}
    if(command==='capture-access'){captureAllowed=payload.enabled===true;return {ok:true,captureAllowed};}
    if(command==='legacy'){setLegacy(!legacyMode);return {ok:true,state:await invoke('state')};}
    if(command==='section'&&legacyMode)setLegacy(false);
    if(command==='import') {
      const result=await dialog.showOpenDialog(studio,{title:'导入人物或动作',properties:['openFile'],filters:[{name:'人物、动作与静态模型',extensions:['vrm','pmx','pmd','zip','vmd','bvh','fbx','obj','glb','gltf','stl','ply','blend']}]});
      if(result.canceled)return {ok:true,cancelled:true};
      const checked=await require('./model-import')(result.filePaths[0],{
        progress:text=>{if(!studio.isDestroyed())studio.webContents.send('studio:import-progress',text);},
        select:async files=>{
          const selected=await dialog.showMessageBox(studio,{type:'question',title:'选择 ZIP 中的模型',message:'压缩包包含多个模型或动作，请选择要导入的文件。',buttons:[...files,'取消'],cancelId:files.length,noLink:true});
          return files[selected.response]||null;
        }
      });
      if(checked.cancelled)return {ok:true,cancelled:true};
      const loaded=await invoke('import',{file:checked.file,kind:checked.kind,displayName:checked.displayName});
      return {...loaded,importNote:checked.note,missingTextures:checked.missingTextures||[]};
    }
    return invoke(command,payload);
    }catch(error){
      try{fs.appendFileSync(path.join(__dirname,'../user-data/main-errors.log'),new Date().toISOString()+' '+command+' '+(error.stack||error)+'\n');}catch{}
      return {ok:false,error:error.message||'操作失败，请重试'};
    }
  });
  const timer=setInterval(async()=>{
    if(inFlight || studio.isDestroyed() || engine.isDestroyed())return;
    inFlight=true;
    try {
      lastState=await invoke('state');
      if(lastState.ready&&!backgroundApplied){await invoke('background-set',background);backgroundApplied=true;}
      if(!lastState.ready && !lastState.diagnostics?.bootClicked)await invoke('boot');
      studio.webContents.send('studio:state',lastState);
    } catch(error){studio.webContents.send('studio:state',{...lastState,error:error.message});}
    finally {inFlight=false;}
  },250);
  ipcMain.on('studio:frame-ready',(event,id)=>{if(event.sender===studio.webContents&&id===awaitingFrame){awaitingFrame=0;metrics.acks++;}});
  const frameTimer=setInterval(async()=>{
    if(frameInFlight)return;
    if(lastState.ready&&!baselineMode&&!subscriptionActive&&!engine.isDestroyed()){
      subscriptionActive=true;
      engine.webContents.beginFrameSubscription(false,frame=>{
        lastSubscriptionAt=Date.now();
        videoOutput.send(frame);
        if(baselineMode||!canSend())return;
        sendFrame(frame,0);
      });
    }
    if(!canSend()&&!videoOutput.wantsFrame())return;
    if(!baselineMode&&subscriptionActive&&Date.now()-lastSubscriptionAt<1000)return;
    frameInFlight=true;
    try{
      const start=performance.now();
      const frame=await engine.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
      videoOutput.send(frame);
      if(canSend())sendFrame(frame,performance.now()-start);
    }catch(error){studio.webContents.send('studio:state',{...lastState,error:error.message});}
    finally{frameInFlight=false;}
  },8);
  engine.webContents.on('console-message',(_e,_level,message)=>{
    if(process.argv.includes('--studio-model-test'))fs.appendFileSync(path.join(__dirname,'../models-engine.log'),message+'\n');
    if(process.argv.includes('--studio-self-test'))fs.appendFileSync(path.join(__dirname,'../test-engine.log'),message+'\n');
  });
  if(process.argv.includes('--studio-legacy-test')){
    (async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));try{
      const started=Date.now();while(!lastState.ready){if(Date.now()-started>90000)throw Error('初始化超时');await wait(250);}await wait(2000);
      const click=()=>studio.webContents.executeJavaScript("document.getElementById('legacy').click()");
      await click();await wait(500);
      const opened={state:await invoke('state'),opacity:engine.getOpacity(),label:await studio.webContents.executeJavaScript("document.getElementById('legacy').textContent")};
      await click();await wait(700);
      const closed={state:await invoke('state'),opacity:engine.getOpacity(),label:await studio.webContents.executeJavaScript("document.getElementById('legacy').textContent")};
      const ok=opened.state.legacyOpen&&opened.opacity===1&&opened.label==='关闭原版高级窗口'&&!closed.state.legacyOpen&&closed.opacity===0&&closed.label==='打开原版高级窗口'&&!closed.state.camera&&!closed.state.tracking;
      fs.writeFileSync(path.join(__dirname,'../legacy-test-result.json'),JSON.stringify({ok,opened,closed},null,2));
    }catch(error){fs.writeFileSync(path.join(__dirname,'../legacy-test-result.json'),JSON.stringify({ok:false,error:error.stack}));}finally{app.quit();}})();
  }
  if(process.argv.includes('--studio-perf-test')){
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    (async()=>{try{
      const started=Date.now();while(!lastState.ready){if(Date.now()-started>90000)throw Error('初始化超时');await wait(250);}await wait(5000);
      const reset=()=>{metrics.frames=0;metrics.acks=0;metrics.captureMs=[];metrics.encodeMs=[];metrics.bytes=0;};
      const measure=async(old)=>{baselineMode=old;if(old&&subscriptionActive){engine.webContents.endFrameSubscription();subscriptionActive=false;}await wait(1000);reset();const start=performance.now();await wait(10000);const seconds=(performance.now()-start)/1000;const avg=a=>a.reduce((x,y)=>x+y,0)/Math.max(a.length,1);return {fps:metrics.acks/seconds,captureMs:avg(metrics.captureMs),encodeMs:avg(metrics.encodeMs),kilobytesPerFrame:metrics.bytes/Math.max(metrics.frames,1)/1024};};
      const baseline=await measure(true),optimized=await measure(false),finalState=await invoke('state');
      const result={ok:optimized.fps>baseline.fps*1.5,baseline,optimized,subscriptionActive,camera:finalState.camera,tracking:finalState.tracking};
      fs.writeFileSync(path.join(__dirname,'../performance-result.json'),JSON.stringify(result,null,2));
      fs.writeFileSync(path.join(__dirname,'../studio-preview.png'),(await studio.webContents.capturePage()).toPNG());
    }catch(error){fs.writeFileSync(path.join(__dirname,'../performance-result.json'),JSON.stringify({ok:false,error:error.stack}));}finally{app.quit();}})();
  }
  if(process.argv.includes('--studio-layout-test'))require('./layout-audit')({studio,invoke,app,getState:()=>lastState});
  if(process.argv.includes('--studio-menu-test'))require('./menu-reopen-test')({studio,invoke,app,getState:()=>lastState});
  if(process.argv.includes('--studio-visual-test'))require('./visual-test')({studio,engine,invoke,app,getState:()=>lastState});
  if(process.argv.includes('--studio-model-test'))require('./model-test')({studio,engine,invoke,app,getState:()=>lastState});
  if(process.argv.includes('--studio-output-test'))require('./output-test')({studio,engine,app,getState:()=>lastState});
  if(process.argv.includes('--studio-format-import-test'))require('./model-import-test')({studio,engine,dialog,app,getState:()=>lastState});
  if(process.argv.includes('--studio-import-error-test'))require('./import-error-test')({studio,dialog,app,getState:()=>lastState});
  if(process.argv.includes('--studio-self-test')) {
    const started=Date.now();
    const testTimer=setInterval(async()=>{
      if(!lastState.ready){fs.writeFileSync(path.join(__dirname,'../test-progress.json'),JSON.stringify(lastState));if(Date.now()-started>90000){clearInterval(testTimer);fs.writeFileSync(path.join(__dirname,'../test-result.json'),JSON.stringify({ok:false,error:'引擎初始化超时',state:lastState}));app.quit();}return;}
      clearInterval(testTimer);
      try {
        await new Promise(r=>setTimeout(r,5000));
        const initial=await invoke('state');
        if(initial.camera || initial.tracking)throw Error('启动时不应开启采集');
        await invoke('section',{id:'pose'});
        let pose;
        for(let attempt=0;attempt<40;attempt++){await new Promise(r=>setTimeout(r,250));pose=await invoke('state');if(pose.menu?.options?.length)break;}
        if(!pose.menu?.options?.length)throw Error('动作菜单未接通');
        await invoke('choose',{key:2});
        await new Promise(r=>setTimeout(r,1500));
        const changedPose=await invoke('state');
        if(changedPose.motion===initial.motion)throw Error('动作按钮未改变引擎状态');
        await invoke('dismiss');
        await invoke('section',{id:'settings'});
        await new Promise(r=>setTimeout(r,700));
        const settings=await invoke('state');
        if(!settings.menu?.options?.length)throw Error('设置菜单未接通');
        await invoke('dismiss');
        await studio.webContents.executeJavaScript("document.querySelector('[data-page=pose]').click()");
        await new Promise(r=>setTimeout(r,1200));
        const ui=await studio.webContents.executeJavaScript(`({buttons:document.querySelectorAll('button').length,missingLabels:[...document.querySelectorAll('button')].filter(b=>!b.textContent.trim()&&!b.getAttribute('aria-label')).length,preview:document.getElementById('preview').naturalWidth,status:document.getElementById('engine-status').textContent})`);
        if(ui.missingLabels || !ui.preview)throw Error('界面标签或预览未就绪');
        const finalState=await invoke('state');
        if(finalState.camera||finalState.tracking)throw Error('非采集操作不应开启摄像头或追踪');
        const interactions=await studio.webContents.executeJavaScript(`(()=>{const search=document.getElementById('action-search');search.value='坐姿';search.dispatchEvent(new Event('input'));const matches=[...document.querySelectorAll('#menu-options>button')].filter(b=>!b.hidden&&!b.classList.contains('closing')&&b.dataset.engineKey!=='N');search.value='不存在的动作';search.dispatchEvent(new Event('input'));const empty=!document.getElementById('search-empty').hidden;search.value='';search.dispatchEvent(new Event('input'));const freeze=document.getElementById('freeze');freeze.click();const frozen=freeze.getAttribute('aria-pressed')==='true';freeze.click();const zoom=document.getElementById('zoom');zoom.value=140;zoom.dispatchEvent(new Event('input'));document.getElementById('zoom-reset').click();return {searchMatches:matches.length,empty,frozen,restored:freeze.getAttribute('aria-pressed')==='false',zoomReset:zoom.value==='100',selected:!!document.querySelector('#menu-options button[aria-pressed=true]')};})()`);
        if(interactions.searchMatches!==3||!interactions.empty||!interactions.frozen||!interactions.restored||!interactions.zoomReset||!interactions.selected)throw Error('新增交互检查失败：'+JSON.stringify(interactions));
        const responsive=[];
        studio.webContents.debugger.attach('1.3');
        for(const width of [1380,1040,768,375]){
          await studio.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:820,deviceScaleFactor:1,mobile:false});
          await new Promise(r=>setTimeout(r,350));
          const layout=await studio.webContents.executeJavaScript(`({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,stageWidth:document.getElementById('stage').getBoundingClientRect().width,searchVisible:!document.getElementById('pose-search').hidden})`);
          if(layout.width!==width||layout.overflow||layout.stageWidth<250)throw Error('窗口布局溢出：'+JSON.stringify(layout));
          responsive.push(layout);
          if(width===1380)fs.writeFileSync(path.join(__dirname,'../studio-preview.png'),(await studio.webContents.capturePage(undefined,{stayAwake:true})).toPNG());
          if(width===375)fs.writeFileSync(path.join(__dirname,'../studio-mobile-preview.png'),(await studio.webContents.capturePage(undefined,{stayAwake:true})).toPNG());
        }
        await studio.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
        const reducedMotion=await studio.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.loader')).animationName==='none'`);
        await studio.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
        studio.webContents.debugger.detach();
        if(!reducedMotion)throw Error('减少动画偏好未生效');
        studio.setContentSize(1380,820);
        const result={ok:true,initial,motionBefore:initial.motion,motionAfter:changedPose.motion,poseOptions:pose.menu.options,settingsOptions:settings.menu.options,ui,interactions,responsive,reducedMotion,finalCaptureState:{camera:finalState.camera,tracking:finalState.tracking}};
        fs.writeFileSync(path.join(__dirname,'../test-result.json'),JSON.stringify(result,null,2));
        engine.setAlwaysOnTop(false);
        studio.show();studio.focus();
        await studio.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await new Promise(r=>setTimeout(r,600));
        app.quit();
      }catch(error){fs.writeFileSync(path.join(__dirname,'../test-result.json'),JSON.stringify({ok:false,error:error.stack,state:lastState},null,2));app.quit();}
    },1000);
  }
};
