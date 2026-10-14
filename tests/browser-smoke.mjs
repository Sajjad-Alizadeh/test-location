// Native Chrome DevTools smoke test. Uses no browser-driver dependency.
// Start Chrome headless with --remote-debugging-port=9223, then:
// node tests/browser-smoke.mjs http://localhost:3000
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const origin = process.argv[2] || 'http://localhost:3000';
const debug = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9223';
const targets = await (await fetch(`${debug}/json`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const exceptions = [];
const tileRequests = [];
let failFirstTile = true;
const tileFixture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eee7"/><path d="M0 100H256M110 0V256" stroke="white" stroke-width="16"/></svg>').toString('base64');
ws.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.id) {
    const entry = pending.get(data.id);
    if (entry) { pending.delete(data.id); if (data.error) entry.reject(Error(JSON.stringify(data.error))); else entry.resolve(data.result); }
  }
  if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails.text);
  if (data.method === 'Fetch.requestPaused') {
    const request = data.params.request;
    const referrer = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'referer')?.[1];
    tileRequests.push({ url: request.url, referrer });
    const fail = failFirstTile;
    failFirstTile = false;
    // No image request ever reaches OSM or another external provider in this suite.
    call('Fetch.fulfillRequest', {
      requestId: data.params.requestId, responseCode: fail ? 503 : 200,
      responseHeaders: [{ name: 'Content-Type', value: fail ? 'text/plain' : 'image/svg+xml' }, { name: 'Cache-Control', value: 'public, max-age=604800' }],
      body: fail ? Buffer.from('fixture unavailable').toString('base64') : tileFixture,
    }).catch(error => exceptions.push(error.message));
  }
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const request = ++id;
  const timeout = setTimeout(() => { pending.delete(request); reject(Error(`CDP timeout: ${method}`)); }, 10000);
  pending.set(request, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
  ws.send(JSON.stringify({ id: request, method, params }));
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
async function waitFor(expression, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await evaluate(expression)) return; await sleep(150); }
  throw Error(`Browser condition failed: ${expression}`);
}
async function navigate(path) {
  await call('Page.navigate', { url: 'about:blank' });
  await waitFor(`location.href === 'about:blank'`);
  await call('Page.navigate', { url: origin + path });
  await waitFor(`document.querySelector('.app-container') && document.readyState === 'complete'`);
  await sleep(650);
}
async function screenshot(name) {
  const screenshot = await call('Page.captureScreenshot', { captureBeyondViewport: false });
  writeFileSync(`/tmp/emergency-${name}.png`, Buffer.from(screenshot.data, 'base64'));
}
try {
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Network.clearBrowserCache');
  await call('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Image', requestStage: 'Request' }] });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('/');
  await waitFor(`!!document.querySelector('.map-unavailable button')`);
  await evaluate(`document.querySelector('.map-unavailable button').click()`);
  await waitFor(`!document.querySelector('.map-unavailable')`);
  assert.ok(tileRequests.length > 0);
  const failedUrl = tileRequests[0].url;
  assert.ok(tileRequests.filter(request => request.url === failedUrl).length >= 2, 'retry must reuse original URL/cache semantics');
  assert.equal(await evaluate(`document.querySelector('.map-tiles img').referrerPolicy`), 'origin');
  assert.equal(await evaluate(`document.querySelector('meta[name="referrer"]').content`), 'no-referrer');
  assert.equal(await evaluate(`document.documentElement.lang`), 'fa');
  assert.equal(await evaluate(`document.documentElement.dir`), 'rtl');
  assert.equal(await evaluate(`document.querySelector('.context-bar').textContent.includes('هیچ موقعیتی')`), true);
  await screenshot('desktop');
  for (const width of [360, 390, 768, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 781 });
    await sleep(250);
    assert.equal(await evaluate(`document.documentElement.scrollWidth > innerWidth`), false, `overflow at ${width}`);
    const smallButtons = await evaluate(`[...document.querySelectorAll('.app-container button')].filter(b=>b.getBoundingClientRect().height>0&&b.getBoundingClientRect().height<56).map(b=>b.textContent)`);
    assert.deepEqual(smallButtons, [], `small controls at ${width}`);
    if (width === 390) {
      const inReach = await evaluate(`document.querySelector('.send-area .primary-button').getBoundingClientRect().bottom <= innerHeight`);
      assert.equal(inReach, true);
      await screenshot('mobile');
    }
  }
  await evaluate(`document.querySelector('.map-footer button').click()`);
  await waitFor(`!!document.querySelector('dialog[open]')`);
  await evaluate(`document.querySelector('.platform-tabs button').click()`);
  assert.equal(await evaluate(`document.querySelector('dialog').textContent.includes('Website Settings')`), true);
  await screenshot('permission');
  await evaluate(`document.querySelector('.dialog-close').click()`);
  await evaluate(`{const input=document.querySelector('#landmark-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'فیروزگر');input.dispatchEvent(new Event('input',{bubbles:true}));}`);
  await waitFor(`!!document.querySelector('.search-results button')`);
  await evaluate(`document.querySelector('.search-results button').click()`);
  await waitFor(`document.querySelector('.address-preview h3').textContent.includes('فیروزگر')`);
  await evaluate(`document.querySelector('.send-area button').click()`);
  await waitFor(`!!document.querySelector('.success-content')`);
  assert.equal(await evaluate(`document.querySelector('.success-content').textContent.includes('هیچ پیام')`), true);
  await navigate('/locate');
  await waitFor(`document.querySelector('.location-status').textContent.includes('قابل استفاده نیست')`);
  assert.equal(await evaluate(`document.querySelector('.send-area a').getAttribute('href')`), 'tel:115');
  console.log('PASS: RTL, responsive overflow, 56px controls, visible mobile send, permission guide, search, demo receipt, invalid link.');

  const mock = await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    (()=>{
      const scenario=new URL(location.href).searchParams.get('scenario');
      const nativeFetch=window.fetch.bind(window);
      window.__dispatches=[];window.__watchStops=0;
      const reply=(value,status=200)=>Promise.resolve(new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}));
      window.fetch=(input,options={})=>{
        const url=String(input);
        if(url.includes('/api/emergency/session'))return reply({incidentId:'TEST-115',phoneHint:'•••• ۱۲۳۴',expiresAt:Date.now()+1200000,coarse:{lat:35.71522,lng:51.40595,accuracy:900,source:'carrier',timestamp:Date.now()},lbsPending:false});
        if(url.includes('/api/emergency/geocode'))return reply({address:'تهران، خیابان ولیعصر، خیابان زرتشت'});
        if(url.includes('/api/emergency/dispatch')){
          window.__dispatches.push({body:options.body,headers:options.headers});
          return window.__dispatches.length===1?reply({error:'Provider unavailable'},503):reply({receiptId:'TEST-RECEIPT',acceptedAt:Date.now()});
        }
        return nativeFetch(input,options);
      };
      const timers=new Map();let count=0;
      Object.defineProperty(navigator,'geolocation',{value:{
        watchPosition(success,error){
          const id=++count;window.__lateGPS=success;
          if(scenario==='denied'){timers.set(id,[setTimeout(()=>error({code:1}),50)]);return id;}
          const handles=[100,1200,2400].map(delay=>setTimeout(()=>success({coords:{latitude:35.71522,longitude:51.40595,accuracy:12},timestamp:Date.now()}),delay));timers.set(id,handles);return id;
        },
        clearWatch(id){window.__watchStops++;(timers.get(id)||[]).forEach(clearTimeout);}
      }});
    })();
  ` });
  await navigate('/locate#token=' + 'A'.repeat(43));
  await waitFor(`document.querySelector('.location-status').textContent.includes('با دقت ثبت شد')`);
  assert.equal(await evaluate(`location.hash`), '');
  await evaluate(`document.querySelector('.manual-button').click()`);
  await waitFor(`document.querySelector('.location-status').textContent.includes('انتخاب‌شده')`);
  assert.equal(await evaluate(`window.__watchStops > 0`), true);
  await evaluate(`window.__lateGPS({coords:{latitude:35.71748,longitude:51.40952,accuracy:5},timestamp:Date.now()})`);
  assert.equal(await evaluate(`document.querySelector('.location-status').textContent.includes('انتخاب‌شده')`), true);
  await evaluate(`document.querySelector('.send-area button').click()`);
  await waitFor(`document.querySelector('.send-area button').textContent.includes('ارسال دوباره')`);
  assert.equal(await evaluate(`document.querySelector('.manual-button').disabled`), true);
  await evaluate(`document.querySelector('.send-area button').click()`);
  await waitFor(`!!document.querySelector('.success-content')`);
  assert.equal(await evaluate(`window.__dispatches.length`), 2);
  assert.equal(await evaluate(`window.__dispatches[0].body===window.__dispatches[1].body`), true);
  assert.equal(await evaluate(`window.__dispatches[0].headers['Idempotency-Key']===window.__dispatches[1].headers['Idempotency-Key']`), true);
  assert.equal(await evaluate(`window.__dispatches[1].headers['X-Emergency-Retry']==='1'`), true);
  assert.equal(await evaluate(`JSON.parse(window.__dispatches[0].body).location.accuracy`), null);
  await navigate('/locate?scenario=denied#token='+'A'.repeat(43));
  await waitFor(`!!document.querySelector('dialog[open]')`);
  assert.equal(await evaluate(`document.querySelector('.location-status').textContent.includes('انتخاب‌شده')`), true);
  assert.equal(await evaluate(`document.querySelector('.send-area button').disabled`), true);
  await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: mock.identifier });
  console.log('PASS: three-sample GPS lock, token scrub, manual stops GPS, late GPS ignored, uncertain delivery retry uses same payload/key, denied permissions fallback.');

  const forgedOrigin = await fetch(origin+'/api/emergency/session',{method:'POST',headers:{'Origin':'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({token:'A'.repeat(43)})});
  assert.equal(forgedOrigin.status,403);
  const malformed = await fetch(origin+'/api/emergency/session',{method:'POST',headers:{'Origin':origin,'Content-Type':'application/json'},body:JSON.stringify({token:'bad'})});
  assert.equal(malformed.status,401);
  const oversized = await fetch(origin+'/api/emergency/session',{method:'POST',headers:{'Origin':origin,'Content-Type':'application/json'},body:JSON.stringify({token:'a'.repeat(9000)})});
  assert.equal(oversized.status,413);
  assert.ok(tileRequests.every(request => request.referrer === origin + '/'), 'tile Referer must contain only app origin, never path, query, or token');
  assert.deepEqual(exceptions,[]);
  console.log('PASS: origin-only tile Referer overrides private document policy, failed-tile recovery, unchanged retry URL, zero external tile traffic.');
  console.log('PASS: actual API rejects forged Origin, malformed token, oversized request; zero browser exceptions.');
} finally { ws.close(); }
