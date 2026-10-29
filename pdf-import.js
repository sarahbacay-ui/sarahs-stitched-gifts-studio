// Browser-only PDF text extraction. Original PDFs are not uploaded or saved.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

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

export async function openPdfImporter(onSave) {
  const overlay = control('div', { className: 'pdf-import-overlay' });
  const panel = control('section', { className: 'pdf-import-panel' });
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Import pattern instructions from PDF');
  const heading = control('h2', {}, 'Import instructions from PDF');
  const intro = control('p', { className: 'help' },
    'Choose a PDF from Files or Dropbox on your device. Text is extracted on this device. The original PDF remains in Dropbox. Review and correct the instructions before saving.');
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
  const status = control('p', { className: 'help', role: 'status' }, 'Choose a PDF to extract its instructions.');
  const preview = control('div', { className: 'pdf-import-preview' });
  const actions = control('div', { className: 'row pdf-import-actions' });
  const cancel = control('button', { type: 'button', className: 'button secondary' }, 'Cancel');
  const save = control('button', { type: 'button', className: 'button', disabled: true }, 'Save working pattern');
  actions.append(cancel, save);
  panel.append(heading, intro, picker, options, status, preview, actions);
  overlay.append(panel);
  document.body.append(overlay);
  const close = () => overlay.remove();
  cancel.onclick = close;
  let pages = null, latest = [], loading = false;
  const doExtract = async () => {
    if (!pages || loading) return;
    const n = Number(columns.value);
    latest = Array.from({length:n},()=>[]);
    for (const page of pages) {
      const segments = reconstruct(page.items, page.width, n);
      segments.forEach((lines,i)=> {
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
    save.disabled = !latest.some(lines=>lines.length);
    status.textContent = 'Review the text and column order before saving. Charts, symbols, and scanned pages may need manual correction.';
  };
  columns.onchange = doExtract;
  pageRange.onchange = () => { if (picker.files?.[0]) picker.onchange(); };
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    loading = true;
    save.disabled = true;
    preview.replaceChildren();
    status.textContent = 'Extracting text from '+file.name+'...';
    try {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Select a PDF file.');
      const pdfjs = await import(PDFJS);
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
      const task = pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer())});
      const doc = await task.promise;
      pages = [];
      let count = 0;
      try {
        const selected = selectedPages(pageRange.value, doc.numPages);
        for (const p of selected) {
          const page = await doc.getPage(p);
          const text = await page.getTextContent();
          const viewport = page.getViewport({scale:1});
          pages.push({items:text.items, width:viewport.width});
          count += text.items.filter(x=>x.str && x.str.trim()).length;
        }
      } finally { await doc.destroy(); }
      if (!count) throw new Error('No selectable text was found. This PDF may be scanned and require OCR, which is not available in this version.');
      loading = false;
      await doExtract();
      status.textContent = 'Extracted '+pages.length+' selected page(s). Review the text, especially column order, charts, and symbols.';
    } catch (err) {
      pages = null;
      status.textContent = 'Could not extract this PDF: '+(err?.message || String(err));
    } finally { loading = false; }
  };
  save.onclick = () => {
    const text = [...preview.querySelectorAll('textarea')].map(x=>x.value.trim());
    if (!text.some(Boolean)) return;
    onSave({name: picker.files?.[0]?.name || 'Imported PDF', columns: text});
    close();
  };
  picker.focus();
}
