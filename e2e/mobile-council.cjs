/** Local-only authenticated viewport acceptance: intercepted synthetic TEST data.
 * Never authenticates against production or advertises mock numbers as live.
 * Run: HERMES_E2E_URL=http://127.0.0.1:3107 npm run test:e2e
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const secret = process.env.OS_SESSION_SECRET;
const origin = process.env.HERMES_E2E_URL || 'http://127.0.0.1:3107';
if (!secret || secret.length < 32 || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error('Isolated localhost and test-only OS_SESSION_SECRET required');
const hash = 'a'.repeat(64), at = '2026-10-16T19:00:00Z';
const snapshot = {
  schema_version:3,mode:'council',fixture:false,live_orders_enabled:false,
  generated_at:at, counts:{registered:267,scanned:267,research:1,paper_days:3},
  messages:[],report:null,blockers_nl:[],stocks:[],next_cursor:null,
  research_active:false,
  cases:[{case_id:'case-001',instrument_id:'LNG',name:'Cheniere Energy',
    generated_at:at,status:'RESEARCH_COMPLETE',evidence_hash:hash,decision:'WATCHLIST'}],
  budget:{total_consumed:0,limit:20,chat_consumed:0,chat_limit:4},
  portfolio:{cash:'100000',total_value:'100000',holdings:[]},pnl_amount:'0',
  paper_portfolio:{observed_at:at,positions:[],paper_journal:[
    {date:'2026-10-16',observed_at:at,status_nl:'Geen handel uitgevoerd',
     risk_status:null,risk_reasons:[],portfolio_value:'100000',cash:'100000',transaction:null}]}
};
const archive = {
 fixture:false, case:{case_id:'case-001',status:'RESEARCH_COMPLETE',evidence_hash:hash},
 evidence:{snapshot_hash:hash,sources:[]},messages:[
  {message_id:'test-001',role:'FUNDAMENTAL',text_nl:JSON.stringify({text_nl:'Onderbouwde analyse.',facts:['Omzet gecontroleerd'],interpretation:'Bronanalyse.'}),
   generated_at:at,fixture:false,reply_to:null,evidence_refs:[]},
  {message_id:'test-002',role:'CIO',text_nl:'Voorlopig op de volglijst.',
   generated_at:at,fixture:false,reply_to:'test-001',evidence_refs:[]},
 ]
};
function signedCookie() {
 const now=Math.floor(Date.now()/1000);
 const body=Buffer.from(JSON.stringify({sub:'owner',iat:now,exp:now+3600,
   nonce:crypto.randomUUID(),v:1})).toString('base64url');
 const signature=crypto.createHmac('sha256',secret).update(body).digest('base64url');
 return body+'.'+signature;
}
(async () => {
 const browser=await chromium.launch({headless:true,
   executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined,
   args:['--no-sandbox']});
 try {
  for (const vp of [{width:390,height:844},{width:1440,height:900}]) {
   const context=await browser.newContext({viewport:vp});
   await context.addCookies([{name:'hermes_os_session',value:signedCookie(),
     url:origin,httpOnly:true,sameSite:'Lax'}]);
   const page=await context.newPage();
   await page.route('**/api/os/council*', async route=>{
     const data=route.request().url().includes('/archive?')?archive:snapshot;
     await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   });
   const logs=[];
   page.on('pageerror',error=>logs.push(error.message));
   await page.goto(origin+'/onderzoeksraad',{waitUntil:'domcontentloaded',timeout:1200000});
   await page.getByRole('button',{name:/Cheniere Energy/}).waitFor({timeout:120000});
   const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
   assert.equal(await overflow(),true,'council horizontal overflow '+vp.width);
   if (vp.width===390) {
     assert.equal(await page.getByRole('region',{name:'Groepsgesprek'}).isVisible(),false);
     await page.getByRole('button',{name:/Cheniere Energy/}).click();
     assert.equal(await page.getByRole('region',{name:'Groepsgesprek'}).isVisible(),true);
     const back=page.getByRole('button',{name:'← Terug naar overzicht'});
     assert.equal(await back.isVisible(),true);
     const target=await back.boundingBox();
     assert(target.height>=44,'back button <44px');
     const details = page.getByText('Toon broncijfers').first();
     await details.waitFor({timeout:20000});
     const sourceTarget=await details.boundingBox();
     assert(sourceTarget && sourceTarget.height>=44,'source details <44px');
     await back.click();
     assert.equal(await page.getByRole('region',{name:'Groepsgesprek'}).isVisible(),false);
   } else {
     assert.equal(await page.getByRole('region',{name:'Groepsgesprek'}).isVisible(),true);
   }
   assert(!/forward_pe:ABSENT_|quote_summary_raw_sha256:/.test(await page.locator('body').innerText()));
   await page.goto(origin+'/trading',{waitUntil:'domcontentloaded',timeout:1200000});
   await page.getByText('Portefeuillewaarde').first().waitFor({timeout:120000});
   assert.equal(await overflow(),true,'trading horizontal overflow '+vp.width);
   const body=await page.locator('body').innerText();
   assert(body.includes('100.000'),'synthetic cash not rendered');
   assert(body.includes('3 / 20'),'synthetic paper-days not rendered');
   assert(!/forward_pe:ABSENT_|quote_summary_raw_sha256:/.test(body));
   assert.deepEqual(logs,[],'page errors');
   console.log('PASS',JSON.stringify({viewport:vp,council_overflow:false,trading_overflow:false,
    mobile_chat_transition:vp.width===390?'PASS':'N/A',
    touch_back_min44:vp.width===390?'PASS':'N/A',debug_strings:'ABSENT',
    synthetic_fixture:true}));
   await context.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
