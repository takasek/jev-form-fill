import {formatRole, derivedParts, formatPhone, joinedName, formatContactValue} from './profile-formats.js';
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
  const label = text.replace(/[（(](?:確認用?|再入力)[)）]/g,'').replace(/[（(]\s*(?:姓[\s・/]+名|名[\s・/]+姓|first name[, /]+last name|last name[, /]+first name)\s*[）)]/gi,'');
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

function sectionOf(field) {
  const tokens = (field.autocomplete || '').toLowerCase().split(/\s+/);
  const heading = field.sectionLabel ?? field.context ?? '';
  const scope = tokens.find(token=>token === 'shipping' || token === 'billing') || '';
  // A shipping tag on only the postal field should not split a named delivery section.
  const headingScope = addressSection({context:heading});
  return JSON.stringify([field.group ?? heading,tokens.find(token=>token.startsWith('section-')) || '',
    scope || headingScope]);
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
    targetRoles.lastIndexOf(phoneParts[i]) === start+i && sectionOf(field) === sectionOf(group[0]) &&
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

function proposedSource(field, sources) {
  const role = targetRole(field);
  if (!role) return -1;
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
  const role = targetRole(field);
  if (source.nameParts) return formatContactValue(joinedName(...source.nameParts,field,source.storedName),role,field);
  if (source.role === 'tel' && targetRole(field) === 'tel') return formatPhone(source.value,field);
  return formatContactValue(source.value,role,field);
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
    const neighbors = rawRoles.filter((_,i)=>sectionOf(targets[i]) === sectionOf(field));
    const separateLot = neighbors.includes('parcel') || neighbors.includes('parcel-rest');
    if (!separateLot && !neighbors.includes('address-line2')) return field;
    const hasLocality = neighbors.includes('address-level1') || neighbors.includes('address-level2');
    return {...field,formatRole:hasLocality ? '' : separateLot ? 'before-parcel' : 'through-parcel'};
  });
  const sources = profileSources(fields, targets);
  const sections = new Map();
  for (const field of targets) {
    const key = sectionOf(field);
    if (!sections.has(key)) sections.set(key,[]);
    sections.get(key).push(field);
  }
  const thirdParty = /緊急連絡先|配偶者|保護者|追加の|別の方|同行者|emergency contact|spouse|guardian/i;
  const chooseSections = sections.size > 1 || targets.some(f=>thirdParty.test(f.sectionLabel ?? f.context));
  const sectionControls = new Map();
  const chooser = doc.getElementById('profileSections');
  if (chooseSections) {
    chooser.hidden = false;
    for (const [key,members] of sections) {
      const first = members[0], label = doc.createElement('label'), check = doc.createElement('input');
      check.type = 'checkbox';
      const scope = (first.autocomplete || '').split(/\s+/).find(tag=>tag === 'shipping' || tag === 'billing');
      const context = first.sectionLabel || first.context;
      const suffix = scope && scope !== addressSection({context}) ? t(scope === 'shipping'?'opShipping':'opBilling') : '';
      const title = [context,suffix].filter(Boolean).join(' / ');
      const token = (first.autocomplete || '').split(/\s+/).find(tag=>tag.startsWith('section-'));
      const fields = members.slice(0,2).map(f=>f.label).join(' / ');
      const caption = [title,token?.slice(8),fields].filter(Boolean).join(' · ');
      label.append(check,t('opSectionFields',{n:sectionControls.size+1,label:caption}));
      chooser.append(label);
      sectionControls.set(key,check);
    }
  }
  const proposals = targets.map(field=>proposedSource(field,sources));
  const suggestions = targets.map((field,i)=>{
    const index = proposals[i];
    const heading = field.sectionLabel ?? field.context ?? '';
    const context = field.context || '';
    const rowText = context.startsWith(heading) ? context.slice(heading.length) : context;
    if (index < 0 || thirdParty.test([field.label,rowText].join(' '))) return -1;
    const same = sections.get(sectionOf(field)).filter(other=>proposals[targets.indexOf(other)] === index);
    if (same.length === 1) return index;
    const confirmation = f => /確認|再入力|もう一度|confirm|re.?enter/i.test(f.label);
    if (targetRole(field) === 'email' && same.length === 2 && same.filter(confirmation).length === 1 &&
        !same.some(f=>f.occupied)) return index;
    return -1;
  });
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
    for (const [index, source] of sources.entries()) {
      const formatted = formatSource(field,source);
      if (formatted === undefined || formValue(field,formatted) === undefined) continue;
      select.add(new doc.defaultView.Option(source.label, String(index)));
    }
    const section = sectionControls.get(sectionOf(field));
    let replace = null;
    if (field.occupied) {
      const label = doc.createElement('label');
      replace = doc.createElement('input');
      replace.type = 'checkbox';
      label.append(replace,t('opOverwrite'));
      row.append(label);
    }
    const edit = field.kind === 'select' ? null : doc.createElement('textarea');
    if (edit) {
      edit.id = 'edit-' + field.id;
      edit.rows = 1;
      edit.autocomplete = 'off';
      edit.spellcheck = false;
      edit.setAttribute('aria-label',t('opEditValue',{caption}));
      edit.placeholder = t('opManual');
    }
    const probe = doc.createElement(field.type === 'textarea' ? 'textarea' : 'input');
    if (probe.tagName === 'INPUT') {
      probe.type = field.type || 'text';
      probe.multiple = Boolean(field.multiple);
    }
    for (const key of ['pattern','min','max','step']) if (field[key]) probe.setAttribute(key,field[key]);
    // A value attribute can set a private step base. The actual control checks it at apply time.
    if (field.customStepBase) probe.step='any';
    rows.push({field,select,preview,edit,section,replace,element:row,probe,suggestion:suggestions[i]});
    row.append(label,select);
    if (edit) row.append(edit);
    const hint = [field.placeholder,field.hint].filter(Boolean).join(' · ');
    if (hint) {
      const info = doc.createElement('small');
      info.textContent = hint;
      row.append(info);
    }
    row.append(preview);
    container.append(row);
  }
  function reviewedValue(row) {
    return row.edit ? row.edit.value : row.preview.textContent;
  }
  function enabled(row) {
    return (!row.section || row.section.checked) && (!row.replace || row.replace.checked);
  }
  function updateCount() {
    let count=0, invalid=false;
    for (const row of rows) {
      const value=reviewedValue(row);
      if (!enabled(row) || !value) {
        if (row.edit) row.preview.textContent='';
        continue;
      }
      count++;
      if (!row.edit) continue;
      row.probe.value=value;
      const mismatch = !row.probe.validity.valid || row.probe.value !== value ||
        (row.field.maxLength >= 0 && value.length > row.field.maxLength) ||
        (row.field.minLength > 0 && value.length < row.field.minLength);
      row.probe.value='';
      row.preview.textContent=mismatch ? t('opInvalid') : '';
      invalid ||= mismatch;
    }
    fill.textContent = t('opFillMany',{count});
    fill.disabled = count === 0 || invalid;
  }
  function enableRow(row) {
    const active = enabled(row);
    row.element.hidden = !!row.section && !row.section.checked;
    row.select.disabled = !active;
    if (row.edit) row.edit.disabled = !active;
    row.select.value = active ? String(row.suggestion) : '';
    if (row.select.selectedIndex < 0) row.select.value='';
    row.select.onchange();
  }
  for (const row of rows) {
    const {field,select,preview,edit} = row;
    select.onchange = () => {
      if (select.value === 'manual') return;
      select.querySelector('option[value="manual"]')?.remove();
      const value = select.value === '' ? '' : formatSource(field,sources[Number(select.value)]);
      if (edit) { edit.value = value; preview.textContent = ''; }
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
    if (row.replace) row.replace.onchange = ()=>enableRow(row);
    enableRow(row);
  }
  for (const control of sectionControls.values()) control.onchange = ()=>{
    for (const row of rows.filter(r=>r.section === control)) {
      if (row.replace) row.replace.checked = false;
      enableRow(row);
    }
  };
  status.textContent = t('opBatchHint');
  fill.onclick = async () => {
    if (fill.disabled) return;
    fill.disabled = true;
    const selected = rows.filter(row => enabled(row) && reviewedValue(row) !== '');
    const writes = selected.map(row => ({id:row.field.id,value:formValue(row.field,reviewedValue(row)),
      ...(row.replace?.checked ? {overwrite:true} : {})}));
    for (const control of sectionControls.values()) { control.disabled=true; control.onchange=null; }
    for (const {select,preview,edit,replace} of rows) {
      if (replace) { replace.disabled=true; replace.onchange=null; }
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
