import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {evaluate} from '../core.js';
import {pageCommand} from '../page.js';
import {startPopup} from '../popup.js';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.JEV_TEST_DEPS || 'jsdom');
const html=await readFile(new URL('../popup.html',import.meta.url),'utf8');
const waitFor=async condition=>{for(let i=0;i<200;i++){if(condition()) return;await new Promise(r=>setTimeout(r,10));}throw new Error('UI did not settle');};
function popup({evaluateFn=evaluate,call=async()=>({answers:{}}),pageFn=()=>({token:'t',fields:[{id:'f0',kind:'checkbox',label:'Active'}]}),uiLanguage='ja',initialSaved={}}={}) {
  const dom=new JSDOM(html,{url:'https://extension.test/popup.html',runScripts:'outside-only'});
  const win=dom.window;
  let saved={...initialSaved};
  win.chrome={runtime:{getManifest:()=>({version:'0.1.6',version_name:'test-build'})},i18n:{getUILanguage:()=>uiLanguage},storage:{local:{setAccessLevel:async()=>{},get:async()=>saved,set:async x=>{saved={...saved,...x};},remove:async key=>{delete saved[key];}}},tabs:{query:async()=>[{id:1,url:'https://example.com/form'}]},scripting:{executeScript:async x=>[{result:await pageFn(x.args[0])}]}};
  startPopup(win.document, win.chrome, {evaluateFields:evaluateFn, requestApi:call});
  return {dom,win,$:id=>win.document.getElementById(id),saved:()=>saved};
}
test('editing source during an in-flight analysis cannot revive stale candidates', async()=>{
  let complete;
  const ui=popup({evaluateFn:()=>new Promise(resolve=>{complete=resolve;})});
  await waitFor(()=>ui.$('target').textContent.includes('example.com'));
  ui.$('api-key').value='test-key';ui.$('source').value='Name: Alice';ui.$('analyze').click();
  await waitFor(()=>complete);
  assert.equal(ui.$('source').readOnly,true);
  ui.$('source').value='Name: Bob';ui.$('source').dispatchEvent(new ui.win.Event('input'));
  complete([{id:'f0',field:{label:'Name'},status:'ready',value:'Alice'}]);
  await waitFor(()=>!ui.$('analyze').disabled);
  assert.equal(ui.$('apply').disabled,true);
  assert.equal(ui.$('results').hidden,true);
  assert.match(ui.$('status').textContent,/文章が変わ/);
});
test('English popup localizes controls, API errors and apply failures',async()=>{
  const ui=popup({uiLanguage:'en-US',evaluateFn:async()=>[{id:'f0',field:{label:'Active',kind:'checkbox'},status:'ready',value:false,display:'オフ',reason:'元の文章に一致する候補です。'}],pageFn:request=>request.op==='apply'?[{id:'f0',status:'failed',reason:'入力後にページが値を変更しました。'}]:{token:'t',fields:[{id:'f0',kind:'checkbox',label:'Active'}]}});
  await waitFor(()=>ui.$('target').textContent.includes('example.com'));
  assert.equal(ui.win.document.documentElement.lang,'en');
  assert.equal(ui.$('target').textContent,'Target · example.com/form');
  assert.equal(ui.$('analyze').textContent,'Create proposals with TypeSafe');
  ui.$('source').value='Active: off';ui.$('analyze').click();await waitFor(()=>!ui.$('analyze').disabled);
  assert.match(ui.$('status').textContent,/Set your TypeSafe API key/);
  ui.$('api-key').value='test-key';ui.$('analyze').click();await waitFor(()=>!ui.$('analyze').disabled);
  assert.equal(ui.$('count').textContent,'1 proposals / 1 fields');
  assert.match(ui.$('rows').textContent,/Off/);
  ui.$('apply').click();await waitFor(()=>!ui.$('analyze').disabled);
  assert.match(ui.$('status').textContent,/Could not set: 1/);
  assert.match(ui.$('rows').textContent,/The page changed the value after filling/);
});

