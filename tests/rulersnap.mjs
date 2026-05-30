import { chromium } from 'playwright';
const APP_URL='http://localhost/pdfMiniPro/index.html';
const browser=await chromium.launch({headless:true});
async function mkPdf(){ const p=await browser.newPage(); await p.setContent('<html><body style="margin:0;background:#fff"></body></html>'); const b=await p.pdf({width:'600px',height:'800px',printBackground:true}); await p.close(); return b; }
const pdf=await mkPdf();
const ctx=await browser.newContext({viewport:{width:1400,height:1000},deviceScaleFactor:1});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('[pageerror]',e.message));
page.on('dialog',d=>d.dismiss().catch(()=>{}));
await page.addInitScript(()=>{try{localStorage.setItem('pdfMini.onboardedVersion','99.0')}catch(_){}});
await page.goto(APP_URL,{waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('.modal-overlay,.onboard-overlay,#onboardModal').forEach(m=>m.remove()));
await page.setInputFiles('#fileInput',{name:'f.pdf',mimeType:'application/pdf',buffer:pdf});
await page.waitForSelector('.page-wrapper .overlay',{timeout:15000});
await page.waitForTimeout(500);

// enable reading ruler
await page.click('#readingRulerToggle');
// move ruler band centre to the middle of the page overlay
const ov = await page.evaluate(()=>{ const o=document.querySelector('.overlay'); const r=o.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; });
const targetCx = ov.x + ov.w/2, targetCy = ov.y + ov.h/2;
const band = await page.$('#readingRuler .rr-band');
const bb = await band.boundingBox();
await page.mouse.move(bb.x+bb.width/2, bb.y+bb.height/2); await page.mouse.down();
await page.mouse.move(targetCx, targetCy, {steps:10}); await page.mouse.up();

const line = await page.evaluate(()=>window._readingRulerLine());
// switch to draw tool
await page.evaluate(()=>{ try{ setTool('draw'); }catch(_){} });
await page.waitForTimeout(200);

// draw a zigzag across the ruler line: x advances, y oscillates ±18px around line.cy (within 30px snap)
const startX = line.cx - 150;
await page.mouse.move(startX, line.cy); await page.mouse.down();
for (let i=1;i<=12;i++){ const x=startX + i*25; const y=line.cy + (i%2? 18 : -18); await page.mouse.move(x,y,{steps:2}); }
await page.mouse.up();
await page.waitForTimeout(150);

const res = await page.evaluate((lineCy)=>{
  const d = annotations.filter(a=>a.type==='draw').pop();
  if (!d) return {err:'no draw'};
  const o=document.querySelector('.overlay'); const r=o.getBoundingClientRect();
  // convert points back to viewport y, compare to ruler cy
  const ys = d.points.map(p=> p.y*currentZoom + r.top);
  const maxDev = Math.max(...ys.map(y=>Math.abs(y-lineCy)));
  return { n:d.points.length, maxDevFromRuler: Math.round(maxDev) };
}, line.cy);
let pass=0,fail=0; const ok=(n,c,d)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(d?'  → '+JSON.stringify(d):'')));};
ok('drew a stroke', !res.err, res);
ok('stroke snapped to ruler line (dev < 3px despite ±18px zigzag)', res.maxDevFromRuler!=null && res.maxDevFromRuler < 3, res);
console.log('\n'+pass+' passed, '+fail+' failed');
await browser.close();
process.exit(fail?1:0);
