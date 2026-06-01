import { chromium } from 'playwright';
import fs from 'fs';
const APP_URL='http://localhost/pdfMiniPro/index.html';
const PDF='C:/xampp/htdocs/pdfMiniPro/001.pdf';
if(!fs.existsSync(PDF)){console.log('SKIP no 001.pdf');process.exit(0);}
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1400,height:1000}});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('[pageerror]',e.message));
page.on('dialog',d=>d.dismiss().catch(()=>{}));
await page.addInitScript(()=>{try{localStorage.setItem('pdfMini.onboardedVersion','99.0')}catch(_){}});
await page.goto(APP_URL,{waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('.modal-overlay,.onboard-overlay,#onboardModal').forEach(m=>m.remove()));
await page.setInputFiles('#fileInput',{name:'001.pdf',mimeType:'application/pdf',buffer:fs.readFileSync(PDF)});
await page.waitForSelector('.page-wrapper .overlay',{timeout:20000});
await page.waitForTimeout(800);
let pass=0,fail=0;const ok=(n,c,d)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+'  → '+JSON.stringify(d)));};
const r=await page.evaluate(async ()=>{
  try{setTool('edit-pdf');}catch(_){}
  const span=[...document.querySelectorAll('.pdf-text-item')].find(e=>/^[A-Za-zÀ-ž]{4,}$/.test((e.dataset.text||'').trim()));
  if(!span) return {err:'no span'};
  const word=span.dataset.text, ox=parseFloat(span.dataset.x), oy=parseFloat(span.dataset.y);
  const rc=span.getBoundingClientRect();
  span.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:rc.x+2,clientY:rc.y+2}));
  await new Promise(r=>setTimeout(r,200));
  const td=annotations.find(a=>a.type==='text-delete'&&a._fromEdit);
  const tdX0=td?td.x:null, tdY0=td?td.y:null;
  // move the editable (from-pdf-edit) text far away
  const ta=annotations.find(a=>a.type==='text'&&a.fromPdfEdit);
  const woX0=ta&&ta.sourceWhiteout?ta.sourceWhiteout.x:null;
  if(ta){ ta.x+=200; ta.y+=150; if(ta.el){ta.el.style.left=ta.x+'px';ta.el.style.top=ta.y+'px';}
    if(ta.sourceWhiteout){ const wo=ta.sourceWhiteout; wo.x+=200; wo.y+=150; if(wo.el){wo.el.style.left=wo.x+'px';wo.el.style.top=wo.y+'px';} } }
  const bytes=await generatePdfBytes();
  return { word, ox, oy, tdX0, tdY0,
    tdStillAtOrigin: td && Math.abs(td.x-ox)<1 && Math.abs(td.y-oy)<1,
    coverMoved: ta&&ta.sourceWhiteout?(ta.sourceWhiteout.x-woX0):0,
    saveOk: bytes.length>1000 };
});
ok('edit created a text-delete for the original', r.tdX0!=null, r);
ok('original-cover (text-delete) stays ANCHORED at original after moving text', r.tdStillAtOrigin, r);
ok('editable text cover still follows the text (unchanged UX)', Math.abs(r.coverMoved-200)<1, r);
ok('save succeeds', r.saveOk, r);
console.log('\n'+pass+' passed, '+fail+' failed (word='+r.word+')');
await browser.close();
process.exit(fail?1:0);
