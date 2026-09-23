const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const directory = path.resolve('tmp/coupon-review');
  fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const stamp = '2026-09-17T12:35:00Z';
  const draw = { draw_number: 4971, round_number: 28, four_player_id: 3, status: 'open', reg_open_time: null,
    reg_close_time: new Date(Date.now() + 86400000 * 2).toISOString(), retrieved_at: stamp,
    next_fetch_at: new Date(Date.now()+3600000).toISOString(), last_error: null, round_id: null };
  const teams = [ ['Nottingham', 'Coventry'], ['Arsenal', 'Manchester City'], ['Liverpool', 'Everton'], ['Chelsea', 'Fulham'],
    ['Leeds', 'Southampton'], ['Brighton & Hove Albion', 'Wolverhampton Wanderers'], ['Bristol City', 'Watford'], ['Burnley', 'Sunderland'],
    ['Norwich', 'Blackburn'], ['Middlesbrough', 'Swansea'], ['Sheffield United', 'Derby'], ['Queens Park Rangers', 'Millwall'],
    ['Borussia Mönchengladbach', 'Eintracht Braunschweig'] ];
  const events = teams.map(([home_team, away_team], index) => ({ event_number: index+1, match_id: String(100+index), home_team, away_team,
    player_id: null, kickoff: draw.reg_close_time, league: 'England · Championship', cancelled: false,
    odds: [1.62, 4.35, 5.6], crowd: [.7, .17, .13], odds_retrieved_at: stamp, crowd_retrieved_at: stamp }));
  let picks = [[1,3,'1X'],[2,2,'1'],[3,1,'X2'],[4,3,'X2'],[5,4,'X'],[8,3,'1']].map(([n,p,pick]) => {
    events[n-1].player_id = p;
    return {event_number:n,match_id:events[n-1].match_id,pick,revision:1,owner:{player_id:p}};
  });
  const players = [{id:1,name:'Ompen'},{id:2,name:'Sillen'},{id:3,name:'Adrian'},{id:4,name:'Danne'}];
  let results = [], isAdmin = false, syncFails = false, nextDraw = null;
  let releaseLoading = null;
  let wsChannel = null, wsTopic = null;
  const token = [ {alg:'HS256',typ:'JWT'}, {sub:'visual-test',exp:Math.floor(Date.now()/1000)+864000} ]
    .map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.mock-signature';
  await context.addInitScript(({token}) => {
    for (const host of ['ywamyalehanpsnvskgfl.supabase.co','tzhfrbqfekqpklcmpmhu.supabase.co']) {
      localStorage.setItem(`sb-stryktipstabellen-${host}-auth`, JSON.stringify({ access_token:token, refresh_token:'local-mock-only',
        expires_at:Math.floor(Date.now()/1000)+864000, expires_in:864000, token_type:'bearer',
        user:{id:'visual-test',aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{},user_metadata:{}} }));
    }
  }, {token});
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (['localhost','127.0.0.1'].includes(url.hostname)) return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const endpoint = url.pathname.split('/').pop();
    let body;
    if (endpoint === 'live_identity') body = {player_id:3,name:'Adrian',is_admin:isAdmin};
    else if (endpoint === 'round_recap_pending') body = null;
    else if (endpoint === 'round_recap_acknowledge') body = null;
    else if (endpoint === 'rounds') body = url.searchParams.get('select') === 'season_id' ? {season_id:1} : [{
      id:28,roundnumber:28,week:28,totalscore:9,season_id:1,season:{id:1,name:'2026/27',is_current:true},
      round_players:players.map((player,i)=>({player,score:i===2?4:i===3?1:2,matches_picked:i===2?4:3})),
    }];
    else if (endpoint === 'live_draws') {
      if (releaseLoading) await releaseLoading;
      body = nextDraw ? [nextDraw,draw] : [draw];
    }
    else if (endpoint === 'live_events') body = events;
    else if (endpoint === 'live_picks') body = picks;
    else if (endpoint === 'players') body = players;
    else if (endpoint === 'live_results') body = results;
    else if (endpoint === 'live_save_pick') {
      const args = route.request().postDataJSON();
      const n = args.p_event_number, owner = args.p_pick ? args.p_player_id : null;
      events[n-1].player_id = owner;
      body = {event_number:n,match_id:events[n-1].match_id,pick:args.p_pick,revision:args.p_revision+1,player_id:owner};
      picks = [...picks.filter(p=>p.event_number!==n),{...body,owner:{player_id:owner}}];
    }
    else if (endpoint === 'stryktipset-sync') {
      if (syncFails) return route.fulfill({status:500,json:{error:'Kunde inte hämta nya uppgifter. Försök igen.'}});
      body = {ok:true,message:'Kupongen uppdaterad'};
    }
    else throw new Error('Unmocked Supabase endpoint: '+url.pathname);
    await route.fulfill({status:200,json:body});
  });
  await context.routeWebSocket('**/realtime/**', ws => {
    wsChannel = ws;
    ws.onMessage(message => {
      const request = JSON.parse(message);
      if (request.event === 'phx_join') wsTopic = request.topic;
      ws.send(JSON.stringify({event:'phx_reply',topic:request.topic,ref:request.ref,
        payload:{status:'ok',response:{postgres_changes:(request.payload?.config?.postgres_changes ?? []).map((p,i)=>({...p,id:i+1}))}}}));
    });
  });
  const notify = (table='live_picks', row={}) => wsChannel.send(JSON.stringify({topic:wsTopic,event:'postgres_changes',
    payload:{ids:[['live_draws','live_events','live_picks','live_results'].indexOf(table)+1],data:{schema:'public',table,type:'UPDATE',columns:[],record:row,old_record:{}}}}));
  await page.goto(process.env.COUPON_TEST_URL || 'http://localhost:4200/');
  await page.locator('article.match').nth(12).waitFor();
  await page.waitForFunction(() => document.querySelector('.eyebrow')?.textContent.trim() === 'Live');
  const report = [];
  // Colours are local preferences, persisted across reloads and shared by each display.
  const standardColours = await page.locator('.player-label').evaluateAll(labels=>labels.map(el=>getComputedStyle(el).borderLeftColor));
  assert.equal(new Set(standardColours).size,4,'four distinct default player colours');
  await page.setViewportSize({width:320,height:667});
  await page.getByRole('button',{name:'Färger',exact:true}).click();
  const colours = page.getByRole('dialog',{name:'Spelarfärger',exact:true});
  await colours.waitFor();
  await colours.getByLabel('Färg för Adrian').fill('#007788');
  await colours.getByLabel('Färg för Adrian').dispatchEvent('change');
  await page.waitForFunction(()=>getComputedStyle(document.querySelectorAll('.player-label')[2]).borderLeftColor==='rgb(0, 119, 136)');
  await page.waitForFunction(() => [...document.querySelectorAll('.mat-mdc-dialog-container, .mat-mdc-dialog-surface')]
    .every(el => getComputedStyle(el).opacity === '1' && el.getAnimations().every(animation => animation.playState === 'finished')));
  assert.ok(await colours.evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.screenshot({path:path.join(directory,'player-colours-320.png')});
  await colours.getByRole('button',{name:'Stäng',exact:true}).click();
  await colours.waitFor({state:'hidden'});
  await page.reload();
  await page.locator('article.match').nth(12).waitFor();
  assert.equal(await page.locator('article.match').first().evaluate(el=>getComputedStyle(el).borderLeftColor),'rgb(0, 119, 136)');
  await page.getByRole('button',{name:'Översikt',exact:true}).click();
  const colouredOverview = page.getByRole('dialog',{name:'Översikt',exact:true});
  await colouredOverview.waitFor();
  assert.equal(await colouredOverview.locator('tbody th').first().evaluate(el=>getComputedStyle(el).borderLeftColor),'rgb(0, 119, 136)');
  await colouredOverview.getByRole('button',{name:'Stäng',exact:true}).click();
  await colouredOverview.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Färger',exact:true}).click();
  await colours.getByRole('button',{name:'Återställ standardfärger',exact:true}).click();
  await colours.getByRole('button',{name:'Stäng',exact:true}).click();
  await colours.waitFor({state:'hidden'});
  assert.deepEqual(await page.locator('.player-label').evaluateAll(labels=>labels.map(el=>getComputedStyle(el).borderLeftColor)),standardColours);
  // The legend and match accents use the same player colours.
  assert.equal(await page.locator('.player-label').nth(2).evaluate(el=>getComputedStyle(el).borderLeftColor),
    await page.locator('article.match').first().evaluate(el=>getComputedStyle(el).borderLeftColor));
  for (const width of [320,375,390,430,768,1440]) {
    await page.setViewportSize({width,height:1000});
    const measurements = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('article.match')];
      const center = element => {const r=element.getBoundingClientRect();return r.x+r.width/2;};
      return {
        viewport:innerWidth, documentWidth:document.documentElement.scrollWidth,
        couponWidth:document.querySelector('.coupon').scrollWidth,
        rows: rows.map(row => {
          const buttons=[...row.querySelectorAll('.tips button')];
          const stats=['.crowd','.odds'].map(selector=>[...row.querySelector(selector).children].slice(1));
          return {width:row.getBoundingClientRect().width, height:row.getBoundingClientRect().height,
            overflow:row.scrollWidth>row.clientWidth,
            aligned:buttons.every((button,i)=>stats.every(values=>Math.abs(center(button)-center(values[i]))<1)),
            touch:buttons.every(button=>{const r=button.getBoundingClientRect();return r.width>=44 && r.height>=44;}),
            radius:getComputedStyle(row).borderRadius};
        })};
    });
    report.push(measurements);
    assert.equal(measurements.documentWidth,width,`page overflow at ${width}`);
    assert.ok(measurements.rows.every(r=>!r.overflow && r.aligned && r.touch && r.radius==='0px'),`row layout at ${width}`);
    await page.screenshot({path:path.join(directory,`coupon-${width}.png`),fullPage:true});
    if ([320,390,1440].includes(width)) await page.screenshot({path:path.join(directory,`coupon-${width}-viewport.png`)});
  }
  // A compact read-only snapshot is accessible at mobile and desktop sizes.
  for (const [width,height] of [[320,667],[390,844],[1440,1000]]) {
    await page.setViewportSize({width,height});
    await page.getByRole('button',{name:'Översikt',exact:true}).click();
    const overview = page.getByRole('dialog',{name:'Översikt',exact:true});
    await overview.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.mat-mdc-dialog-container, .mat-mdc-dialog-surface')]
      .every(el => getComputedStyle(el).opacity === '1' && el.getAnimations().every(animation => animation.playState === 'finished')));
    assert.equal(await overview.locator('tbody tr').count(),13);
    assert.equal(await overview.locator('.selected').count(),9);
    assert.ok((await overview.innerText()).includes('7 matcher saknar tips'));
    assert.ok(await overview.evaluate(el=>el.scrollWidth<=el.clientWidth));
    await page.screenshot({path:path.join(directory,`overview-${width}.png`)});
    await page.keyboard.press('Escape');
    await overview.waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'Översikt',exact:true}).evaluate(el=>el===document.activeElement),true);
  }
  // Keyboard selection must still save and complete the player's row.
  await page.setViewportSize({width:390,height:1000});
  await page.getByRole('button',{name:'Match 7, tecken 1',exact:true}).focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelectorAll('article.match')[6].querySelector('button').getAttribute('aria-pressed')==='true');
  await page.waitForFunction(()=>document.querySelectorAll('.player-status')[2].textContent.includes('Rad klar ✓'));
  assert.ok(await page.locator('article.match').first().locator('.tips button').nth(2).isDisabled());
  await page.screenshot({path:path.join(directory,'coupon-keyboard.png'),fullPage:false});
  // Real WebSocket callback updates ownership and selections without moving match rows.
  const positions = () => page.locator('article.match').evaluateAll(rows=>rows.map(row=>({top:row.getBoundingClientRect().top+window.scrollY,height:row.getBoundingClientRect().height})));
  const before = await positions();
  await page.getByRole('button',{name:'Översikt',exact:true}).click();
  const frozen = page.getByRole('dialog',{name:'Översikt',exact:true});
  const snapshotText = await frozen.innerText();
  events[8].player_id = 2;
  picks.push({event_number:9,match_id:events[8].match_id,pick:'1X',revision:1,owner:{player_id:2}});
  notify('live_picks',picks.at(-1));
  await page.waitForFunction(()=>document.querySelectorAll('article.match')[8].querySelector('.owner').textContent.includes('Sillen'));
  assert.equal(await frozen.innerText(),snapshotText,'open snapshot must remain unchanged during realtime updates');
  await frozen.getByRole('button',{name:'Stäng'}).click();
  await frozen.waitFor({state:'hidden'});
  assert.deepEqual(await positions(),before,'realtime row shift');
  // Late results remain below the sign controls, with no movement within a row.
  draw.status = 'locked';
  notify('live_draws',draw);
  await page.waitForFunction(()=>document.querySelector('.banner')?.textContent.includes('Spelstopp'));
  const lockedBefore = await positions();
  results = [{event_number:1,match_id:events[0].match_id,outcome:'1',home_score:2,away_score:0},
    {event_number:2,match_id:events[1].match_id,outcome:'2',home_score:0,away_score:1}];
  notify('live_results',results[0]);
  await page.waitForFunction(()=>document.querySelector('.result').textContent.includes('Rätt'));
  assert.deepEqual(await positions(),lockedBefore,'result row shift');
  await page.screenshot({path:path.join(directory,'coupon-results-390.png'),fullPage:true});
  // Settled coupons become a readable waiting state and can replay a seen recap.
  draw.status='settled'; draw.round_id=28; notify('live_draws',draw);
  await page.getByRole('heading',{name:'Väntar på nya rader'}).waitFor();
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    assert.equal(await page.locator('.matches').evaluate(el=>getComputedStyle(el).filter),'grayscale(1)');
    assert.equal(await page.locator('.fetch-status').count(),0);
    await page.screenshot({path:path.join(directory,`coupon-waiting-${width}.png`)});
  }
  await page.getByRole('button',{name:'Visa recap',exact:true}).click();
  const recap=page.locator('app-round-recap-story dialog[open]'); await recap.waitFor();
  assert.ok((await recap.innerText()).includes('Omgång 28 är avgjord'));
  await recap.getByRole('button',{name:'Stäng recap',exact:true}).click(); await recap.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'Visa recap',exact:true}).evaluate(el=>el===document.activeElement),true);
  nextDraw={...draw,draw_number:4972,round_number:29,status:'open',round_id:null,reg_close_time:new Date(Date.now()+86400000*4).toISOString()};
  notify('live_draws',nextDraw);
  await page.locator('.settled-panel').waitFor({state:'hidden'});
  assert.ok((await page.locator('.draw-meta select').evaluate(el=>el.selectedOptions[0].textContent)).startsWith('29 ·'));
  nextDraw=null; draw.status='locked'; draw.round_id=null;
  // Stale/missing values, error state and admin corrections are exercised separately.
  draw.last_error='Provider unavailable'; events[5].odds=null; events[5].crowd=null;
  syncFails=true; isAdmin=true;
  await page.reload();
  await page.locator('article.match').nth(12).waitFor();
  await page.getByRole('button',{name:'Uppdatera',exact:true}).click();
  await page.getByRole('alert').waitFor();
  await page.getByLabel('Administrera tips och resultat').check();
  await page.getByRole('button',{name:'Korrigera tips',exact:true}).nth(2).click();
  await page.screenshot({path:path.join(directory,'coupon-admin-390.png'),fullPage:true});
  await page.setViewportSize({width:320,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320,'admin layout overflow');
  await page.setViewportSize({width:390,height:1000});
  assert.equal(await page.locator('article.match').nth(5).locator('.odds').innerText(),'Odds\n–\n–\n–');
  let finishLoading;
  releaseLoading = new Promise(resolve => finishLoading=resolve);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.loading .skeleton').first().waitFor();
  await page.screenshot({path:path.join(directory,'coupon-loading-390.png'),fullPage:false});
  finishLoading(); releaseLoading=null;
  assert.deepEqual(errors,[],'browser errors');
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({widths:report.map(r=>r.viewport),checks:'alignment, no overflow, 44px targets, keyboard/save, quota status, realtime, results, missing data, admin, loading',screenshots:directory}));
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
