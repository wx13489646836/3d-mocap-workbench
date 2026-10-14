const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('studio',{
  command:(name,payload)=>ipcRenderer.invoke('studio:command',name,payload),
  viewportInput:input=>ipcRenderer.send('studio:viewport-input',input),
  onImportProgress:callback=>ipcRenderer.on('studio:import-progress',(_event,text)=>callback(text)),
  onState:callback=>ipcRenderer.on('studio:state',(_event,state)=>callback(state)),
  onFrame:callback=>ipcRenderer.on('studio:frame',(_event,frame)=>callback(frame)),
  frameReady:id=>ipcRenderer.send('studio:frame-ready',id)
});
