// Format cues and values stay in the private review window.
export function formatRole(text = '') {
  const key = text.normalize('NFKC').trim().toLowerCase().replace(/[\s_():：・*-]/g,'').replace(/必須|任意/g,'');
  const namePart=key.match(/^(お名前|氏名|名前|フリガナ|ふりがな|カナ)(姓|名|セイ|メイ|せい|めい)$/);
  if (namePart) {
    const family=/^(姓|セイ|せい)$/.test(namePart[2]);
    const kana=/フリガナ|ふりがな|カナ/.test(namePart[1]) || /セイ|メイ|せい|めい/.test(namePart[2]);
    return (family?'family-':'given-') + (kana?'kana':'name');
  }
  if (/^(?:郵便番号|postalcode|zip)(?:前(?:半)?3桁|上3桁|prefix)$/.test(key)) return 'postal-prefix';
  if (/^(?:郵便番号|postalcode|zip)(?:後(?:半)?4桁|下4桁|suffix)$/.test(key)) return 'postal-suffix';
  if (/^(?:電話(?:番号)?|携帯電話|tel|phone)?(?:市外局番|1)$/.test(key) && key !== '1') return 'tel-area-code';
  if (/^(?:電話(?:番号)?|携帯電話|tel|phone)?(?:市内局番|2)$/.test(key) && key !== '2') return 'tel-local-prefix';
  if (/^(?:電話(?:番号)?|携帯電話|tel|phone)?(?:加入者番号|3)$/.test(key) && key !== '3') return 'tel-local-suffix';
  if (/^(?:ご?住所)?丁目まで$/.test(key)) return 'through-chome';
  if (/^(?:ご?住所)?丁目(?:より後|の後)$/.test(key)) return 'after-chome';
  if (/^(?:ご?住所)?(?:地番|番地)(?:のみ)?$/.test(key)) return 'parcel';
  if (/^(?:ご?住所)?(?:地番|番地)(?:以降|以下|建物名)$/.test(key)) return 'parcel-rest';
  if (/^(?:ご?住所)?(?:地番|番地)まで$/.test(key)) return 'through-parcel';
  if (/^(?:ご?住所)?(?:地番|番地)(?:より前|の前まで)$/.test(key)) return 'before-parcel';
  return '';
}

function parcelParts(value) {
  // Require a distinct, numeric parcel followed by end-of-address or a separated building.
  // Preserve the source slices, including full-width digits and building/room numbers.
  value = value.trim().replace(/^〒\s*[0-9０-９]{3}[-－][0-9０-９]{4}\s*/, '');
  const digit = '[0-9０-９]+';
  const lot = digit+'(?:番地?(?:の)?'+digit+'号?|(?:[-－−]'+digit+'){1,2})';
  const number = '(?:(?:'+digit+'|[〇零一二三四五六七八九十百]+)丁目)?'+lot;
  const matches = [...value.matchAll(new RegExp(number,'g'))];
  if (matches.length !== 1) return;
  const m = matches[0], prefix = value.slice(0,m.index).trimEnd(), tail = value.slice(m.index+m[0].length);
  if (!prefix || /[0-9０-９〒-]$/.test(prefix) || /〒?\s*[0-9０-９]{3}[-－][0-9０-９]{4}/.test(value) ||
      (tail && !/^\s+\S/.test(tail))) return;
  const parts = {'before-parcel':prefix, parcel:m[0], 'through-parcel':value.slice(0,m.index+m[0].length),
    'parcel-rest':value.slice(m.index), 'address-line2':tail.trim()};
  const endOfChome = m[0].indexOf('丁目');
  if (endOfChome >= 0) {
    const offset = m.index + endOfChome + '丁目'.length;
    parts['through-chome'] = value.slice(0,offset);
    parts['after-chome'] = value.slice(offset);
  }
  return parts;
}

export function derivedParts(source, widths) {
  if (source.role === 'postal-code') {
    const digits=source.value.normalize('NFKC').replace(/^〒\s*/, '').replace(/[-‐‑−－]/g,'');
    if (/^\d{7}$/.test(digits)) return {'postal-prefix':digits.slice(0,3),'postal-suffix':digits.slice(3)};
  }
  if (source.role === 'name') {
    const parts = source.value.trim().split(/\s+/u);
    if (parts.length !== 2) return;
    if (/姓[\s　・/]+名|family name[, /]+given name/i.test(source.label)) return {'family-name':parts[0],'given-name':parts[1]};
    if (/名[\s　・/]+姓|given name[, /]+family name/i.test(source.label)) return {'given-name':parts[0],'family-name':parts[1]};
  }
  if (source.role === 'street-address') return parcelParts(source.value);
  if (source.role !== 'tel') return;
  const value = source.value.normalize('NFKC').trim();
  let groups = value.match(/^(0\d{1,4})[-‐‑−](\d{1,4})[-‐‑−](\d{4})$/);
  if (!groups && widths && /^0\d+$/.test(value) && widths.reduce((sum,n)=>sum+n,0) === value.length) {
    const [a,b] = widths;
    groups = [value,value.slice(0,a),value.slice(a,a+b),value.slice(a+b)];
  }
  if (groups) return {'tel-area-code':groups[1], 'tel-local-prefix':groups[2], 'tel-local-suffix':groups[3]};
}

