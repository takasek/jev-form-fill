import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {startReview} from '../onepassword.js';
const html=readFileSync(new URL('../onepassword.html',import.meta.url),'utf8');
async function review(profile, fields) {
  const {window:{document}}=new JSDOM(html);
  const writes=[];
  await startReview(document,{
    scan:async()=>({token:'t',fields:fields.map((f,i)=>({id:'f'+i,type:'text',kind:'text',...f}))}),
    native:async r=>r.op==='list'?{profile:true}:{fields:profile},
    apply:async r=>{writes.push(...r.rows);return r.rows.map(row=>({...row,status:'filled'}));}
  },'ja');
  return {document,writes,apply:()=>document.querySelector('#profileFill').onclick()};
}

test('uses each destination’s name separator, preserving stored family and given names',async()=>{
  for (const [hint,expected] of [['姓と名の間に全角スペース','朝日　花子'],['スペースなし','朝日花子']]) {
    const ui=await review([{role:'family-name',label:'姓',value:'朝日'},{role:'given-name',label:'名',value:'花子'}],
      [{label:'氏名（'+hint+'）'}]);
    await ui.apply();
    assert.equal(ui.writes[0]?.value,expected);
  }
});

test('keeps the variable area code and leading zero for labelled telephone parts',async()=>{
  const ui=await review([{role:'tel',label:'電話',value:'０３－１２３４－５６７８'}],
    ['市外局番','市内局番','加入者番号'].map(label=>({label,type:'tel'})));
  await ui.apply();
  assert.deepEqual(ui.writes.map(x=>x.value),['03','1234','5678']);
});

test('formats a whole phone as digits, and does not guess ambiguous area codes',async()=>{
  const ui=await review([{role:'tel',label:'電話',value:'03-1234-5678'}],[{label:'電話番号（ハイフンなし）'}]);
  await ui.apply();assert.equal(ui.writes[0]?.value,'0312345678');
  const split=await review([{role:'tel',label:'電話',value:'0312345678'}],[{label:'市外局番',type:'tel'}]);
  assert.equal(split.document.querySelector('#map-f0').value,'');
});

test('places the parcel on the side requested by the form and preserves building digits',async()=>{
  const source=[{role:'street-address',label:'住所',value:'東京都架空区若葉町2丁目3番4号 若葉ビル501号室'}];
  for (const [labels,expected] of [
    [['住所（番地まで）','建物名'],['東京都架空区若葉町2丁目3番4号','若葉ビル501号室']],
    [['住所（番地より前）','番地以降'],['東京都架空区若葉町','2丁目3番4号 若葉ビル501号室']]
  ]) {
    const ui=await review(source,labels.map(label=>({label})));await ui.apply();
    assert.deepEqual(ui.writes.map(x=>x.value),expected);
  }
});

test('keeps a local manual correction when another row changes and clears it after fill',async()=>{
  const ui=await review([{role:'street-address',label:'住所',value:'架空町一番館'}],[{label:'地番'},{label:'詳細'}]);
  const edit=ui.document.querySelector('#edit-f0');
  edit.value='1-2';edit.dispatchEvent(new ui.document.defaultView.Event('input'));
  ui.document.querySelector('#map-f1').onchange();await ui.apply();
  assert.deepEqual(ui.writes,[{id:'f0',value:'1-2'}]);assert.equal(edit.value,'');
});

test('ungrouped phone digits use three explicit field widths only when the lengths account for every digit',async()=>{
  const fields=['tel1','tel2','tel3'].map((name,i)=>({name,label:'電話番号',type:'tel',maxLength:[3,4,4][i]}));
  const ui=await review([{role:'tel',label:'電話番号',value:'09012345678'}],fields);
  await ui.apply();assert.deepEqual(ui.writes.map(x=>x.value),['090','1234','5678']);
  const short=await review([{role:'tel',label:'電話番号',value:'0312345678'}],fields);
  assert.equal(short.document.querySelector('#profileFill').disabled,true);
});

test('can place chome and later parcel parts on opposite sides and ignore a marked leading postcode',async()=>{
  const ui=await review([{role:'street-address',label:'住所',value:'〒100-0001 東京都架空区若葉町2丁目3-4'}],
    [{label:'住所（丁目まで）'},{label:'丁目より後'}]);
  await ui.apply();
  assert.deepEqual(ui.writes.map(x=>x.value),['東京都架空区若葉町2丁目','3-4']);
});

test('only splits a stored full name when its source explicitly identifies the order',async()=>{
  const fields=[{label:'姓'},{label:'名'}];
  const ui=await review([{role:'name',label:'氏名（姓 名）',value:'星野　光'}],fields);
  await ui.apply();assert.deepEqual(ui.writes.map(r=>r.value),['星野','光']);
  const ambiguous=await review([{role:'name',label:'氏名',value:'星野光'}],fields);
  assert.equal(ambiguous.document.querySelector('#profileFill').disabled,true);
});

test('specific lot labels refine address-line1 and explicit name spacing also works with a matching stored full name',async()=>{
  const ui=await review([{role:'parcel',label:'番地',value:'1-2'},{role:'name',label:'氏名',value:'星野 光'},
    {role:'given-name',label:'名',value:'光'},{role:'family-name',label:'姓',value:'星野'}],
    [{label:'番地',autocomplete:'address-line1'},{label:'氏名（スペースなし）'}]);
  await ui.apply();assert.deepEqual(ui.writes.map(r=>r.value),['1-2','星野光']);
});

test('order-only labels work without autocomplete',async()=>{
  const ui=await review([{role:'family-name',label:'姓',value:'星野'},{role:'given-name',label:'名',value:'光'}],
    [{label:'氏名（名 姓）'}]);
  await ui.apply();assert.equal(ui.writes[0].value,'光 星野');
});

test('an address followed by a separate lot field does not repeat the lot in the address row',async()=>{
  const ui=await review([{role:'street-address',label:'住所',value:'架空区若葉町2-3-4'}],
    [{label:'住所'},{label:'番地'}]);
  await ui.apply();assert.deepEqual(ui.writes.map(r=>r.value),['架空区若葉町','2-3-4']);
});

test('distinct table row captions in the same form section still describe one address',async()=>{
  const ui=await review([{role:'street-address',label:'住所',value:'架空区若葉町2-3-4'}],
    [{label:'住所',context:'配送先 / 住所',group:'shipping'},{label:'番地',context:'配送先 / 番地',group:'shipping'}]);
  await ui.apply();assert.deepEqual(ui.writes.map(r=>r.value),['架空区若葉町','2-3-4']);
});
