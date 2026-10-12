const fs=require('fs'),path=require('path');
module.exports=async({studio,invoke,app,getState})=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const report={ok:false,cycles:[]};
 try{
  const started=Date.now();while(!getState().ready){if(Date.now()-started>90000)throw Error('初始化超时');await wait(250);}await wait(3000);
  const open=async()=>{await studio.webContents.executeJavaScript("document.querySelector('[data-page=pose]').click()");for(let i=0;i<30;i++){await wait(100);const s=await invoke('state');if(s.menu?.options?.length)return s;}throw Error('动作列表未打开');};
  for(let cycle=0;cycle<3;cycle++){
   const before=await open();await invoke('choose',{key:cycle+7,sbIndex:0});await wait(700);
   await studio.webContents.executeJavaScript("document.getElementById('menu-option-1-X').click()");await wait(400);
   const closed=await invoke('state');
   const reopenButton=await studio.webContents.executeJavaScript("!!document.getElementById('reopen-menu')&&!document.getElementById('reopen-menu').hidden");
   let reopened;if(reopenButton){await studio.webContents.executeJavaScript("document.getElementById('reopen-menu').click()");await wait(650);reopened=await invoke('state');}else reopened=await open();
   const currentMotion=reopened.motion;
   await invoke('choose',{key:2,sbIndex:0});await wait(700);const changed=await invoke('state');
   report.cycles.push({closed:!closed.menu,reopenButton,reopened:!!reopened.menu?.options?.length,motionBefore:currentMotion,motionAfter:changed.motion,motionChanged:currentMotion!==changed.motion,camera:changed.camera,tracking:changed.tracking});
  }
  report.ok=report.cycles.every(c=>c.closed&&c.reopenButton&&c.reopened&&c.motionChanged&&!c.camera&&!c.tracking);
 }catch(error){report.error=error.stack;}finally{fs.writeFileSync(path.join(__dirname,'../menu-reopen-result.json'),JSON.stringify(report,null,2));app.quit();}
};
