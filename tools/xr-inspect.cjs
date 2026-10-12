// Local developer interface for the independently maintained XR Animator fork.
const fs = require('node:fs');
(async()=>{
  const targets=await (await fetch('http://127.0.0.1:9231/json/list')).json();
  const target=targets.find(t=>t.title===(process.argv[2]||'System Animator (Webkit)'));
  if(!target)throw Error('XR window unavailable');
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  const result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.close();reject(Error('XR query timed out'))},30000);
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id!==1)return;clearTimeout(timer);m.error?reject(m.error):resolve(m.result)};
    ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:fs.readFileSync(process.argv[3],'utf8'),returnByValue:true,awaitPromise:true}}));
  });
  console.log(JSON.stringify(result,null,2));ws.close();
})().catch(e=>{console.error(e);process.exitCode=1});
