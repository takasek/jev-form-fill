// Only the local review page imports this module. A proposal selects a source by index.
const rules = [
  ['family-kana', /^(セイ|せい|姓(?:カナ|かな|ふりがな|フリガナ))$/u],
  ['given-kana', /^(メイ|めい|名(?:カナ|かな|ふりがな|フリガナ))$/u],
  ['name-kana', /^(フリガナ|ふりがな|(?:氏名|お名前|名前)(?:カナ|かな|フリガナ|ふりがな))$/u],
  ['family-name', /^(?:姓|名字|苗字|lastname|surname|familyname)$/],
  ['given-name', /^(?:名|下の名前|firstname|givenname)$/],
  ['name', /^(?:氏名|姓名|お名前|名前|name|fullname|recipientname)$/],
  ['email', /^(?:email(?:address)?|メール(?:アドレス)?)$/],
  ['tel', /^(?:電話(?:番号)?|携帯(?:電話)?(?:番号)?|(?:mobile|cell)?phone(?:number)?|tel(?:ephone)?)$/],
  ['postal-code', /^(?:郵便番号|〒|zipcode|zip|postalcode|postcode)$/],
  ['address-level1', /^(?:都道府県|prefecture|province|state)$/],
  ['address-level2', /^(?:市区町村|city|town)$/],
  ['address-line1', /^(?:住所1|addressline1|番地)$/],
  ['address-line2', /^(?:建物名|住所2|addressline2|apartment)$/],
  ['street-address', /^(?:住所|ご住所|address|streetaddress)$/],
  ['organization', /^(?:会社名|勤務先名|法人名|company(?:name)?|organization)$/]
];
const roles = new Set(rules.map(([role]) => role));
function labelRole(text = '') {
  const normalized = text.normalize('NFKC').toLowerCase().replace(/[\s_():*・-]|必須|任意/g, '')
    .replace(/^(?:配送先|請求先|お届け先|ご自宅|自宅|勤務先|仕事用|billing|shipping|home|work)(?:の)?/, '');
  return rules.find(([,pattern]) => pattern.test(normalized))?.[0];
}
function targetRole(field) {
  const label = labelRole(field.label);
  const token = (field.autocomplete || '').split(/\s+/).find(token => roles.has(token));
  if (label && token && label !== token) return '';
  return label || token || labelRole(field.name) || ({email:'email',tel:'tel'})[field.type];
}
function targetScope(field) {
  const text = [field.label, field.context, field.autocomplete, field.name].join(' ');
  if (/勤務先|会社用|職場|仕事用|\b(work|business)\b/i.test(text)) return 'work';
  if (/自宅|\bhome\b/i.test(text)) return 'home';
  if (/携帯|\b(cell|mobile)\b/i.test(text)) return 'mobile';
  return '';
}
function addressSection(field) {
  const text = [field.autocomplete, field.context, field.label].join(' ');
  if (/請求先|billing/i.test(text)) return 'billing';
  if (/配送先|お届け先|shipping/i.test(text)) return 'shipping';
  return '';
}

export function profileSources(fields, targets) {
  const sources = [...fields];
  if (targets.some(f => targetRole(f) === 'name') && !fields.some(f => f.role === 'name')) {
    const given = fields.filter(f => f.role === 'given-name'), family = fields.filter(f => f.role === 'family-name');
    if (given.length === 1 && family.length === 1) {
      const japanese = targets.some(f => targetRole(f) === 'name' && /[ぁ-ヿ一-龯]/u.test(f.label));
      const parts = japanese ? [family[0],given[0]] : [given[0],family[0]];
      sources.push({role:'name',scope:'',label:parts.map(f => f.label).join(' + '),value:parts.map(f => f.value).join(' ')});
    }
  }
  return sources;
}

function proposedSource(field, targets, sources) {
  const role = targetRole(field);
  if (!role || /緊急連絡先|配偶者|保護者|emergency contact|spouse|guardian/i.test([field.context,field.label].join(' '))) return -1;
  // With one identity, leave the billing copy for the user when the form asks for both.
  if (addressSection(field) === 'billing' &&
      targets.some(other => addressSection(other) === 'shipping' && targetRole(other) === role)) return -1;
  let candidates = sources.filter(source => source.role === role);
  const scope = targetScope(field);
  if (scope) {
    const scoped = candidates.filter(s => s.scope === scope);
    candidates = scoped.length ? scoped : candidates.filter(s => !s.scope);
  }
  if (candidates.length !== 1) return -1;
  return sources.indexOf(candidates[0]);
}

function formValue(field, value) {
  if (field.kind !== 'select') return value;
  const matches = field.options.filter(option => option.value === value || option.label === value);
  return matches.length === 1 ? matches[0].value : undefined;
}

export function reviewProfile(doc, scan, targets, fields, api, t, localize) {
  const container = doc.getElementById('profileRows'), fill = doc.getElementById('profileFill');
  const status = doc.getElementById('status');
  const sources = profileSources(fields, targets);
  const proposals = targets.map(field => proposedSource(field, targets, sources));
  const rows = [];
  doc.getElementById('profileReview').hidden = false;
  for (const [i, field] of targets.entries()) {
    const row = doc.createElement('div');
    row.className = 'row';
    const label = doc.createElement('label'), select = doc.createElement('select'), preview = doc.createElement('output');
    select.id = 'map-' + field.id;
    label.htmlFor = select.id;
    const caption = [field.context, field.label].filter(Boolean).join(' / ');
    const repeated = targets.some((other, j) => i !== j && other.context === field.context && other.label === field.label);
    label.textContent = repeated ? t('opNumbered',{caption,position:i+1}) : caption;
    select.add(new doc.defaultView.Option(t('opSkip'),''));
    // Repeated, indistinguishable uses of one source can refer to different people.
    const candidate = proposals[i];
    const suggestion = proposals.indexOf(candidate) === proposals.lastIndexOf(candidate) ? candidate : -1;
    for (const [index, source] of sources.entries()) {
      if (formValue(field, source.value) === undefined) continue;
      select.add(new doc.defaultView.Option(source.label, String(index)));
    }
    select.value = String(suggestion);
    if (select.selectedIndex < 0) select.value = '';
    rows.push({field,select,preview});
    row.append(label,select,preview);
    container.append(row);
  }
  function update() {
    let count = 0;
    for (const {select,preview} of rows) {
      preview.textContent = select.value === '' ? '' : sources[Number(select.value)].value;
      if (select.value !== '') count++;
    }
    fill.textContent = t('opFillMany',{count});
    fill.disabled = count === 0;
  }
  for (const {select} of rows) select.onchange = update;
  update();
  status.textContent = t('opBatchHint');
  fill.onclick = async () => {
    if (fill.disabled) return;
    fill.disabled = true;
    const selected = rows.filter(({select}) => select.value !== '');
    const writes = selected.map(({field,select}) => ({id:field.id,value:formValue(field,sources[Number(select.value)].value)}));
    for (const {select,preview} of rows) {
      select.disabled = true;
      select.onchange = null;
      preview.textContent = '';
    }
    sources.length = 0;
    fill.onclick = null;
    try {
      const results = await api.apply({op:'apply', privateFill:true, token:scan.token, rows:writes});
      for (const {field,preview} of selected) {
        const result = results.find(result => result.id === field.id);
        preview.textContent = result ? localize(result.reason) : t('opPageError');
      }
      status.textContent = t('opBatchResult',{filled:results.filter(r=>r.status==='filled').length,total:writes.length});
    } catch { status.textContent = t('opPageError'); }
  };
}
