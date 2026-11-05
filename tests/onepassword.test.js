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
  assert.deepEqual([...document.querySelectorAll('#profileRows select')].map(s=>s.value),['0','']);
});
