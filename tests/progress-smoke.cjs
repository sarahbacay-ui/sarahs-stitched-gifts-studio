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
   await page.locator('[data-action="finishingSetup"]').click();
   await page.locator('textarea[name="tasks"]').fill('Seaming\nBlocking');
   await page.locator('#dialogForm button[type="submit"]').click();
   assert.equal(await page.locator('[data-finishing-task]').count(),2);
   await page.locator('[data-finishing-task]').first().check();
   assert.equal(await page.locator('[data-finishing-task]').first().isChecked(),true);
   await page.reload();
   await page.locator('[data-finishing-task]').first().waitFor();
   assert.equal(await page.locator('[data-finishing-task]').first().isChecked(),true,'finishing task persists');
   assert.equal(await page.locator('.video-card').count(),1,'video widget exists');
   assert.equal(await page.locator('.pattern-card').count(),1,'pattern widget exists');
   if(name==='mobile')assert.equal(await page.locator('.mobile-nav').count() > 0 || await page.locator('[data-action="mobileMore"]').count()>0,true,'mobile navigation exists');
   assert.deepEqual(errors,[],'no uncaught JavaScript errors');
   console.log('PASS '+name);
  }catch(e){failures.push(name+': '+e.stack);console.error('FAIL '+name,e)}
  await context.close();
 }
 await browser.close();
 if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