export function formatPhone(value, field) {
  const text = [field.label,field.placeholder,field.hint].filter(Boolean).join(' ').normalize('NFKC');
  const normalized = value.normalize('NFKC').replace(/[‐‑−]/g,'-');
  if (!/^0\d+(?:-\d+){0,2}$/.test(normalized)) return value;
  const digits = normalized.replaceAll('-','');
  const pattern = field.pattern || '';
  // Exact group sizes are sufficient even for an unformatted number.
  const widths = pattern.match(/^\^?(?:\\d|\[0-9\])\{(\d+)\}-(?:\\d|\[0-9\])\{(\d+)\}-(?:\\d|\[0-9\])\{(\d+)\}\$?$/);
  if (widths) {
    const [a,b,c] = widths.slice(1).map(Number);
    if (a+b+c !== digits.length) return;
    return [digits.slice(0,a),digits.slice(a,a+b),digits.slice(a+b)].join('-');
  }
  const withHyphens=/ハイフン(?:は)?(?:あり|有り|付き|必須|を含む)|with hyphens/i.test(text);
  if (/ハイフン(?:は)?(?:なし|無し|不要)|数字のみ|digits only|no hyphens/i.test(text) ||
      (/半角数字/.test(text) && !/ハイフン|hyphen/i.test(text)) ||
      /^(?:\\d|\[0-9\])(?:\+|\{\d+(?:,\d*)?\})$/.test(pattern) || field.maxLength === digits.length) return digits;
  const example = (field.placeholder || '').normalize('NFKC').match(/^(?:例[：:]?\s*)?(0\d{1,4})-(\d{1,4})-(\d{4})$/);
  if (!normalized.includes('-') && example && digits.startsWith(example[1]) && digits.length === example[1].length + example[2].length + example[3].length) {
    const a=example[1].length, b=example[2].length;
    return [digits.slice(0,a),digits.slice(a,a+b),digits.slice(a+b)].join('-');
  }
  if (withHyphens) return normalized.includes('-') ? normalized : undefined;
  return value;
}

export function joinedName(family, given, field, original) {
  const hint = [field.label,field.placeholder,field.hint].filter(Boolean).join(' ');
  if (original && !/(?:スペース|空白|名[\s・/]+姓|姓[\s・/]+名|first name.*last name|last name.*first name)/i.test(hint)) return original;
  const givenFirst = /名[\s　・/]+姓|first\s+name.*last\s+name/i.test(hint);
  const familyFirst = /姓[\s　・/]+名|last\s+name.*first\s+name/i.test(hint) || /[ぁ-ヿ一-龯]/u.test(field.label);
  const parts = familyFirst && !givenFirst ? [family,given] : [given,family];
  const separator = /(?:スペース|空白)(?:は)?(?:なし|無し|不要)/.test(hint) ? '' :
    /全角(?:の)?(?:スペース|空白)/.test(hint) ? '　' : ' ';
  return parts.join(separator);
}

export function formatContactValue(value, role, field) {
  const hint = [field.label,field.placeholder,field.hint].filter(Boolean).join(' ');
  if (role === 'postal-code') {
    const digits = value.normalize('NFKC').replace(/^([0-9]{3})-([0-9]{4})$/, '$1$2');
    if (/^\d{7}$/.test(digits)) {
      if (field.maxLength === 7 || /ハイフン(?:なし|不要)|数字のみ/.test(hint) || /^(?:\\d|\[0-9\])\{7\}$/.test(field.pattern || '')) return digits;
      if (/ハイフン(?:あり|必須)|\d{3}-\d{4}/.test(hint) || (field.pattern || '').includes('}-')) return digits.slice(0,3)+'-'+digits.slice(3);
    }
  }
  if (role?.endsWith('-kana')) {
    const compact = value.replace(/[ｦ-ﾟ]+/gu, part=>part.normalize('NFKC'));
    if (/半角(?:の)?(?:カタカナ|カナ)/.test(hint)) {
      const katakana=compact.replace(/[ぁ-ゖ]/gu,c=>String.fromCharCode(c.charCodeAt(0)+96));
      const narrow=new Map();
      for (let code=0xff61;code<=0xff9f;code++) {
        const half=String.fromCharCode(code);
        narrow.set(half.normalize('NFKC'),half);
      }
      return [...katakana.normalize('NFD')].map(c=>narrow.get(c) || c).join('').replace(/　/g,' ');
    }
    if (/ひらがな|ふりがな|せい|めい/.test(hint)) return compact.replace(/[ァ-ヶ]/gu, c=>String.fromCharCode(c.charCodeAt(0)-96));
    if (/カタカナ|フリガナ|セイ|メイ/.test(hint)) return compact.replace(/[ぁ-ゖ]/gu, c=>String.fromCharCode(c.charCodeAt(0)+96));
  }
  return value;
}
