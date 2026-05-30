import { chromium } from 'playwright';
const APP_URL='http://localhost/pdfMiniPro/index.html';
const browser=await chromium.launch({headless:true});
async function mkPdf(){const p=await browser.newPage();await p.setContent('<html><body style="margin:0;background:#fff"></body></html>');const b=await p.pdf({width:'600px',height:'800px',printBackground:true});await p.close();return b;}
const pdf=await mkPdf();
// touch device emulation: isMobile => pointer:coarse and no fine
const ctx=await browser.newContext({viewport:{width:412,height:840},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('[pageerror]',e.message));
page.on('console',m=>{if(m.type()==='error')console.log('[console]',m.text());});
page.on('dialog',d=>d.dismiss().catch(()=>{}));
await page.addInitScript(()=>{try{localStorage.setItem('pdfMini.onboardedVersion','99.0')}catch(_){}});
await page.goto(APP_URL,{waitUntil:'networkidle'});
await page.evaluate(()=>document.querySelectorAll('.modal-overlay,.onboard-overlay,#onboardModal,#mobileNotice').forEach(m=>m.remove?m.remove():(m.hidden=true)));
await page.setInputFiles('#fileInput',{name:'f.pdf',mimeType:'application/pdf',buffer:pdf});
await page.waitForSelector('.page-wrapper .overlay',{timeout:15000});
await page.waitForTimeout(500);

let pass=0,fail=0;const ok=(n,c,d)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+(d?'  → '+JSON.stringify(d):'')));};

ok('data-touch flag set on touch device', await page.evaluate(()=>document.body.getAttribute('data-touch')==='1'));

// create a text annotation and drag it via synthetic TOUCH pointer events
const res = await page.evaluate(async ()=>{
  try{ setTool('select'); }catch(_){}
  const overlay=document.querySelector('.overlay[data-page-num="1"]')||document.querySelector('.overlay');
  const ann = createTextAnnotationFromLines({pageNum:1,x:80,y:120,overlay},[[{text:'Hello'}]],24,{});
  if(!ann||!ann.el) return {err:'no ann'};
  const el=ann.el; const r=el.getBoundingClientRect();
  const sx=r.x+r.width/2, sy=r.y+r.height/2;
  const x0=ann.x, y0=ann.y;
  const pe=(t,cx,cy)=>new PointerEvent(t,{pointerType:'touch',pointerId:7,clientX:cx,clientY:cy,button:0,buttons:1,bubbles:true});
  el.dispatchEvent(pe('pointerdown',sx,sy));
  for(let i=1;i<=6;i++) window.dispatchEvent(pe('pointermove',sx+ i*10, sy+ i*8));
  window.dispatchEvent(pe('pointerup',sx+60,sy+48));
  return { movedX: Math.round(ann.x-x0), movedY: Math.round(ann.y-y0) };
});
ok('text annotation drags by touch', !res.err && Math.abs(res.movedX)>20 && Math.abs(res.movedY)>20, res);

// in select mode, a one-finger touch on empty page must NOT spawn a marquee (so page can pan)
const marq = await page.evaluate(()=>{
  try{ setTool('select'); }catch(_){}
  const overlay=document.querySelector('.overlay[data-page-num="1"]')||document.querySelector('.overlay');
  const r=overlay.getBoundingClientRect();
  overlay.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',pointerId:9,clientX:r.x+r.width-10,clientY:r.y+r.height-10,button:0,bubbles:true}));
  const has=!!overlay.querySelector('.marquee-rect');
  return has;
});
ok('no marquee from one-finger touch in select mode (page can pan)', marq===false);

console.log('\n'+pass+' passed, '+fail+' failed');
await browser.close();
process.exit(fail?1:0);
