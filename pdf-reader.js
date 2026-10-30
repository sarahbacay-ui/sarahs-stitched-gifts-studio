// Non-OCR original PDF reader; saved annotations use normalized page coordinates.
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs',WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
export function normalizeReaderState(raw={}){
 const x=raw&&typeof raw==='object'?raw:{};
 return {page:Math.max(1,Math.floor(Number(x.page)||1)),zoom:clamp(Number(x.zoom)||1,.7,2.5),
 rotation:([0,90,180,270].includes(Number(x.rotation))?Number(x.rotation):0),mode:['highlight','ruler','pan','draw','note','erase'].includes(x.mode)?x.mode:'pan',
 ruler:x.ruler&&typeof x.ruler==='object'?structuredClone(x.ruler):{},marks:x.marks&&typeof x.marks==='object'?structuredClone(x.marks):{},strokes:x.strokes&&typeof x.strokes==='object'?structuredClone(x.strokes):{},notes:x.notes&&typeof x.notes==='object'?structuredClone(x.notes):{}};
}
export function insertMark(state,page,rect){
 const x=clamp(rect.x,0,1),y=clamp(rect.y,0,1),w=clamp(rect.w,0,1-x),h=clamp(rect.h,0,1-y);
 if(w<.008||h<.008)return false;
 (state.marks[String(page)]??=[]).push({x,y,w,h});return true;
}
export async function openPdfReader({url,reading,onChange,onClose,onCounter,mount=null,onMount}){
 const state=normalizeReaderState(reading);
 const history=[];const snapshot=()=>({marks:structuredClone(state.marks),strokes:structuredClone(state.strokes),notes:structuredClone(state.notes)});
 const checkpoint=()=>{history.push(snapshot());if(history.length>50)history.shift()};
 let pdf=null,api=null,closed=false,serial=0,rendering=false;
 const inline=!!mount;
 const outer=element('div',inline?'studio-reader-inline':'studio-reader-backdrop');
 const dialog=element('section','studio-reader');
 dialog.setAttribute('role',inline?'region':'dialog');if(!inline)dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','PDF pattern reader');
 const top=element('div','studio-reader-top');
 const close=element('button','button secondary small',inline?'Hide PDF':'Close');close.type='button';
 top.append(element('strong','', 'Original Pattern Reader'),close);
 const status=element('p','studio-reader-status','Loading original PDF…');status.setAttribute('role','status');
 const toolbar=element('div','studio-reader-toolbar');
 const prev=element('button','button secondary small','Previous page'),label=element('span','','Page —'),next=element('button','button secondary small','Next page');
 const zoomOut=element('button','button secondary small','Zoom −'),zoomStatus=element('span','','100%'),zoomIn=element('button','button secondary small','Zoom +'),rotate=element('button','button secondary small','Rotate');
 toolbar.append(prev,label,next,zoomOut,zoomStatus,zoomIn,rotate);
 const tools=element('div','studio-reader-toolbar');
 const pan=element('button','button secondary small','Pan / Scroll'),ruler=element('button','button secondary small','Ruler'),highlight=element('button','button secondary small','Highlight'),drawTool=element('button','button secondary small','Draw / Pencil'),noteTool=element('button','button secondary small','Add note'),eraseTool=element('button','button secondary small','Eraser'),undo=element('button','button secondary small','Undo annotation');
 tools.append(pan,ruler,highlight,drawTool,noteTool,eraseTool,undo);
 const area=element('div','studio-reader-workspace');
 const viewport=element('div','studio-reader-scroll'),sheet=element('div','studio-reader-sheet'),overlay=element('div','studio-reader-overlay');
 viewport.append(sheet);area.append(viewport);
 const aside=element('aside','studio-reader-side');
 const section=element('p','muted',''),counter=element('strong','studio-reader-counter-value','0'),countDescription=element('p','muted','');
 const down=element('button','round','−'),up=element('button','round plus','+'),counterControls=element('div','studio-reader-count-controls');
 counterControls.append(down,counter,up);
 aside.append(element('strong','','Row Counter'),section,counterControls,countDescription,
 element('p','muted','Reading position and highlights save automatically with this project on this device. Cross-device restore requires backup and sync.'));
 if(!inline)area.append(aside);
 const fallback=element('div','studio-reader-fallback');
 fallback.hidden=true;
 const fallbackPick=element('input','field');fallbackPick.type='file';fallbackPick.accept='.pdf,application/pdf';
 fallback.append(element('p','','Dropbox could not open the PDF. Select the same PDF from Files instead.'),fallbackPick);
 dialog.append(top,status,toolbar,tools,area,fallback);outer.append(dialog);(mount||document.body).append(outer);
 const save=()=>onChange(structuredClone(state));
 // iPad Safari may cancel an active pointer when scrolling or backgrounding.
 // Save the last position on cancellation, hide and close, not just pointerup.
 const onVisibility=()=>{if(document.visibilityState==='hidden'&&!closed)save();};
 const onPageHide=()=>{if(!closed)save();};
 document.addEventListener('visibilitychange',onVisibility);
 window.addEventListener('pagehide',onPageHide);
 let rulerDrag=null;
 const countRefresh=()=>{
   const c=onCounter?.get?.()||{section:'',count:0,rows:0};section.textContent=c.section||'';counter.textContent=String(c.count||0);
   countDescription.textContent=c.rows?'of '+c.rows+' rows':'No active section';
   down.disabled=up.disabled=!c.rows;
 };
 down.onclick=()=>{onCounter.change(-1);countRefresh()};
 up.onclick=()=>{onCounter.change(1);countRefresh()};
 const draw=()=>{
   overlay.replaceChildren();
   const key=String(state.page);
   for(const mark of state.marks[key]||[]){
     const rect=element('div','studio-reader-mark');
     Object.assign(rect.style,{left:mark.x*100+'%',top:mark.y*100+'%',width:mark.w*100+'%',height:mark.h*100+'%'});
     overlay.append(rect);
   }
   const strokes=state.strokes[key]||[];
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');Object.assign(svg.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
   const preview=pointer&&pointer.mode==='draw'&&pointer.page===state.page?pointer.points:null;
   for(const stroke of [...strokes,...(preview?[{points:preview}]:[])]){const path=document.createElementNS('http://www.w3.org/2000/svg','polyline');path.setAttribute('points',(stroke.points||[]).map(p=>`${p.x*1000},${p.y*1000}`).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#b34837');path.setAttribute('stroke-width','3');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path)}overlay.append(svg);
   for(const note of state.notes[key]||[]){const pin=element('button','studio-reader-note-pin','Note');pin.type='button';pin.title=note.text;pin.setAttribute('aria-label','Edit note: '+note.text);Object.assign(pin.style,{position:'absolute',left:note.x*100+'%',top:note.y*100+'%',zIndex:'3',pointerEvents:'auto'});pin.onclick=e=>{e.stopPropagation();if(state.mode==='erase'){checkpoint();state.notes[key]=state.notes[key].filter(n=>n!==note);save();draw();return}const value=prompt('Edit note (leave blank to delete)',note.text);if(value===null)return;checkpoint();if(value.trim())note.text=value.trim();else state.notes[key]=state.notes[key].filter(n=>n!==note);save();draw()};overlay.append(pin)}
   const line=element('div','studio-reader-ruler','Drag ruler to mark your place');
   line.style.top=clamp(Number(state.ruler[key]??.32),0,1)*100+'%';
   // The ruler remains draggable even when Pan / Scroll mode is selected.
   line.style.pointerEvents='auto';
   line.style.touchAction='none';
   line.setAttribute('role','slider');
   line.setAttribute('aria-label','Reading ruler position');
   line.setAttribute('aria-valuemin','0');line.setAttribute('aria-valuemax','100');
   line.setAttribute('aria-valuenow',String(Math.round(clamp(Number(state.ruler[key]??.32),0,1)*100)));
   const moveRuler=e=>{
     const bounds=overlay.getBoundingClientRect();
     const y=clamp((e.clientY-bounds.top)/bounds.height,0,1);
     state.ruler[key]=y;line.style.top=y*100+'%';
     line.setAttribute('aria-valuenow',String(Math.round(y*100)));
   };
   line.onpointerdown=e=>{
     e.preventDefault();e.stopPropagation();
     line.setPointerCapture(e.pointerId);
     rulerDrag=e.pointerId;moveRuler(e);save();
   };
   line.onpointermove=e=>{if(rulerDrag===e.pointerId){e.stopPropagation();moveRuler(e);}};
   const finishRuler=e=>{if(rulerDrag!==e.pointerId)return;e.stopPropagation();moveRuler(e);rulerDrag=null;save();};
   line.onpointerup=finishRuler;
   line.onpointercancel=finishRuler;
   line.onkeydown=e=>{
     const delta=e.key==='ArrowUp'?-0.01:e.key==='ArrowDown'?0.01:0;
     if(!delta)return;e.preventDefault();
     state.ruler[key]=clamp(Number(state.ruler[key]??.32)+delta,0,1);save();draw();
   };
   line.tabIndex=0;
   overlay.append(line);
   undo.disabled=!history.length;
   pan.setAttribute('aria-pressed',String(state.mode==='pan'));
   ruler.setAttribute('aria-pressed',String(state.mode==='ruler'));
   highlight.setAttribute('aria-pressed',String(state.mode==='highlight'));
   drawTool.setAttribute('aria-pressed',String(state.mode==='draw'));noteTool.setAttribute('aria-pressed',String(state.mode==='note'));eraseTool.setAttribute('aria-pressed',String(state.mode==='erase'));
   // Native touch scrolling works in Pan mode; annotation gestures stay opt-in.
   overlay.style.pointerEvents=state.mode==='pan'?'none':'auto';
   overlay.style.touchAction=state.mode==='pan'?'auto':'none';
 };
 const closeReader=()=>{
   if(closed)return;
   save();
   closed=true;serial++;
   document.removeEventListener('visibilitychange',onVisibility);
   window.removeEventListener('pagehide',onPageHide);
   outer.remove();onClose?.();
   if(pdf)pdf.destroy().catch(()=>{});
 };
 close.onclick=closeReader;
 if(!inline)outer.onclick=e=>{if(e.target===outer)closeReader()};
 const paint=async()=>{
   if(!pdf||closed)return;
   const token=++serial;rendering=true;status.textContent='Rendering page '+state.page+'…';
   try{
     const page=await pdf.getPage(state.page);
     const base=page.getViewport({scale:1,rotation:(page.rotate+state.rotation)%360});
     const scale=Math.min(2,1800/Math.max(base.width,base.height))*state.zoom;
     const view=page.getViewport({scale,rotation:(page.rotate+state.rotation)%360});
     const canvas=element('canvas','studio-reader-canvas');
     canvas.width=Math.round(view.width);canvas.height=Math.round(view.height);
     await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
     if(closed||token!==serial)return;
     sheet.replaceChildren(canvas,overlay);
     sheet.style.width=canvas.width+'px';sheet.style.height=canvas.height+'px';
     label.textContent='Page '+state.page+' of '+pdf.numPages;
     zoomStatus.textContent=Math.round(state.zoom*100)+'%';
     prev.disabled=state.page===1;next.disabled=state.page===pdf.numPages;
     draw();status.textContent='Ready. Move the ruler or drag over text to highlight.';
   }catch(e){if(!closed&&token===serial)status.textContent='Could not render page: '+e.message}
   finally{if(token===serial)rendering=false}
 };
 const navigate=n=>{if(!pdf)return;const p=clamp(n,1,pdf.numPages);if(p!==state.page){state.page=p;save();paint()}};
 prev.onclick=()=>navigate(state.page-1);next.onclick=()=>navigate(state.page+1);
 zoomOut.onclick=()=>{state.zoom=clamp(Math.round((state.zoom-.2)*10)/10,.7,2.5);save();paint()};
 zoomIn.onclick=()=>{state.zoom=clamp(Math.round((state.zoom+.2)*10)/10,.7,2.5);save();paint()};
 rotate.onclick=()=>{state.rotation=(state.rotation+90)%360;save();paint()};
 pan.onclick=()=>{state.mode='pan';save();draw()};
 ruler.onclick=()=>{state.mode='ruler';save();draw()};
 highlight.onclick=()=>{state.mode='highlight';save();draw()};
 drawTool.onclick=()=>{state.mode='draw';save();draw()};noteTool.onclick=()=>{state.mode='note';save();draw()};eraseTool.onclick=()=>{state.mode='erase';save();draw()};
 undo.onclick=()=>{const previous=history.pop();if(!previous)return;state.marks=previous.marks;state.strokes=previous.strokes;state.notes=previous.notes;save();draw()};
 let pointer=null;
 const locate=e=>{const rect=overlay.getBoundingClientRect();return {x:clamp((e.clientX-rect.left)/rect.width,0,1),y:clamp((e.clientY-rect.top)/rect.height,0,1)}};
 overlay.onpointerdown=e=>{
   if(rendering||!pdf||state.mode==='pan')return;
   e.preventDefault();overlay.setPointerCapture(e.pointerId);
   const at=locate(e);pointer={id:e.pointerId,mode:state.mode,page:state.page,begin:at,end:at,points:[at]};
   if(state.mode==='ruler'){state.ruler[String(state.page)]=at.y;save();draw()}
 };
 overlay.onpointermove=e=>{if(!pointer||pointer.id!==e.pointerId)return;pointer.end=locate(e);if(pointer.mode==='draw'){pointer.points.push(pointer.end);draw()}if(state.mode==='ruler'){state.ruler[String(state.page)]=pointer.end.y;draw()}};
 overlay.onpointerup=e=>{
   if(!pointer||pointer.id!==e.pointerId)return;
   const a=pointer.begin,b=locate(e),pointerPoints=pointer.points;pointer=null;
   if(state.mode==='ruler')state.ruler[String(state.page)]=b.y;
   else if(state.mode==='highlight'){checkpoint();if(!insertMark(state,state.page,{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)}))history.pop();}
   else if(state.mode==='draw'){checkpoint();(state.strokes[String(state.page)]??=[]).push({points:[...pointerPoints,b]});}
   else if(state.mode==='note'){const value=prompt('Note or comment');if(value?.trim()){checkpoint();(state.notes[String(state.page)]??=[]).push({x:b.x,y:b.y,text:value.trim()});}}
   else if(state.mode==='erase'){const key=String(state.page);const distance=(p)=>Math.hypot(p.x-b.x,p.y-b.y);const candidates=[...(state.marks[key]||[]).map((m,i)=>({kind:'marks',i,d:distance({x:m.x+m.w/2,y:m.y+m.h/2})})),...(state.strokes[key]||[]).map((m,i)=>({kind:'strokes',i,d:Math.min(...(m.points||[]).map(distance))})),...(state.notes[key]||[]).map((m,i)=>({kind:'notes',i,d:distance(m)}))].sort((x,y)=>x.d-y.d);if(candidates[0]?.d<.08){checkpoint();state[candidates[0].kind][key].splice(candidates[0].i,1);}}
   save();draw();
 };
 overlay.onpointercancel=e=>{
   if(pointer&&pointer.id===e.pointerId){
     if(state.mode==='draw'&&pointer.points.length>1){checkpoint();(state.strokes[String(state.page)]??=[]).push({points:pointer.points});}
     if(state.mode==='ruler')state.ruler[String(state.page)]=pointer.end.y;
     pointer=null;save();
   }
   draw();
 };
 const load=async bytes=>{
   if(!api){api=await import(PDFJS);api.GlobalWorkerOptions.workerSrc=WORKER}
   if(pdf)await pdf.destroy();
   pdf=await api.getDocument({data:new Uint8Array(bytes).slice()}).promise;
   state.page=clamp(state.page,1,pdf.numPages);
   fallback.hidden=true;area.hidden=false;toolbar.hidden=false;tools.hidden=false;
   await paint();
 };
 fallbackPick.onchange=async()=>{
   const file=fallbackPick.files?.[0];if(!file)return;
   try{status.textContent='Opening PDF from Files…';await load(await file.arrayBuffer())}
   catch(e){status.textContent='Could not open selected PDF: '+e.message}
 };
 countRefresh();
 onMount?.({root:outer,close:closeReader,refreshCounter:countRefresh});
 try{
   if(!url)throw Error('No saved Dropbox PDF link.');
   const db=typeof StudioDropbox!=='undefined'?StudioDropbox:globalThis.StudioDropbox;
   if(!db?.connected())throw Error('Dropbox is not connected on this device.');
   await load(await db.downloadSharedLink(url));
 }catch(e){
   status.textContent='Cannot open from Dropbox: '+e.message;
   fallback.hidden=false;area.hidden=true;toolbar.hidden=true;tools.hidden=true;
 }
 return {close:closeReader};
}
