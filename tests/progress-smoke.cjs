const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true});
 const failures=[];
 for (const [name,contextOptions] of [['desktop',{viewport:{width:1280,height:900}}],['mobile',devices['iPhone 13']]]) {
  const context=await browser.newContext(contextOptions);
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('.counter-card .counter-number').waitFor({timeout:12000});
   const before=Number(await page.locator('.counter-card .counter-number').innerText());
   await page.locator('.counter-card [data-action="plus"]').click();
   assert.equal(Number(await page.locator('.counter-card .counter-number').innerText()),before+1);
   assert.match(await page.locator('.project-progress').innerText(),/rows/);
   await page.reload();
   await page.locator('.counter-card .counter-number').waitFor({timeout:12000});
   assert.equal(Number(await page.locator('.counter-card .counter-number').innerText()),before+1,'counter persists across reload');
   assert.equal(await page.locator('[data-finishing-task]').count(),0,'finishing checklist hidden in row section');
   assert.equal(await page.locator('[data-action="finishingSetup"]').count(),0,'finishing settings hidden in row section');
   await page.locator('.pattern-card #activeSection').selectOption('finishing');
   assert.equal(await page.locator('.counter-card h2').innerText(),'Finishing','finishing section selected');
   assert.equal(await page.locator('.counter-card .counter-number').count(),0,'row counter hidden in finishing section');
   await page.locator('[data-action="finishingSetup"]').click();
   await page.locator('textarea[name="tasks"]').fill('Seaming\nBlocking');
   await page.locator('#dialogForm button[type="submit"]').click();
   assert.equal(await page.locator('[data-finishing-task]').count(),2);
   await page.locator('[data-finishing-task]').first().check();
   assert.equal(await page.locator('[data-finishing-task]').first().isChecked(),true);
   await page.reload();
   await page.locator('[data-finishing-task]').first().waitFor();
   assert.equal(await page.locator('[data-finishing-task]').first().isChecked(),true,'finishing task persists');
   const firstRowOption=await page.locator('.pattern-card #activeSection option:not([value="finishing"])').first().getAttribute('value');
   await page.locator('.pattern-card #activeSection').selectOption(firstRowOption);
   assert.equal(await page.locator('[data-finishing-task]').count(),0,'finishing checklist hidden after switching to row section');
   assert.equal(await page.locator('.counter-card .counter-number').count(),1,'row counter restored');
   await page.locator('.pattern-card #activeSection').selectOption('finishing');
   assert.equal(await page.locator('[data-finishing-task]').first().isChecked(),true,'task remains checked after section switch');
   assert.equal(await page.locator('.video-card').count(),1,'video widget exists');
   await page.locator('[data-nav="Projects"]').first().click();
   assert.equal(await page.locator('#projectStatusFilter').count(),1,'status filter exists');
   assert.equal(await page.locator('#projectCraftFilter').count(),1,'craft filter exists');
   await page.locator('[data-editproject]').first().click();
   await page.locator('#dialogForm select[name="status"]').selectOption('On Hold');
   await page.locator('#dialogForm select[name="craftType"]').selectOption('Crochet');
   await page.locator('#dialogForm button[type="submit"]').click();
   await page.locator('#projectStatusFilter').selectOption('On Hold');
   await page.locator('#projectCraftFilter').selectOption('Crochet');
   assert.equal(await page.locator('[data-editproject]').count(),1,'combined filters match edited project');
   await page.locator('#projectCraftSort').selectOption('desc');
   await page.locator('#projectStatusSort').selectOption('asc');
   assert.equal(await page.locator('[data-editproject]').count(),1,'sorting retains matching project');
   await page.reload();
   await page.locator('[data-nav="Projects"]').first().click();
   assert.match(await page.locator('.list-item').first().innerText(),/On Hold/,'edited status persists');

   assert.equal(await page.locator('.pattern-card').count(),1,'pattern widget exists');
   if(name==='mobile')assert.equal(await page.locator('.bottom-nav').count() > 0 || await page.locator('[data-action="mobileMore"]').count()>0,true,'mobile navigation exists');
   assert.deepEqual(errors,[],'no uncaught JavaScript errors');
   console.log('PASS '+name);
  }catch(e){failures.push(name+': '+e.stack);console.error('FAIL '+name,e)}
  await context.close();
 }
 await browser.close();
 if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
