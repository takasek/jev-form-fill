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

test('a single shipping section and its surrounding contact fields do not require a person choice',async()=>{
  const profile=[{role:'name',label:'Name',value:'架空 花'},{role:'email',label:'Email',value:'hana@example.test'}];
  const ui=await review(profile,[
    {label:'お名前',group:'shipping',formGroup:'0',sectionLabel:'配送先',autocomplete:'shipping name'},
    {label:'メールアドレス',type:'email',group:'root',formGroup:'0',sectionLabel:''}]);
  assert.equal(ui.document.querySelector('#profileSections').hidden,true);
  await ui.apply();assert.deepEqual(ui.writes.map(x=>x.value),['架空 花','hana@example.test']);
  for(const extra of [{formGroup:'1'}, {sectionLabel:'同伴者'}, {autocomplete:'section-other email'}, {label:'Partner email',sectionLabel:'Contact'}]){
    const guarded=await review(profile,[
      {label:'お名前',group:'shipping',formGroup:'0',sectionLabel:'配送先',autocomplete:'section-self shipping name'},
      {label:'メールアドレス',type:'email',group:'other',formGroup:'0',sectionLabel:'',...extra}]);
    assert.equal(guarded.document.querySelector('#profileSections').hidden,false);
    assert.equal(guarded.document.querySelector('#profileFill').disabled,true);
  }
});

test('an English address line gets a stored street without duplicating a separate apartment',async()=>{
  const ui=await review([{role:'street-address',label:'Address',value:'123 Example Street\nUnit 4'}],[
    {label:'Address',autocomplete:'address-line1'}, {label:'Apartment',autocomplete:'address-line2'}]);
  await ui.apply();assert.deepEqual(ui.writes.map(x=>x.value),['123 Example Street','Unit 4']);
  const unknown=await review([{role:'street-address',label:'Address',value:'若葉町2-3-4, 架空市, 東京都, 1500002, jp'}],
    [{label:'Address',autocomplete:'address-line1'}]);
  assert.equal(unknown.document.querySelector('#map-f0').value,'');
  const options=[...unknown.document.querySelector('#map-f0').options];
  const full=options.find(o=>o.textContent.includes('若葉町2-3-4'));
  assert.ok(full,'full stored address must be available for explicit review');
  assert.match(full.textContent,/要確認/);
  const country=await review([{role:'street-address',label:'Address',value:'123 Example Street\nUnited States'}],
    [{label:'Address',autocomplete:'address-line1'},{label:'Apartment',autocomplete:'address-line2'}]);
  assert.equal(country.document.querySelector('#edit-f1').value,'');
});

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

test('a landline is not inferred from a mobile number, and explicit half-width kana preserves voicing',async()=>{
  const ui=await review([{role:'tel',scope:'mobile',label:'携帯',value:'09012345678'},
    {role:'name-kana',label:'フリガナ',value:'ユキノ ナギ'}],[
    {label:'固定電話番号（任意）',type:'tel',autocomplete:'tel'},
    {label:'フリガナ',hint:'半角カタカナで入力'}]);
  await ui.apply();assert.deepEqual(ui.writes,[{id:'f1',value:'ﾕｷﾉ ﾅｷﾞ'}]);
});

test('uses only the address suffix when the same identity supplies the separate prefecture and city',async()=>{
  const ui=await review([{role:'street-address',label:'住所',value:'〒123-4567 東京都架空市見本町4-8 青葉荘306'},
    {role:'address-level1',label:'都道府県',value:'東京都'},{role:'address-level2',label:'市区町村',value:'架空市'}],[
    {label:'都道府県'},{label:'市区町村'},{label:'住所',hint:'町名・番地・建物名のみ入力してください'}]);
  await ui.apply();assert.equal(ui.writes.at(-1).value,'見本町4-8 青葉荘306');
});

test('inline parent and child destinations require choosing the identity owner',async()=>{
  const ui=await review([{role:'name',label:'氏名',value:'架空 親'},{role:'email',label:'メール',value:'parent@example.test'}],[
    {label:'保護者のメールアドレス',type:'email'},{label:'お子さまの氏名',autocomplete:'name'}]);
  assert.ok(ui.document.querySelector('#profileFill').disabled);
  const parent=[...ui.document.querySelectorAll('#profileSections label')].find(l=>l.textContent.includes('保護者'));
  parent.querySelector('input').click();
  await ui.apply();
  assert.deepEqual(ui.writes,[{id:'f0',value:'parent@example.test'}]);
});

test('edited confirmation pairs must agree before applying and attention points to the problem',async()=>{
  const ui=await review([{role:'email',label:'メール',value:'a@example.test'}],
    ['メールアドレス','メールアドレス（確認用）'].map(label=>({label,type:'email'})));
  const [email,confirm]=ui.document.querySelectorAll('#profileRows textarea');
  email.value='order@example.test';email.oninput();
  assert.ok(ui.document.querySelector('#profileFill').disabled);
  ui.document.querySelector('#profileAttention').click();
  assert.equal(ui.document.activeElement,confirm);
  confirm.value=email.value;confirm.oninput();await ui.apply();
  assert.deepEqual(ui.writes.map(w=>w.value),['order@example.test','order@example.test']);
});

test('temporarily hiding a section preserves manual changes but requires fresh overwrite consent',async()=>{
  const ui=await review([{role:'name',label:'氏名',value:'架空 親'}],
    [{label:'氏名',group:'a'},{label:'電話',group:'a',occupied:true},{label:'氏名',group:'b'}]);
  const section=ui.document.querySelector('#profileSections input');
  section.click();const edit=ui.document.querySelector('#edit-f0');edit.value='注文者';edit.oninput();
  const overwrite=ui.document.querySelector('.row input');overwrite.click();section.click();section.click();
  assert.equal(edit.value,'注文者');assert.equal(overwrite.checked,false);
  await ui.apply();assert.deepEqual(ui.writes,[{id:'f0',value:'注文者'}]);
});

