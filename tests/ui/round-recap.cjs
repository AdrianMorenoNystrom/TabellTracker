const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const directory = path.resolve('tmp/recap-review');
  fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined), headless: true });
  try {
    const names=['Ompen','Adrian','Sillen','Danne'];
    const round=(n,scores,quotas=[4,3,3,3])=>({id:n,roundNumber:n,week:27,seasonId:1,seasonName:'2026/27',totalScore:scores.reduce((a,b)=>a+b,0),
      players:names.map((name,i)=>({id:i+1,name,score:scores[i],matchesPicked:quotas[i]}))});
    let payload={round_id:27,rounds:[round(26,[1,3,2,0]),round(27,[4,2,2,1])]};
    let seen=false,acknowledgements=0,failWrite=false,reads=0;
    const errors=[];
    const createDevice = async () => {
      const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
      const token=[{alg:'HS256',typ:'JWT'},{sub:'recap-test',exp:Math.floor(Date.now()/1000)+864000}]
        .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.mock';
      await context.addInitScript(({token})=>{
        for(const host of ['ywamyalehanpsnvskgfl.supabase.co','tzhfrbqfekqpklcmpmhu.supabase.co']) {
          localStorage.setItem(`sb-stryktipstabellen-${host}-auth`,JSON.stringify({access_token:token,refresh_token:'mock-only',
            expires_at:Math.floor(Date.now()/1000)+864000,expires_in:864000,token_type:'bearer',
            user:{id:'recap-test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));
        }
      },{token});
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(['localhost','127.0.0.1'].includes(url.hostname)) return route.continue();
        if(!url.hostname.endsWith('.supabase.co')) return route.abort();
        const endpoint=url.pathname.split('/').pop(); let body;
        if(endpoint==='live_identity') body={player_id:1,name:'Ompen',is_admin:false};
        else if(endpoint==='round_recap_pending') {reads++;body=seen?null:payload;}
        else if(endpoint==='round_recap_acknowledge') {
          assert.deepEqual(route.request().postDataJSON(),{p_round_id:27});
          acknowledgements++;
          if(failWrite) return route.fulfill({status:500,json:{message:'offline'}});
          seen=true;body=null;
        }
        else if(endpoint==='articles') body={id:1,title:'Testvy',content:'Bakom recapen',created_at:'2026-09-19T12:00:00Z'};
        else throw new Error('Unmocked Supabase endpoint: '+url.pathname);
        await route.fulfill({status:200,json:body});
      });
      await context.routeWebSocket('**/realtime/**',ws=>ws.close());
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      return {context,page};
    };
    const {context,page}=await createDevice();
    const url=new URL('/kronikor/1',process.env.COUPON_TEST_URL || 'http://localhost:4200/').href;
    const open=async()=>{
      await page.goto(url);await page.locator('app-round-recap-story dialog[open]').waitFor();
    };
    await open();
    const dialog=page.locator('app-round-recap-story dialog');
    assert.equal(acknowledgements,0);
    assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
    await page.reload();await dialog.waitFor();assert.equal(acknowledgements,0,'reload is not a dismissal');
    const measure=async(width,height)=>{
      await page.waitForFunction(()=>[...document.querySelectorAll('.slide')].every(el=>el.getAnimations().every(a=>a.playState==='finished')));
      const size=await dialog.evaluate(el=>{
        const rect=el.getBoundingClientRect(),main=el.querySelector('main');
        return {width:rect.width,height:rect.height,overflow:el.scrollWidth>el.clientWidth,
          innerOverflow:main.scrollWidth>main.clientWidth,
          buttons:[...el.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}),
          metrics:[...el.querySelectorAll('.metrics article')].map(a=>({overflow:a.scrollWidth>a.clientWidth,font:parseFloat(getComputedStyle(a.querySelector('p')||a).fontSize)}))};
      });
      assert.ok(!size.overflow&&!size.innerOverflow,`overflow at ${width}: ${JSON.stringify(size)}`);
      assert.ok(size.buttons.every(b=>b.top>=0&&b.bottom<=height&&b.height>=44),`buttons at ${width}x${height}`);
      assert.ok(size.metrics.every(m=>!m.overflow&&m.font>=12),`metric readability at ${width}`);
      if(width<=430) {assert.equal(size.width,width);assert.equal(size.height,height);}
    };
    for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[768,1024],[1440,1000]]) {
      await page.setViewportSize({width,height});
      for(let slide=0;slide<3;slide++) {
        if(slide) await dialog.getByRole('button',{name:'Nästa →',exact:true}).click();
        await page.waitForFunction(i=>document.querySelector('app-round-recap-story .counter')?.textContent.trim().startsWith(`${i}/3`),slide+1);
        await measure(width,height);
        await page.screenshot({path:path.join(directory,`recap-${width}-slide-${slide+1}.png`)});
      }
      await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');
    }
    // Focus cannot leave the modal even with repeated Tab/Shift-Tab.
    for(let i=0;i<9;i++) {await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));}
    for(let i=0;i<6;i++) {await page.keyboard.press('Shift+Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));}
    // Swipes navigate, vertical scrolling does not.
    const swipe=async(dx,dy)=>page.locator('app-round-recap-story main').evaluate((el,{dx,dy})=>{
      const touch=(x,y)=>new Touch({identifier:1,target:el,clientX:x,clientY:y});
      el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(200,200)]}));
      el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[touch(200+dx,200+dy)]}));
    },{dx,dy});
    await swipe(-90,2);assert.ok((await dialog.locator('.counter').innerText()).startsWith('2/3'));
    await swipe(90,2);assert.ok((await dialog.locator('.counter').innerText()).startsWith('1/3'));
    await swipe(-60,100);assert.ok((await dialog.locator('.counter').innerText()).startsWith('1/3'));
    const frozen=await dialog.innerText();
    payload={round_id:27,rounds:[round(26,[0,0,0,0]),round(27,[0,0,0,0])]};
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    assert.equal(await dialog.innerText(),frozen,'open recap remains frozen');
    // Explicit X retries a failed write; no false acknowledgement in localStorage.
    failWrite=true;await dialog.getByRole('button',{name:'Stäng recap',exact:true}).click();
    await dialog.getByRole('alert').waitFor();assert.equal(seen,false);
    failWrite=false;await dialog.getByRole('button',{name:'Stäng recap',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(seen,true);assert.equal(acknowledgements,2);
    assert.equal(await page.locator('.navbar button').first().evaluate(el=>el===document.activeElement),true);
    const second=await createDevice();
    await second.page.goto(url);
    await second.page.getByText('Bakom recapen').waitFor();
    await second.page.waitForLoadState('networkidle');
    assert.equal(await second.page.locator('app-round-recap-story').count(),0,'seen persists on another device');
    await second.context.close();
    // Ties, full pots, narrow names, reduced motion and the final Close button.
    seen=false;payload={round_id:27,rounds:[round(27,[3,3,3,3])]};
    await page.emulateMedia({reducedMotion:'reduce'});await open();await page.setViewportSize({width:320,height:568});
    assert.ok((await dialog.innerText()).includes('Delad omgångsvinst'));
    assert.equal(await dialog.locator('.full').count(),3);
    assert.equal(await dialog.locator('.slide').evaluate(el=>getComputedStyle(el).animationName),'none');
    await dialog.getByRole('button',{name:'Nästa →',exact:true}).click();await dialog.getByRole('button',{name:'Nästa →',exact:true}).click();
    await measure(320,568);await page.screenshot({path:path.join(directory,'recap-tied-320.png')});
    await dialog.getByRole('button',{name:'Stäng',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(seen,true);
    // Empty result (no completed rounds) never creates a modal.
    seen=false;payload=null;await page.reload();await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('app-round-recap-story').count(),0);
    assert.deepEqual(errors,[]);
    await context.close();
    console.log(`Recap UI passed: 6 viewports, 3 slides, swipe/keyboard/focus, acknowledgement/reload/device/retry, frozen snapshot, ties, reduced motion (${reads} reads).`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
