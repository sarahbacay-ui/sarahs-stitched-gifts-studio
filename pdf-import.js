// Browser-only PDF text extraction. Original PDFs are not uploaded or saved.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';

function reconstruct(items, width, columns) {
  const result = Array.from({ length: columns }, () => []);
  const lanes = Array.from({ length: columns }, () => []);
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = Number(item.transform?.[4] || 0);
    const y = Number(item.transform?.[5] || 0);
    // Assign using the text start position. This is an estimate, not guaranteed PDF reading order.
    const lane = Math.min(columns - 1, Math.max(0, Math.floor(x / (width / columns))));
    lanes[lane].push({ text: item.str, x, y, w: Number(item.width) || 0 });
  }
  for (let c = 0; c < columns; c++) {
    const rows = [];
    for (const part of lanes[c].sort((a,b) => b.y - a.y || a.x - b.x)) {
      let row = rows.find(r => Math.abs(r.y - part.y) < 3.5);
      if (!row) { row = { y: part.y, parts: [] }; rows.push(row); }
      row.parts.push(part);
    }
    rows.sort((a,b) => b.y - a.y);
    result[c] = rows.map(r => {
      const parts = r.parts.sort((a,b) => a.x - b.x);
      let line = '', right = -1;
      for (const p of parts) {
        if (line && p.x > right + 1.5 && !/\s$/.test(line)) line += ' ';
        line += p.text;
        right = Math.max(right, p.x + p.w);
      }
      return line.trim();
    }).filter(Boolean);
  }
  return result;
}

// Page numbers are 1-based PDF file pages, not page labels printed within the pattern.
function selectedPages(input, total) {
  const text = input.trim();
  if (!text) return Array.from({length:total}, (_,i)=>i+1);
  const selected = new Set();
  for (const token of text.split(',')) {
    const part = token.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error('Use page numbers such as 6-8 or 2, 5, 7-9.');
    const start = Number(match[1]), end = match[2] ? Number(match[2]) : start;
    if (start<1 || end<start || end>total) throw new Error('Page selection must be between 1 and '+total+'.');
    for (let n=start;n<=end;n++) selected.add(n);
  }
  return [...selected].sort((a,b)=>a-b);
}

function control(tag, props, label) {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  if (label != null) node.textContent = label;
  return node;
}

