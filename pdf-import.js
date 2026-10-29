// Guided, browser-local PDF import. The source PDF is never modified.
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDF_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const TESSERACT='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';

function node(tag, props={}, text) {
  const el=document.createElement(tag);
  Object.assign(el,props);
  if(text!==undefined)el.textContent=text;
  return el;
}
function pagesFromRange(raw,total) {
  if(!raw.trim())return Array.from({length:total},(_,i)=>i+1);
  const result=new Set();
  for(const part of raw.split(',')) {
    const m=/^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim());
    if(!m)throw Error('Use page numbers such as 6-8 or 2, 5, 7-9.');
    const start=Number(m[1]),end=Number(m[2]||m[1]);
    if(start<1||end<start||end>total)throw Error('Pages must be between 1 and '+total+'.');
    for(let i=start;i<=end;i++)result.add(i);
  }
  return [...result].sort((a,b)=>a-b);
}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function boundaries(settings) {
  const b=[settings.crop.x,...settings.splits,settings.crop.x+settings.crop.w];
  return b.sort((a,c)=>a-c);
}
function regions(settings) {
  const x=boundaries(settings);
  return x.slice(0,-1).map((left,i)=>({
    x:left,y:settings.crop.y,w:x[i+1]-left,h:settings.crop.h
  }));
}
function cropCanvas(source,rect) {
  const x=clamp(Math.round(rect.x*source.width),0,source.width-1);
  const y=clamp(Math.round(rect.y*source.height),0,source.height-1);
  const w=clamp(Math.round(rect.w*source.width),1,source.width-x);
  const h=clamp(Math.round(rect.h*source.height),1,source.height-y);
  const dst=document.createElement('canvas');
  dst.width=w;dst.height=h;
  dst.getContext('2d').drawImage(source,x,y,w,h,0,0,w,h);
  return dst;
}
function setColumns(settings,n) {
  settings.count=n;
  settings.splits=Array.from({length:n-1},(_,i)=>settings.crop.x+(i+1)*settings.crop.w/n);
}
function updateCrop(settings,crop) {
  settings.crop=crop;
  setColumns(settings,settings.count);
}
function orderedText(pages) {
  return pages.flatMap(page=>page.flatMap(lines=>lines.length?[...lines,'']:[])).join('\n').trim();
}

