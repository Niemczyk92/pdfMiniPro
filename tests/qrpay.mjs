import { chromium } from 'playwright';
const APP_URL='http://localhost/pdfMiniPro/index.html';
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1400,height:1000}});
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('[pageerror]',e.message));
page.on('dialog',d=>d.dismiss().catch(()=>{}));
await page.addInitScript(()=>{try{localStorage.setItem('pdfMini.onboardedVersion','99.0')}catch(_){}});
await page.goto(APP_URL,{waitUntil:'networkidle'});
const r=await page.evaluate(()=>({
  iban: _czAccountToIban('19-2000145399','0800'),
  ibanPlain: _czAccountToIban('2000145399','0800'),
  ibanDirect: _czAccountToIban('CZ65 0800 0000 1920 0014 5399',''),
  spd: QR_TEMPLATES.payment.build({qrf_acc:'19-2000145399',qrf_bank:'0800',qrf_amount:'450',qrf_cur:'CZK',qrf_vs:'1234567890',qrf_msg:'Invoice 2024-001'}),
  empty: QR_TEMPLATES.payment.build({qrf_acc:'',qrf_bank:''}),
}));
let pass=0,fail=0;const ok=(n,c,d)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,console.log('  ✗ '+n+'  → '+JSON.stringify(d)));};
ok('CZ account → correct IBAN (mod-97)', r.iban==='CZ6508000000192000145399', r.iban);
ok('IBAN pasted directly is normalised', r.ibanDirect==='CZ6508000000192000145399', r.ibanDirect);
ok('SPAYD payload well-formed', /^SPD\*1\.0\*ACC:CZ6508000000192000145399\*AM:450\.00\*CC:CZK\*X-VS:1234567890\*MSG:Invoice 2024-001$/.test(r.spd||''), r.spd);
ok('empty account → empty payload', r.empty==='', r.empty);
console.log('\n'+pass+' passed, '+fail+' failed');
await browser.close();
process.exit(fail?1:0);
