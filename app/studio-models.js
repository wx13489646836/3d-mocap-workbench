let builtinModels=[],modelPickerSignature='',modelSwitchBusy=false;
fetch('../models/catalog.json').then(r=>r.json()).then(models=>{builtinModels=models;if(page==='model')renderModelPicker();}).catch(()=>{if(page==='model')$('control-description').textContent='人物列表读取失败，请重新启动工作台。';});
function renderModelPicker(){
  const signature=JSON.stringify([state.modelId,state.ready,modelSwitchBusy,builtinModels.length]);if(signature===modelPickerSignature)return;modelPickerSignature=signature;
  $('control-title').textContent='内置人物';$('control-count').textContent=builtinModels.length+' 个人物';$('control-description').textContent=modelSwitchBusy?'正在加载人物，请稍等…':'点击人物即可切换。所有内置模型都保存在本机。';
  $('dismiss').hidden=true;$('reopen-menu').hidden=true;$('engine-input').hidden=true;$('menu-options').replaceChildren();
  for(const model of builtinModels){
    const button=document.createElement('button');button.id='model-select-'+model.id;button.className='model-option';button.disabled=!state.ready||modelSwitchBusy;button.setAttribute('aria-pressed',String(state.modelId===model.id));button.setAttribute('aria-label','切换为'+model.name+'，'+model.style);
    const image=document.createElement('img');image.src='../models/'+model.thumbnail;image.alt='';image.width=80;image.height=104;button.append(image);
    const text=document.createElement('span');text.className='model-option-text';const name=document.createElement('strong');name.textContent=model.name;const style=document.createElement('small');style.textContent=model.style;text.append(name,style);button.append(text);
    if(state.modelId===model.id){const tag=document.createElement('span');tag.className='model-current';tag.textContent='当前';button.append(tag);}
    button.addEventListener('click',async()=>{modelSwitchBusy=true;renderModelPicker();try{await command('model-select',{id:model.id},'已切换为'+model.name);}finally{modelSwitchBusy=false;modelPickerSignature='';if(page==='model'){renderModelPicker();const selected=$('model-select-'+model.id);selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest'});}}});
    $('menu-options').append(button);
  }
}
