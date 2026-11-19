import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import puppeteer from 'puppeteer-core';

const executablePath=process.env.CHROME_BINARY;
if (!executablePath) throw new Error('Set CHROME_BINARY to a Chrome executable with extension automation support.');
const directory=await mkdtemp(join(tmpdir(),'jev-chrome-'));
const fixture=`<!doctype html><title>Registration</title>
  <form id="buyer" aria-label="Buyer"><label>Email<input name="keep" value="existing"></label>
  <label>Confirm<input name="matching" value="fixture"></label><label>Reference<input name="moving"></label></form>
  <h2 id="recipient">Recipient</h2><form id="guest" aria-labelledby="recipient">
  <label>Email<input name="dest"></label><label>Code<input name="trigger"></label></form>`;
const server=createServer((_,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(fixture);});
let browser;
try {
  execFileSync('python3',['-m','zipfile','-e',resolve('dist/jev-form-fill.zip'),directory]);
  await new Promise((done,reject)=>server.once('error',reject).listen(0,'127.0.0.1',done));
  browser=await puppeteer.launch({
    executablePath,pipe:true,enableExtensions:true,dumpio:process.env.CI==='true',
    args:['--disable-background-networking','--proxy-server=http://127.0.0.1:1','--proxy-bypass-list=127.0.0.1']
  });
  const id=await browser.installExtension(join(directory,'jev-form-fill'));
  assert.equal(id,'aphbpgobgclgapicghknakcleaalecnj');
  const extension=(await browser.extensions()).get(id);
  assert.ok(extension,'The packaged extension must load with the registered ID');
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  await extension.triggerAction(page);
  const target=await browser.waitForTarget(t=>t.url()==='chrome-extension://'+extension.id+'/popup.html');
  const popup=await target.asPage();
  await popup.waitForFunction(()=>document.getElementById('target').textContent.includes('127.0.0.1'));
  // Replace the paid model at the transport boundary. Everything from the popup to FormData is real.
  await popup.evaluate(()=>{
    window.fetch=async (url,{body})=>{
      if (url!=='https://api.typesafe.ai/v1/systemone') throw new Error('Unexpected request');
      const answers={};
      for (const [id,question] of Object.entries(JSON.parse(body).questions)) {
        if (question.type==='noul') {answers[id]={type:'noul',noul:1};continue;}
        const choice=Object.hasOwn(question.criteria,'p0')?'p0':'v0';
        answers[id]={type:'choice',choice,confidence:1,
          probabilities:Object.fromEntries(Object.keys(question.criteria).map(key=>[key,Number(key===choice)]))};
      }
      return Response.json({answers});
    };
    document.getElementById('source').value='Use "fixture"';
    document.getElementById('api-key').value='synthetic-key';
    document.getElementById('analyze').click();
  });
  await popup.waitForFunction(()=>document.querySelectorAll('#rows input:checked').length===5);
  const captions=await popup.$$eval('#rows .context',els=>els.map(el=>el.textContent));
  assert.match(captions[0],/Buyer/);
  assert.match(captions[3],/Recipient/);
  await popup.click('[data-field-id=f0]');
  await page.evaluate(()=>{
    document.querySelector('[name=moving]').setAttribute('form','guest');
    document.querySelector('[name=trigger]').oninput=()=>{
      document.querySelector('[name=matching]').value='site update';
      document.querySelector('[name=dest]').disabled=true;
    };
  });
  await popup.$eval('#apply',button=>button.click());
  await popup.waitForFunction(()=>!document.getElementById('analyze').disabled,{polling:'mutation'});
  const support=await popup.$eval('#support',el=>JSON.parse(el.value));
  assert.equal(support.version,extension.version);
  assert.ok(support.build.includes(support.version));
  assert.deepEqual(support.rows.map(row=>row.reason),['not_selected','value_changed','form_changed','disabled','match']);
  assert.doesNotMatch(JSON.stringify(support),/Recipient|Buyer|fixture|synthetic-key|127\.0\.0\.1/);
  assert.equal(await popup.$$eval('#rows input:checked',els=>els.length),0);
  assert.deepEqual(await page.evaluate(()=>Array.from(document.forms,form=>Object.fromEntries(new FormData(form)))),
    [{keep:'existing',matching:'site update'},{moving:'',trigger:'fixture'}]);
  await page.evaluate(()=>{document.body.innerHTML='<label>Field<input></label>'.repeat(161);});
  await popup.$eval('#analyze',button=>button.click());
  await popup.waitForFunction(()=>!document.getElementById('analyze').disabled,{polling:'mutation'});
  const scanReport=await popup.$eval('#support',el=>JSON.parse(el.value));
  assert.equal(scanReport.error,'field_limit');
  assert.equal(scanReport.fieldsFound,161);

  // Exercise the same isolated, document-pinned adapter used by the private review. No vault is opened.
  await page.evaluate(()=>{
    document.body.innerHTML='<form><label>Name<input name="person"></label></form>';
    const input=document.querySelector('input');
    input.oninput=()=>{input.disabled=true;};
  });
  const privateResults=await popup.evaluate(async()=>{
    const {pageCommand}=await import(chrome.runtime.getURL('page.js'));
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const [frame]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>true});
    const run=async request=>(await chrome.scripting.executeScript({
      target:{tabId:tab.id,documentIds:[frame.documentId]},world:'ISOLATED',func:pageCommand,
      args:[{privateFill:true,...request}]
    }))[0].result;
    const {token}=await run({op:'scan'});
    const [applied]=await run({op:'apply',token,rows:[{id:'f0',value:'fixture'}]});
    const [verified]=await run({op:'verify',token});
    return [applied,verified].map(row=>[row.code,row.wrote,row.valueMatches]);
  });
  assert.deepEqual(privateResults,[['disabled',true,true],['disabled',true,true]]);
  assert.equal(await page.evaluate(()=>new FormData(document.forms[0]).has('person')),false);

  console.log('Packaged Chrome popup, final form data, private recheck and scan errors verified.');
} finally {
  try { await browser?.close(); }
  finally {
    if (server.listening) await new Promise(done=>server.close(done));
    await rm(directory,{recursive:true,force:true});
  }
}
