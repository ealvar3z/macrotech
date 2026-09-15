/* Local Chromium smoke checks. Never run against a hosted URL. */
const {chromium}=require(process.env.MACROTECH_PLAYWRIGHT || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'evidence','screenshots');
fs.mkdirSync(output,{recursive:true});
const server=spawn(process.env.MACROTECH_PYTHON || 'python',['-B','tests/preview_server.py'],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverError='';server.stderr.on('data',b=>{serverError+=b});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let browser;
 try {
  for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:8766')).ok)break}catch{}await delay(100)}
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{window.pywebview={api:new Proxy({}, {get:(_,name)=>async(...args)=>{const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});const data=await r.json();if(data.error)throw Error(data.error);return data.result}})}});
  await page.goto('http://127.0.0.1:8766');
  await page.getByRole('heading',{name:'My Quotations',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Master Tracker/i}).count(),0);
  await page.screenshot({path:path.join(output,'employee-dashboard.png'),fullPage:true});
  await page.locator('.role-switch select').selectOption('CEO');
  await page.getByRole('heading',{name:'CEO Command Center'}).waitFor();
  await page.locator('.text-action').first().click();
  await page.getByRole('button',{name:'Approve & next request'}).waitFor();
  await page.screenshot({path:path.join(output,'approval-review.png'),fullPage:true});
  await page.getByLabel('Approved discount percentage').fill('5');
  await page.getByRole('button',{name:'Approve & next request'}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Got it',exact:true}).click();
  await page.getByRole('button',{name:'Approve & next request'}).waitFor();
  // Inspect the remaining pending record in the full quotation editor.
  const detail=page.getByRole('button',{name:/details|full quotation/i}).first();
  await detail.click();
  await page.getByRole('button',{name:'Preview approval email · no sending'}).click();
  const frame=page.frameLocator('iframe');
  await frame.getByText('View Approval Record',{exact:true}).waitFor();
  assert.equal(await frame.getByRole('link').count(),3);
  for(const href of await frame.getByRole('link').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')))) assert.equal(href,'#preview-only');
  await page.screenshot({path:path.join(output,'email-preview-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'email-preview-mobile.png'),fullPage:true});
  assert.equal(await frame.locator('body').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'Email overflows mobile iframe');
  assert.deepEqual(errors,[]);
  console.log('PASS: employee navigation, no employee Master controls, CEO review, 5% approval, next record, inert 3-action email preview, 390px responsive email; no browser JS errors.');
 } catch(e) {console.error(serverError.slice(-1500));throw e}
 finally {if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
