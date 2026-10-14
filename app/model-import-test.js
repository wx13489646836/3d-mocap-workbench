const fs=require('fs'),path=require('path');
module.exports=({studio,engine,dialog,app,getState})=>{
 const original=dialog.showOpenDialog,wait=ms=>new Promise(r=>setTimeout(r,ms));const ui=code=>studio.webContents.executeJavaScript(code);const native=code=>engine.webContents.executeJavaScript(code);const report={ok:false,imports:[]};
 (async()=>{try{
  const deadline=Date.now()+60000;while(!getState().ready){if(Date.now()>deadline)throw Error('初始化超时');await wait(250);}await wait(600);
  const fixtures=JSON.parse(process.env.STUDIO_IMPORT_TEST_FILES||'[]');if(fixtures.length!==3||fixtures.some(f=>!fs.existsSync(f)))throw Error('STUDIO_IMPORT_TEST_FILES must contain three existing fixture paths: static FBX ZIP, OBJ ZIP, rigged FBX ZIP');
  const cases=fixtures.map((file,index)=>[file,index<2]);
  for(const [file,expectedStatic] of cases){dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});await ui("document.getElementById('import').click()");await wait(200);
   const busy=await ui("({busy:importBusy,disabled:document.getElementById('import').disabled})");if(!busy.busy||!busy.disabled)throw Error('导入期间按钮未锁定');
   const end=Date.now()+180000;while(await ui('importBusy')){if(Date.now()>end)throw Error('导入超时');await wait(200);}await wait(700);
   const state=await ui("({static:state.staticModel,model:state.model,ready:state.ready,status:document.getElementById('import-status').textContent})");
   if(state.static!==expectedStatic||!state.ready)throw Error('模型状态不正确：'+file);
   const details=await native("(()=>{let meshes=0,textures=0;MMD_SA.THREEX.scene.traverse(o=>{if(o.isMesh&&o.visible){meshes++;const m=Array.isArray(o.material)?o.material:[o.material];textures+=m.filter(x=>x?.map).length}});return {meshes,textures,camera:System._browser.camera.ML_enabled}})()");
   report.imports.push({format:cases.indexOf(cases.find(c=>c[0]===file))===1?'OBJ ZIP':expectedStatic?'FBX ZIP':'Rigged FBX ZIP',...state,...details,busyLocked:true});
  }
  report.pose=await native("(async()=>{await XRStudio.dispatch('section',{id:'pose'});const T=MMD_SA.THREEX.THREE;const pos=()=>MMD_SA.THREEX.models[0].model.humanoid.getRawBoneNode('leftHand').getWorldPosition(new T.Vector3());await XRStudio.dispatch('pose-select',{id:'stand_simple|full'});await new Promise(r=>setTimeout(r,600));const before=pos();await XRStudio.dispatch('pose-select',{id:'Mixamo - Sitting02|upper'});await new Promise(r=>setTimeout(r,600));return {distance:before.distanceTo(pos())}})()");if(report.pose.distance<.1)throw Error('自动转换的人物没有正常驱动');
  const bad=path.join(__dirname,'../imports/invalid.obj');fs.writeFileSync(bad,'not a model');dialog.showOpenDialog=async()=>({canceled:false,filePaths:[bad]});await ui("document.getElementById('import').click()");await wait(200);while(await ui('importBusy'))await wait(200);
  report.errorRecovered=await ui("({disabled:document.getElementById('import').disabled,error:document.getElementById('toast').textContent,ready:state.ready})");if(report.errorRecovered.disabled||!report.errorRecovered.ready||!report.errorRecovered.error.includes('没有可显示的网格'))throw Error('失败恢复未通过');
  await ui("command('model-select',{id:'default'})");await wait(700);report.originalVrm=await ui("({id:state.modelId,static:state.staticModel})");if(report.originalVrm.id!=='default'||report.originalVrm.static)throw Error('原版 VRM 回归失败');
  report.ok=true;
 }catch(error){report.error=error.stack;}finally{dialog.showOpenDialog=original;fs.writeFileSync(path.join(__dirname,'../model-import-test-result.json'),JSON.stringify(report,null,2));app.quit();}})();
};
