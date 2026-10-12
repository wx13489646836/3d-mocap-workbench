const fs=require('fs'),path=require('path');
module.exports=async({studio,engine,invoke,app,getState})=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const root=path.join(__dirname,'..');const results=[];
 try{
  const started=Date.now();while(!getState().ready){if(Date.now()-started>90000)throw Error('引擎初始化超时');await wait(250)}await wait(1500);
  await studio.webContents.executeJavaScript('navigate("model")');await wait(700);
  for(const id of ['default','robert','polybot','realman','default','realman','robert','polybot','default']){
   await studio.webContents.executeJavaScript(`document.getElementById('model-select-${id}').click()`);
   const begin=Date.now();while(true){const s=await invoke('state');const busy=await studio.webContents.executeJavaScript('modelSwitchBusy');if(s.modelId===id&&!busy)break;if(Date.now()-begin>45000)throw Error('切换失败：'+id);await wait(200)}await wait(600);
   const info=await engine.webContents.executeJavaScript(`(()=>{const m=MMD_SA.THREEX.models[0];return {path:m.model_path,name:m.model.meta?.name||m.model.meta?.title,sceneVisible:m.model.scene.parent===MMD_SA.THREEX.scene,expressions:m.model.expressionManager?.expressions?.map(e=>e.expressionName),modelCount:MMD_SA.THREEX.models.length,camera:System._browser.camera.ML_enabled}})()`);
   const s=await invoke('state');results.push({id,model:s.model,...info});
   fs.writeFileSync(path.join(root,'models',id+'-render.png'),(await engine.webContents.capturePage()).toPNG());
  }
  const expressions=await engine.webContents.executeJavaScript(`(()=>{const data=[];for(const m of MMD_SA.THREEX.models){const e=m.model.expressionManager;if(!e)continue;const name=e.expressions?.find(x=>x.expressionName==='aa')?.expressionName||e.expressions?.find(x=>x.expressionName==='a')?.expressionName;if(name){const before=e.getValue(name);e.setValue(name,.8);const applied=e.getValue(name);e.setValue(name,before);data.push({model:m.model_path,expression:name,applied})}}return data})()`);
  const layout=await studio.webContents.executeJavaScript(`({cards:[...document.querySelectorAll('.model-option')].map(b=>({name:b.textContent,label:b.getAttribute('aria-label'),pressed:b.getAttribute('aria-pressed'),overflow:b.scrollWidth>b.clientWidth+1})),pageOverflow:document.documentElement.scrollWidth>innerWidth})`);
  fs.writeFileSync(path.join(root,'models-preview.png'),(await studio.webContents.capturePage()).toPNG());
  const final=await invoke('state');const ok=results.length===9&&results.every(r=>r.sceneVisible&&r.modelCount<=4)&&expressions.length===4&&layout.cards.length===4&&!layout.pageOverflow&&layout.cards.every(c=>!c.overflow)&&!final.camera&&!final.tracking;
  fs.writeFileSync(path.join(root,'models-test-result.json'),JSON.stringify({ok,results,expressions,layout,final},null,2));
 }catch(e){fs.writeFileSync(path.join(root,'models-test-result.json'),JSON.stringify({ok:false,error:e.stack,results},null,2));}finally{app.quit()}
};
