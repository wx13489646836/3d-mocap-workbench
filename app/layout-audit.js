/* Runs only with --studio-layout-test against this app's own renderer. */
const fs=require('fs'),path=require('path');
module.exports=async({studio,invoke,app,getState})=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const report={ok:false,pages:[],checks:[]};
  try{
    const started=Date.now();while(!getState().ready){if(Date.now()-started>90000)throw Error('人物初始化超时');await wait(250);}await wait(4000);
    studio.webContents.debugger.attach('1.3');
    // All first-level pages; no capture choices or device access.
    const dimensions=[[1380,820],[1280,740],[1100,740],[1040,680],[768,600],[375,700]];
    for(const [width,height] of dimensions){
      await studio.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      for(const page of ['overview','model','pose','settings','camera','tracking','vmc']){
        await studio.webContents.executeJavaScript(`document.querySelector('[data-page=${page}]').click()`);await wait(650);
        const layout=await studio.webContents.executeJavaScript(`(async()=>{
          const inspector=document.querySelector('.inspector');
          document.querySelectorAll('.inspector details').forEach(d=>d.open=true);
          const model=document.querySelector('.model-detail>div');const long=document.createElement('strong');long.id='audit-long-model';long.textContent='很长的人物模型名称_'+('ABCDEFGHIJKLMNOPQRSTUVWXYZ').repeat(4);model.append(long);
          const menu=document.getElementById('menu-options');let stress;
          if(menu.children.length){stress=document.createElement('button');stress.id='audit-long-setting';const text=document.createElement('span');text.textContent='长设置名称与参数说明_'+('LongSettingName').repeat(14);stress.append(text);menu.append(stress);}
          const problems=[];let checked=0;
          const targets=[...document.querySelectorAll('button,summary,input')].filter(e=>e.getClientRects().length);
          for(const e of targets){
            e.scrollIntoView({block:'nearest',inline:'nearest'});if(!e.disabled)e.focus({preventScroll:true});
            await new Promise(r=>requestAnimationFrame(r));
            const rect=e.getBoundingClientRect();let clipped=rect.left<-.5||rect.right>innerWidth+.5||rect.top<-.5||rect.bottom>innerHeight+.5;
            for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){const style=getComputedStyle(a);const b=a.getBoundingClientRect();if(['hidden','clip','auto','scroll'].includes(style.overflowY)&&(rect.top<b.top-1||rect.bottom>b.bottom+1))clipped=true;if(['hidden','clip','auto','scroll'].includes(style.overflowX)&&(rect.left<b.left-1||rect.right>b.right+1))clipped=true;}
            if(clipped)problems.push({id:e.id||e.dataset.page||e.tagName,text:e.textContent.slice(0,45),rect:{x:rect.x,y:rect.y,w:rect.width,h:rect.height}});
            if(e.scrollWidth>e.clientWidth+2)problems.push({id:e.id||e.dataset.page||e.tagName,error:'text-overflow'});
            checked++;
          }
          const result={page:${JSON.stringify(page)},width:innerWidth,height:innerHeight,checked,overflow:document.documentElement.scrollWidth>innerWidth,inspectorScrolls:inspector.scrollHeight>inspector.clientHeight,problems};
          long.remove();stress?.remove();return result;
        })()`);
        report.pages.push(layout);
      }
    }
    await studio.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1380,height:820,deviceScaleFactor:1,mobile:false});
    await studio.webContents.executeJavaScript("document.querySelector('[data-page=pose]').click()");await wait(700);
    const end=await studio.webContents.executeJavaScript(`(()=>{const advanced=document.querySelector('.advanced-settings');advanced.open=true;const last=advanced.querySelector('button:last-child');last.focus();last.scrollIntoView({block:'nearest'});const r=last.getBoundingClientRect(),i=document.querySelector('.inspector').getBoundingClientRect();return {lastVisible:r.top>=i.top&&r.bottom<=i.bottom,scrollTop:document.querySelector('.inspector').scrollTop,controlHeight:document.querySelector('.control-card').clientHeight,controlScrollHeight:document.querySelector('.control-card').scrollHeight};})()`);
    report.checks.push(end);
    fs.writeFileSync(path.join(__dirname,'../layout-bottom-preview.png'),(await studio.webContents.capturePage()).toPNG());
    await studio.webContents.executeJavaScript("document.querySelector('.inspector').scrollTop=0;document.querySelector('.advanced-settings').open=false;document.querySelector('.activity-card').open=false;document.activeElement.blur()");await wait(250);
    fs.writeFileSync(path.join(__dirname,'../studio-preview.png'),(await studio.webContents.capturePage()).toPNG());
    const final=await invoke('state');report.capture={camera:final.camera,tracking:final.tracking};
    report.ok=report.pages.every(p=>!p.overflow&&!p.problems.length)&&end.lastVisible&&end.controlScrollHeight<=end.controlHeight+2&&!final.camera&&!final.tracking;
  }catch(error){report.error=error.stack;}finally{fs.writeFileSync(path.join(__dirname,'../layout-result.json'),JSON.stringify(report,null,2));app.quit();}
};
