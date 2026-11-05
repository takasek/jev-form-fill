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

test('one section choice proposes only the selected person and excludes populated destinations',async()=>{
  const sources=[{role:'name',label:'氏名',value:'山野 夏'},{role:'email',label:'email',value:'demo@example.test'}];
  const ui=await review(sources,[
    {context:'お迎えに来る保護者',group:'parent',label:'氏名'},
    {context:'お迎えに来る保護者',group:'parent',label:'メール',occupied:true},
    {context:'追加のお迎え担当者（任意）',group:'other',label:'氏名'}]);
  const controls=[...ui.document.querySelectorAll('#profileSections input')];
  assert.equal(controls.length,2);assert.ok(ui.document.querySelector('#profileFill').disabled);
  controls[0].click();
  assert.deepEqual([...ui.document.querySelectorAll('#profileRows textarea')].map(x=>x.value),['山野 夏','','']);
  await ui.apply();assert.deepEqual(ui.writes,[{id:'f0',value:'山野 夏'}]);
});

test('fills a confirmation pair, converts kana and postcode, and keeps invalid edits correctable',async()=>{
  const ui=await review([{role:'email',label:'Email',value:'a@example.test'},{role:'family-kana',label:'姓カナ',value:'アオノ'},
    {role:'postal-code',label:'郵便番号',value:'123-4567'}],
    [{label:'メールアドレス',type:'email'},{label:'メールアドレス（確認用）',type:'email'},
     {label:'姓（ふりがな）',hint:'ひらがな'},{label:'郵便番号',pattern:'[0-9]{7}',maxLength:7}]);
  const edits=[...ui.document.querySelectorAll('#profileRows textarea')];
  assert.deepEqual(edits.map(x=>x.value),['a@example.test','a@example.test','あおの','1234567']);
  edits[3].value='abc';edits[3].dispatchEvent(new ui.document.defaultView.Event('input'));
  assert.equal(ui.document.querySelector('#profileFill').disabled,true);
  edits[3].value='9999999';edits[3].dispatchEvent(new ui.document.defaultView.Event('input'));
  await ui.apply();assert.equal(ui.writes[3].value,'9999999');
});

test('a third-party row inside the applicant section is not suggested',async()=>{
  const ui=await review([{role:'email',label:'Email',value:'owner@example.test'}],[
    {label:'メールアドレス',type:'email',context:'申込 / 緊急連絡先 メールアドレス',sectionLabel:'申込',group:'applicant'}]);
  assert.equal(ui.document.querySelector('#map-f0').value,'');
});

test('an occupied field needs a per-row override; a section choice alone is insufficient',async()=>{
  const ui=await review([{role:'family-name',label:'姓',value:'星野'}],[{label:'姓',occupied:true}]);
  assert.ok(ui.document.querySelector('#profileFill').disabled);
  ui.document.querySelector('.row input[type=checkbox]').click();
  await ui.apply();assert.deepEqual(ui.writes,[{id:'f0',value:'星野',overwrite:true}]);
});

test('separate HTML autocomplete sections do not truncate another person’s address',async()=>{
  const ui=await review([{role:'street-address',label:'住所',value:'架空区若葉町2-3-4'}],[
    {label:'住所',context:'登録',group:'g',autocomplete:'section-applicant street-address'},
    {label:'番地',context:'登録',group:'g',autocomplete:'section-friend address-line1'}]);
  const control=ui.document.querySelector('#profileSections input');
  assert.match(control.parentElement.textContent,/applicant/);control.click();
  await ui.apply();assert.deepEqual(ui.writes,[{id:'f0',value:'架空区若葉町2-3-4'}]);
});
