const fs=require('fs');
(async()=>{
 const targets=await(await fetch('http://127.0.0.1:9231/json/list')).json();
 const ws=new WebSocket(targets.find(t=>t.title==='3D动捕工作台').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});let id=0;
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>reject(Error('CDP timeout')),15000);const handler=e=>{const m=JSON.parse(e.data);if(m.id!==n)return;ws.removeEventListener('message',handler);clearTimeout(t);m.error?reject(m.error):resolve(m.result)};ws.addEventListener('message',handler);ws.send(JSON.stringify({id:n,method,params}));});
 const run=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const result={ok:false};
 try{
  await run('location.reload()');await wait(600);await run("navigate('pose')");await wait(600);
  result.total=await run('document.querySelectorAll("[data-pose-id]").length');if(result.total<30)throw Error('动作库不完整');
  result.noPagination=await run("!document.querySelector('#menu-options [data-engine-key=N]')");
  result.search=await run(`(()=>{$('action-search').value='坐姿 17';$('action-search').dispatchEvent(new Event('input'));return [...document.querySelectorAll('[data-pose-id]')].filter(b=>!b.hidden).map(b=>b.textContent)})()`);
  if(result.search.length!==1)throw Error('跨页搜索失败');
  await run("document.querySelector('[data-pose-id]:not([hidden])').click()");await wait(1000);
  result.selected=await run('state.motion');if(result.selected!=='sitting_sexy12')throw Error('远端动作选择失败');
  result.standVariants=[];
  for(const suffix of ['full','upper']){
   await run(`(()=>{$('action-search').value='';filterPoseLibrary();document.querySelector('[data-pose-id="stand_simple|${suffix}"]').click()})()`);await wait(600);
   const selected=await run("state.poses.filter(p=>p.selected).map(p=>p.id)");result.standVariants.push(selected);if(selected.length!==1||selected[0]!==`stand_simple|${suffix}`)throw Error('全身与上半身混淆');
  }
  result.walkCount=await run("(()=>{document.querySelector('[data-pose-category=行走]').click();return [...document.querySelectorAll('[data-pose-id]')].filter(b=>!b.hidden).length})()");if(result.walkCount!==3)throw Error('类型筛选失败');
  result.empty=await run("(()=>{$('action-search').value='不存在的动作';filterPoseLibrary();return !$('search-empty').hidden})()");if(!result.empty)throw Error('搜索空状态失败');
  await run("(()=>{document.querySelector('[data-pose-category=全部]').click();$('action-search').value='';filterPoseLibrary();document.querySelector('[data-pose-id=\"prone_pose01|upper\"]').click()})()");await wait(700);
  result.locate=await run("(()=>{const inspector=document.querySelector('.inspector'),before=inspector.scrollTop;$('pose-locate-current').click();const list=$('pose-library'),current=list.querySelector('[aria-pressed=true]'),r=current.getBoundingClientRect(),box=list.getBoundingClientRect();return {before,after:inspector.scrollTop,visible:r.top>=box.top-1&&r.bottom<=box.bottom+1,searchVisible:$('action-search').getBoundingClientRect().top>0}})()");
  if(!result.locate.visible||result.locate.before!==result.locate.after)throw Error('定位当前动作影响外层滚动');
  result.layouts=[];
  for(const width of [1380,1040,768,375]){
   await call('Emulation.setDeviceMetricsOverride',{width,height:820,deviceScaleFactor:1,mobile:false});await wait(180);
   const layout=await run("({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,listHeight:$('pose-library').clientHeight,controlsOverflow:[...document.querySelectorAll('.pose-categories button,#pose-library button')].filter(b=>!b.hidden).some(b=>b.getBoundingClientRect().right>innerWidth)})");result.layouts.push(layout);if(layout.overflow||layout.controlsOverflow||layout.listHeight<100)throw Error('动作库布局异常');
  }
  await call('Emulation.clearDeviceMetricsOverride');
  await run("$('dismiss').click()");await wait(350);result.reopen=await run("!$('reopen-menu').hidden");if(!result.reopen)throw Error('收起动作库失败');await run("$('reopen-menu').click()");await wait(500);if(!await run("!!$('pose-library')"))throw Error('收起后不能重开');
  for(const section of ['settings','model','output','pose']){await run(`navigate('${section}')`);await wait(250);}
  result.errors=await run("[...document.querySelectorAll('#activity-log .error')].map(e=>e.textContent)");if(result.errors.length)throw Error(result.errors.join('\n'));
  result.final=await run('({motion:state.motion,camera:state.camera,tracking:state.tracking})');
  await run("$('pose-locate-current').click()");
  const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync('pose-library-preview.png',Buffer.from(shot.data,'base64'));
  result.ok=true;
 }catch(e){result.error=e.stack}finally{await call('Emulation.clearDeviceMetricsOverride').catch(()=>{});ws.close();fs.writeFileSync('pose-library-test-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1});

