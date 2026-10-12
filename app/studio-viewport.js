const viewport=$('stage');
let viewportDrag=null,viewportMove=null,viewportTick=0;
function viewportPoint(event,clamp=false){
  const image=$('preview');if(!image.naturalWidth||!state.ready||previewFrozen||state.legacyOpen)return null;
  const rect=image.getBoundingClientRect();
  const scale=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
  const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  const u=(event.clientX-rect.left-(rect.width-width)/2)/width,v=(event.clientY-rect.top-(rect.height-height)/2)/height;
  if(!clamp&&(u<0||v<0||u>1||v>1))return null;
  return {u:Math.max(0,Math.min(1,u)),v:Math.max(0,Math.min(1,v))};
}
function flushViewportMove(){cancelAnimationFrame(viewportTick);viewportTick=0;if(viewportMove){window.studio.viewportInput(viewportMove);viewportMove=null;}}
function endViewportDrag(){
  if(!viewportDrag)return;flushViewportMove();window.studio.viewportInput({...viewportDrag.point,type:'mouseUp',button:viewportDrag.button,control:viewportDrag.control});
  const id=viewportDrag.id;viewportDrag=null;viewport.classList.remove('dragging');if(viewport.hasPointerCapture(id))viewport.releasePointerCapture(id);
}
viewport.addEventListener('pointerdown',event=>{
  if(event.button!==0&&event.button!==2)return;const point=viewportPoint(event);if(!point)return;
  event.preventDefault();viewport.focus({preventScroll:true});
  viewportDrag={id:event.pointerId,button:event.button===2?'right':'left',control:event.ctrlKey,point};
  viewport.setPointerCapture(event.pointerId);viewport.classList.add('dragging');window.studio.viewportInput({...point,type:'mouseDown',button:viewportDrag.button,control:viewportDrag.control});
});
viewport.addEventListener('pointermove',event=>{
  if(!viewportDrag||event.pointerId!==viewportDrag.id)return;const point=viewportPoint(event,true);if(!point){endViewportDrag();return;}
  viewportDrag.point=point;viewportMove={...point,type:'mouseMove',button:viewportDrag.button,control:viewportDrag.control};
  if(!viewportTick)viewportTick=requestAnimationFrame(flushViewportMove);
});
viewport.addEventListener('pointerup',endViewportDrag);viewport.addEventListener('pointercancel',endViewportDrag);viewport.addEventListener('lostpointercapture',endViewportDrag);
window.addEventListener('blur',endViewportDrag);$('freeze').addEventListener('click',endViewportDrag);
viewport.addEventListener('contextmenu',event=>event.preventDefault());
viewport.addEventListener('dragstart',event=>event.preventDefault());
viewport.addEventListener('wheel',event=>{const point=viewportPoint(event);if(!point)return;event.preventDefault();window.studio.viewportInput({...point,type:'mouseWheel',deltaY:Math.sign(event.deltaY)*60});},{passive:false});
viewport.addEventListener('keydown',event=>{
  if(!state.ready||previewFrozen||state.legacyOpen)return;
  if(event.key==='Home'){event.preventDefault();command('view-reset',{},'视角已复位');return;}
  if(['+','=','-'].includes(event.key)){event.preventDefault();window.studio.viewportInput({type:'mouseWheel',u:.5,v:.5,deltaY:event.key==='-'?60:-60});return;}
  const direction={ArrowLeft:[-.04,0],ArrowRight:[.04,0],ArrowUp:[0,-.04],ArrowDown:[0,.04]}[event.key];if(!direction)return;event.preventDefault();
  const button=event.shiftKey?'right':'left';window.studio.viewportInput({type:'mouseDown',u:.5,v:.5,button});window.studio.viewportInput({type:'mouseMove',u:.5+direction[0],v:.5+direction[1],button});window.studio.viewportInput({type:'mouseUp',u:.5+direction[0],v:.5+direction[1],button});
});
$('view-reset').addEventListener('click',()=>{endViewportDrag();command('view-reset',{},'视角已复位');});
window.studio.onState(next=>{$('view-reset').disabled=!next.ready;viewport.setAttribute('aria-disabled',String(!next.ready||previewFrozen||next.legacyOpen));});
