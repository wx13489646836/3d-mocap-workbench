// Keep navigation and capture actions separate, with real device shutdown.
(()=>{
  if(document.getElementById('camera-toggle'))return;
  const busy=new Set();
  function refresh(next){
    for(const target of ['camera','tracking']){
      const button=document.getElementById(target+'-toggle');
      const on=!!next[target];
      button.textContent=on?(target==='camera'?'关闭':'停止'):'开启';
      button.setAttribute('aria-label',(on?(target==='camera'?'关闭视频输入并停止追踪':'停止动作捕捉，保留视频输入'):(target==='camera'?'选择并开启视频输入':'选择并开启动作捕捉')));
      button.title=button.getAttribute('aria-label');
      button.setAttribute('aria-pressed',String(on));
      button.disabled=!next.ready||busy.has(target);
    }
  }
  for(const target of ['camera','tracking']){
    const navigation=document.querySelector('[data-page="'+target+'"]');
    const row=document.createElement('div');row.className='capture-nav-row';
    navigation.before(row);row.append(navigation);
    const button=document.createElement('button');button.id=target+'-toggle';button.className='capture-switch';row.append(button);
    button.addEventListener('click',async()=>{
      busy.add(target);refresh(state);
      try{
        if(state[target])await command('capture-stop',{target},target==='camera'?'视频输入与动作捕捉已关闭':'动作捕捉已停止，视频输入保留');
        else{
          const access=await command('capture-access',{enabled:true});
          if(!access)return;
          captureAllowed=true;$('capture-card').hidden=true;
          await navigate(target);
          toast(target==='camera'?'请选择视频来源':'请选择面部或全身等追踪模式');
        }
      }finally{busy.delete(target);refresh(state);}
    });
  }
  window.studio.onState(refresh);refresh(state);
})();