export async function openPdfImporter(onSave, options={}) {
  const overlay = control('div', { className: 'pdf-import-overlay' });
  const panel = control('section', { className: 'pdf-import-panel' });
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Import pattern instructions from PDF');
  const heading = control('h2', {}, 'Import instructions from PDF');
  const intro = control('p', { className: 'help' },
    'Choose a PDF from Files or Dropbox on your device. Text is extracted on this device. The original PDF remains in Dropbox. Review and correct the instructions before saving.');
  const savedLink=options.dropboxUrl||'';
  const savedBox=control('div', {className:'pdf-import-saved-link'});
  const savedDescription=control('p', {className:'help'}, savedLink?'Original PDF link already saved in this project. No need to paste it again.':'No Dropbox PDF is linked to this project yet.');
  const useSaved=control('button', {type:'button',className:'button secondary small',disabled:!savedLink},'Import from saved Dropbox PDF');
  savedBox.append(savedDescription);
  if(savedLink)savedBox.append(useSaved);
  const picker = control('input', { type: 'file', accept: 'application/pdf,.pdf', className: 'field' });
  picker.setAttribute('aria-label', 'Choose PDF file');
  const options = control('div', { className: 'pdf-import-options' });
  const label = control('label', {}, 'Printed columns per page: ');
  const columns = control('select', { className: 'field' });
  for (let n=1; n<=3; n++) columns.append(control('option', { value: String(n) }, String(n)));
  label.append(columns);
  options.append(label);
  const pageLabel = control('label', {}, 'Pages to convert (blank = all): ');
  const pageRange = control('input', { type:'text', className:'field', placeholder:'e.g. 6-8 or 2, 5, 7-9' });
  pageRange.setAttribute('aria-label','PDF file page numbers to convert');
  pageLabel.append(pageRange);
  options.append(pageLabel);
  const forceLabel = control('label', { className: 'pdf-ocr-choice' });
  const forceOCR = control('input', { type: 'checkbox' });
  forceLabel.append(forceOCR, document.createTextNode(' Use OCR even if selectable text exists'));
  options.append(forceLabel);
  const status = control('p', { className: 'help', role: 'status' }, 'Choose a PDF to extract its instructions.');
  const preview = control('div', { className: 'pdf-import-preview' });
  const actions = control('div', { className: 'row pdf-import-actions' });
  const cancel = control('button', { type: 'button', className: 'button secondary' }, 'Cancel');
  const save = control('button', { type: 'button', className: 'button', disabled: true }, 'Save working pattern');
  actions.append(cancel, save);
  panel.append(heading, intro, savedBox, control('p',{className:'help'},'Or select the PDF from Files if Dropbox does not allow direct access:'), picker, options, status, preview, actions);
  overlay.append(panel);
  document.body.append(overlay);
  const close = () => { if (loading) return; overlay.remove(); if (worker) { const activeWorker = worker; worker = null; activeWorker.terminate().catch(()=>{}); } };
  cancel.onclick = close;
  let latest = [], loading = false, worker = null, sourceBytes = null, sourceName = '';
  const display = (pages, count, ocrCount) => {
    const n = Number(columns.value);
    latest = Array.from({length:n},()=>[]);
    for (const page of pages) {
      page.forEach((lines,i)=> {
        if (latest[i].length && lines.length) latest[i].push('');
        latest[i].push(...lines);
      });
    }
    preview.replaceChildren();
    latest.forEach((lines,i) => {
      const section = control('label', {className:'pdf-preview-column'});
      section.append(control('strong', {}, 'Column '+(i+1)));
      const area = control('textarea', {className:'field', rows:12, value:lines.join('\n')});
      area.setAttribute('aria-label','Extracted instructions, column '+(i+1));
      section.append(area);
      preview.append(section);
    });
    save.disabled = !latest.some(lines=>lines.some(x=>x.trim()));
    status.textContent = 'Processed '+count+' selected page(s), OCR used on '+ocrCount+'. Review stitch counts, abbreviations, symbols and column order before saving.';
  };
  const getWorker = async () => {
    if (!worker) {
      status.textContent = 'Loading free OCR for scanned pages. The first download may take a moment...';
      const {createWorker} = await import(TESSERACT);
      worker = await createWorker('eng');
    }
    return worker;
  };
  const recognizePage = async (page, n, pageNo) => {
    const viewportBase = page.getViewport({scale:1});
    // Keep the longest raster dimension under 2400 pixels for mobile memory.
    const scale = Math.min(2.5, 2400 / Math.max(viewportBase.width, viewportBase.height));
    const viewport = page.getViewport({scale});
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    if (!ctx) throw new Error('Could not create an image for OCR.');
    const render = page.render({canvasContext:ctx, viewport});
    await render.promise;
    const engine = await getWorker();
    const extracted = [];
    try {
      for(let col=0;col<n;col++) {
        status.textContent = 'Reading scanned PDF page '+pageNo+', column '+(col+1)+' of '+n+'...';
        const start = Math.floor(col*canvas.width/n);
        const end = Math.floor((col+1)*canvas.width/n);
        const slice = document.createElement('canvas');
        slice.width = end-start;
        slice.height = canvas.height;
        slice.getContext('2d').drawImage(canvas, start,0,slice.width,slice.height,0,0,slice.width,slice.height);
        const response = await engine.recognize(slice);
        extracted.push(response.data.text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean));
        slice.width = 0; slice.height = 0;
      }
      return extracted;
    } finally {
      canvas.width = 0; canvas.height = 0;
    }
  };
  const processPDF = async () => {
    if (!sourceBytes || loading) return;
    loading = true; save.disabled = true; preview.replaceChildren();
    status.textContent = 'Opening '+sourceName+'...';
    let pdf = null;
    try {
      const pdfjs = await import(PDFJS);
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
      pdf = await pdfjs.getDocument({data:sourceBytes.slice()}).promise;
      const selection = selectedPages(pageRange.value,pdf.numPages);
      const n = Number(columns.value), collected = [];
      let scanned = 0;
      for (const p of selection) {
        status.textContent = 'Processing page '+p+' of '+pdf.numPages+'...';
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const items = content.items.filter(x=>x.str && x.str.trim());
        const needsOCR = forceOCR.checked || items.length < 6;
        if (needsOCR) {
          collected.push(await recognizePage(page,n,p));
          scanned++;
        } else {
          const viewport = page.getViewport({scale:1});
          collected.push(reconstruct(content.items,viewport.width,n));
        }
        page.cleanup();
      }
      display(collected,selection.length,scanned);
    } catch (err) {
      save.disabled = true;
      preview.replaceChildren();
      status.textContent = 'Could not convert the selected pages: '+(err?.message||String(err));
    } finally {
      loading = false;
      if (pdf) await pdf.destroy();
    }
  };
  columns.onchange = processPDF;
  pageRange.onchange = processPDF;
  forceOCR.onchange = processPDF;
  picker.onchange = async () => {
    const file=picker.files?.[0];
    if(!file)return;
    if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){status.textContent='Select a PDF file.';return;}
    sourceName=file.name;
    sourceBytes=new Uint8Array(await file.arrayBuffer());
    processPDF();
  };
  useSaved.onclick = async () => {
    if(!savedLink || loading)return;
    useSaved.disabled=true;
    status.textContent='Opening the PDF from the saved Dropbox link...';
    try {
      if(!StudioDropbox.connected())throw Error('Dropbox is not connected in this browser session.');
      sourceBytes=await StudioDropbox.downloadSharedLink(savedLink);
      sourceName=decodeURIComponent(new URL(savedLink).pathname.split('/').pop()||'Dropbox pattern.pdf');
      if(!sourceName.toLowerCase().endsWith('.pdf'))sourceName='Dropbox pattern.pdf';
      await processPDF();
    } catch (err) {
      status.textContent='Could not read the saved link directly: '+(err?.message||String(err))+'. You can select the same PDF from Files below, without re-entering its Dropbox link.';
    } finally {useSaved.disabled=false;}
  };
  save.onclick = () => {
    const text = [...preview.querySelectorAll('textarea')].map(x=>x.value.trim());
    if (!text.some(Boolean)) return;
    onSave({name: sourceName || 'Imported PDF', columns: text});
    close();
  };
  picker.focus();
}