test('switching language preserves source values, unchecked proposals and API key preferences',async()=>{
  const candidates=[{id:'f0',field:{label:'氏名',kind:'text'},status:'ready',value:'新井 美香',display:'新井 美香',reason:'元の文章に一致する候補です。'},{id:'f1',field:{label:'Active',kind:'checkbox'},status:'ready',value:false,display:'オフ',reason:'元の文章に一致する候補です。'}];
  const ui=popup({uiLanguage:'en',initialSaved:{apiKey:'saved-key'},evaluateFn:async()=>structuredClone(candidates),pageFn:()=>({token:'t',fields:[{id:'f0',kind:'text',label:'氏名'}],unsupported:true})});
  await waitFor(()=>ui.$('target').textContent.includes('example.com'));
  ui.$('source').value='氏名: 新井 美香';ui.$('analyze').click();await waitFor(()=>!ui.$('analyze').disabled);
  ui.win.document.querySelector('[data-field-id=f0]').checked=false;
  ui.$('language').value='ja';ui.$('language').dispatchEvent(new ui.win.Event('change'));await waitFor(()=>ui.$('analyze').textContent==='TypeSafeへ送って候補を作る');
  assert.equal(ui.$('source').value,'氏名: 新井 美香');
  assert.equal(ui.$('target').textContent,'入力先 · example.com/form');
  assert.equal(ui.$('status').textContent,'候補を作成しました。確認後に入力してください。 独自の選択UIやiframeは対象外になる場合があります。');
  assert.equal(ui.win.document.querySelector('[data-field-id=f0]').checked,false);
  assert.match(ui.$('rows').textContent,/新井 美香/);
  assert.equal(ui.saved().apiKey,'saved-key');assert.equal(ui.saved().uiLanguage,'ja');
  ui.$('forget-key').click();await waitFor(()=>!ui.$('forget-key').disabled);
  assert.deepEqual(ui.saved(),{uiLanguage:'ja'});
});
test('full popup-to-form flow uses real planner and page adapter, supports OFF and undo without submission', async()=>{
  const form=new JSDOM(`<form><h2>Webhook</h2><label><input id=active type=checkbox checked>Active</label><button type=submit>Submit</button></form>`,{url:'https://example.com/form',runScripts:'outside-only'});
  form.window.HTMLElement.prototype.getClientRects=function(){return [{width:10,height:10}];};
  const page=form.window.eval(`(${pageCommand.toString()})`);
  let submissions=0;form.window.document.querySelector('form').addEventListener('submit',()=>submissions++);
  const ui=popup({pageFn:page,call:async body=>({answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>[id,q.type==='noul'?{type:'noul',noul:0.99}:{type:'choice',choice:'off',confidence:0.99,probabilities:{skip:0.005,on:0.005,off:0.99}}]))})});
  await waitFor(()=>ui.$('target').textContent.includes('example.com'));
  ui.$('api-key').value='test-key';ui.$('source').value='Webhook: Active のチェックを外す';ui.$('analyze').click();
  await waitFor(()=>!ui.$('analyze').disabled);
  assert.equal(ui.$('apply').disabled,false);
  assert.equal(ui.$('count').textContent,'1件の候補 / 1項目');
  const diagnostics=JSON.parse(ui.$('diagnostics').value);
  assert.equal(diagnostics.rows[0].diagnostics.at(-1).stage,'verification');
  assert.equal(diagnostics.rows[0].diagnostics.at(-1).accepted,true);
  assert.equal(ui.$('diagnostics').value.includes('test-key'),false);
  ui.$('apply').click();await waitFor(()=>!ui.$('analyze').disabled);
  assert.equal(form.window.document.querySelector('#active').checked,false);
  assert.equal(ui.$('apply').disabled,true);
  assert.match(ui.$('status').textContent,/1件を入力/);
  ui.$('undo').click();await waitFor(()=>!ui.$('analyze').disabled);
  assert.equal(form.window.document.querySelector('#active').checked,true);
  assert.equal(submissions,0);
});
test('a failed API request leaves the form untouched and no apply plan; keys are stored only on explicit save',async()=>{
  let applies=0;
  const ui=popup({call:async()=>{throw new Error('quota');},pageFn:request=>{if(request.op==='apply') applies++;return {token:'t',fields:[{id:'f0',kind:'checkbox',label:'Active'}]};}});
  await waitFor(()=>ui.$('target').textContent.includes('example.com'));
  ui.$('api-key').value='test-key';ui.$('source').value='Active: off';ui.$('analyze').click();
  await waitFor(()=>!ui.$('analyze').disabled);
  assert.match(ui.$('status').textContent,/quota/);assert.equal(ui.$('apply').disabled,true);assert.equal(applies,0);assert.deepEqual(ui.saved(),{});
  ui.$('remember').checked=true;ui.$('save-key').click();await waitFor(()=>!ui.$('save-key').disabled);
  assert.equal(ui.saved().apiKey,'test-key');
  ui.$('forget-key').click();await waitFor(()=>!ui.$('forget-key').disabled);
  assert.deepEqual(ui.saved(),{});
});

