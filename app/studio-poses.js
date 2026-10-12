let poseCategory='全部',poseSignature='',poseBusy=false;
function describePose(pose){
  let label=pose.label.replace(/^✔️?/,'').replace(/\(🙋\/👟\)/g,'（上半身 / 足部）');
  label=label.replace(/Sit (\d+)/g,(_,n)=>'坐姿 '+n.padStart(2,'0'))
    .replace('Sit simple','简洁坐姿').replace('Legs on table','腿部搭桌')
    .replace(/Prone (\d+)/g,(_,n)=>'俯卧姿势 '+n.padStart(2,'0'))
    .replace('Laying pose','侧躺姿势').replace('Hip Walk','摆胯行走')
    .replace('Walk','行走').replace('Run','跑步')
    .replace(/Model pose (\d+)/g,(_,n)=>'模特站姿 '+n.padStart(2,'0'));
  const translated=friendly(label);
  const parts=translated.match(/^(.*?)\s*(（.*）)?$/);
  const name=(parts?.[1]||translated).trim(),mode=(parts?.[2]||'').replace(/[（）]/g,'');
  const category=/坐姿|搭桌/.test(name)?'坐姿':/行走|跑步/.test(name)?'行走':/卧|躺/.test(name)?'卧姿':/站姿|站立|待机|平衡/.test(name)?'站立':'其他';
  return {name,mode,category,search:(name+' '+mode+' '+pose.name).toLowerCase()};
}
function filterPoseLibrary(){
  const library=$('pose-library');if(!library)return;
  const query=$('action-search').value.trim().toLowerCase();let matches=0;
  library.querySelectorAll('[data-pose-id]').forEach(button=>{
    button.hidden=(poseCategory!=='全部'&&button.dataset.category!==poseCategory)||(query&&!button.dataset.search.includes(query));
    if(!button.hidden)matches++;
  });
  document.querySelectorAll('[data-pose-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.poseCategory===poseCategory)));
  $('pose-result-count').textContent=matches+' / '+(state.poses?.length||0)+' 个动作';
  $('search-empty').hidden=matches>0;
  $('search-empty').textContent='没有匹配的动作，请清除关键词或选择“全部”。';
}
function renderPoseLibrary(menu){
  menuSignature='';
  const entries=state.poses||[];
  const signature=JSON.stringify([entries,menu.options.filter(o=>o.sbIndex===1&&!['N','X'].includes(String(o.key))),poseBusy]);
  if(poseSignature===signature&&$('pose-library')){filterPoseLibrary();return;}
  poseSignature=signature;
  const scroll=$('pose-library')?.scrollTop||0,focus=$('menu-options').contains(document.activeElement)?document.activeElement.id:'';
  const open=$('menu-options').querySelector('details')?.open;
  $('menu-options').replaceChildren();$('menu-options').classList.add('pose-menu');
  $('control-title').textContent='动作库';$('control-count').textContent=entries.length+' 个动作';
  $('control-description').textContent='搜索全部动作，或按类型筛选。点击即可应用。';
  $('control-description').hidden=true;
  $('pose-search').hidden=false;$('dismiss').hidden=false;$('dismiss').textContent='收起动作库';
  $('engine-input').hidden=true;$('reopen-menu').hidden=true;
  const tools=document.createElement('div');tools.className='pose-library-tools';
  const categories=document.createElement('div');categories.className='pose-categories';categories.setAttribute('aria-label','筛选动作类型');
  const available=['全部','站立','坐姿','行走','卧姿','其他'].filter(c=>c==='全部'||entries.some(p=>describePose(p).category===c));
  if(!available.includes(poseCategory))poseCategory='全部';
  available.forEach(category=>{const b=document.createElement('button');b.type='button';b.dataset.poseCategory=category;b.textContent=category;b.addEventListener('click',()=>{poseCategory=category;filterPoseLibrary();$('pose-library').scrollTop=0;});categories.append(b);});
  const row=document.createElement('div');row.className='pose-result-row';
  const count=document.createElement('span');count.id='pose-result-count';count.setAttribute('role','status');
  const locate=document.createElement('button');locate.id='pose-locate-current';locate.textContent='定位当前动作';locate.disabled=!entries.some(p=>p.selected);
  locate.addEventListener('click',()=>{poseCategory='全部';$('action-search').value='';filterPoseLibrary();const list=$('pose-library'),current=list.querySelector('[aria-pressed=true]');if(current){list.scrollTop+=current.getBoundingClientRect().top-list.getBoundingClientRect().top-(list.clientHeight-current.offsetHeight)/2;current.focus({preventScroll:true});}});
  row.append(count,locate);tools.append(categories,row);
  const list=document.createElement('div');list.id='pose-library';list.className='pose-library';list.setAttribute('role','group');list.setAttribute('aria-label','全部动作，可滚动浏览');
  entries.forEach(pose=>{
    const info=describePose(pose),b=document.createElement('button');b.type='button';b.id='pose-'+encodeURIComponent(pose.id);b.dataset.poseId=pose.id;b.dataset.category=info.category;b.dataset.search=info.search;b.disabled=poseBusy;
    b.setAttribute('aria-pressed',String(pose.selected));b.setAttribute('aria-label',info.name+(info.mode?'，'+info.mode:''));
    const content=document.createElement('span');content.className='pose-name';const name=document.createElement('strong');name.textContent=info.name;content.append(name);
    if(info.mode){const mode=document.createElement('small');mode.textContent=info.mode;content.append(mode);}b.append(content);
    if(pose.selected){const tag=document.createElement('span');tag.className='selected-label';tag.textContent='当前';b.append(tag);}
    b.addEventListener('click',async()=>{if(poseBusy)return;poseBusy=true;renderPoseLibrary(state.menu);try{await command('pose-select',{id:pose.id},'已选择：'+info.name);}finally{poseBusy=false;if(page==='pose'&&state.menu?.event==='_POSE_')renderPoseLibrary(state.menu);}});
    list.append(b);
  });
  $('menu-options').append(tools,list);
  const custom=menu.options.find(o=>o.key===0&&!(o.sbIndex||0));
  const advanced=menu.options.filter(o=>o.sbIndex===1&&!['N','X'].includes(String(o.key)));
  if(custom||advanced.length){const details=document.createElement('details');details.className='advanced-settings';details.open=!!open;const summary=document.createElement('summary');summary.textContent='姿态调整与自定义动作';details.append(summary);
    [...(custom?[custom]:[]),...advanced].forEach(o=>{const b=document.createElement('button');b.id='pose-option-'+o.sbIndex+'-'+o.key;b.textContent=friendly(o.label);b.dataset.engineKey=o.key;b.addEventListener('click',()=>command('choose',{key:o.key,sbIndex:o.sbIndex||0},'已选择：'+b.textContent));details.append(b);});$('menu-options').append(details);
  }
  list.scrollTop=scroll;filterPoseLibrary();if(focus)$(focus)?.focus({preventScroll:true});
}
