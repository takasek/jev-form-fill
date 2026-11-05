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
