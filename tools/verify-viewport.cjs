const fs=require('fs');
(async()=>{
 const targets=await(await fetch('http://127.0.0.1:9231/json/list')).json();
 async function connect(title){const ws=new WebSocket(targets.find(t=>t.title===title).webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;return {ws,call:(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>reject(Error('Timeout')),15000);const handler=e=>{const m=JSON.parse(e.data);if(m.id!==n)return;ws.removeEventListener('message',handler);clearTimeout(t);m.error?reject(m.error):resolve(m.result)};ws.addEventListener('message',handler);ws.send(JSON.stringify({id:n,method,params}));})};}
 const ui=await connect('3D动捕工作台'),engine=await connect('3D动捕工作台 · 高级设置');
 const run=async(client,expression)=>{const r=await client.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const camera=()=>run(engine,"(()=>{const c=MMD_SA._trackball_camera;return {position:c.object.position.toArray(),target:c.target.toArray(),distance:c.object.position.distanceTo(c.target)}})()");
 const reset=async()=>{await run(ui,"document.getElementById('view-reset').click()");await wait(500);};
 const changed=(a,b)=>Math.hypot(...a.position.map((v,i)=>v-b.position[i]))>.01;
 const drag=async(button='left')=>{const box=await run(ui,"(()=>{const r=document.getElementById('stage').getBoundingClientRect();return {x:r.x+r.width*.5,y:r.y+r.height*.5}})()");const buttons=button==='right'?2:1;
  await ui.call('Input.dispatchMouseEvent',{type:'mousePressed',...box,button,buttons,clickCount:1});for(let i=1;i<=8;i++){await ui.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+i*12,y:box.y+i*4,button,buttons});await wait(35);}await ui.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x+96,y:box.y+32,button,buttons:0,clickCount:1});await wait(700);};
 const result={ok:false};
 try{
  for(let i=0;i<40;i++){if(await run(ui,"state.ready&&document.getElementById('preview').naturalWidth>0"))break;await wait(150);}
  await reset();result.initial=await camera();await drag();result.rotated=await camera();if(!changed(result.initial,result.rotated))throw Error('左键旋转未生效');
  await reset();const before=await camera();await drag('right');result.panned=await camera();if(Math.hypot(...before.target.map((v,i)=>v-result.panned.target[i]))<.01)throw Error('右键平移未生效');
  await reset();const zoomBefore=await camera();const point=await run(ui,"(()=>{const r=document.getElementById('stage').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await ui.call('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:100});await wait(600);result.zoomed=await camera();if(result.zoomed.distance<=zoomBefore.distance+.01)throw Error('向下滚动未拉远视角');
  await reset();result.reset=await camera();if(changed(result.initial,result.reset))throw Error('视角复位失败');
  await run(ui,"document.getElementById('stage').focus()");await ui.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await ui.call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await wait(500);result.keyboard=changed(result.reset,await camera());if(!result.keyboard)throw Error('键盘旋转失败');
  await reset();await run(ui,"document.getElementById('zoom').value=140;document.getElementById('zoom').dispatchEvent(new Event('input'))");await drag();result.scaledPreview=changed(result.reset,await camera());if(!result.scaledPreview)throw Error('预览缩放后的坐标映射失败');await run(ui,"document.getElementById('zoom-reset').click()");await reset();
  result.layouts=[];for(const width of [1380,1040,768,375]){await ui.call('Emulation.setDeviceMetricsOverride',{width,height:820,deviceScaleFactor:1,mobile:false});await wait(200);const layout=await run(ui,"({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})");result.layouts.push(layout);if(layout.overflow)throw Error('视角工具栏溢出');}await ui.call('Emulation.clearDeviceMetricsOverride');
  result.final=await run(ui,'({title:document.title,camera:state.camera,tracking:state.tracking})');if(result.final.title!=='3D动捕工作台'||result.final.camera||result.final.tracking)throw Error('名称或采集状态不正确');result.ok=true;
 }catch(e){result.error=e.stack}finally{await ui.call('Emulation.clearDeviceMetricsOverride').catch(()=>{});ui.ws.close();engine.ws.close();fs.writeFileSync('viewport-test-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1});

