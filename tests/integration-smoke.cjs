const {chromium,webkit,devices}=require('playwright');
const assert=require('node:assert/strict');

async function runSyncPolicyTests(){
 const vm=require('node:vm');
 const fs=require('node:fs');
 const nodeCrypto=require('node:crypto');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../dropbox.js'),'utf8');
 const hash=data=>nodeCrypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const canonical=data=>{const x=structuredClone(data);delete x.active;return x};
 const doc=data=>{const shared=canonical(data);return {format:'sarah-studio-backup',version:2,checksumAlgorithm:'SHA-256',checksum:hash(shared),exportedAt:new Date().toISOString(),data:shared}};
 const backend={current:null,rev:0,backups:[]};
 const success=body=>({ok:true,status:200,json:async()=>structuredClone(body),text:async()=>JSON.stringify(body)});
 const error=(status,message)=>({ok:false,status,text:async()=>message});
 const fetchMock=async(url,opts={})=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/files/get_metadata'))return backend.current?success({rev:String(backend.rev)}):error(409,'not found');
  if(path.endsWith('/files/download'))return backend.current?success(backend.current):error(409,'not found');
  if(path.endsWith('/files/upload')){
   const args=JSON.parse(opts.headers['Dropbox-API-Arg']);
   const data=JSON.parse(opts.body);
   if(args.path==='/studio-current.json'){
    const mode=args.mode;
    if(mode['.tag']==='update'&&mode.update!==String(backend.rev))return error(409,'revision changed');
    if(mode['.tag']==='add'&&backend.current)return error(409,'already exists');
    backend.current=data;backend.rev++;
    return success({rev:String(backend.rev)});
   }
   backend.backups.push(data);return success({rev:'backup'});
  }
  throw Error('Unexpected Dropbox API call: '+url);
 };
 function device(initial){
  let data=structuredClone(initial);
  const storage=new Map(),session=new Map([['studio-db-token','mock-token'],['studio-db-token-expiry','999999999999999']]);
  const webStore=map=>({getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
  const ctx=vm.createContext({fetch:fetchMock,localStorage:webStore(storage),sessionStorage:webStore(session),crypto:nodeCrypto.webcrypto,TextEncoder,URL,URLSearchParams,structuredClone,Date,console,btoa:x=>Buffer.from(x,'binary').toString('base64'),location:{href:'https://example.org',origin:'https://example.org',pathname:'/'},history:{replaceState(){}}});
  const dropbox=vm.runInContext(source+'\nStudioDropbox',ctx);
  const local={
   checksum:async()=>hash(canonical(data)),
   checksumOf:async value=>hash(canonical(value)),
   isDemo:async()=>false,
   export:async()=>doc(data)
  };
  return {
   get data(){return data},
   edit:(count,time)=>{data.projects[0].sections[0].count=count;data.updated=time;data.dataChangedAt=time},
   select:name=>{data.active=name},
   sync:()=>dropbox.synchronizeAutomatic(local,async remote=>{
    assert.equal(remote.checksum,hash(canonical(remote.data)),'backup checksum valid');
   },async(remote,expected)=>{
    assert.equal(await local.checksum(),expected,'local data unchanged before applying');
    const active=data.active;data=structuredClone(remote);data.active=active;
   })
  };
 }
 function state(count,time,active='p1'){
  return {active,projects:[{id:'p1',name:'Sample',sections:[{id:'s1',count}],versions:[],finishingTasks:[],versionSectionStates:{}}],yarn:[],tools:[],gifts:[],ideas:[],updated:time,dataChangedAt:time};
 }
 const t1='2026-11-02T19:00:00.000Z',t2='2026-11-02T19:01:00.000Z',t3='2026-11-02T19:02:00.000Z',t4='2026-11-02T19:03:00.000Z',t5='2026-11-02T19:04:00.000Z';
 const ipad=device(state(5,t1)),iphone=device(state(5,t1,'other'));
 assert.equal(await ipad.sync(),'uploaded','first device initializes Dropbox');
 assert.equal(await iphone.sync(),'already up to date','different selected project is not a data change');
 ipad.edit(6,t2);assert.equal(await ipad.sync(),'uploaded','iPad row change uploads');
 assert.equal(await iphone.sync(),'downloaded','iPhone gets iPad edit automatically');
 assert.equal(iphone.data.projects[0].sections[0].count,6);
 iphone.edit(7,t3);assert.equal(await iphone.sync(),'uploaded','iPhone newer edit uploads');
 assert.equal(await ipad.sync(),'downloaded','iPad gets iPhone edit automatically');
 assert.equal(ipad.data.projects[0].sections[0].count,7);
 ipad.edit(8,t4);iphone.edit(9,t5);
 assert.equal(await ipad.sync(),'uploaded','earlier concurrent edit uploads');
 assert.equal(await iphone.sync(),'uploaded','later concurrent edit replaces earlier one');
 assert.equal(await ipad.sync(),'downloaded','earlier editing device receives later edit');
 assert.equal(ipad.data.projects[0].sections[0].count,9);
 assert.ok(backend.backups.length>=4,'previous data versions are backed up');
 // Legacy data predates actual-edit tracking; choosing cloud avoids an old
 // iPhone navigation timestamp taking precedence over the established iPad copy.
 const legacy=state(2,'2026-11-02T19:50:00.000Z');
 delete legacy.dataChangedAt;
 const oldPhone=device(legacy);
 assert.equal(await oldPhone.sync(),'downloaded','legacy device defers to established cloud records');
 assert.equal(oldPhone.data.projects[0].sections[0].count,9);
 console.log('PASS automatic sync: last actual edit wins, both directions, legacy safety, backups');
}

(async()=>{
 await runSyncPolicyTests();
 const failures=[];
 for(const [engine,device,options] of [
  ['chromium','desktop',{viewport:{width:1280,height:900}}],
  ['webkit','ipad',{viewport:{width:820,height:1180},isMobile:true,hasTouch:true}],
  ['webkit','iphone',{...devices['iPhone 13']}]
 ]){
  const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
  const context=await browser.newContext(options);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function navigate(name){
   let target=page.locator('.sidebar [data-nav="'+name+'"]:visible, .bottom-nav [data-nav="'+name+'"]:visible');
   if(!await target.count()){
    await page.locator('.bottom-nav [data-action="mobileMore"]:visible').click();
    target=page.locator('.mobile-more-panel [data-nav="'+name+'"]:visible');
   }
   await target.first().click();
  }
  try{
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('.counter-card .counter-number').waitFor({timeout:15000});
   const first=await page.locator('#activeProject').inputValue();
   assert.ok(first,'active project selected on Home');
   assert.equal(await page.locator('.pattern-card').count(),1);
   assert.equal(await page.locator('.video-card').count(),1);
   await navigate('Projects');
   assert.equal(await page.locator('.kanban-column').count(),5);
   await page.locator('[data-project-view="list"]').click();
   assert.equal(await page.locator('#projectStatusFilter').count(),1);
   assert.equal(await page.locator('#projectCraftFilter').count(),1);
   assert.equal(await page.locator('#projectStatusSort').count(),0,'removed status sort');
   assert.equal(await page.locator('#projectCraftSort').count(),1);
   await page.locator('[data-editproject]').first().click();
   await page.locator('#dialogForm select[name="status"]').selectOption('On Hold');
   await page.locator('#dialogForm select[name="craftType"]').selectOption('Crochet');
   await page.locator('#dialogForm button[type="submit"]').click();
   await page.locator('#projectStatusFilter').selectOption('On Hold');
   await page.locator('#projectCraftFilter').selectOption('Crochet');
   assert.ok(await page.locator('[data-editproject]').count()>0,'combined project filters');
   await navigate('Home');
   assert.equal(await page.locator('#activeProject').inputValue(),first,'project remains selected across navigation');
   await page.locator('.counter-card .counter-number').waitFor();
   const before=Number(await page.locator('.counter-card .counter-number').innerText());
   await page.locator('.counter-card [data-action="plus"]').click();
   await page.evaluate(()=>window.StudioPersistence.flush());
   await page.reload();
   await page.locator('.counter-card .counter-number').waitFor({timeout:15000});
   assert.equal(Number(await page.locator('.counter-card .counter-number').innerText()),before+1,'row counter persists');
   // Persist the Dropbox PDF URL, then simulate a fresh Safari session on the same browser profile.
   await page.locator('[data-nav="Home"]:visible').first().click().catch(async()=>navigate('Home'));
   await page.locator('.project-selector [data-action="setDropboxLink"]').click();
   const savedPdf='https://www.dropbox.com/scl/fi/test-pattern/sample.pdf?rlkey=test';
   await page.locator('#dialogForm input[name="url"]').fill(savedPdf);
   await page.locator('#dialogForm button[type="submit"]').click();
   await page.locator('#dialogForm').waitFor({state:'detached',timeout:15000});
   await page.evaluate(()=>window.StudioPersistence.flush());
   await page.locator('.project-selector [data-action="setDropboxLink"]').filter({hasText:'Change link'}).waitFor({timeout:15000});
   await page.reload();
   await page.locator('.counter-card .counter-number').waitFor({timeout:15000});
   await page.locator('.project-selector [data-action="setDropboxLink"]').filter({hasText:'Change link'}).waitFor({timeout:15000});
   await page.locator('.project-selector [data-action="setDropboxLink"]').click();
   assert.equal(await page.locator('#dialogForm input[name="url"]').inputValue(),savedPdf,'saved Dropbox URL restored');
   await page.locator('.modal [data-action="close"]').click();
   await navigate('Projects');
   assert.equal(await page.locator('[data-kanban-status="On Hold"] [data-project-card]').count(),1,'project edit persists in board');
   // Regression coverage for newly released non-project controls.
   await navigate('Ideas & Requests');
   await page.locator('[data-action="newIdea"]').click();
   await page.locator('#dialogForm input[name="title"]').fill('Sync regression idea');
   await page.locator('#dialogForm button[type="submit"]').click();
   await page.locator('[data-edit-idea]').first().click();
   await page.locator('#dialogForm input[name="title"]').fill('Edited sync regression idea');
   await page.locator('#dialogForm button[type="submit"]').click();
   assert.ok(await page.getByText('Edited sync regression idea').count()>0);
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('[data-delete-idea]').first().click();
   assert.equal(await page.locator('[data-edit-idea]').count(),0);

   await navigate('Tools');
   await page.locator('[data-action="newTool"]').click();
   await page.locator('#dialogForm input[name="name"]').fill('Test needle');
   await page.locator('#dialogForm button[type="submit"]').click();
   await page.locator('[data-edit-tool]').first().click();
   await page.locator('#dialogForm input[name="name"]').fill('Edited needle');
   await page.locator('#dialogForm button[type="submit"]').click();
   assert.ok(await page.getByText('Edited needle').count()>0);
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('[data-delete-tool]').first().click();
   assert.equal(await page.locator('[data-edit-tool]').count(),0);

   await navigate('Yarn Inventory');
   await page.locator('[data-action="newYarn"]').click();
   await page.locator('#dialogForm input[name="name"]').fill('Test yarn');
   await page.locator('#dialogForm button[type="submit"]').click();
   await page.locator('[data-edit-yarn]').first().click();
   await page.locator('#dialogForm input[name="name"]').fill('Edited yarn');
   await page.locator('#dialogForm button[type="submit"]').click();
   assert.ok(await page.getByText('Edited yarn').count()>0);
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('[data-delete-yarn]').first().click();
   assert.equal(await page.locator('[data-edit-yarn]').count(),0);

   await navigate('Settings');
   assert.equal(await page.locator('#keepScreenAwake').count(),1);
   assert.equal(await page.locator('#keepScreenAwake').isChecked(),false);
   await page.locator('#keepScreenAwake').check();
   await page.reload();
   await page.locator('.counter-card .counter-number').waitFor({timeout:15000});
   await navigate('Settings');
   assert.equal(await page.locator('#keepScreenAwake').isChecked(),true,'screen wake preference persists');
   await page.locator('#keepScreenAwake').uncheck();

   // Run PDF note UI regression against a local fake PDF renderer. No Dropbox account needed.
   await page.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs',async route=>{
    await route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:
      'export const GlobalWorkerOptions={};export const getDocument=()=>({promise:Promise.resolve({numPages:2,getPage:async()=>({rotate:0,getViewport:({scale})=>({width:300*scale,height:400*scale}),render:()=>({promise:Promise.resolve()})}),destroy:async()=>{}})});'
    });
   });
   await page.evaluate(async()=>{
    StudioDropbox.connected=()=>true;
    const objects=[
     '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
     '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
     '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> /Contents 4 0 R >>\nendobj\n',
     '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n'
    ];
    let pdfData='%PDF-1.4\n';const offsets=[0];
    for(const obj of objects){offsets.push(pdfData.length);pdfData+=obj}
    const xrefOffset=pdfData.length;
    pdfData+='xref\n0 5\n0000000000 65535 f \n';
    pdfData+=offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('');
    pdfData+='trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF\n';
    StudioDropbox.downloadSharedLink=async()=>new TextEncoder().encode(pdfData);
    const mod=await import('./pdf-reader.js');
    const initial={page:1,mode:'pan',notes:{'1':[{x:.3,y:.2,text:'Original saved instruction'}]}};
    window.pdfNotesState=initial;
    window.testPdfReader=await mod.openPdfReader({
      url:'https://www.dropbox.com/fake.pdf',reading:initial,
      onChange:x=>{window.pdfNotesState=x},onCounter:{get:()=>({section:'',count:0,rows:0})}
    });
   });
   await page.waitForFunction(()=>{const x=document.querySelector('.studio-reader-status')?.textContent||'';return x.includes('Ready')||x.startsWith('Cannot open')||x.startsWith('Could not render')},{timeout:15000});
   const pdfStatus=await page.locator('.studio-reader-status').innerText();
   assert.match(pdfStatus,/Ready/,'PDF initialization: '+pdfStatus);
   const pin=page.locator('.studio-reader-note-pin');
   assert.equal(await pin.count(),1,'existing note pin remains visible');
   assert.equal(await pin.first().innerText(),'','note pin uses icon rather than word');
   assert.equal(await pin.first().locator('svg').count(),1,'note icon renders');
   const visual=await pin.first().evaluate(el=>{const css=getComputedStyle(el),icon=getComputedStyle(el.querySelector('svg'));return {background:css.backgroundColor,width:parseInt(icon.width,10),hasText:el.textContent.trim(),transform:css.transform}});
   assert.equal(visual.background,'rgba(0, 0, 0, 0)','note icon has transparent background');
   assert.ok(visual.width<=20,'small note icon');
   const markerStyle=await pin.first().evaluate(el=>{
    const style=getComputedStyle(el),svg=getComputedStyle(el.querySelector('svg'));
    return {color:style.color,opacity:svg.opacity,borderWidth:style.borderTopWidth,borderRadius:style.borderTopLeftRadius,fill:svg.fill};
   });
   assert.equal(markerStyle.color,'rgb(224, 173, 0)','page icon is yellow');
   assert.equal(markerStyle.opacity,'1','page icon has opaque yellow fill');
   assert.equal(markerStyle.fill,'rgb(224, 173, 0)','page glyph interior is solid yellow');
   assert.equal(markerStyle.borderWidth,'0px','no circular border');
   assert.equal(markerStyle.borderRadius,'0px','no circular background shape');
   assert.equal(visual.hasText,'','no opaque Note label');
   await page.evaluate(()=>{document.querySelector('.studio-reader-toolbar button[aria-pressed="false"]')?.focus()});
   await page.locator('.studio-reader-toolbar button', {hasText:'Add note'}).click();
   await pin.first().click();
   await page.locator('.studio-reader-note-content').getByText('Original saved instruction').waitFor();
   assert.equal(await page.locator('.studio-reader-note-dialog').count(),1,'saved note opens directly');
   await page.locator('.studio-reader-note-actions button', {hasText:'Close'}).click();
   assert.equal(await page.locator('.studio-reader-note-dialog').count(),0,'close dismisses without edit');
   await pin.first().click();
   await page.locator('.studio-reader-note-actions button', {hasText:'Edit'}).click();
   await page.locator('.studio-reader-note-editor').fill('Edited saved instruction');
   await page.locator('.studio-reader-note-actions button', {hasText:'Cancel'}).click();
   await page.locator('.studio-reader-note-content').getByText('Original saved instruction').waitFor();
   await page.locator('.studio-reader-note-actions button', {hasText:'Edit'}).click();
   await page.locator('.studio-reader-note-editor').fill('Edited saved instruction');
   await page.locator('.studio-reader-note-actions button', {hasText:'Save'}).click();
   assert.equal(await page.evaluate(()=>window.pdfNotesState.notes['1'][0].text),'Edited saved instruction');
   await page.locator('.studio-reader-note-pin').first().click();
   await page.locator('.studio-reader-note-content').getByText('Edited saved instruction').waitFor();
   // Existing notes can be moved by tapping a new page location, preserving text.
   await page.locator('.studio-reader-note-actions button', {hasText:'Move'}).click();
   const pageSize=await page.locator('.studio-reader-overlay').boundingBox();
   await page.locator('.studio-reader-overlay').click({position:{x:Math.floor(pageSize.width*.75),y:Math.floor(pageSize.height*.7)}});
   const moved=await page.evaluate(()=>window.pdfNotesState.notes['1'][0]);
   assert.ok(Math.abs(moved.x-.3)>.05,'note moved horizontally by page tap');
   assert.ok(Math.abs(moved.y-.2)>.05,'note moved vertically by page tap');
   assert.equal(moved.text,'Edited saved instruction','move preserves note text');
   await page.locator('.studio-reader-note-pin').click();
   await page.locator('.studio-reader-note-content').getByText('Edited saved instruction').waitFor();
   // Move by dragging the note marker; note data saves with the new position.
   await page.locator('.studio-reader-note-actions button', {hasText:'Move'}).click();
   const dragStart=await page.locator('.studio-reader-note-pin').boundingBox();
   const startX=dragStart.x+dragStart.width/2,startY=dragStart.y+dragStart.height/2;
   await page.mouse.move(startX,startY);
   await page.mouse.down();
   await page.mouse.move(startX+55,startY+45,{steps:5});
   await page.mouse.up();
   const dragged=await page.evaluate(()=>window.pdfNotesState.notes['1'][0]);
   assert.ok(Math.abs(dragged.x-moved.x)>.02,'drag moves note to a new x position');
   assert.equal(dragged.text,'Edited saved instruction','drag preserves note text');
   await page.locator('.studio-reader-note-pin').click();
   await page.locator('.studio-reader-note-content').getByText('Edited saved instruction').waitFor();
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('.studio-reader-note-actions button', {hasText:'Delete'}).click();
   assert.equal(await page.evaluate(()=>window.pdfNotesState.notes['1'].length),0,'delete removes note');
   await page.locator('.studio-reader-toolbar button', {hasText:'Add note'}).click();
   await page.locator('.studio-reader-overlay').click({position:{x:240,y:240}});
   await page.locator('.studio-reader-note-editor').fill('New separate note');
   await page.locator('.studio-reader-note-actions button', {hasText:'Save'}).click();
   assert.equal(await page.evaluate(()=>window.pdfNotesState.notes['1'][0].text),'New separate note');
   await page.evaluate(()=>window.testPdfReader.close());
   console.log('PASS PDF note UI '+engine+' '+device);
   assert.deepEqual(errors,[],'no uncaught errors');
   console.log('PASS integration '+engine+' '+device);
  }catch(e){failures.push(engine+' '+device+': '+e.stack);console.error('FAIL integration '+engine+' '+device,e)}
  await context.close();await browser.close();
 }
 if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
