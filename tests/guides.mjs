import { chromium } from 'playwright';
const APP_URL='http://localhost/pdfMiniPro/index.html';
const browser=await chromium.launch({headless:true});
async function mkPdf(){const p=await browser.newPage();await p.setContent('<html><body style="margin:0;background:#fff"></body></html>');const b=await p.pdf({width:'600px',height:'800px',printBackground:true});await p.close();return b;}
const pdf=await mkPdf();
const ctx=await browser.newContext({viewport:{width:1400,height:1000}});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('[pageerror]',e.message));
page.on('dialog',d=>d.dismiss().catch(()=>{}));
await page.addInitScript(()=>{try{localStorage.setItem('pdfMini.onboardedVersion','99.0')}catch(_){}});
await page.goto(APP_URL,{waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('.modal-overlay,.onboard-overlay,#onboardModal').forEach(m=>m.remove()));
await page.setInputFiles('#fileInput',{name:'f.pdf',mimeType:'application/pdf',buffer:pdf});
await page.waitForSelector('.page-wrapper .overlay',{timeout:15000});
await page.waitForTimeout(400);
let pass=0,fail=0;const ok=(n,c,d)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+'  → '+JSON.stringify(d)));};
await page.click('#rulerToggle'); // enable edge ruler
await page.waitForTimeout(200);
const r=await page.evaluate(()=>{
  const overlay=document.querySelector('.overlay[data-page-num="1"]')||document.querySelector('.overlay');
  const rect=overlay.getBoundingClientRect();
  const dbl=(cx,cy)=>overlay.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:cx,clientY:cy}));
  // double-click in TOP strip (y within RULER_STRIP) -> vertical guide
  dbl(rect.x+120, rect.y+6);
  // double-click in LEFT strip (x within RULER_STRIP) -> horizontal guide
  dbl(rect.x+6, rect.y+160);
  const guides=(_rulerGuides[1]||[]);
  const layer=overlay.querySelector('.guide-layer');
  const lines=layer?layer.querySelectorAll('.ruler-guide').length:0;
  return { count:guides.length, axes:guides.map(g=>g.axis), lines, inAnnotations: annotations.some(a=>a.type==='guide'||a.axis) };
});
ok('two guides created (1 vertical + 1 horizontal)', r.count===2 && r.axes.includes('v') && r.axes.includes('h'), r);
ok('guide lines rendered in guide-layer', r.lines===2, r);
ok('guides are NOT annotations (non-printing)', r.inAnnotations===false, r);
// toggle ruler off -> guides hidden
await page.click('#rulerToggle'); await page.waitForTimeout(150);
const hidden=await page.evaluate(()=>{const o=document.querySelector('.overlay[data-page-num="1"]')||document.querySelector('.overlay');return !o.querySelector('.guide-layer');});
ok('guides hidden when ruler toggled off', hidden);
console.log('\n'+pass+' passed, '+fail+' failed');
await browser.close();
process.exit(fail?1:0);
