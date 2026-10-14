const fs=require('fs'),path=require('path');
module.exports=({studio,dialog,app,getState})=>{
  const original=dialog.showOpenDialog,wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ui=code=>studio.webContents.executeJavaScript(code);
  const report={ok:false};
  (async()=>{try{
    const start=Date.now();while(!getState().ready){if(Date.now()-start>60000)throw Error('初始化超时');await wait(250);}await wait(600);
    // The test parent closes both output pipes before this write.
    console.error('Closed-pipe import regression '+'.'.repeat(100000));await wait(200);
    report.pipeWriteSurvived=true;
    const invalid=path.join(__dirname,'../imports/invalid.obj');fs.mkdirSync(path.dirname(invalid),{recursive:true});fs.writeFileSync(invalid,'invalid');
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[invalid]});
    await ui("document.getElementById('import').click()");await wait(200);while(await ui('importBusy'))await wait(200);
    report.zip=await ui("({message:document.getElementById('toast').textContent,ready:state.ready,static:state.staticModel})");
    if(!report.zip.ready||!report.zip.message.includes('没有可显示的网格'))throw Error('无效模型错误未正确显示');
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[process.env.STUDIO_STATIC_TEST_MODEL||path.join(__dirname,'../imports/test-fixtures/cube.glb')]});
    await ui("document.getElementById('import').click()");await wait(1200);
    report.glb=await ui("({message:document.getElementById('toast').textContent,ready:state.ready,static:state.staticModel,model:state.model,camera:state.camera,tracking:state.tracking})");
    if(!report.glb.ready||!report.glb.static||report.glb.camera||report.glb.tracking)throw Error('静态模型导入失败');
    report.ok=true;
  }catch(error){report.error=error.stack;}finally{dialog.showOpenDialog=original;fs.writeFileSync(path.join(__dirname,'../import-error-test-result.json'),JSON.stringify(report,null,2));app.quit();}})();
};
