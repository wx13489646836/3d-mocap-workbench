// Native HTML controls for upstream lil-gui; no click simulation in the preview.
let visualSignature='';
const visualNames={'Controls':'视觉效果','Light and camera':'灯光与镜头','Directional Light Parameters':'主光源','Camera':'镜头视角','Post-Processing Effects':'后期效果','Depth of Field Parameters':'景深','SSAO (Selective) Parameters':'环境光遮蔽','Unreal Bloom (Selective) Parameters':'泛光','enabled':'启用','color':'颜色','reset':'恢复默认','x':'横向位置 X','y':'垂直位置 Y','z':'纵深位置 Z','FOV (main camera)':'主镜头视野角度','FOV (hand camera)':'手持镜头视野角度','strength':'强度','radius':'半径','threshold':'阈值','intensity':'强度','quality':'质量','focus':'焦点距离','aperture':'光圈','maxblur':'最大模糊','aoRadius':'遮蔽半径','distanceFalloff':'距离衰减','denoiseSamples':'降噪采样数','denoiseRadius':'降噪半径','halfRes':'半分辨率','colorMultiply':'颜色叠加','transparencyAware':'识别透明材质','bias':'偏移','blur':'模糊','bloomStrength':'泛光强度','bloomRadius':'泛光半径','bloomThreshold':'泛光阈值'};
const visualLabel=text=>visualNames[text]||text;
Object.assign(visualNames,{'VRM Specific Parameters':'VRM 专用参数','bloom_factor':'泛光系数','RimFresnelPower':'轮廓光衰减','RimLift':'轮廓光提升','aoSamples':'遮蔽采样数','renderMode':'显示模式','AO opacity':'遮蔽不透明度','AO color':'遮蔽颜色','fstop':'光圈系数','showFocus':'显示焦点','manualdof':'手动景深','vignetting':'暗角','depthblur':'深度模糊','gain':'增益','fringe':'色散','noise':'噪点','dithering':'抖动强度','pentagon':'五边形光斑','rings':'采样环数','samples':'采样数','focus target':'对焦目标','Low':'低','Medium':'中','High':'高','Ultra':'极高','Performance':'性能优先','Quality':'画质优先'});
function renderVisualControls(tree){
  const signature=JSON.stringify(tree);if(signature===visualSignature)return;visualSignature=signature;
  const openFolders=new Set([...document.querySelectorAll('.visual-folder[open]')].map(e=>e.dataset.folder));
  const hadFolders=!!document.querySelector('.visual-folder');const focused=document.activeElement?.id;
  $('menu-options').replaceChildren();$('reopen-menu').hidden=true;$('pose-search').hidden=true;$('search-empty').hidden=true;$('engine-input').hidden=true;$('dismiss').hidden=true;
  $('control-title').textContent='视觉效果';$('control-description').textContent='调整参数会直接应用到人物画面。镜头参数只改变渲染视角。';
  let count=0;
  const add=(folder,parent,path)=>{
    const details=document.createElement('details');details.className='visual-folder';details.dataset.folder=path;details.open=hadFolders?openFolders.has(path):path==='root'||path==='root/0'||path==='root/1';
    const summary=document.createElement('summary');summary.id='visual-folder-'+path.replaceAll('/','-');summary.textContent=visualLabel(folder.title);details.append(summary);
    for(const control of folder.controls){
      count++;const id='visual-control-'+control.id.replaceAll('/','-');const field=document.createElement('div');field.className='visual-field';
      const label=document.createElement('label');label.htmlFor=id;label.textContent=visualLabel(control.label);field.append(label);
      let input;
      if(control.type==='function'){input=document.createElement('button');input.textContent=visualLabel(control.label);label.hidden=true;}
      else if(control.type==='option'){input=document.createElement('select');for(const option of control.options){const el=document.createElement('option');el.value=option.index;el.textContent=visualLabel(option.label);el.selected=option.selected;input.append(el);}}
      else {input=document.createElement('input');input.type={boolean:'checkbox',number:'number',color:'color',string:'text'}[control.type]||'text';if(control.type==='boolean'){input.checked=control.value;field.classList.add('visual-toggle');}else input.value=control.value;if(control.type==='number'){if(control.min!=null)input.min=control.min;if(control.max!=null)input.max=control.max;input.step=control.step||'any';}}
      input.id=id;input.disabled=control.disabled;input.setAttribute('aria-label',visualLabel(folder.title)+'：'+visualLabel(control.label));input.dataset.visualId=control.id;
      const commit=async()=>{let value=control.type==='boolean'?input.checked:input.value;const result=await command('visual-set',{id:control.id,value,optionIndex:control.type==='option'?Number(input.value):undefined},'已调整：'+visualLabel(control.label));if(result?.state)renderVisualControls(result.state.visualEffects);};
      input.addEventListener(control.type==='function'?'click':'change',commit);field.append(input);
      if(control.type==='number'&&control.min!=null&&control.max!=null){const range=document.createElement('input');range.id=id+'-range';range.type='range';range.min=control.min;range.max=control.max;range.step=control.step||Math.max((control.max-control.min)/100,0.001);range.value=control.value;range.disabled=control.disabled;range.setAttribute('aria-label',visualLabel(folder.title)+'：'+visualLabel(control.label)+'滑块');range.addEventListener('input',()=>input.value=range.value);range.addEventListener('change',commit);field.append(range);}
      details.append(field);
    }
    folder.folders.forEach((child,index)=>add(child,details,path+'/'+index));parent.append(details);
  };
  add(tree,$('menu-options'),'root');$('control-count').textContent=count+' 个参数';
  const back=document.createElement('button');back.id='visual-back';back.textContent='返回场景与设置';back.addEventListener('click',()=>command('visual-close'));$('menu-options').append(back);
  if(focused)$(focused)?.focus({preventScroll:true});
}
