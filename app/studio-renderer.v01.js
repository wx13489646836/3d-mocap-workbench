const $=id=>document.getElementById(id);
const pages={overview:['总览','人物、输入与输出的状态，一眼看清。'],model:['人物与模型','导入人物和动作，管理当前出镜角色。'],pose:['动作与姿态','用有名称的按钮选择姿态和动画。'],settings:['场景与设置','调整背景、灯光、视觉效果与显示方式。'],camera:['视频输入','选择视频来源，采集保持手动控制。'],tracking:['动作捕捉','面部、手部、身体追踪的入口与设置。'],vmc:['VMC 连接','向兼容软件发送动作，或接收外部动作数据。']};
let page='overview',state={ready:false},menuSignature='',captureAllowed=false,toastTimer;
const translations={'Stand relaxed':'放松站姿','Stand simple':'标准站姿','Standby':'待机动作','Happy idle':'轻松待机','I-shaped balance':'单腿平衡','Sit 01':'坐姿一','Sit 02':'坐姿二','Sit 03':'坐姿三','介面及重叠覆盖':'界面与叠加显示','将动作汇出成档案':'导出动作文件','关於 XR Animator':'关于 XR Animator'};
function friendly(text){for(const [from,to] of Object.entries(translations))text=text.replaceAll(from,to);return text;}
function log(message,error=false){const li=document.createElement('li');if(error)li.className='error';const time=document.createElement('time');time.textContent=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});const span=document.createElement('span');span.textContent=message;li.append(time,span);$('activity-log').prepend(li);while($('activity-log').children.length>5)$('activity-log').lastChild.remove();}
function toast(message,error=false){$('toast').textContent=message;$('toast').className=error?'error':'';$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
async function command(name,payload={},label=''){try{const result=await window.studio.command(name,payload);if(result?.state)update(result.state);if(label&&!result?.cancelled){log(label);toast(label);}return result;}catch(e){const text=e.message.replace(/^Error invoking remote method '[^']+': Error: /,'');log(text,true);toast(text,true);return null;}}
async function navigate(id){page=id;document.querySelectorAll('[data-page]').forEach(b=>b.setAttribute('aria-current',b.dataset.page===id?'page':'false'));$('page-title').textContent=pages[id][0];$('page-description').textContent=pages[id][1];$('control-title').textContent=id==='overview'?'快捷操作':pages[id][0];$('quick-actions').hidden=id!=='overview';$('model-help').hidden=id!=='model';$('capture-card').hidden=!['camera','tracking'].includes(id)||captureAllowed;$('menu-options').replaceChildren();menuSignature='';$('control-description').textContent=id==='overview'?'选择左侧功能，设置会在这里展开。':id==='model'?'点击预览下方的导入按钮，选择本地文件。':'引擎设置将在这里显示。';if(state.ready)await command('section',{id});log('打开'+pages[id][0]);}
function renderMenu(menu){
  if(['overview','model'].includes(page))menu=null;
  const signature=JSON.stringify([page,menu?.options,menu?.event,captureAllowed]);if(signature===menuSignature)return;menuSignature=signature;
  $('menu-options').replaceChildren();$('control-count').textContent=menu?.options?.length?menu.options.length+' 个选项':'';$('dismiss').hidden=!menu;$('engine-input').hidden=!menu?.acceptsInput||page==='pose';
  if(!menu)return;
  const extra=(menu.lines||[]).filter(line=>!menu.options.some(o=>line.startsWith(o.key+'.')||line.startsWith(o.key+'．'))).join(' ');
  $('control-description').textContent=extra||'每个按钮对应原引擎的一项设置；点击后会显示下一层选项。';
  let advanced;
  menu.options.forEach(option=>{const label=friendly(option.label).replace(/^[┣┗]\s*/, '');const button=document.createElement('button');button.id='menu-option-'+(option.sbIndex||0)+'-'+String(option.key).replace(/[^a-zA-Z0-9]/g,'_');button.textContent=label;button.dataset.engineKey=String(option.key);button.setAttribute('aria-label',label);if(option.closing)button.className='closing';button.disabled=!captureAllowed&&['camera','tracking'].includes(page)&&!option.closing;button.addEventListener('click',()=>command('choose',{key:option.key,sbIndex:option.sbIndex||0},'已选择：'+label));
    if(page==='pose'&&option.sbIndex===1&&!['N','X'].includes(String(option.key))){if(!advanced){advanced=document.createElement('details');advanced.className='advanced-settings';const summary=document.createElement('summary');summary.textContent='更多姿态设置';advanced.append(summary);}advanced.append(button);}else $('menu-options').append(button);
  });
  if(advanced)$('menu-options').append(advanced);
}
function update(next){const wasReady=state.ready;state=next;$('engine-status').textContent=state.error?'引擎连接异常':state.ready?'引擎已就绪':'引擎载入中';$('render-status').textContent=state.ready?'运行中':'正在载入';$('camera-status').textContent=state.camera?'已开启':'未开启';$('tracking-status').textContent=state.tracking?'追踪中':'未开启';$('avatar').disabled=!state.ready;$('import').disabled=!state.ready;$('pause').disabled=!state.camera;$('pause').textContent=state.paused?'恢复视频':'暂停视频';$('avatar').textContent=state.avatarVisible===false?'显示人物':'隐藏人物';$('model-name').textContent=state.model||'默认人物';$('motion-name').textContent=state.motion?'当前动作 · '+state.motion:state.ready?'待机姿态':'等待引擎初始化';$('footer-state').textContent=state.camera?'视频输入运行中'+(state.tracking?' · 追踪已开启':' · 追踪未开启'):'采集未开启 · 仅加载人物渲染';renderMenu(state.menu);if(state.ready&&!wasReady){log('人物引擎已就绪');if(!['overview','model'].includes(page))command('section',{id:page});}}
document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.go)));
$('avatar').addEventListener('click',()=>command('avatar',{},'已切换人物可见性'));
$('pause').addEventListener('click',()=>command('pause',{},'已切换视频播放状态'));
$('import').addEventListener('click',()=>command('import',{},'文件已提交给人物引擎'));
$('legacy').addEventListener('click',()=>command('legacy',{},'已打开原版高级窗口'));
$('dismiss').addEventListener('click',()=>command('dismiss',{},'已关闭当前设置'));
$('clear-log').addEventListener('click',()=>$('activity-log').replaceChildren());
$('zoom').addEventListener('input',e=>{$('preview').style.transform='scale('+e.target.value/100+')';$('zoom-value').textContent=e.target.value+'%';});
$('capture-unlock').addEventListener('click',async()=>{const result=await command('capture-access',{enabled:true},'本次会话已允许手动开启采集');if(result){captureAllowed=true;$('capture-card').hidden=true;menuSignature='';renderMenu(state.menu);document.querySelectorAll('[data-page=camera] i,[data-page=tracking] i').forEach(i=>i.textContent='手动');}});
$('engine-input').addEventListener('submit',e=>{e.preventDefault();command('engine-key',{value:$('setting-value').value},'已提交设置输入');});
window.studio.onState(update);window.studio.onFrame(url=>{if(!state.ready)return;$('preview').src=url;$('preview').classList.add('loaded');$('loading').hidden=true;});
log('Studio 已启动，采集操作保持暂停');
