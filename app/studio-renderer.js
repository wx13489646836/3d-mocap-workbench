const $=id=>document.getElementById(id);
let previewFrames=0,previewFpsStarted=performance.now();
const pages={output:['视频输出','通过虚拟相机将人物画面发送到 OBS。'],overview:['总览','人物、输入与输出的状态，一眼看清。'],model:['人物与模型','导入人物和动作，管理当前出镜角色。'],pose:['动作与姿态','用有名称的按钮选择姿态和动画。'],settings:['场景与设置','调整背景、灯光、视觉效果与显示方式。'],camera:['视频输入','选择视频来源，采集保持手动控制。'],tracking:['动作捕捉','面部、手部、身体追踪的入口与设置。'],vmc:['VMC 连接','向兼容软件发送动作，或接收外部动作数据。']};
let page='overview',state={ready:false},menuSignature='',captureAllowed=false,toastTimer,previewFrozen=false;
const translations={'Stand relaxed':'放松站姿','Stand simple':'标准站姿','Standby':'待机动作','Happy idle':'轻松待机','I-shaped balance':'单腿平衡','Sit 01':'坐姿一','Sit 02':'坐姿二','Sit 03':'坐姿三','介面及重叠覆盖':'界面与叠加显示','将动作汇出成档案':'导出动作文件','关於 XR Animator':'关于软件'};
function friendly(text){for(const [from,to] of Object.entries(translations))text=text.replaceAll(from,to);return text.replace(/\(💃➔全身动捕\)/g,'（全身）').replace(/\(🙋➔上半身动捕\)/g,'（上半身）').replace(/\(🙋\/🦶\)/g,'（上半身 / 足部）').replace(/\(🦶\/🙋\)/g,'（足部 / 上半身）').replace(/\(🙋\)/g,'（上半身）').replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'').replace(/^[┣┗]\s*/,'').trim();}
Object.assign(translations,{'关于 XR Animator':'关于软件','XR Animator':'3D动捕工作台','全身 (MediaPipe Vision)':'全身（新版，精度优先）','全身 (Legacy Holistic)':'全身（旧版，低占用）'});
function filterActions(){if(page==='pose'&&document.getElementById('pose-library')){filterPoseLibrary();return;}const query=$('action-search').value.trim().toLocaleLowerCase();let matches=0;document.querySelectorAll('#menu-options>button').forEach(button=>{const excluded=button.classList.contains('closing')||button.dataset.engineKey==='N';button.hidden=!excluded&&Boolean(query)&&!button.textContent.toLocaleLowerCase().includes(query);if(!excluded&&!button.hidden)matches++;});const advanced=$('menu-options').querySelector('details');if(advanced)advanced.hidden=Boolean(query);$('search-empty').hidden=page!=='pose'||!query||matches>0;}
function markSelected(){document.querySelectorAll('#menu-options button').forEach(button=>{const selected=page==='pose'&&button.dataset.selected==='true';button.setAttribute('aria-pressed',String(selected));});}
function log(message,error=false){const li=document.createElement('li');if(error)li.className='error';const time=document.createElement('time');time.textContent=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});const span=document.createElement('span');span.textContent=message;li.append(time,span);$('activity-log').prepend(li);while($('activity-log').children.length>5)$('activity-log').lastChild.remove();}
function toast(message,error=false){$('toast').textContent=message;$('toast').className=error?'error':'';$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
async function command(name,payload={},label=''){try{const result=await window.studio.command(name,payload);if(result?.state)update(result.state);if(label&&!result?.cancelled){log(label);toast(label);}return result;}catch(e){const text=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');log(text,true);toast(text,true);return null;}}
async function navigate(id){page=id;document.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-current',b.dataset.page===id?'page':'false'));$('page-title').textContent=pages[id][0];$('page-description').textContent=pages[id][1];$('control-title').textContent=id==='overview'?'开始创作':pages[id][0];$('quick-actions').hidden=id!=='overview';$('model-help').hidden=id!=='model';$('pose-search').hidden=id!=='pose';$('action-search').value='';$('search-empty').hidden=true;$('capture-card').hidden=!['camera','tracking'].includes(id)||captureAllowed;$('menu-options').replaceChildren();menuSignature='';$('control-description').textContent=id==='overview'?'选择一项操作，展开对应设置。':id==='model'?'使用人物预览下方的导入按钮，选择本地文件。':'正在读取设置…';if(state.ready)await command('section',{id});log('打开'+pages[id][0]);}
function renderMenu(menu){
  if(typeof renderStudioOutput==='function')renderStudioOutput();
  if(page==='output')return;
  if(page==='pose'&&state.poses?.length&&menu?.event==='_POSE_'&&menu.options.some(o=>o.key==='X'&&o.closing)){renderPoseLibrary(menu);return;}
  poseSignature='';$('menu-options').classList.remove('pose-menu');$('dismiss').textContent='关闭当前设置';$('control-description').hidden=false;
  if(page==='model'){renderModelPicker();return;}
  modelPickerSignature='';
  if(state.visualEffects){menuSignature='';renderVisualControls(state.visualEffects);return;}
  visualSignature='';
  $('control-title').textContent=page==='overview'?'开始创作':pages[page][0];
  if(['overview','model'].includes(page))menu=null;
  const signature=JSON.stringify([page,menu?.options,menu?.event,captureAllowed]);if(signature===menuSignature)return;menuSignature=signature;
  const advancedOpen=$('menu-options').querySelector('details')?.open;
  const focusedId=$('menu-options').contains(document.activeElement)?document.activeElement.id:'';
  $('menu-options').replaceChildren();$('control-count').textContent=menu?.options?.length?menu.options.length+' 个选项':'';$('dismiss').hidden=!menu;$('engine-input').hidden=!menu?.acceptsInput||page==='pose';
  const canReopen=state.ready&&!['overview','model'].includes(page);
  $('reopen-menu').hidden=!!menu||!canReopen;
  $('reopen-menu').textContent=page==='pose'?'重新打开动作列表':'重新打开设置';
  $('pose-search').hidden=page!=='pose'||!menu;
  if(!menu){$('search-empty').hidden=true;if(canReopen)$('control-description').textContent=page==='pose'?'动作列表已关闭，人物保持当前动作。点击下方按钮可重新打开。':'设置已关闭，点击下方按钮可重新打开。';return;}
  const extra=(menu.lines||[]).filter(line=>!menu.options.some(o=>line.startsWith(o.key+'.')||line.startsWith(o.key+'．'))).join(' ');
  $('control-description').textContent=friendly(extra)||(page==='pose'?'选择动作即可应用到人物。更多调整在列表下方。':'选择一项设置，展开调整选项。');
  let advanced;
  menu.options.forEach(option=>{const label=option.closing&&page==='pose'?'关闭动作列表':friendly(option.label);const button=document.createElement('button');button.id='menu-option-'+(option.sbIndex||0)+'-'+String(option.key).replace(/[^a-zA-Z0-9]/g,'_');const text=document.createElement('span');text.textContent=label;button.append(text);button.dataset.engineKey=String(option.key);button.dataset.selected=String(option.label.includes('✔'));button.setAttribute('aria-label',label);if(page==='pose'&&button.dataset.selected==='true'){const tag=document.createElement('span');tag.className='selected-label';tag.textContent='当前';button.append(tag);}if(option.closing)button.className='closing';button.disabled=!captureAllowed&&['camera','tracking'].includes(page)&&!option.closing;button.addEventListener('click',async()=>{button.disabled=true;button.setAttribute('aria-busy','true');try{await command('choose',{key:option.key,sbIndex:option.sbIndex||0},'已选择：'+label);}finally{button.removeAttribute('aria-busy');button.disabled=!captureAllowed&&['camera','tracking'].includes(page)&&!option.closing;}});
    if(page==='pose'&&option.sbIndex===1&&!['N','X'].includes(String(option.key))){if(!advanced){advanced=document.createElement('details');advanced.className='advanced-settings';const summary=document.createElement('summary');summary.textContent='更多姿态设置';advanced.append(summary);}advanced.append(button);}else $('menu-options').append(button);
  });
  if(advanced){advanced.open=!!advancedOpen;$('menu-options').append(advanced);}markSelected();filterActions();
  if(focusedId)$(focusedId)?.focus({preventScroll:true});
}
function update(next){$('legacy').textContent=next.legacyOpen?'关闭原版高级窗口':'打开原版高级窗口';$('legacy').setAttribute('aria-pressed',String(!!next.legacyOpen));const wasReady=state.ready;state=next;$('engine-status').textContent=state.error?'引擎连接异常':state.ready?'引擎已就绪':'引擎载入中';$('render-status').textContent=state.ready?'运行中':'正在载入';$('camera-status').textContent=state.camera?'已开启':'未开启';$('tracking-status').textContent=state.tracking?'追踪中':'未开启';$('avatar').disabled=!state.ready;$('import').disabled=!state.ready;$('pause').disabled=!state.camera;$('pause').textContent=state.paused?'恢复视频':'暂停视频';$('avatar').textContent=state.avatarVisible===false?'显示人物':'隐藏人物';$('model-name').textContent=state.model||'默认人物';$('motion-name').textContent=state.motion?'当前动作 · '+state.motion:state.ready?'待机姿态':'等待引擎初始化';$('footer-state').textContent=state.camera?'视频输入运行中'+(state.tracking?' · 追踪已开启':' · 追踪未开启'):'采集未开启 · 仅加载人物渲染';renderMenu(state.menu);if(state.ready&&!wasReady){log('人物引擎已就绪');if(!['overview','model'].includes(page))command('section',{id:page});}}
document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.go)));
$('avatar').addEventListener('click',()=>command('avatar',{},'已切换人物可见性'));
$('pause').addEventListener('click',()=>command('pause',{},'已切换视频播放状态'));
$('import').addEventListener('click',()=>command('import',{},'文件已提交给人物引擎'));
$('legacy').addEventListener('click',async()=>{const button=$('legacy');button.disabled=true;try{const result=await command('legacy');if(result?.state){const label=result.state.legacyOpen?'已打开原版高级窗口':'已关闭原版高级窗口';log(label);toast(label);}}finally{button.disabled=false;}});
$('dismiss').addEventListener('click',()=>{const closing=page==='pose'&&$('pose-library')?state.menu?.options.find(o=>o.closing):null;return closing?command('choose',{key:closing.key,sbIndex:closing.sbIndex||0},'已收起动作库'):command('dismiss',{},'已关闭当前设置');});
$('reopen-menu').addEventListener('click',async()=>{const button=$('reopen-menu');button.disabled=true;try{await navigate(page);}finally{button.disabled=false;}});
$('clear-log').addEventListener('click',()=>$('activity-log').replaceChildren());
$('zoom').addEventListener('input',e=>{$('preview').style.transform='scale('+e.target.value/100+')';$('zoom-value').textContent=e.target.value+'%';});
$('capture-unlock').addEventListener('click',async()=>{const result=await command('capture-access',{enabled:true},'本次会话已允许手动开启采集');if(result){captureAllowed=true;$('capture-card').hidden=true;menuSignature='';renderMenu(state.menu);document.querySelectorAll('[data-page=camera] i,[data-page=tracking] i').forEach(i=>i.textContent='手动');}});
$('engine-input').addEventListener('submit',e=>{e.preventDefault();command('engine-key',{value:$('setting-value').value},'已提交设置输入');});
window.studio.onState(next=>{update(next);$('freeze').disabled=!state.ready;$('pause').hidden=!state.camera;document.querySelector('[data-page=camera] i').textContent=state.camera?'开启':'关闭';document.querySelector('[data-page=tracking] i').textContent=state.tracking?'开启':'关闭';$('status-dot').style.background=state.error?'var(--error)':state.ready?'var(--success)':'var(--muted)';});window.studio.onFrame(async frame=>{
  if(!state.ready||previewFrozen){window.studio.frameReady(frame.id);return;}
  const url=URL.createObjectURL(new Blob([frame.bytes],{type:frame.mime}));
  const previous=$('preview').dataset.frameUrl;
  try{
    const decoded=new Image();decoded.src=url;await decoded.decode();$('preview').src=url;
    $('preview').dataset.frameUrl=url;$('preview').classList.add('loaded');$('loading').hidden=true;
    previewFrames++;const elapsed=performance.now()-previewFpsStarted;
    if(elapsed>=1000){$('preview-fps').textContent=Math.round(previewFrames*1000/elapsed)+' 帧/秒';previewFrames=0;previewFpsStarted=performance.now();}
    if(previous)URL.revokeObjectURL(previous);
  }catch(_error){URL.revokeObjectURL(url);}finally{window.studio.frameReady(frame.id);}
});
$('action-search').addEventListener('input',filterActions);
$('freeze').addEventListener('click',()=>{previewFrozen=!previewFrozen;command('preview-pause',{paused:previewFrozen});previewFrames=0;previewFpsStarted=performance.now();$('freeze').setAttribute('aria-pressed',String(previewFrozen));$('freeze').textContent=previewFrozen?'恢复预览':'暂停预览';$('preview-status').textContent=previewFrozen?'预览已暂停':'实时预览';});
$('zoom-reset').addEventListener('click',()=>{$('zoom').value='100';$('zoom-value').textContent='100%';$('preview').style.transform='scale(1)';});
log('工作台已启动，采集操作保持暂停');


