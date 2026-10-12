let outputPending=false,backgroundDirty=false;
function renderStudioOutput(){
  $('background-card').hidden=page!=='settings';$('output-card').hidden=page!=='output';$('main-controls').hidden=page==='output';
  const bg=state.background||{enabled:false,color:'#00ff00'};
  $('background-enabled').checked=bg.enabled;$('background-enabled').disabled=!state.ready;
  $('background-apply').disabled=!state.ready;
  if(!backgroundDirty){$('background-color').value=bg.color;$('background-hex').value=bg.color.toUpperCase();}
  $('background-status').textContent=bg.enabled?'已启用 · '+bg.color.toUpperCase():'原场景背景';
  const out=state.videoOutput||{};
  $('output-nav-status').textContent=out.running?'开启':'关闭';
  $('output-status').textContent=out.starting?'正在开启':out.running?'输出中':'未开启';
  $('output-fps').textContent=out.running?(out.fps||0)+' / 30 帧/秒':'30 帧/秒';
  $('output-toggle').textContent=out.starting?'正在开启…':out.running?'停止视频输出':'开启视频输出';
  $('output-toggle').disabled=outputPending||out.starting||!state.ready;
  $('output-toggle').setAttribute('aria-pressed',String(!!out.running));
  $('output-resolution').disabled=outputPending||out.running||out.starting;
  $('output-error').hidden=!out.error;$('output-error').textContent=out.error||'';
}
async function applyStudioBackground(enabled,color){
  const result=await command('background-set',{enabled,color},enabled?'已应用纯色背景':'已恢复场景背景');
  if(result){backgroundDirty=false;renderStudioOutput();}
  return result;
}
$('background-color').addEventListener('input',()=>{backgroundDirty=true;$('background-hex').value=$('background-color').value.toUpperCase();});
$('background-hex').addEventListener('input',()=>{backgroundDirty=true;if(/^#[0-9a-f]{6}$/i.test($('background-hex').value))$('background-color').value=$('background-hex').value;});
$('background-form').addEventListener('submit',event=>{event.preventDefault();applyStudioBackground(true,$('background-hex').value);});
$('background-enabled').addEventListener('change',async event=>{const enabled=event.target.checked;const color=/^#[0-9a-f]{6}$/i.test($('background-hex').value)?$('background-hex').value:state.background?.color||'#00ff00';await applyStudioBackground(enabled,color);renderStudioOutput();});
document.querySelectorAll('[data-background]').forEach(button=>button.addEventListener('click',()=>applyStudioBackground(true,button.dataset.background)));
$('output-toggle').addEventListener('click',async()=>{
  if(outputPending)return;outputPending=true;renderStudioOutput();
  try{await command(state.videoOutput?.running?'output-stop':'output-start',{resolution:$('output-resolution').value},state.videoOutput?.running?'视频输出已停止':'视频输出已开启');}
  finally{outputPending=false;renderStudioOutput();}
});
renderStudioOutput();
