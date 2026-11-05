import {translator, localizeMessage} from './i18n.js';
import {pageCommand} from './page.js';

export async function startReview(doc, api, language) {
  const t = translator(language);
  const get = id => doc.getElementById(id);
  const source = get('field'), destination = get('destination'), preview = get('preview'), fill = get('fill');
  doc.documentElement.lang = language;
  for (const node of doc.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  function option(select, id, label) {
    const node = doc.createElement('option');
    node.value = id;
    node.textContent = label;
    select.append(node);
  }
  let scan;
  try {
    scan = await api.scan();
    get('target').textContent = scan.url;
    const targets = scan.fields.filter(field => field.kind === 'text');
    if (!targets.length) { get('status').textContent = t('opNoFields'); return; }
    const {fields} = await api.native({op:'list'});
    if (!fields?.length) throw new Error();
    option(source, '', t('opChoose'));
    for (const field of fields) option(source, field.id, field.label);
    option(destination, '', t('opChoose'));
    const captions = targets.map(field => [field.context, field.label].filter(Boolean).join(' / '));
    targets.forEach((field, index) => {
      const caption = captions[index];
      const repeated = captions.indexOf(caption) !== captions.lastIndexOf(caption);
      option(destination, field.id, repeated ? t('opNumbered', {caption, position:index + 1}) : caption);
    });
    source.disabled = false;
    source.onchange = async () => {
      preview.textContent = '';
      destination.value = '';
      destination.disabled = fill.disabled = true;
      get('status').textContent = '';
      if (!source.value) return;
      source.disabled = true;
      try {
        get('status').textContent = t('opReading');
        const {value, error} = await api.native({op:'read', id:source.value});
        if (error === 'timeout' || error === 'authorization') {
          source.value = '';
          get('status').textContent = t('opAuthError');
          return;
        }
        if (typeof value !== 'string' || !value.length) throw new Error();
        preview.textContent = value;
        const matches = targets.filter(field => field.label === source.selectedOptions[0].textContent);
        if (matches.length === 1) destination.value = matches[0].id;
        destination.disabled = false;
        fill.disabled = !destination.value;
        get('status').textContent = t('opReview');
      } catch {
        source.value = '';
        get('status').textContent = t('opReadError');
      } finally { source.disabled = false; }
    };
    destination.onchange = () => { fill.disabled = !destination.value || !preview.textContent; };
    fill.onclick = async () => {
      if (fill.disabled) return;
      source.disabled = destination.disabled = fill.disabled = true;
      const row = {id:destination.value, value:preview.textContent};
      preview.textContent = '';
      try {
        const [result] = await api.apply({op:'apply', privateFill:true, token:scan.token, rows:[row]});
        get('status').textContent = localizeMessage(result.reason, language);
      } catch { get('status').textContent = t('opPageError'); }
    };
  } catch { get('status').textContent = t(scan ? 'opSetup' : 'opPageError'); }
}

if (typeof chrome !== 'undefined' && chrome.scripting) {
  const params = new URLSearchParams(location.search);
  const target = {tabId:Number(params.get('tab')), documentIds:[params.get('document')]};
  async function command(request) {
    const [response] = await chrome.scripting.executeScript({target, world:'ISOLATED', func:pageCommand, args:[request]});
    return response.result;
  }
  startReview(document, {
    scan:() => command({op:'scan', privateFill:true}),
    apply:command,
    native:request => chrome.runtime.sendNativeMessage('local.jev_form_fill.onepassword', request)
  }, params.get('lang'));
}
