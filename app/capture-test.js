const fs=require('fs'),path=require('path');
module.exports=async({studio,engine,invoke,dialog,app,getState})=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),report={ok:false,checks:[]};
  const output=process.env.STUDIO_CAPTURE_REPORT;
  const ui=code=>studio.webContents.executeJavaScript(code),native=code=>engine.webContents.executeJavaScript(code);
  report.console=[];const captureConsole=(_event,_level,message)=>{report.console.push(String(message));if(report.console.length>70)report.console.shift();};engine.webContents.on('console-message',captureConsole);
  const check=(condition,label)=>{if(!condition)throw Error(label);report.checks.push(label);if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));};
  const until=async(test,label,timeout=30000)=>{const start=Date.now();while(!await test()){if(Date.now()-start>timeout)throw Error(label);await wait(200);}};
  const action=async(name,payload={})=>{const result=await ui(`window.studio.command(${JSON.stringify(name)},${JSON.stringify(payload)})`);if(!result?.ok)throw Error(result?.error||'IPC failed');await wait(300);return result;};
  try{
    await until(()=>getState().ready,'引擎初始化超时',90000);await wait(1500);
    check(!getState().camera&&!getState().tracking,'启动时未自动采集');
    await ui("navigate('camera')");await wait(400);
    let s=await invoke('state');report.devices=s.capture.devices;
    check(s.capture.devices.length>0,'检测到真实摄像头');
    check(await ui("!document.getElementById('capture-panel').hidden&&document.getElementById('main-controls').hidden&&document.getElementById('capture-card').hidden"),'显示专用采集面板并隐藏旧菜单');
    const device=s.capture.devices.find(d=>!/virtual|avatar|obs|warudo/i.test(d.label))||s.capture.devices[0];
    await ui(`document.getElementById('camera-device').value=${JSON.stringify(device.id)};document.getElementById('camera-start').click()`);
    await until(async()=>{s=await invoke('state');if(s.capture.error)throw Error(s.capture.error);return s.camera&&!s.capture.busy;},'真实摄像头打开超时');
    check(s.capture.width>0&&s.capture.height>0,'真实视频已解码');
    report.camera={label:s.capture.label,width:s.capture.width,height:s.capture.height,fps:s.capture.fps};
    await until(()=>ui("!!document.getElementById('capture-preview').naturalWidth"),'取景预览未显示');
    check(true,'输入取景预览收到画面');
    await ui("navigate('tracking')");await wait(300);
    check(await ui("document.getElementById('tracking-start').getClientRects().length>0&&!document.getElementById('capture-source').open"),'动捕页显示启动按钮并折叠输入设置');
    const before=s.capture.poseUpdates;
    await ui("document.getElementById('tracking-start').click()");
    await until(async()=>{s=await invoke('state');return s.tracking&&!s.capture.busy;},'全身动捕未开启');
    await until(async()=>{s=await invoke('state');return s.capture.poseUpdates>before;},'动捕管线未返回识别结果',60000);
    report.tracking={mode:s.capture.mode,poseUpdates:s.capture.poseUpdates,faceUpdates:s.capture.faceUpdates,detected:s.capture.detected};
    check(true,'全身动捕收到 MediaPipe 识别结果');
    await action('capture-stop',{target:'tracking'});s=await invoke('state');
    check(s.camera&&!s.tracking,'停止动捕保留视频输入');
    await native('window.__oldCaptureStream=System._browser.camera.stream;void 0');
    await action('capture-stop',{target:'camera'});s=await invoke('state');
    check(!s.camera&&!s.tracking&&await native("window.__oldCaptureStream.getTracks().every(t=>t.readyState==='ended')"),'关闭输入释放所有设备轨道');
    await action('camera-start',{deviceId:device.id,resolution:'720p',mirror:true});s=await invoke('state');
    check(s.camera&&s.capture.mirror&&s.capture.width>0,'停止后可重新打开摄像头并镜像');
    await action('capture-stop',{target:'camera'});await wait(2200);
    // Exercise OS failures without changing system settings or touching other apps.
    await native("window.__originalGUM=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError')};void 0");
    const denied=await ui("window.studio.command('camera-start',{})");
    check(denied.ok===false&&denied.error.includes('权限'),'权限拒绝返回可读错误');
    await native("navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('busy','NotReadableError')};void 0");
    const busy=await ui("window.studio.command('camera-start',{})");
    check(busy.ok===false&&busy.error.includes('占用'),'设备占用返回可读错误');
    await native("navigator.mediaDevices.getUserMedia=window.__originalGUM;void 0");
    await action('camera-start',{deviceId:device.id,resolution:'auto'});s=await invoke('state');check(s.camera&&!s.capture.error,'错误后可恢复打开设备');
    await action('capture-stop',{target:'camera'});await wait(2200);
    const originalDialog=dialog.showOpenDialog;
    try{
      dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});
      const cancelled=await action('camera-file');check(cancelled.cancelled&&!getState().camera,'取消视频选择不启动输入');
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(__dirname,'../engine/AT_SystemAnimator_v110350.gadget/js/headtrackr.mp4')]});
      await action('camera-file');s=await invoke('state');check(s.camera&&s.capture.source==='file'&&s.capture.width>0,'本地视频输入可解码');
      await action('capture-stop',{target:'camera'});
    }finally{dialog.showOpenDialog=originalDialog;}
    await until(()=>ui('!state.camera&&!state.tracking'),'界面关闭状态未同步');
    await ui("navigate('pose')");await wait(500);
    check(await ui("!document.getElementById('main-controls').hidden&&document.getElementById('capture-panel').hidden&&!!state.menu?.options.length"),'切换其他功能恢复原控制面板');
    await ui("navigate('camera')");await wait(300);
    // Pixel QA uses an idle view, never saves webcam imagery.
    studio.webContents.debugger.attach('1.3');report.layouts=[];
    for(const [width,height] of [[1380,820],[1040,680],[768,800],[375,800]]){
      await studio.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(200);
      const layout=await ui("({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,oldMenuVisible:!document.getElementById('main-controls').hidden,panelWidth:document.getElementById('capture-panel').getBoundingClientRect().width})");
      report.layouts.push(layout);check(!layout.overflow&&!layout.oldMenuVisible&&layout.panelWidth>200,'采集面板布局 '+width);
    }
    await studio.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');studio.webContents.debugger.detach();
    await ui("document.querySelector('.inspector').scrollTop=0");
    if(output){
      fs.writeFileSync(path.join(path.dirname(output),'摄像头与动捕面板.png'),(await studio.webContents.capturePage()).toPNG());
      await ui("navigate('tracking')");await wait(300);await ui("document.querySelector('.inspector').scrollTop=0");
      fs.writeFileSync(path.join(path.dirname(output),'动作捕捉面板.png'),(await studio.webContents.capturePage()).toPNG());
    }
    report.runtimeErrors=report.console.filter(line=>/Uncaught|^ERROR\(/.test(line));
    check(!report.runtimeErrors.length,'采集生命周期无脚本运行错误');
    engine.webContents.removeListener('console-message',captureConsole);delete report.console;
    report.ok=true;
  }catch(error){report.error=error.stack;try{report.diagnostics=await native(`(()=>{const c=System._browser.camera;return {video:{time:c.video?.currentTime,paused:c.video?.paused,ready:c.video?.readyState,width:c.video_canvas?.width,height:c.video_canvas?.height,visible:c.visible},pose:{enabled:c.poseNet.enabled,initialized:c.poseNet.initialized,worker:c.poseNet.worker_initialized,busy:c.poseNet.busy,stamp:c.poseNet.camera_video_timestamp},face:{enabled:c.facemesh.enabled,worker:c.facemesh.worker_initialized,busy:c.facemesh.busy,stamp:c.facemesh.camera_video_timestamp}}})()`);delete report.diagnostics.state;}catch{}}finally{
    try{await native("if(window.__originalGUM)navigator.mediaDevices.getUserMedia=window.__originalGUM");await invoke('capture-stop',{target:'camera'});}catch{}
    engine.webContents.removeListener('console-message',captureConsole);if(output)fs.writeFileSync(output,JSON.stringify(report,null,2));app.quit();
  }
};
