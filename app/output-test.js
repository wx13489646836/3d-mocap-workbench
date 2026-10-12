const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
module.exports=({studio,engine,app,getState})=>{
  const root=path.join(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ui=expression=>studio.webContents.executeJavaScript(expression);
  const capture=async(name,width,height)=>{
    const output=path.join(root,name+'.png');
    await new Promise((resolve,reject)=>{const p=spawn(path.join(process.env.USERPROFILE,'.local/bin/ffmpeg.exe'),['-hide_banner','-rtbufsize','64M','-f','dshow','-video_size',width+'x'+height,'-i','video=Avatar Camera','-ss','1','-frames:v','1','-update','1','-y',output],{windowsHide:true});let errors='';p.stderr.on('data',d=>errors+=d);const t=setTimeout(()=>{p.kill();reject(Error('相机接收超时'))},15000);p.on('exit',code=>{clearTimeout(t);code===0?resolve():reject(Error(errors))});p.on('error',reject);});
    return output;
  };
  (async()=>{const result={ok:false};try{
    const started=Date.now();while(!getState().ready){if(Date.now()-started>90000)throw Error('引擎初始化超时');await wait(250);}
    await wait(1500);
    await ui("navigate('settings')");
    await ui("document.getElementById('background-hex').value='#123456';document.getElementById('background-hex').dispatchEvent(new Event('input'));document.getElementById('background-form').requestSubmit()");await wait(700);
    result.custom=await engine.webContents.executeJavaScript("({body:document.body.style.background,host:document.getElementById('LdesktopBG_host').style.display})");
    if(result.custom.body!=='rgb(18, 52, 86)'||result.custom.host!=='none')throw Error('自定义颜色未生效');
    fs.writeFileSync(path.join(root,'background-custom-test.png'),(await engine.webContents.capturePage()).toPNG());
    result.invalidRejected=await ui("studio.command('background-set',{enabled:true,color:'invalid'}).then(()=>false,()=>true)");if(!result.invalidRejected)throw Error('无效颜色未拒绝');
    await ui("document.getElementById('background-enabled').click()");await wait(500);
    result.disabled=await ui('state.background.enabled===false');if(!result.disabled)throw Error('背景关闭失败');
    await ui("document.querySelector('[data-background=\"#00ff00\"]').click()");await wait(500);
    await ui("navigate('output')");await ui("document.getElementById('output-toggle').click()");await wait(2500);
    result.started=await ui('state.videoOutput');if(!result.started.running)throw Error('视频输出未启动');
    result.green=await capture('output-green-test',1280,720);
    await ui("document.getElementById('freeze').click()");studio.minimize();
    await ui("command('background-set',{enabled:true,color:'#0000ff'})");await wait(1200);
    result.backgroundOutput=await capture('output-minimized-test',1280,720);
    result.minimized=studio.isMinimized();studio.restore();
    await ui("document.getElementById('output-toggle').click()");await wait(900);
    result.stopped=await ui('state.videoOutput');if(result.stopped.running||result.stopped.error)throw Error('停止输出失败');
    result.black=await capture('output-stopped-test',1280,720);
    await ui("document.getElementById('output-resolution').value='1080p';document.getElementById('output-toggle').click()");await wait(1800);
    result.restarted=await ui('state.videoOutput');if(!result.restarted.running||result.restarted.width!==1920)throw Error('高清输出重新启动失败');
    result.hd=await capture('output-hd-test',1920,1080);
    await ui("document.getElementById('output-toggle').click();document.getElementById('freeze').click()");await wait(900);
    result.layouts=[];studio.webContents.debugger.attach('1.3');
    for(const section of ['settings','output']){await ui(`navigate(${JSON.stringify(section)})`);for(const width of [1380,1040,768,375]){
      await studio.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:820,deviceScaleFactor:1,mobile:false});await wait(250);
      const layout=await ui(`({page, width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,fields:[...document.querySelectorAll('#'+(page==='settings'?'background-card':'output-card')+' input,#output-card select')].filter(e=>e.getClientRects().length).some(e=>e.getBoundingClientRect().right>innerWidth)})`);
      result.layouts.push(layout);if(layout.overflow||layout.fields)throw Error('新增页面布局溢出');
    }}
    await studio.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');studio.webContents.debugger.detach();
    await ui("navigate('settings')");await ui("document.querySelector('[data-background=\"#00ff00\"]').click()");await wait(500);
    fs.writeFileSync(path.join(root,'background-ui-preview.png'),(await studio.webContents.capturePage()).toPNG());
    await ui("navigate('output')");fs.writeFileSync(path.join(root,'output-ui-preview.png'),(await studio.webContents.capturePage()).toPNG());
    result.final=await ui('({camera:state.camera,tracking:state.tracking,background:state.background,output:state.videoOutput})');
    if(result.final.camera||result.final.tracking)throw Error('输出操作意外开启采集');
    result.ok=true;
  }catch(error){result.error=error.stack;}finally{fs.writeFileSync(path.join(root,'output-test-result.json'),JSON.stringify(result,null,2));app.quit();}})();
};
