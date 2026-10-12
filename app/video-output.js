const path=require('path');
const fs=require('fs');
const {spawn,spawnSync}=require('child_process');
module.exports=()=>{
  let child=null,lastFrameAt=0,starting=null;
  let status={running:false,starting:false,device:'Avatar Camera',width:1280,height:720,fps:0,error:''};
  const runtime=path.join(__dirname,'../runtime/virtual-camera');
  const python=path.join(process.env.LOCALAPPDATA,'Programs/Python/Python311/python.exe');
  const stop=()=>{const process=child;child=null;status={...status,running:false,starting:false,fps:0};if(process){process.stdin.end();const timer=setTimeout(()=>process.kill(),800);process.once('exit',()=>clearTimeout(timer));}};
  const start=async(resolution)=>{
    if(starting)return starting;
    if(child)return;
    if(!fs.existsSync(python))throw Error('找不到本机视频输出运行环境');
    const registration=spawnSync(python,[path.join(runtime,'register.py')],{windowsHide:true,encoding:'utf8'});
    if(registration.status!==0)throw Error('虚拟相机注册失败：'+(registration.stderr||registration.error?.message||''));
    const width=resolution==='1080p'?1920:1280,height=resolution==='1080p'?1080:720;
    status={...status,width,height,starting:true,error:''};
    starting=new Promise((resolve,reject)=>{
      const p=child=spawn(python,['-u',path.join(runtime,'output.py'),String(width),String(height)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      let lines='',errors='',settled=false;
      const timer=setTimeout(()=>fail('虚拟相机启动超时'),10000);
      const fail=message=>{const pending=!settled;settled=true;clearTimeout(timer);status={...status,error:message};stop();if(pending)reject(Error(message));};
      p.stdout.on('data',data=>{lines+=data;const chunks=lines.split('\n');lines=chunks.pop();for(const line of chunks){try{const event=JSON.parse(line);if(p!==child)continue;if(event.error){fail('虚拟相机无法启动：'+event.error);continue;}if(event.ready){settled=true;clearTimeout(timer);status={...status,running:true,starting:false,error:''};resolve();}if(event.fps!=null)status.fps=event.fps;}catch{}}});
      p.stderr.on('data',data=>{errors=(errors+data).slice(-2000);});
      p.on('error',error=>fail(error.message));
      p.stdin.on('error',()=>{});
      p.on('exit',code=>{if(p!==child)return;child=null;status={...status,running:false,starting:false,fps:0,error:code?'视频输出意外停止：'+errors:''};if(!settled)fail(status.error||'视频输出未启动');});
    });
    try{await starting;}finally{starting=null;}
  };
  const wantsFrame=()=>status.running&&child&&!child.stdin.destroyed&&!child.stdin.writableNeedDrain&&Date.now()-lastFrameAt>=32;
  const send=frame=>{
    if(!wantsFrame())return;
    const p=child,last=Date.now();
    // Resize on the helper thread, keeping the Electron UI thread responsive.
    const bitmap=frame.toBitmap(),size=frame.getSize();
    const header=Buffer.alloc(12);header.writeUInt32LE(bitmap.length,0);header.writeUInt32LE(size.width,4);header.writeUInt32LE(size.height,8);
    lastFrameAt=last;p.stdin.write(Buffer.concat([header,bitmap]));
  };
  return {start,stop,send,wantsFrame,state:()=>({...status})};
};
