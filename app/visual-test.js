const fs=require('fs'),path=require('path');
module.exports=async({studio,engine,invoke,app,getState})=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const report={ok:false};
 const flatten=folder=>[...(folder?.controls||[]),...(folder?.folders||[]).flatMap(flatten)];
 try{
  studio.show();studio.focus();
  const started=Date.now();while(!getState().ready){if(Date.now()-started>90000)throw Error('初始化超时');await wait(250);}await wait(3000);
  await studio.webContents.executeJavaScript("document.querySelector('[data-page=settings]').click()");await wait(500);
  await studio.webContents.executeJavaScript("document.getElementById('menu-option-0-3').click()");
  let state;for(let i=0;i<200;i++){await wait(100);state=await invoke('state');if(state.visualEffects)break;}
  if(!state.visualEffects)throw Error('视觉面板未接通');
  fs.writeFileSync(path.join(__dirname,'../visual-schema.json'),JSON.stringify(state.visualEffects,null,2));
  const controls=flatten(state.visualEffects);report.controlCount=controls.length;report.types=[...new Set(controls.map(c=>c.type))];
  const x=controls.find(c=>c.label==='x'&&c.type==='number');if(!x)throw Error('缺少灯光位置控件');
  const old=x.value;const changed=old>0.7?old-0.1:old+0.1;
  const id='visual-control-'+x.id.replaceAll('/','-');await studio.webContents.executeJavaScript(`(()=>{const input=document.getElementById(${JSON.stringify(id)});input.value=${JSON.stringify(changed)};input.dispatchEvent(new Event('change'));})()`);await wait(400);
  const actual=flatten((await invoke('state')).visualEffects).find(c=>c.id===x.id)?.value;report.numberApplied=Math.abs(actual-changed)<0.0001;
  await invoke('visual-set',{id:x.id,value:old});
  const enabled=controls.find(c=>c.type==='boolean'&&c.label==='enabled');if(enabled){await invoke('visual-set',{id:enabled.id,value:!enabled.value});report.booleanApplied=flatten((await invoke('state')).visualEffects).find(c=>c.id===enabled.id)?.value===!enabled.value;await invoke('visual-set',{id:enabled.id,value:enabled.value});}
  const color=controls.find(c=>c.type==='color');await invoke('visual-set',{id:color.id,value:'#8090a0'});report.colorApplied=flatten((await invoke('state')).visualEffects).find(c=>c.id===color.id)?.value.toLowerCase()==='#8090a0';await invoke('visual-set',{id:color.id,value:color.value});
  const option=controls.find(c=>c.type==='option'&&c.options.length>1);const oldOption=option.options.find(o=>o.selected).index;const newOption=(oldOption+1)%option.options.length;await invoke('visual-set',{id:option.id,optionIndex:newOption});report.optionApplied=flatten((await invoke('state')).visualEffects).find(c=>c.id===option.id)?.options[newOption].selected;await invoke('visual-set',{id:option.id,optionIndex:oldOption});
  const reset=controls.find(c=>c.type==='function'&&c.label==='reset');await invoke('visual-set',{id:reset.id});report.functionApplied=true;
  for(const control of controls.filter(c=>c.id.startsWith(reset.id.slice(0,reset.id.lastIndexOf('/'))+'/')&&c.type!=='function'))await invoke('visual-set',{id:control.id,value:control.value});
  report.overlaysHidden=await engine.webContents.executeJavaScript(`Object.values(MMD_SA.THREEX.GUI.obj).every(gui=>!gui.domElement||getComputedStyle(gui.domElement).visibility==='hidden')`);
  await wait(500);report.layouts=[];studio.webContents.debugger.attach('1.3');
  for(const [width,height] of [[1380,820],[1040,680],[768,700],[375,700]]){
   await studio.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await wait(200);
   const layout=await studio.webContents.executeJavaScript(`(async()=>{document.querySelectorAll('.visual-folder').forEach(d=>d.open=true);const errors=[];const inputs=[...document.querySelectorAll('.visual-field input,.visual-field select,.visual-field button,#visual-back')];for(const input of inputs){input.scrollIntoView({block:'nearest',inline:'nearest'});await new Promise(r=>setTimeout(r,20));const r=input.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1||input.scrollWidth>input.clientWidth+2)errors.push({id:input.id,x:r.x,y:r.y,w:r.width,h:r.height,scrollWidth:input.scrollWidth,clientWidth:input.clientWidth});}return {width:innerWidth,checked:inputs.length,overflow:document.documentElement.scrollWidth>innerWidth,errors};})()`);report.layouts.push(layout);
  }
  await studio.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1380,height:820,deviceScaleFactor:1,mobile:false});await wait(200);
  await studio.webContents.executeJavaScript("document.querySelectorAll('.visual-folder').forEach(d=>d.open=true);document.querySelector('.inspector').scrollTop=0");await wait(200);
  fs.writeFileSync(path.join(__dirname,'../visual-preview.png'),(await studio.webContents.capturePage()).toPNG());
  await studio.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');studio.webContents.debugger.detach();
  await studio.webContents.executeJavaScript("document.getElementById('visual-back').click()");await wait(350);
  const after=await invoke('state');report.returnedToSettings=!!after.menu?.options?.length&&!after.visualEffects;report.camera=after.camera;report.tracking=after.tracking;
  report.ok=report.controlCount>=8&&report.numberApplied&&report.booleanApplied&&report.colorApplied&&report.optionApplied&&report.functionApplied&&report.layouts.every(l=>!l.overflow&&!l.errors.length)&&report.overlaysHidden&&report.returnedToSettings&&!report.camera&&!report.tracking;
 }catch(error){report.error=error.stack;}finally{fs.writeFileSync(path.join(__dirname,'../visual-test-result.json'),JSON.stringify(report,null,2));app.quit();}
};
