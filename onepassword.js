import {translator, localizeMessage} from './i18n.js';
import {reviewProfile} from './profile.js';
import {pageCommand} from './page.js';

export async function startReview(doc, api, language) {
  const t = translator(language);
  const get = id => doc.getElementById(id);
  const source = get('field'), destination = get('destination'), preview = get('preview'), fill = get('fill');
  doc.documentElement.lang = language;
  for (const node of doc.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  function setupIssue(message) {
    get('status').textContent=t(message);
    get('setupHelp').hidden=false;
    get('setupHelp').open=message==='opSetup';
    get('setupCommand').textContent='python3 native/install.py '+(api.extensionId || 'EXTENSION_ID')+" --profile '"+t('opVault')+"' IDENTITY_ITEM_ID";
    if (api.rescan) {
      get('profileRescan').hidden=false;
      get('profileRescan').textContent=t('opRetry');
      get('profileRescan').onclick=api.rescan;
    }
  }
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
    const targets = scan.fields.filter(field => ['text','select'].includes(field.kind));
    if (!targets.length) { get('status').textContent = t('opNoFields'); return; }
    const registration = await api.native({op:'list'});
    if (registration.profile) {
      get('status').textContent = t('opProfileReading');
      const profile = await api.native({op:'profile'});
      if (!profile.fields?.length) {
        const auth=['authorization','timeout'].includes(profile.error);
        setupIssue(auth ? 'opProfileAuth' : profile.error ? 'opProfileError' : 'opEmptyProfile');
        return;
      }
      reviewProfile(doc,scan,targets,profile.fields,api,t,reason=>localizeMessage(reason,language));
      return;
    }
    const textTargets = targets.filter(f => f.kind === 'text');
    if (!textTargets.length) { get('status').textContent = t('opNoFields'); return; }
    get('legacyReview').hidden = false;
    const {fields} = registration;
    if (!fields?.length) throw new Error();
    option(source, '', t('opChoose'));
    for (const field of fields) option(source, field.id, field.label);
    option(destination, '', t('opChoose'));
    const captions = textTargets.map(field => [field.context, field.label].filter(Boolean).join(' / '));
    textTargets.forEach((field, index) => {
      const caption = captions[index];
      const repeated = captions.indexOf(caption) !== captions.lastIndexOf(caption);
      const text = repeated ? t('opNumbered', {caption, position:index + 1}) : caption;
      option(destination, field.id, field.occupied ? text + ' — ' + t('opOverwrite') : text);
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
        const matches = textTargets.filter(field => field.label === source.selectedOptions[0].textContent);
        if (matches.length === 1 && !matches[0].occupied) destination.value = matches[0].id;
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
      if (textTargets.find(field=>field.id===row.id)?.occupied) row.overwrite = true;
      preview.textContent = '';
      try {
        const [result] = await api.apply({op:'apply', privateFill:true, token:scan.token, rows:[row]});
        get('status').textContent = localizeMessage(result.reason, language);
      } catch { get('status').textContent = t('opPageError'); }
    };
  } catch {
    if (scan) setupIssue('opSetup');
    else get('status').textContent=t('opPageError');
  }
}

if (typeof chrome !== 'undefined' && chrome.scripting) {
  const params = new URLSearchParams(location.search);
  const target = {tabId:Number(params.get('tab')), documentIds:[params.get('document')]};
  async function command(request) {
    const [response] = await chrome.scripting.executeScript({target, world:'ISOLATED', func:pageCommand, args:[request]});
    return response.result;
  }
  startReview(document, {
    extensionId:chrome.runtime.id,
    scan:() => command({op:'scan', privateFill:true}),
    apply:command,
    verify:token=>command({op:'verify',privateFill:true,token}),
    rescan:()=>location.reload(),
    native:request => chrome.runtime.sendNativeMessage('local.jev_form_fill.onepassword', request)
  }, params.get('lang'));
}
