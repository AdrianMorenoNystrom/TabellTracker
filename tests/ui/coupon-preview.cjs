const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined),headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const databaseRequests=[],errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(['localhost','127.0.0.1'].includes(url.hostname)) return route.continue();
      if(url.hostname.endsWith('.supabase.co')) databaseRequests.push(url.pathname);
      return route.abort();
    });
    await page.goto(new URL('/dev/kupong',process.env.COUPON_TEST_URL||'http://localhost:4200/').href);
    await page.getByRole('heading',{name:'Väntar på nya rader'}).waitFor();
    assert.equal(await page.locator('article.match').count(),13);
    assert.equal(await page.locator('.result.correct').count(),9);
    await page.getByRole('button',{name:'Visa recap',exact:true}).click();
    const recap=page.locator('app-round-recap-story dialog[open]');await recap.waitFor();
    assert.ok((await recap.innerText()).includes('Omgång 27 är avgjord'));
    await recap.getByRole('button',{name:'Stäng recap',exact:true}).click();await recap.waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Simulera nästa kupong',exact:true}).click();
    await page.locator('.settled-panel').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelector('.draw-meta select')?.selectedOptions[0]?.textContent.startsWith('28 ·'));
    assert.equal(await page.locator('.tips .chosen').count(),0);
    await page.getByRole('button',{name:'Match 1, tecken 1',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.save-status')?.textContent.includes('Sparat'));
    await page.getByRole('button',{name:'Visa rättad kupong',exact:true}).click();
    await page.getByRole('heading',{name:'Väntar på nya rader'}).waitFor();
    await page.reload();await page.getByRole('heading',{name:'Väntar på nya rader'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    assert.deepEqual(databaseRequests,[],'preview must not contact Supabase');
    assert.deepEqual(errors,[]);
    console.log('Dev preview passed: no login/DB requests, settled, recap, automatic next coupon, in-memory picks, reset.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