test('an empty undo history explains how to correct a private fill',async()=>{
  const ui=popup({uiLanguage:'ja',pageFn:()=>[]});
  await waitFor(()=>ui.$('target').textContent.includes('example.com'));
  ui.$('undo').click();await waitFor(()=>!ui.$('undo').disabled);
  assert.match(ui.$('status').textContent,/1Password/);
});

test('mixed selection keeps an occupied field and reports both outcomes without disclosing inputs',async()=>{
  const dom=new JSDOM('<form aria-label="Private caption"><label>First<input name=a value=secret-old></label><label>Second<input name=b></label></form>',{url:'https://example.test/',runScripts:'outside-only'});
  dom.window.HTMLElement.prototype.getClientRects=()=>[{width:10,height:10}];
  const command=dom.window.eval('('+pageCommand.toString()+')');
  const ui=popup({pageFn:command,evaluateFn:async(source,fields)=>fields.map(field=>({field,id:field.id,status:'ready',value:source,display:source}))});
  await waitFor(()=>ui.$('target').textContent.includes('example.com'));
  ui.$('api-key').value='fake-api-key';ui.$('source').value='secret-new';ui.$('analyze').click();
  await waitFor(()=>!ui.$('analyze').disabled);
  assert.match(ui.$('rows').firstChild.textContent,/入力済み/);
  ui.$('rows').querySelector('input').checked=false;
  ui.$('apply').click();
  assert.equal(ui.$('cancel').hidden,true);
  await waitFor(()=>!ui.$('analyze').disabled);
  assert.deepEqual(Array.from(dom.window.document.querySelectorAll('input'),el=>el.value),['secret-old','secret-new']);
  assert.equal(ui.$('rows').querySelectorAll('input:checked').length,0);
  assert.match(ui.$('rows').firstChild.textContent,/選択しなかった/);
  const summary=JSON.parse(ui.$('support').value);
  assert.equal(summary.build,'test-build');
  assert.deepEqual(summary.rows.map(row=>row.selected),[false,true]);
  assert.equal(summary.rows[1].wrote,true);
  assert.doesNotMatch(ui.$('support').value,/secret-|fake-api|First|Second|Private caption|example\.test/);
  dom.window.close();
});

test('a later batch failure reports only operational details and the cost of restarting',async()=>{
  let calls=0;
  const fields=Array.from({length:9},(_,i)=>({id:'f'+i,kind:'checkbox',label:'Private label'}));
  const ui=popup({pageFn:()=>({token:'t',fields}),call:async body=>{
    if(++calls===2) throw Object.assign(new Error('quota'),{httpStatus:429});
    return {answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>[id,{type:'choice',choice:'skip',confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k==='skip')]))}]))};
  }});
  await waitFor(()=>ui.$('target').textContent.includes('example.com'));
  ui.$('api-key').value='fake-key';ui.$('source').value='private source';ui.$('analyze').click();
  await waitFor(()=>!ui.$('analyze').disabled);
  const report=JSON.parse(ui.$('support').value);
  assert.equal(report.batch,2);assert.equal(report.stage,'source');assert.equal(report.requests,2);
  assert.equal(report.httpStatus,429);
  assert.match(ui.$('status').textContent,/先頭から/);
  assert.equal(ui.$('apply').disabled,true);
  assert.doesNotMatch(ui.$('support').value,/private source|Private label|fake-key|example\.com/);
});

test('lost page during apply replaces successful analysis in the support summary',async()=>{
  const field={id:'f0',kind:'text',label:'Private'};
  const ui=popup({pageFn:r=>r.op==='scan'?{token:'t',fields:[field]}:undefined,
    evaluateFn:async()=>[{id:'f0',field,value:'private',status:'ready'}]});
  await waitFor(()=>ui.$('target').textContent.includes('example.com'));
  ui.$('api-key').value='key';ui.$('source').value='private';ui.$('analyze').click();
  await waitFor(()=>!ui.$('analyze').disabled);
  ui.$('apply').click();await waitFor(()=>!ui.$('analyze').disabled);
  const report=JSON.parse(ui.$('support').value);
  assert.equal(report.operation,'apply');assert.equal(report.error,'no_access');
});