export async function openPdfImporter(onSave, options={}) {
  const backdrop=node('div',{className:'pdf-import-overlay'});
  const panel=node('section',{className:'pdf-import-panel'});
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','Guided PDF pattern importer');
  const heading=node('h2',{},'Import knitting instructions');
  const description=node('p',{className:'help'},'Prepare each PDF page, then convert and review the instructions before saving a new working pattern. Your original PDF is unchanged.');
  const status=node('p',{className:'pdf-import-status',role:'status'},'Choose the PDF source.');
  status.setAttribute('aria-live','polite');
  const progress=node('progress',{className:'pdf-import-progress',max:100,value:0});progress.hidden=true;
  const sourceArea=node('section',{className:'pdf-import-stage'});
  const settingsArea=node('section',{className:'pdf-import-stage'});settingsArea.hidden=true;
  const reviewArea=node('section',{className:'pdf-import-stage'});reviewArea.hidden=true;
  const buttons=node('div',{className:'row pdf-import-actions'});
  const closeButton=node('button',{type:'button',className:'button secondary'},'Cancel');
  const saveButton=node('button',{type:'button',className:'button',disabled:true},'Save working pattern');
  buttons.append(closeButton,saveButton);
  panel.append(heading,description,status,progress,sourceArea,settingsArea,reviewArea,buttons);
  backdrop.append(panel);document.body.append(backdrop);

  const savedUrl=options.dropboxUrl||'';
  const fromDropbox=node('button',{type:'button',className:'button secondary',disabled:!savedUrl},'Import from saved Dropbox PDF');
  const picker=node('input',{type:'file',accept:'.pdf,application/pdf',className:'field'});
  const range=node('input',{type:'text',className:'field',placeholder:'e.g. 6-8'});
  range.setAttribute('aria-label','PDF page numbers');
  const prepare=node('button',{type:'button',className:'button',disabled:true},'Preview selected pages');
  sourceArea.append(
    node('h3',{},'1. Choose PDF and pages'),
    node('p',{className:'help'},savedUrl?'Your saved Dropbox PDF link is ready.':'No Dropbox PDF linked; select a file from Files.'),
    fromDropbox,
    node('p',{className:'help'},'Or choose a PDF from Files:'),
    picker,
    node('label',{},'Pages to import (blank = all)'),
    range,prepare
  );
  const cards=node('div',{className:'pdf-page-cards'});
  const convert=node('button',{type:'button',className:'button'},'Convert selected reading areas');
  const reset=node('button',{type:'button',className:'button secondary'},'Change page selection');
  const prepButtons=node('div',{className:'row pdf-import-actions'});prepButtons.append(reset,convert);
  settingsArea.append(node('h3',{},'2. Prepare each page'),
    node('p',{className:'help'},'Rotate the page until text is upright. Choose 1–4 columns for each page. Drag a rectangle over the instructions to exclude unwanted text, or adjust its edges with the controls. Adjust the green column dividers when needed. Reading order is top-to-bottom in each column, then left-to-right, page by page.'),
    cards,prepButtons);
  const reviewed=node('textarea',{className:'field pdf-import-review',rows:18});
  reviewed.setAttribute('aria-label','Review extracted knitting instructions');
  const redo=node('button',{type:'button',className:'button secondary'},'Back to page preparation');
  reviewArea.append(node('h3',{},'3. Review and save'),
    node('p',{className:'help'},'Compare the converted text with the page previews. Correct missing stitches, row order, OCR errors, or extra text before saving.'),
    reviewed,redo);

  let busy=false,closed=false,sourceBytes=null,sourceName='Imported PDF';
  let pdf=null,pdfjs=null,ocr=null,settings=[],converted=false;
  const update=(message,value=null)=>{
    status.textContent=message;
    progress.hidden=value===null;
    if(value!==null)progress.value=clamp(value,0,100);
  };
  const setBusy=value=>{
    busy=value;
    fromDropbox.disabled=value||!savedUrl;
    picker.disabled=value;
    prepare.disabled=value||!sourceBytes;
    convert.disabled=value;
    reset.disabled=value;
    redo.disabled=value;
    saveButton.disabled=value||!converted||!reviewed.value.trim();
    closeButton.disabled=value;
  };
  const destroyPdf=async()=>{
    if(pdf){const previous=pdf;pdf=null;await previous.destroy();}
  };
  const close=()=>{
    if(busy||closed)return;
    closed=true;backdrop.remove();
    if(ocr){const previous=ocr;ocr=null;previous.terminate().catch(()=>{});}
    destroyPdf().catch(()=>{});
  };
  closeButton.onclick=close;
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
  const loadSource=async(bytes,name)=>{
    await destroyPdf();
    sourceBytes=new Uint8Array(bytes);
    sourceName=name;
    settings=[];converted=false;reviewed.value='';
    cards.replaceChildren();settingsArea.hidden=true;reviewArea.hidden=true;sourceArea.hidden=false;
    prepare.disabled=false;
    update('PDF loaded. Enter the page range, then preview the selected pages.');
  };
  picker.onchange=async()=>{
    const file=picker.files?.[0];if(!file)return;
    if(!file.name.toLowerCase().endsWith('.pdf')&&file.type!=='application/pdf'){update('Please select a PDF.');return;}
    try{setBusy(true);await loadSource(await file.arrayBuffer(),file.name);}
    catch(err){update('Could not open file: '+err.message);}
    finally{setBusy(false);}
  };
  fromDropbox.onclick=async()=>{
    if(busy)return;
    try{
      setBusy(true);update('Downloading the original PDF from Dropbox…',0);
      if(!globalThis.StudioDropbox?.connected())throw Error('Dropbox is not connected in this browser.');
      const bytes=await globalThis.StudioDropbox.downloadSharedLink(savedUrl);
      await loadSource(bytes,'Dropbox PDF');
    }catch(err){update('Dropbox download failed: '+err.message+'. You can select the same PDF from Files.');}
    finally{setBusy(false);}
  };
  const getPdf=async()=>{
    if(!pdfjs){
      pdfjs=await import(PDFJS);
      pdfjs.GlobalWorkerOptions.workerSrc=PDF_WORKER;
    }
    if(!pdf)pdf=await pdfjs.getDocument({data:sourceBytes.slice()}).promise;
    return pdf;
  };
  const renderPreview=async(setting)=>{
    const target=setting.canvas;
    const page=await pdf.getPage(setting.number);
    const viewport0=page.getViewport({scale:1,rotation:(page.rotate+setting.rotation)%360});
    const scale=Math.min(1.35,820/Math.max(viewport0.width,viewport0.height));
    const viewport=page.getViewport({scale,rotation:(page.rotate+setting.rotation)%360});
    target.width=Math.max(1,Math.round(viewport.width));
    target.height=Math.max(1,Math.round(viewport.height));
    await page.render({canvasContext:target.getContext('2d'),viewport}).promise;
    page.cleanup();
  };
  const refreshOverlay=setting=>{
    const crop=setting.crop,overlay=setting.selection;
    overlay.style.left=(crop.x*100)+'%';overlay.style.top=(crop.y*100)+'%';
    overlay.style.width=(crop.w*100)+'%';overlay.style.height=(crop.h*100)+'%';
    overlay.replaceChildren();
    for(const x of setting.splits){
      const line=node('div',{className:'pdf-split-line'});
      line.style.left=((x-crop.x)/crop.w*100)+'%';
      overlay.append(line);
    }
    setting.sliders.forEach((slider,i)=>{
      slider.min=String(Math.round((crop.x+0.05)*100));
      slider.max=String(Math.round((crop.x+crop.w-0.05)*100));
      slider.value=String(Math.round(setting.splits[i]*100));
    });
  };
  const makePageCard=async setting=>{
    const card=node('section',{className:'pdf-page-card'});
    const title=node('h4',{},'PDF page '+setting.number);
    const rotateLeft=node('button',{type:'button',className:'button secondary small'},'Rotate left');
    const rotateRight=node('button',{type:'button',className:'button secondary small'},'Rotate right');
    const row=node('div',{className:'row pdf-page-controls'});
    const colLabel=node('label',{},'Columns: ');
    const select=node('select',{className:'field'});
    for(let i=1;i<=4;i++)select.append(node('option',{value:String(i)},String(i)));
    select.value=String(setting.count);colLabel.append(select);
    const controls=node('div',{className:'row pdf-page-controls'});
    controls.append(rotateLeft,rotateRight,colLabel);
    const canvas=node('canvas',{className:'pdf-page-canvas'});setting.canvas=canvas;
    const wrapper=node('div',{className:'pdf-page-canvas-wrap'});
    const selection=node('div',{className:'pdf-crop-selection'});setting.selection=selection;
    const surface=node('div',{className:'pdf-crop-draw-surface'});
    wrapper.append(canvas,selection,surface);
    const cropForm=node('div',{className:'pdf-crop-fields'});
    const edges=[['Left','x'],['Top','y'],['Right','right'],['Bottom','bottom']];
    const cropFields={};
    for(const [label,key] of edges){
      const controlLabel=node('label',{},label+' %');
      const field=node('input',{type:'number',className:'field',min:0,max:100,step:1});
      cropFields[key]=field;controlLabel.append(field);cropForm.append(controlLabel);
    }
    const syncCropFields=()=>{
      const c=setting.crop;
      cropFields.x.value=Math.round(c.x*100);
      cropFields.y.value=Math.round(c.y*100);
      cropFields.right.value=Math.round((c.x+c.w)*100);
      cropFields.bottom.value=Math.round((c.y+c.h)*100);
    };
    const applyCrop=()=>{
      const left=clamp(Number(cropFields.x.value)/100,0,.95);
      const top=clamp(Number(cropFields.y.value)/100,0,.95);
      const right=clamp(Number(cropFields.right.value)/100,left+.05,1);
      const bottom=clamp(Number(cropFields.bottom.value)/100,top+.05,1);
      updateCrop(setting,{x:left,y:top,w:right-left,h:bottom-top});
      syncCropFields();renderSplits();refreshOverlay(setting);
    };
    Object.values(cropFields).forEach(field=>field.onchange=applyCrop);
    const splitControls=node('div',{className:'pdf-split-controls'});
    setting.sliders=[];
    const renderSplits=()=>{
      splitControls.replaceChildren();setting.sliders=[];
      for(let i=0;i<setting.count-1;i++){
        const label=node('label',{},'Divider '+(i+1));
        const slider=node('input',{type:'range',step:1,min:0,max:100});
        slider.oninput=()=>{
          const left=i===0?setting.crop.x:setting.splits[i-1]+.05;
          const right=i===setting.splits.length-1?setting.crop.x+setting.crop.w:setting.splits[i+1]-.05;
          setting.splits[i]=clamp(Number(slider.value)/100,left,right);
          refreshOverlay(setting);
        };
        label.append(slider);splitControls.append(label);setting.sliders.push(slider);
      }
      refreshOverlay(setting);
    };
    select.onchange=()=>{setColumns(setting,Number(select.value));renderSplits();};
    const rotate=async degrees=>{
      if(busy)return;
      try{
        setBusy(true);
        setting.rotation=(setting.rotation+degrees+360)%360;
        updateCrop(setting,{x:0,y:0,w:1,h:1});
        await renderPreview(setting);syncCropFields();renderSplits();
        update('PDF page '+setting.number+' rotated. Adjust its reading area, if needed.');
      }catch(err){update('Rotation preview failed: '+err.message);}
      finally{setBusy(false);}
    };
    rotateLeft.onclick=()=>rotate(-90);rotateRight.onclick=()=>rotate(90);
    let start=null;
    surface.onpointerdown=e=>{
      if(busy)return;
      e.preventDefault();surface.setPointerCapture(e.pointerId);
      const rect=surface.getBoundingClientRect();
      start={x:clamp((e.clientX-rect.left)/rect.width,0,1),y:clamp((e.clientY-rect.top)/rect.height,0,1)};
    };
    surface.onpointerup=e=>{
      if(!start)return;
      const rect=surface.getBoundingClientRect(),ex=clamp((e.clientX-rect.left)/rect.width,0,1),ey=clamp((e.clientY-rect.top)/rect.height,0,1);
      const x=Math.min(start.x,ex),y=Math.min(start.y,ey),w=Math.abs(ex-start.x),h=Math.abs(ey-start.y);start=null;
      if(w<.03||h<.03)return;
      updateCrop(setting,{x,y,w,h});syncCropFields();renderSplits();
    };
    surface.onpointercancel=()=>{start=null;};
    const resetCrop=node('button',{type:'button',className:'button secondary small'},'Use full page');
    resetCrop.onclick=()=>{updateCrop(setting,{x:0,y:0,w:1,h:1});syncCropFields();renderSplits();};
    const note=node('p',{className:'help'},'Drag across the page image to select a reading area. Adjust edges or dividers for accuracy.');
    card.append(title,controls,wrapper,note,cropForm,resetCrop,splitControls);
    cards.append(card);await renderPreview(setting);syncCropFields();renderSplits();
  };
  prepare.onclick=async()=>{
    if(busy||!sourceBytes)return;
    try{
      setBusy(true);update('Loading PDF page previews…',0);
      await getPdf();
      const numbers=pagesFromRange(range.value,pdf.numPages);
      if(numbers.length>20)throw Error('For iPhone stability, please select up to 20 pages per import.');
      cards.replaceChildren();settings=[];
      for(let i=0;i<numbers.length;i++){
        const setting={number:numbers[i],rotation:0,count:2,crop:{x:0,y:0,w:1,h:1},splits:[.5],sliders:[]};
        settings.push(setting);
        update('Preparing page '+setting.number+' ('+(i+1)+' of '+numbers.length+')…',Math.round(i/numbers.length*100));
        await makePageCard(setting);
      }
      sourceArea.hidden=true;settingsArea.hidden=false;reviewArea.hidden=true;
      update('Page previews ready. Rotate, select reading areas, and choose columns for each page.',100);
    }catch(err){update('Could not prepare pages: '+err.message);settingsArea.hidden=true;}
    finally{setBusy(false);}
  };
  reset.onclick=()=>{settingsArea.hidden=true;reviewArea.hidden=true;sourceArea.hidden=false;converted=false;saveButton.disabled=true;update('Choose pages and preview again.');};
  const getOcr=async()=>{
    if(!ocr){
      update('Loading OCR for scanned knitting pages…');
      const mod=await import(TESSERACT);
      const createWorker=mod.createWorker||mod.default?.createWorker;
      if(typeof createWorker!=='function')throw Error('The OCR library did not provide a worker.');
      ocr=await createWorker('eng');
    }
    return ocr;
  };
  const ocrPage=async(setting,index)=>{
    const page=await pdf.getPage(setting.number);
    const v0=page.getViewport({scale:1,rotation:(page.rotate+setting.rotation)%360});
    // Bound raster size on mobile. Crop and OCR one column at a time.
    const scale=Math.min(2.5,2200/Math.max(v0.width,v0.height));
    const viewport=page.getViewport({scale,rotation:(page.rotate+setting.rotation)%360});
    const full=node('canvas');
    full.width=Math.max(1,Math.round(viewport.width));full.height=Math.max(1,Math.round(viewport.height));
    try{
      await page.render({canvasContext:full.getContext('2d'),viewport}).promise;
      const engine=await getOcr();
      const result=[];
      for(let i=0;i<setting.count;i++){
        update('Reading page '+setting.number+', column '+(i+1)+' of '+setting.count+'…',Math.round(10+80*(index+(i+1)/setting.count)/settings.length));
        const portion=cropCanvas(full,regions(setting)[i]);
        try{
          const response=await engine.recognize(portion);
          result.push((response.data?.text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean));
        }finally{portion.width=0;portion.height=0;}
      }
      return result;
    }finally{
      page.cleanup();full.width=0;full.height=0;
    }
  };
  convert.onclick=async()=>{
    if(busy||!pdf||!settings.length)return;
    try{
      setBusy(true);converted=false;reviewArea.hidden=true;
      const result=[];
      for(let i=0;i<settings.length;i++)result.push(await ocrPage(settings[i],i));
      reviewed.value=orderedText(result);
      converted=true;
      settingsArea.hidden=false;reviewArea.hidden=false;
      update('Conversion complete. Review the text carefully before saving.',100);
      reviewArea.scrollIntoView({block:'start'});
    }catch(err){update('Conversion failed: '+err.message+'. Your original PDF is unchanged.');}
    finally{setBusy(false);}
  };
  redo.onclick=()=>{reviewArea.hidden=true;converted=false;saveButton.disabled=true;settingsArea.scrollIntoView({block:'start'});update('Adjust page rotation, crop, or column dividers, then convert again.');};
  reviewed.oninput=()=>{saveButton.disabled=busy||!converted||!reviewed.value.trim();};
  saveButton.onclick=()=>{
    if(busy||!converted||!reviewed.value.trim())return;
    onSave({name:sourceName,columns:[reviewed.value.trim()]});
    close();
  };
  picker.focus();
}
