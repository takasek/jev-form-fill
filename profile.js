import {formatRole, derivedParts, formatPhone, joinedName} from './profile-formats.js';
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
const roles = new Set([...rules.map(([role]) => role),'tel-area-code','tel-local-prefix','tel-local-suffix']);
function labelRole(text = '') {
  const specific = formatRole(text);
  if (specific) return specific;
  const label = text.replace(/[（(]\s*(?:姓[\s・/]+名|名[\s・/]+姓|first name[, /]+last name|last name[, /]+first name)\s*[）)]/gi,'');
  const normalized = label.replace(/[（(][^（()）]*(?:スペース|空白|ハイフン|数字のみ|hyphens)[^（()）]*[)）]/gi,'').normalize('NFKC').toLowerCase().replace(/[\s_():*・-]|必須|任意/g, '')
    .replace(/^(?:配送先|請求先|お届け先|ご自宅|自宅|勤務先|仕事用|billing|shipping|home|work)(?:の)?/, '');
  return rules.find(([,pattern]) => pattern.test(normalized))?.[0];
}
function targetRole(field) {
  if (field.formatRole !== undefined) return field.formatRole;
  const label = labelRole(field.label);
  const named = labelRole(field.name);
  const token = (field.autocomplete || '').split(/\s+/).find(token => roles.has(token));
  if (label === 'tel' && (token?.startsWith('tel-') || named?.startsWith('tel-'))) return token?.startsWith('tel-') ? token : named;
  const addressPart = ['parcel','parcel-rest','before-parcel','through-parcel','through-chome','after-chome'].includes(label);
  if (addressPart && ['street-address','address-line1','address-line2'].includes(token)) return label;
  if (label?.startsWith('tel-') && token === 'tel') return label;
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
  const targetRoles = targets.map(targetRole);
  const needed = new Set(targetRoles);
  const phoneParts = ['tel-area-code','tel-local-prefix','tel-local-suffix'];
  const start = targetRoles.indexOf(phoneParts[0]);
  const group = start < 0 ? [] : targets.slice(start,start+3);
  // A maximum is an exact split only when the entire number fills all three boxes.
  const widths = group.length === 3 && group.every((field,i) => targetRoles[start+i] === phoneParts[i] &&
    targetRoles.lastIndexOf(phoneParts[i]) === start+i && (field.group ?? field.context) === (group[0].group ?? group[0].context) &&
    field.maxLength > 0 && field.maxLength <= 5) ? group.map(f=>f.maxLength) : null;
  for (const source of fields) {
    for (const [role,value] of Object.entries(derivedParts(source,widths) || {})) {
      if (!value || !needed.has(role) || fields.some(f=>f.role===role && f.scope===source.scope)) continue;
      sources.push({role,scope:source.scope,label:source.label,value});
    }
  }
  for (const [full,given,family] of [['name','given-name','family-name'],['name-kana','given-kana','family-kana']]) {
    if (!needed.has(full)) continue;
    const first=fields.filter(f=>f.role===given), last=fields.filter(f=>f.role===family);
    if (first.length === 1 && last.length === 1 && first[0].scope === last[0].scope) {
      const nameParts = [last[0].value, first[0].value];
      const stored = fields.filter(f=>f.role === full);
      if (!stored.length) {
        sources.push({role:full,scope:first[0].scope,label:last[0].label+' + '+first[0].label,
          value:nameParts.join(' '),nameParts});
      } else {
        const matching = stored.filter(f=>f.scope === first[0].scope &&
          [nameParts.join(''),first[0].value+last[0].value].includes(f.value.replace(/\s+/g,'')));
        for (const source of matching) sources[sources.indexOf(source)] = {...source,nameParts,storedName:source.value};
      }
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

function formatSource(field, source) {
  if (source.nameParts) return joinedName(...source.nameParts,field,source.storedName);
  if (source.role === 'tel' && targetRole(field) === 'tel') return formatPhone(source.value,field);
  return source.value;
}

function formValue(field, value) {
  if (field.kind !== 'select') return value;
  const matches = field.options.filter(option => option.value === value || option.label === value);
  return matches.length === 1 ? matches[0].value : undefined;
}

export function reviewProfile(doc, scan, targets, fields, api, t, localize) {
  const container = doc.getElementById('profileRows'), fill = doc.getElementById('profileFill');
  const status = doc.getElementById('status');
  // A generic address box can be followed by a separate parcel or building box.
  const rawRoles = targets.map(targetRole);
  targets = targets.map((field,index) => {
    if (rawRoles[index] !== 'street-address') return field;
    const neighbors = rawRoles.filter((_,i)=>(targets[i].group ?? targets[i].context) === (field.group ?? field.context) &&
      addressSection(targets[i]) === addressSection(field));
    const separateLot = neighbors.includes('parcel') || neighbors.includes('parcel-rest');
    if (!separateLot && !neighbors.includes('address-line2')) return field;
    const hasLocality = neighbors.includes('address-level1') || neighbors.includes('address-level2');
    return {...field,formatRole:hasLocality ? '' : separateLot ? 'before-parcel' : 'through-parcel'};
  });
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
      const formatted = formatSource(field,source);
      if (formatted === undefined || formValue(field,formatted) === undefined) continue;
      select.add(new doc.defaultView.Option(source.label, String(index)));
    }
    select.value = String(suggestion);
    if (select.selectedIndex < 0) select.value = '';
    const edit = field.kind === 'select' ? null : doc.createElement('textarea');
    if (edit) {
      edit.id = 'edit-' + field.id;
      edit.rows = 1;
      edit.autocomplete = 'off';
      edit.spellcheck = false;
      edit.setAttribute('aria-label',t('opEditValue',{caption}));
      edit.placeholder = t('opManual');
    }
    rows.push({field,select,preview,edit});
    row.append(label,select);
    if (edit) row.append(edit);
    row.append(preview);
    container.append(row);
  }
  function reviewedValue(row) {
    return row.edit ? row.edit.value : row.preview.textContent;
  }
  function updateCount() {
    const count = rows.filter(row=>reviewedValue(row) !== '').length;
    fill.textContent = t('opFillMany',{count});
    fill.disabled = count === 0;
  }
  for (const row of rows) {
    const {field,select,preview,edit} = row;
    select.onchange = () => {
      if (select.value === 'manual') return;
      select.querySelector('option[value="manual"]')?.remove();
      const value = select.value === '' ? '' : formatSource(field,sources[Number(select.value)]);
      if (edit) edit.value = value;
      else preview.textContent = value;
      updateCount();
    };
    if (edit) edit.oninput = () => {
      if (select.value !== 'manual') {
        if (!select.querySelector('option[value="manual"]')) {
          const edited = new doc.defaultView.Option(t('opEdited'),'manual');
          edited.disabled = true;
          select.add(edited);
        }
        select.value = 'manual';
      }
      updateCount();
    };
    select.onchange();
  }
  status.textContent = t('opBatchHint');
  fill.onclick = async () => {
    if (fill.disabled) return;
    fill.disabled = true;
    const selected = rows.filter(row => reviewedValue(row) !== '');
    const writes = selected.map(row => ({id:row.field.id,value:formValue(row.field,reviewedValue(row))}));
    for (const {select,preview,edit} of rows) {
      if (edit) { edit.value = ''; edit.disabled = true; edit.oninput = null; }
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
