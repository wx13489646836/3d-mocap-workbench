// Dedicated, device-based capture controls; menu navigation never opens hardware.
let capturePending=false,captureDeviceSignature='',captureUiError='',capturePanelPage='';
let previewInputId;
function captureOptions(){return {deviceId:$('camera-device').value,resolution:$('camera-resolution').value,mirror:$('camera-mirror').checked,mode:$('tracking-mode').value};}
function renderCapturePanel(){
  const visible=['camera','tracking'].includes(page),info=state.capture||{},busy=capturePending||info.busy;
  $('capture-panel').hidden=!visible;
  if(visible){$('main-controls').hidden=true;$('capture-card').hidden=true;}
  if(visible&&capturePanelPage!==page){capturePanelPage=page;$('capture-source').open=page==='camera';}
  $('capture-tracking-settings').hidden=page!=='tracking';$('capture-next').hidden=page!=='camera';
  $('capture-next').textContent=state.camera?'下一步：选择动捕模式 →':'前往动作捕捉 →';
  $('capture-source-label').textContent=state.camera?(info.source==='file'?'本地视频':info.label||'已连接'):'尚未开启';
  $('capture-source-label').title=$('capture-source-label').textContent;
  $('capture-title').textContent=page==='tracking'?'动作捕捉':'视频输入';
  $('capture-status').textContent=busy?'正在启动…':state.tracking?(info.detected?'正在追踪':'等待人物入镜'):state.camera?'视频已连接':'未开启';
  $('capture-status').dataset.active=String(!!state.camera);
  const devices=info.devices||[],signature=JSON.stringify(devices);
  if(signature!==captureDeviceSignature){
    captureDeviceSignature=signature;const selected=$('camera-device').value;
    $('camera-device').replaceChildren();
    for(const device of devices){const option=document.createElement('option');option.value=device.id;option.textContent=device.label;$('camera-device').append(option);}
    if(!devices.length){const option=document.createElement('option');option.value='';option.textContent='未检测到摄像头';$('camera-device').append(option);}
    if(devices.some(d=>d.id===selected))$('camera-device').value=selected;
    else if(devices.some(d=>d.id===info.deviceId))$('camera-device').value=info.deviceId;
  }
  $('camera-device').title=$('camera-device').selectedOptions[0]?.textContent||'';
  $('camera-device-help').textContent=devices.length?'检测到 '+devices.length+' 个设备':'请连接摄像头并刷新；也可使用本地视频。';
  for(const id of ['camera-device','camera-resolution','camera-mirror','tracking-mode','camera-refresh','camera-file'])$(id).disabled=!state.ready||busy;
  $('camera-start').disabled=!state.ready||busy||!devices.length;
  $('camera-start').textContent=busy?'正在连接…':state.camera?'重新连接 / 应用设置':'开启摄像头';
  $('camera-start').setAttribute('aria-busy',String(!!busy));
  $('tracking-start').disabled=!state.ready||busy||!!state.staticModel||(!state.camera&&!devices.length);
  $('tracking-start').textContent=busy?'正在准备…':state.tracking?'应用追踪模式':state.camera?'开始动作捕捉':'开启摄像头并开始动捕';
  $('tracking-stop').disabled=busy||!state.tracking;$('camera-stop').disabled=busy||!state.camera;
  if(!state.camera||previewInputId!==info.inputId){
    $('capture-preview').removeAttribute('src');
    $('capture-preview').hidden=true;$('capture-empty').hidden=false;$('capture-live').hidden=true;
  }
  $('capture-preview').classList.toggle('mirrored',!!info.mirror);
  $('camera-current').textContent=state.camera?((info.source==='file'?'本地视频':info.label||'摄像头')+' · '+info.width+' × '+info.height+(info.fps?' · '+Math.round(info.fps)+' 帧/秒':'')+(state.paused?' · 已暂停':'')):'视频输入尚未开启';
  $('tracking-current').textContent=state.tracking?(state.paused?'视频已暂停 · 恢复视频后继续追踪':info.detected?'已检测到人物'+(info.trackingFps?' · 追踪更新约 '+info.trackingFps+' 次/秒':''):'追踪已启用 · 请面向摄像头进入取景范围'):'动捕尚未开启 · 停止动捕会保留视频输入';
  const error=captureUiError||info.error;
  $('capture-error').hidden=!error;$('capture-error').textContent=error||'';
  if(state.staticModel)$('tracking-guide').textContent='当前模型仅供展示，请先切换带人形骨骼的人物。';
  else $('tracking-guide').textContent=$('tracking-mode').value==='Face'?'面部模式请正对镜头，保持脸部清晰、光线均匀。':'全身模式请后退，让头部、双手和双脚完整入镜。';
}
async function runCapture(name,payload={},label=''){
  if(capturePending||state.capture?.busy)return;
  capturePending=true;captureUiError='';renderCapturePanel();refreshCaptureNavigation();
  try{
    const result=await command(name,payload,label);
    if(!result)captureUiError=$('toast').textContent;
    return result;
  }finally{capturePending=false;renderCapturePanel();refreshCaptureNavigation();}
}
function refreshCaptureNavigation(){
  for(const target of ['camera','tracking']){
    const button=$(target+'-toggle');if(!button)continue;
    const on=!!state[target];button.textContent=on?(target==='camera'?'关闭':'停止'):'开启';
    button.setAttribute('aria-label',on?(target==='camera'?'关闭视频输入并停止动捕':'停止动捕并保留视频输入'):(target==='camera'?'开启所选摄像头':'开启所选模式的动作捕捉'));
    button.title=button.getAttribute('aria-label');button.setAttribute('aria-pressed',String(on));
    button.disabled=!state.ready||capturePending||!!state.capture?.busy;
  }
}
for(const target of ['camera','tracking']){
  const navigation=document.querySelector('[data-page="'+target+'"]');
  const row=document.createElement('div');row.className='capture-nav-row';navigation.before(row);row.append(navigation);
  const button=document.createElement('button');button.id=target+'-toggle';button.className='capture-switch';row.append(button);
  button.addEventListener('click',async()=>{
    if(state[target])await runCapture('capture-stop',{target},target==='camera'?'视频输入已关闭，动捕已停止':'动捕已停止，视频输入保留');
    else{await navigate(target);await runCapture(target==='camera'?'camera-start':'tracking-start',captureOptions(),target==='camera'?'摄像头已连接':'动作捕捉已启用');}
  });
}
$('camera-start').addEventListener('click',()=>runCapture('camera-start',captureOptions(),'摄像头已连接'));
$('camera-refresh').addEventListener('click',()=>runCapture('camera-list',{},'已刷新摄像头列表'));
$('camera-file').addEventListener('click',()=>runCapture('camera-file',{},'已连接本地视频'));
$('tracking-start').addEventListener('click',()=>runCapture('tracking-start',captureOptions(),'动作捕捉已启用'));
$('tracking-stop').addEventListener('click',()=>runCapture('capture-stop',{target:'tracking'},'动捕已停止，视频输入保留'));
$('camera-stop').addEventListener('click',()=>runCapture('capture-stop',{target:'camera'},'视频输入已关闭，动捕已停止'));
$('tracking-mode').addEventListener('change',renderCapturePanel);
$('capture-next').addEventListener('click',()=>navigate('tracking'));
window.studio.onCapturePreview(({id,src})=>{
  if(!state.camera||state.capture?.inputId!==id||!['camera','tracking'].includes(page))return;
  previewInputId=id;
  $('capture-preview').src=src;
  $('capture-preview').hidden=false;$('capture-empty').hidden=true;$('capture-live').hidden=false;
});
window.studio.onState(refreshCaptureNavigation);refreshCaptureNavigation();
