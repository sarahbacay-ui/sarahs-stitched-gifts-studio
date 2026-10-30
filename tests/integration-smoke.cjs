const {chromium,webkit,devices}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
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
   await page.locator('.pattern-card [data-action="setDropboxLink"]').click();
   const savedPdf='https://www.dropbox.com/scl/fi/test-pattern/sample.pdf?rlkey=test';
   await page.locator('#dialogForm input[name="url"]').fill(savedPdf);
   page.once('dialog',async dialog=>{throw Error('Dropbox save error: '+dialog.message())});
   await page.locator('#dialogForm button[type="submit"]').click();
   await page.locator('#dialogForm').waitFor({state:'detached',timeout:15000});
   await page.evaluate(()=>window.StudioPersistence.flush());
   await page.locator('.pattern-card [data-action="setDropboxLink"]').filter({hasText:'Change link'}).waitFor({timeout:15000});
   await page.reload();
   await page.locator('.counter-card .counter-number').waitFor({timeout:15000});
   await page.locator('.pattern-card [data-action="setDropboxLink"]').filter({hasText:'Change link'}).waitFor({timeout:15000});
   await page.locator('.pattern-card [data-action="setDropboxLink"]').click();
   assert.equal(await page.locator('#dialogForm input[name="url"]').inputValue(),savedPdf,'saved Dropbox URL restored');
   await page.locator('.modal [data-action="close"]').click();
   await navigate('Projects');
   assert.equal(await page.locator('[data-kanban-status="On Hold"] [data-project-card]').count(),1,'project edit persists in board');
   assert.deepEqual(errors,[],'no uncaught errors');
   console.log('PASS integration '+engine+' '+device);
  }catch(e){failures.push(engine+' '+device+': '+e.stack);console.error('FAIL integration '+engine+' '+device,e)}
  await context.close();await browser.close();
 }
 if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
