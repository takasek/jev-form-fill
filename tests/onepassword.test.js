import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {startReview} from '../onepassword.js';
const {JSDOM}=createRequire(import.meta.url)(process.env.JEV_TEST_DEPS || 'jsdom');

test('only reads the selected source, then fills the corrected destination on explicit apply', async()=>{
  const html=await readFile(new URL('../onepassword.html',import.meta.url),'utf8');
  const {window:{document}}=new JSDOM(html);
  const reads=[], writes=[];
  const api={
    scan:async()=>({token:'plan',url:'https://example.test/form',fields:[
      {id:'a',kind:'text',label:'Name'}, {id:'b',kind:'text',label:'Recipient'}
    ]}),
    native:async request=>{
      if(request.op==='list') return {fields:[{id:'first',label:'Unused'},{id:'second',label:'Name'}]};
      reads.push(request);return {value:'private fixture'};
    },
    apply:async request=>{writes.push(request);return [{status:'filled',reason:'入力して読戻しを確認しました。'}];}
  };
  await startReview(document,api,'en');
  const field=id=>document.getElementById(id);
  assert.deepEqual(reads,[]);
  field('field').value='second';
  await field('field').onchange();
  assert.deepEqual(reads,[{op:'read',id:'second'}]);
  assert.equal(field('preview').textContent,'private fixture');
  assert.equal(field('destination').value,'a');
  field('destination').value='b';
  field('destination').onchange();
  assert.deepEqual(writes,[]);
  await field('fill').onclick();
  assert.deepEqual(writes,[{op:'apply',privateFill:true,token:'plan',rows:[{id:'b',value:'private fixture'}]}]);
  assert.equal(document.body.textContent.includes('private fixture'),false);
  assert.equal(field('fill').disabled,true);
});

test('one profile suggests multiple destinations, keeps ambiguity open, accepts one correction and applies once', async()=>{
  const html=await readFile(new URL('../onepassword.html',import.meta.url),'utf8');
  const {window:{document}}=new JSDOM(html);
  let applied=[];
  const profile=[{role:'given-name',label:'First name',value:'Hanako'},{role:'family-name',label:'Last name',value:'Arai'},
    {role:'email',label:'Email',value:'fixture@example.test'}];
  const fields=['名','姓','受領者の連絡先','用途'].map((label,i)=>({kind:'text',type:'text',id:'f'+i,label,context:'配送先'}));
  await startReview(document,{
    scan:async()=>({fields,token:'t',url:'https://example.test'}),
    native:async r=>r.op==='list'?{profile:true}:{fields:profile},
    apply:async r=>{applied.push(r.rows);return r.rows.map(row=>({...row,status:'filled'}));}
  },'ja');
  const selects=[...document.querySelectorAll('#profileRows select')];
  assert.equal(selects.length,4);
  assert.deepEqual(selects.map(s=>s.value),['0','1','','']);
  selects[2].value='2';selects[2].onchange();
  assert.equal(applied.length,0);
  await document.querySelector('#profileFill').onclick();
  assert.deepEqual(applied,[[{id:'f0',value:'Hanako'},{id:'f1',value:'Arai'},{id:'f2',value:'fixture@example.test'}]]);
  assert.ok(!document.body.textContent.includes('fixture@example.test'));
});

test('an identity email is not automatically duplicated into a different person’s section',async()=>{
  const html=await readFile(new URL('../onepassword.html',import.meta.url),'utf8');
  const {window:{document}}=new JSDOM(html);
  const fields=['Applicant','Emergency contact'].map((context,i)=>({id:'f'+i,kind:'text',type:'email',label:'Email',context}));
  await startReview(document,{scan:async()=>({fields}),native:async r=>r.op==='list'?{profile:true}:{fields:[
    {role:'email',label:'Email',value:'fixture@example.test'}]}},'en');
  assert.ok(document.querySelector('#profileFill').disabled);
  document.querySelector('#profileSections input').click();
  assert.deepEqual([...document.querySelectorAll('#profileRows select')].map(s=>s.value),['0','']);
});

test('setup and identity failures offer actionable help and a local retry',async()=>{
  const html=await readFile(new URL('../onepassword.html',import.meta.url),'utf8');
  for (const failure of ['missing','authorization','cli-error']) {
    const {window:{document}}=new JSDOM(html);
    let retried=0;
    await startReview(document,{scan:async()=>({fields:[{kind:'text'}]}),rescan:()=>retried++,
      native:async r=>{if(failure==='missing') throw Error();return r.op==='list'?{profile:true}:{error:failure};}},'ja');
    assert.equal(document.querySelector('#profileRescan').hidden,false);
    document.querySelector('#profileRescan').click();assert.equal(retried,1);
    assert.match(document.querySelector('#status').textContent,failure==='authorization'?/認証/:failure==='cli-error'?/保管庫/:/設定/);
    assert.equal(document.querySelector('#setupHelp').hidden,false);
  }
});

test('a page interaction is announced before apply and review can resume with edits without reading the vault again',async()=>{
  const {pageCommand}=await import('../page.js');
  const form=new JSDOM('<form><h2>連絡先</h2><label>メールアドレス<input type=email></label></form>',
    {url:'https://example.test/contact',runScripts:'outside-only'});
  form.window.HTMLElement.prototype.getClientRects=()=>[{width:100,height:20}];
  form.window.TextEncoder=TextEncoder;
  Object.defineProperty(form.window.crypto,'subtle',{value:crypto.subtle});
  const command=form.window.eval('('+pageCommand.toString()+')');
  const html=await readFile(new URL('../onepassword.html',import.meta.url),'utf8');
  const document=new JSDOM(html).window.document;
  let monitor,reads=0;
  const api={
    scan:options=>command({op:'scan',privateFill:true,...options}),
    inspect:token=>command({op:'inspect',privateFill:true,token}),
    watch:(token,callback)=>{monitor=()=>callback(command({op:'inspect',privateFill:true,token}));return ()=>{};},
    native:async request=>request.op==='list'?{profile:true}:(reads++,{fields:[{role:'email',label:'Email',value:'stored@example.test'}]}),
    apply:command
  };
  await startReview(document,api,'ja');
  const edit=document.querySelector('#edit-f0');edit.value='order@example.test';edit.oninput();
  form.window.document.querySelector('h2').click();
  await monitor();
  assert.equal(document.querySelector('#profileFill').disabled,true);
  assert.equal(document.querySelector('#profileRescan').hidden,false);
  assert.match(document.querySelector('#status').textContent,/確認/);
  await document.querySelector('#profileRescan').onclick();
  assert.equal(reads,1);
  assert.equal(document.querySelector('#edit-f0').value,'order@example.test');
  assert.equal(document.querySelector('#profileFill').disabled,false);
  await document.querySelector('#profileFill').onclick();
  assert.equal(form.window.document.querySelector('input').value,'order@example.test');
  assert.equal(document.body.textContent.includes('order@example.test'),false);
  form.window.close();
});
