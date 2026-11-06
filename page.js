// Self-contained because chrome.scripting serializes the function into an isolated world.
export function pageCommand(request) {
  const key='__jevFormFillPrivateV1';
  const clean=text=>String(text||'').replace(/\s+/g,' ').trim().slice(0,600);
  const doc=document;
  function openedForScan() {
    const opened=[];
    for (const d of doc.querySelectorAll('form details')) {
      if (!d.open && d.querySelector('input:not([type=hidden]),select,textarea')) {d.open=true;opened.push(d);}
    }
    return opened;
  }
  function visible(element) {
    if (!element?.isConnected) return false;
    // A custom menu may hide only its backing native radio; require a visible labelled menu item.
    const styled=element.matches('input[type=radio],input[type=checkbox]') && element.labels?.[0];
    const anchor=styled || element;
    if (anchor.closest('[hidden],[inert],[aria-hidden=true]')) return false;
    let fixed=false;
    const clips=[];
    for (let parent=anchor;parent;parent=parent.parentElement) {
      const css=getComputedStyle(parent);
      if (request.privateFill) {
        fixed ||= css.position==='fixed';
        if (parent!==anchor && ['hidden','clip'].some(mode=>css.overflowX===mode || css.overflowY===mode)) {
          clips.push({box:parent.getBoundingClientRect(),x:['hidden','clip'].includes(css.overflowX),y:['hidden','clip'].includes(css.overflowY)});
        }
      }
      if (request.privateFill && (css.opacity === '0' || css.contentVisibility === 'hidden' ||
          /inset\(50%/.test(css.clipPath) || /^rect\(0px,? 0px,? 0px,? 0px\)$/.test(css.clip))) return false;
      if (css.display==='none' || css.visibility==='hidden' || css.visibility==='collapse') return false;
    }
    // Styled checkbox/radio inputs may be visually hidden, while their label is visible.
    const rects = [...anchor.getClientRects()];
    if (!request.privateFill) return rects.length > 0;
    // Keep ordinary controls below the fold, but exclude tiny traps and unreachable negative coordinates.
    return rects.some(rect => rect.width > 1 && rect.height > 1 &&
      !(rect.right + window.scrollX <= 0 || rect.bottom + window.scrollY <= 0 || rect.left >= window.innerWidth) &&
      !(fixed && (rect.bottom<=0 || rect.top>=window.innerHeight || rect.right<=0)) &&
      clips.every(({box,x,y})=>(!x || (rect.right>box.left && rect.left<box.right)) &&
        (!y || (rect.bottom>box.top && rect.top<box.bottom))));

  }
  function label(element) {
    const labels=Array.from(element.labels||[]).map(x=>{const clone=x.cloneNode(true);clone.querySelectorAll('input,textarea,select').forEach(n=>n.remove());return clean(clone.textContent);}).filter(Boolean);
    const aria=element.getAttribute('aria-label');
    const labelled=(element.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent).filter(Boolean).join(' ');
    return clean(labels.join(' / ') || aria || labelled || element.placeholder || element.name || element.id);
  }
  function context(element,includeRow=true) {
    const form=element.form || element.closest('form') || doc.body;
    const scopes=[];
    for(let parent=element.parentElement;parent&&parent!==form;parent=parent.parentElement)if(parent.matches('section,article'))scopes.unshift(parent);
    scopes.unshift(form);
    const headings=[];
    for(const scope of scopes) {
      const outline=[];
      for(const heading of scope.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
        if(!(heading.compareDocumentPosition(element)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
        // Keep ancestor headings, never preceding headings inside sibling sections.
        if(heading.closest('section,article')!==scope.closest('section,article'))continue;
        const level=Number(heading.tagName.slice(1));
        while(outline.length&&outline.at(-1).level>=level)outline.pop();
        outline.push({level,text:clean(heading.textContent)});
      }
      headings.push(...outline.map(x=>x.text));
    }
    const legend=element.closest('fieldset')?.querySelector('legend')?.textContent;
    const row=includeRow && element.closest('li,tr,[role=group]');
    let rowText='';
    if (row) {const clone=row.cloneNode(true);clone.querySelectorAll('input,select,textarea,button,details,a,[role=menu]').forEach(x=>x.remove());rowText=clean(clone.textContent);}
    return clean([...headings,legend,rowText].filter(Boolean).join(' / '));
  }
  function privateRegion(element) {
    // Read a section's own caption, never values or paragraphs from its entire subtree.
    let unnamed=null;
    for (let node=element.parentElement; node; node=node.parentElement) {
      if (!node.matches('div,section,article,fieldset,form,[role=group],[role=region]')) continue;
      const refs=(node.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
      const named=clean(refs.map(id=>doc.getElementById(id)?.textContent).join(' ') || node.getAttribute('aria-label'));
      if (named) return unnamed || {node,caption:named};
      const first=node.firstElementChild;
      if (first?.matches('p,strong,b,legend,h1,h2,h3,h4,h5,h6,[role=heading]') && first.textContent.trim().length<=120 && !first.querySelector('input,select,textarea')) {
        return unnamed || {node,caption:clean(first.textContent)};
      }
      if (!unnamed && node.matches('div,section,article,[role=group]') && node.parentElement &&
          node.querySelectorAll('label input,input:not([type=hidden]),select,textarea').length>=2 &&
          Array.from(node.parentElement.children).some(peer=>peer!==node && peer.tagName===node.tagName &&
            peer.querySelectorAll('input:not([type=hidden]),select,textarea').length>=2)) {
        unnamed={node,caption:'',uncertain:true};
      }
    }
    return unnamed || {node:null,caption:''};
  }
  function choiceState(control) {
    const state=['aria-checked','aria-selected','aria-pressed'].map(attr=>control.getAttribute(attr));
    if (control.tagName==='SELECT') state.push(...control.selectedOptions);
    if (control.matches('input[type=checkbox],input[type=radio]')) state.push(control.checked);
    return state;
  }
  function switches() {
    return Array.from(doc.querySelectorAll(
      'input[type=radio],input[type=checkbox],select,[aria-checked],[aria-selected],[aria-pressed]')).filter(control=>{
      // Address lookup commonly updates these selects without switching recipients.
      if (!control.matches('select') || control.matches('[aria-checked],[aria-pressed],[aria-selected]')) return true;
      const role=(control.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).at(-1);
      return !['country','country-name','address-level1','address-level2'].includes(role) &&
        !/^(都道府県|市区町村|国|国名|prefecture|state|city|country)$/i.test(label(control));
    });
  }
  function sameTarget(guards) {
    if (!guards || globalThis[key].editorActivated) return false;
    const controls=switches();
    return controls.length===guards.length && guards.every(({node,selection},i)=>{
      if (node!==controls[i]) return false;
      const actual=choiceState(node);
      return actual.length===selection.length && actual.every((v,j)=>v===selection[j]);
    });
  }
  function allowed(element) {
    if (!visible(element) || element.matches(':disabled') || element.readOnly) return false;
    if (element.tagName==='SELECT' && element.multiple) return false;
    if (element.tagName==='INPUT' && !['text','email','tel','url','search','number','date','time','datetime-local','checkbox','radio'].includes(element.type)) return false;
    const identity=[label(element),element.name,element.id,element.autocomplete].join(' ');
    if (element.matches('input[type=checkbox],input[type=radio],select')) return true;
    return !/(password|passwd|secret|token|api.?key|credit.?card|card.?number|cc-number|cc-csc|cvc|cvv|one.?time|otp|social.?security|パスワード|秘密|トークン|カード番号|認証コード)/i.test(identity);
  }
  function value(entry) {
    if (entry.kind==='radio') return entry.elements.find(x=>x.checked)?.value ?? null;
    if (entry.kind==='checkbox') return entry.elements[0].checked;
    return entry.elements[0].value;
  }
  function occupied(entry) {
    if (value(entry)==='') return false;
    if (entry.kind!=='select') return true;
    const option=entry.elements[0].selectedOptions[0];
    return !/^(?:選んでください|選択してください|未選択|please select|select an option)$/i.test(clean(option?.textContent));
  }
  function describe(entry,id) {
    const element=entry.elements[0];
    const base={id,kind:entry.kind,label:label(element),context:context(element),type:element.type||element.tagName.toLowerCase(),required:element.required};
    if (request.privateFill) {
      const region=privateRegion(element);
      const heading=context(element,false);
      const sectionLabel=region.caption && !heading.split(' / ').includes(region.caption)
        ? [heading,region.caption].filter(Boolean).join(' / ') : heading;
      base.context=sectionLabel + base.context.slice(heading.length);
      Object.assign(base,{
      group:JSON.stringify([Array.from(doc.forms).indexOf(element.form),
        Array.from(doc.querySelectorAll('fieldset,section,article')).indexOf(element.closest('fieldset,section,article')),
        region.node ? Array.from(doc.querySelectorAll('div,section,article,fieldset,form,[role=group],[role=region]')).indexOf(region.node) : -1,
        sectionLabel]),sectionLabel,uncertainGroup:!!region.uncertain,name:element.name,autocomplete:element.autocomplete,placeholder:element.placeholder,pattern:element.pattern,maxLength:element.maxLength,
      minLength:element.minLength,min:element.min,max:element.max,step:element.step,multiple:element.multiple,
      customStepBase:!element.min && !!element.getAttribute('value'),
      hint:clean((element.getAttribute('aria-describedby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent).filter(Boolean).join(' '))});
    }
    if (entry.kind==='radio') {
      base.label=clean(element.closest('fieldset')?.querySelector('legend')?.textContent || element.name || base.label);
      base.options=entry.elements.map(x=>({value:x.value,label:label(x)}));
    }
    if (entry.kind==='select') base.options=Array.from(element.options).filter(x=>!x.disabled && !x.closest('optgroup[disabled]')).map(x=>({value:x.value,label:clean(x.textContent)}));
    return base;
  }
  async function snapshot(text, token) {
    const bytes=new TextEncoder().encode(token + text);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',');
  }
  function collect(token) {
    const entries=[],seen=new Set();
    for (const element of doc.querySelectorAll('input,textarea,select')) {
      if (seen.has(element) || !allowed(element)) continue;
      const kind=element.type==='radio'?'radio':element.type==='checkbox'?'checkbox':element.tagName==='SELECT'?'select':'text';
      if (request.privateFill && !['text','select'].includes(kind)) continue;
      let elements=[element];
      if (kind==='radio' && element.name) {
        elements=Array.from(doc.querySelectorAll('input[type=radio]')).filter(x=>x.name===element.name && x.form===element.form);
        if (!elements.every(allowed)) {elements.forEach(x=>seen.add(x));continue;}
      }
      elements.forEach(x=>seen.add(x));
      const entry={kind,elements};
      const descriptor=describe(entry,`f${entries.length}`);
      if (!descriptor.label || descriptor.options?.length>254 || descriptor.options?.length===0 || new Set(descriptor.options?.map(x=>x.value)).size!== (descriptor.options?.length || 0)) continue;
      entry.descriptor=descriptor;entry.before=request.privateFill ? snapshot(value(entry),token) : value(entry);entry.fingerprint=JSON.stringify(descriptor);
      entries.push(entry);
    }
    return entries;
  }
  function reveal(entry) {
    const opened=[];
    for (const element of entry.elements) for(let p=element.parentElement;p;p=p.parentElement) if(p.tagName==='DETAILS' && !p.open) {p.open=true;opened.push(p);}
    return opened;
  }
  function current(entry, expectedFingerprint=entry.fingerprint) {
    const first=entry.elements[0];
    if (entry.kind==='radio' && first.name) {
      const members=Array.from(doc.querySelectorAll('input[type=radio]')).filter(x=>x.name===first.name && x.form===first.form);
      if (members.length!==entry.elements.length || members.some((x,i)=>x!==entry.elements[i])) return false;
    }
    return entry.elements.every(allowed) && JSON.stringify(describe(entry,entry.descriptor.id))===expectedFingerprint;
  }
  function setter(element,property,newValue) {
    const prototype=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,property).set.call(element,newValue);
    element.dispatchEvent(new Event('input',{bubbles:true}));
    element.dispatchEvent(new Event('change',{bubbles:true}));
    element.dispatchEvent(new Event('blur',{bubbles:true}));
  }
  function write(entry,newValue,restoring=false) {
    if (entry.kind==='radio') {
      const target=entry.elements.find(x=>x.value===newValue);
      if (!target) return false;
      // Native radios update the whole group. No click: avoids submit/navigation handlers.
      setter(target,'checked',true);
    } else if (entry.kind==='checkbox') {
      if (typeof newValue!=='boolean') return false;
      setter(entry.elements[0],'checked',newValue);
    } else {
      if (typeof newValue!=='string') return false;
      if (entry.kind==='select' && !describe(entry,entry.descriptor.id).options.some(x=>x.value===newValue)) return false;
      const element=entry.elements[0];
      if (!restoring) {
        if (element.maxLength>=0 && newValue.length>element.maxLength) return false;
        const probe=element.cloneNode(true);probe.value=newValue;
        if (newValue && (!probe.validity.valid || probe.value!==newValue)) return false;
      }
      // A page can copy the value into labels synchronously from its input handler.
      if (request.privateFill && !restoring) globalThis[key].privatePage=true;
      setter(element,'value',newValue);
    }
    return true;
  }
  const settle=()=>new Promise(resolve=>setTimeout(resolve,80));
  if (request.op==='scan') {
    const previous=globalThis[key];
    if (previous?.privatePage && !request.privateFill) return {privatePage:true};
    if (previous?.busy) throw new Error('入力処理中です。');
    const opened=openedForScan();
    try {
      const token=crypto.randomUUID();
      const entries=collect(token);
      if (entries.length>160) throw new Error('160項目を超えています。対象フォームを分けてください。');
      const fields=entries.map(entry=>request.privateFill
        ? {...entry.descriptor,occupied:occupied(entry)}
        : entry.descriptor);
      if (request.privateFill) {
        // Headings returned to the local reviewer may contain an earlier private value.
        for (const entry of entries) {
          entry.fingerprint=snapshot(entry.fingerprint,token);
          entry.descriptor={id:entry.descriptor.id};
        }
      }
      previous?.listener?.abort();
      const state={token,guards:request.privateFill ? switches().map(node=>({node,selection:choiceState(node)})) : null,privatePlan:Boolean(request.privateFill),privatePage:Boolean(previous?.privatePage),url:location.href,entries,undo:previous?.undo||[]};
      globalThis[key]=state;
      if (request.privateFill) {
        // Sites can switch drafts from arbitrary elements without replacing the input.
        // Review controls live in a different document. Our own writes dispatch input/change.
        state.listener=new AbortController();
        const invalidate=()=>{state.editorActivated=true;};
        for (const event of ['click','keydown','pointerdown']) {
          doc.addEventListener(event,invalidate,{capture:true,signal:state.listener.signal});
        }
      }
      return {token,url:location.origin+location.pathname,title:doc.title,fields,unsupported:doc.querySelectorAll('[role=combobox]:not(select),[role=listbox]:not(select),iframe').length};
    } finally {opened.reverse().forEach(x=>{x.open=false;});}
  }
  return (async()=>{
    const state=globalThis[key];
    if (!state || state.url!==location.href || (request.op==='apply' && (request.token!==state.token || Boolean(request.privateFill)!==state.privatePlan))) throw new Error('対象ページが変わりました。もう一度読み取ってください。');
    if (state.busy) throw new Error('入力処理中です。');
    state.busy=true;
    try {
      const results=[];
      if (request.op==='undo') {
        const pending=[],restoredRecords=[];
        for (const record of [...state.undo].reverse()) {
          const opened=reveal(record.entry);
          try {
            if (!current(record.entry) || value(record.entry)!==record.after) {results.push({id:record.entry.descriptor.id,status:'skip',reason:'その後の変更を残しました。'});continue;}
            if (record.entry.kind==='radio' && record.before===null) record.entry.elements.forEach(x=>setter(x,'checked',false));
            else if (!write(record.entry,record.before,true)) {pending.push(record);results.push({id:record.entry.descriptor.id,status:'failed'});continue;}
            await settle();
            const restored=value(record.entry)===record.before;
            const result={id:record.entry.descriptor.id,status:restored?'restored':'failed'};
            results.push(result);
            if(restored)restoredRecords.push({record,result});
            if (!restored) pending.push(record);
          } finally {opened.reverse().forEach(x=>{x.open=false;});}
        }
        if(restoredRecords.length) {
          await new Promise(resolve=>setTimeout(resolve,650));
          for(const {record,result} of restoredRecords)if(!record.entry.elements.every(x=>x.isConnected)||value(record.entry)!==record.before) {
            result.status='failed';pending.push(record);
          }
        }
        state.undo=state.undo.filter(record=>pending.includes(record));return results;
      }
      async function readReceipt(receipt) {
        if (state.url!==location.href || !sameTarget(state.guards)) {
          return receipt.items.filter(item=>item.result).map(item=>({id:item.id,wrote:!!item.result.wrote,status:'stale',reason:'元のフォームで操作または選択の変更がありました。フォームを読み直してください。'}));
        }
        const reports=await Promise.all(receipt.items.map(async item=>{
          const actual=item.node.isConnected ? await snapshot(item.node.value,receipt.token) : null;
          if (!item.result) return actual===await item.before ? null :
            {id:item.id,status:'indirect',reason:'この欄への直接入力は行っていませんが、値または欄が変わりました。'};
          const result=item.result;
          if (result.status==='confirmation') return result;
          if (actual===await item.expected && result.status!=='stale' &&
              await snapshot(JSON.stringify(describe(item.entry,item.id)),receipt.token)===await item.entry.fingerprint) {
            return {...result,status:result.wrote?'filled':'matched',reason:result.wrote?'入力して読戻しを確認しました。':'現在の値が候補と一致しています。'};
          }
          if (result.status==='skip' || result.status==='stale') return result;
          return {id:item.id,wrote:!!result.wrote,status:'changed',reason:'読戻し時点で候補と異なる値、または別の欄になっています。'};
        }));
        const known=new Set(receipt.items.map(i=>i.node));
        const added=Array.from(doc.querySelectorAll('input,select,textarea')).some(el=>
          !known.has(el) && allowed(el) && !el.matches('input[type=checkbox],input[type=radio]') && label(el));
        if (added) reports.push({status:'new-fields',reason:'新しい入力欄があります。'});
        return [...reports.filter(r=>r && r.status!=='indirect' && r.status!=='new-fields'),
          ...reports.filter(r=>r && (r.status==='indirect' || r.status==='new-fields'))];
      }
      if (request.op==='verify') {
        if (!request.privateFill || !state.receipt || state.receipt.token!==request.token) throw new Error('フォームを読み直してください。');
        return await readReceipt(state.receipt);
      }
      if (request.op!=='apply') throw new Error('不明な操作です。');
      const rows=new Map((request.rows||[]).map(x=>[x.id,x]));
      const receipt=state.privatePlan ? {token:state.token,
        items:state.entries.map(entry=>({id:entry.descriptor.id,node:entry.elements[0],entry,
          before:snapshot(value(entry),state.token)}))} : null;
      const undo=[];
      for (const entry of state.entries) {
        const row=rows.get(entry.descriptor.id);if(!row) continue;
        const opened=reveal(entry);
        try {
          const before=value(entry);
          const fingerprint=state.privatePlan ? JSON.stringify(describe(entry,row.id)) : entry.fingerprint;
          const matches=state.privatePlan
            ? await snapshot(before,state.token)===await entry.before &&
              await snapshot(fingerprint,state.token)===await entry.fingerprint
            : before===entry.before;
          if (state.privatePlan && !sameTarget(state.guards)) {
            results.push({id:row.id,status:'stale',reason:'元のフォームで操作または選択の変更がありました。フォームを読み直してください。'});continue;
          }
          if (state.privatePlan && row.matchExisting) {
            const peer=state.entries.find(other=>other.descriptor.id===row.matchExisting);
            if (!peer || !peer.elements[0].isConnected || value(peer)!==row.value) {
              results.push({id:row.id,status:'confirmation',reason:'入力済みのメールアドレスと一致しません。'});
              continue;
            }
          }
          if (state.privatePlan && before===row.value && current(entry,fingerprint) &&
              await snapshot(fingerprint,state.token)===await entry.fingerprint && value(entry)===before) {
            results.push({id:row.id,status:'matched',reason:'この欄に書き込む前に候補と一致していました。'});continue;
          }
          if (!matches || value(entry)!==before || state.url!==location.href || !current(entry,fingerprint)) {results.push({id:row.id,status:'skip',reason:'ページの項目または値が変わりました。'});continue;}
          if (state.privatePlan && occupied(entry) && row.overwrite !== true) {
            results.push({id:row.id,status:'skip',reason:'入力済みの値を保持しました。'});continue;
          }
          if (value(entry)===row.value) {results.push({id:row.id,status:'unchanged',reason:'すでに同じ値です。'});continue;}
          if (!write(entry,row.value)) {results.push({id:row.id,status:'skip',reason:'この値は項目に設定できません。'});continue;}
          const after=value(entry);
          if (state.privatePlan && entry.kind==='select' && after===row.value) {
            const guard=state.guards.find(g=>g.node===entry.elements[0]);
            if (guard) guard.selection=choiceState(guard.node);
          }
          if (!request.privateFill && after!==before) undo.push({entry,before,after});
          await settle();await settle();
          const retained=value(entry)===row.value;
          results.push({id:row.id,...(state.privatePlan ? {wrote:true} : {}),status:retained?'filled':'failed',reason:retained?'入力して読戻しを確認しました。':'ページが値を受け付けませんでした。'});
        } catch {results.push({id:row.id,status:'failed',reason:'この項目の入力に失敗しました。'});}
        finally {opened.reverse().forEach(x=>{x.open=false;});}
      }
      // A plan can be applied only once, even when some rows were deselected.
      if (receipt) {
        // Keep only salted digests for read-only checks while the review is open.
        for (const item of receipt.items) {
          item.result=results.find(r=>r.id===item.id);
          if (item.result) item.expected=snapshot(rows.get(item.id).value,receipt.token);
        }
        state.token=null;
        state.entries=[];
        state.receipt=receipt;
        if (results.some(r=>r.status==='filled' || r.status==='failed')) {
          state.undo=[];
          await new Promise(resolve=>setTimeout(resolve,2000));
        }
        return await readReceipt(receipt);
      }
      if(results.some(x=>x.status==='filled')) {
        await new Promise(resolve=>setTimeout(resolve,650));
        for(const result of results.filter(x=>x.status==='filled')) {
          const entry=state.entries.find(x=>x.descriptor.id===result.id);
          if(!entry.elements.every(x=>x.isConnected)||value(entry)!==rows.get(result.id).value) {
            result.status='failed';result.reason='入力後にページが値を変更しました。';
          }
        }
      }
      state.token=null;
      if (undo.length) state.undo=undo;
      return results;
    } finally {state.busy=false;}
  })();
}