test('checks a plain English confirmation text box and recognizes a child’s role in a Japanese label',async()=>{
  const ui=await review([{role:'email',label:'Email',value:'one@example.test'}],[{label:'Email'},{label:'Confirm email',name:'confirm_email'}]);
  const confirm=ui.document.querySelector('#edit-f1');
  confirm.value='two@example.test';confirm.oninput();assert.ok(ui.document.querySelector('#profileFill').disabled);
  const family=await review([{role:'name',label:'氏名',value:'保護者'}],[{label:'お子さんの氏名',autocomplete:'name'}]);
  assert.ok(family.document.querySelector('#profileFill').disabled);
});

test('checks the untouched member of an occupied email pair at its destination',async()=>{
  const ui=await review([{role:'email',label:'Email',value:'a@example.test'}],[
    {label:'Email',occupied:true},{label:'Confirm email'}]);
  const confirm=ui.document.querySelector('#edit-f1');confirm.value='b@example.test';confirm.oninput();
  await ui.apply();
  assert.deepEqual(ui.writes,[{id:'f1',value:'b@example.test',matchExisting:'f0'}]);
});

test('choosing one complete phone fills its three parts together',async()=>{
  const ui=await review([
    {role:'tel',scope:'home',label:'home phone',value:'03-1234-5678'},
    {role:'tel',scope:'mobile',label:'cell phone',value:'090-9876-5432'}],
    ['市外局番','市内局番','加入者番号'].map(label=>({label,type:'tel'})));
  const phones=ui.document.querySelector('#profilePhones select');
  assert.ok(phones);
  assert.match(phones.options[1].textContent,/03-1234-5678/);
  assert.match(phones.options[2].textContent,/090-9876-5432/);
  phones.selectedIndex=2;phones.onchange();
  await ui.apply();
  assert.deepEqual(ui.writes.map(row=>row.value),['090','9876','5432']);
});

test('a default phone remains useful beside a work phone, and row choices describe only compatible values',async()=>{
  const ui=await review([
    {role:'given-name',label:'first name',value:'花'},
    {role:'tel',label:'default phone',value:'03-1234-5678'},
    {role:'tel',scope:'work',label:'business',value:'06-9876-5432'}],
    [{label:'電話番号（半角数字）',type:'tel'}]);
  const select=ui.document.querySelector('#map-f0');
  assert.equal(select.options.length,3);
  assert.equal([...select.options].some(o=>o.textContent.includes('first name')),false);
  await ui.apply();assert.deepEqual(ui.writes,[{id:'f0',value:'0312345678'}]);
});

test('common Japanese label annotations preserve the requested name and address part',async()=>{
  const sources=[
    {role:'family-name',label:'姓',value:'架空'},
    {role:'given-name',label:'名',value:'花'},
    {role:'family-kana',label:'セイ',value:'カクウ'},
    {role:'given-kana',label:'メイ',value:'ハナ'},
    {role:'street-address',label:'住所',value:'東京都架空市若葉町2-3-4 架空棟101'}
  ];
  for (const [label,expected] of [
    ['お名前（漢字）','架空 花'],['氏名（全角）','架空 花'],['お名前（姓）','架空'],
    ['フリガナ（セイ）','カクウ'],['建物名・部屋番号','架空棟101'],
    ['マンション名・部屋番号','架空棟101'],['ご住所（番地まで）','東京都架空市若葉町2-3-4']
  ]) {
    const ui=await review(sources,[{label}]);await ui.apply();
    assert.equal(ui.writes[0]?.value,expected,label);
  }
});

test('an explicit 3+4 postal pair uses the correct part of a single stored postcode',async()=>{
  const ui=await review([{role:'postal-code',label:'郵便番号',value:'150-0002'}],
    [{label:'郵便番号',maxLength:3},{label:'郵便番号',maxLength:4}]);
  await ui.apply();assert.deepEqual(ui.writes.map(r=>r.value),['150','0002']);
});

test('Address with address-line1 autocomplete accepts a stored address line',async()=>{
  const ui=await review([{role:'address-line1',label:'住所1',value:'12 Example Street'}],
    [{label:'Address',autocomplete:'address-line1'}]);
  await ui.apply();assert.deepEqual(ui.writes,[{id:'f0',value:'12 Example Street'}]);
});

test('format annotations can be combined without overriding explicit hyphens or autocomplete parts',async()=>{
  const source=[{role:'family-name',label:'姓',value:'架空'},{role:'given-name',label:'名',value:'花'},
    {role:'family-kana',label:'セイ',value:'カクウ'},{role:'tel',label:'電話',value:'03-1234-5678'},
    {role:'postal-code',label:'郵便番号',value:'150-0002'}];
  for(const [label,expected] of [['お名前（姓）（漢字）','架空'],['お名前（名）（漢字）','花'],
    ['フリガナ（セイ）（全角）','カクウ'],['自宅電話番号（市外局番）','03'],
    ['電話番号（半角数字・ハイフンあり）','03-1234-5678'],
    ['電話番号（半角数字、ハイフンは必須）','03-1234-5678']]){
    const ui=await review(source,[{label}]);await ui.apply();assert.equal(ui.writes[0]?.value,expected,label);
  }
  const postal=await review(source,[{label:'郵便番号（前3桁）',maxLength:3,autocomplete:'postal-code'},
    {label:'郵便番号（後4桁）',maxLength:4,autocomplete:'postal-code'}]);
  await postal.apply();assert.deepEqual(postal.writes.map(row=>row.value),['150','0002']);
});
