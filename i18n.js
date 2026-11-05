export const messages = {
  "opNumbered": {"en":"{caption} (field {position})","ja":"{caption}（上から {position} 番目）"},
  "opPrivatePage": {"en":"1Password was used on this page. Reload the form before creating AI proposals.","ja":"このページには 1Password から入力しました。AI の候補を作るにはフォームを再読み込みしてください。"},
  "opProfileReading": {"en":"Reading your registered identity…","ja":"登録した身元情報を読み取り中…"},
  "opProfileError": {"en":"Could not read the identity. Check 1Password and reopen the review.","ja":"身元情報を読み取れませんでした。1Password を確認して開き直してください。"},
  "opEmptyProfile": {"en":"This identity has no supported contact information.","ja":"この身元情報に入力できる氏名・住所・連絡先がありません。"},
  "opSkip": {"en":"Leave this field alone","ja":"入力しない"},
  "opFillMany": {"en":"Fill {count} fields","ja":"{count} 件をまとめて入力"},
  "opBatchHint": {"en":"Check the proposed values. Change or skip any row before filling.","ja":"入力案を確認し、必要な欄だけ選び直してください。"},
  "opBatchResult": {"en":"Filled {filled} of {total} selected fields.","ja":"選択した {total} 件のうち {filled} 件に入力しました。"},
  "opOpen": {"en": "Fill from 1Password", "ja": "1Password から入力"},
  "opField": {"en": "1Password field", "ja": "1Password の項目"},
  "opChoose": {"en": "Choose a field…", "ja": "項目を選択…"},
  "opPreview": {"en": "Value to fill", "ja": "入力する値"},
  "opDestination": {"en": "Destination on the form", "ja": "フォームの入力先"},
  "opFill": {"en": "Fill this field", "ja": "この欄に入力"},
  "opReview": {"en": "Check the value and destination before filling.", "ja": "値と入力先を確認してください。"},
  "opNoFields": {"en": "No eligible text fields on this form.", "ja": "このフォームには入力できるテキスト欄がありません。"},
  "opSetup": {"en": "Set up the macOS helper and register a field using the README, then reopen from the form.", "ja": "README の手順で Mac 用ヘルパーを設定し、項目を登録してからフォームで開き直してください。"},
  "opReading": {"en": "Reading the field. Approve the request in 1Password if prompted.", "ja": "読み取り中です。1Password の認証が表示されたら承認してください。"},
  "opAuthError": {"en":"1Password authorization expired or was declined. Select the field to try again.","ja":"1Password の認証が完了しませんでした。項目を選び直してください。"},
  "opReadError": {"en": "Could not read this field. Check 1Password and select the field again.", "ja": "読み取れませんでした。1Password を確認し、項目を選び直してください。"},
  "opPageError": {"en": "Reopen Jev Form Fill on the target form and try again.", "ja": "対象フォームで Jev Form Fill を開き直してください。"},
  "subtitle": {
    "en": "Copied text. The right fields.",
    "ja": "コピーした文章を、今のフォームへ。"
  },
  "language": {
    "en": "Language",
    "ja": "表示言語"
  },
  "auto": {
    "en": "Browser language",
    "ja": "ブラウザの言語"
  },
  "checkingTarget": {
    "en": "Checking the target page…",
    "ja": "対象ページを確認しています…"
  },
  "target": {
    "en": "Target · {host}{path}",
    "ja": "入力先 · {host}{path}"
  },
  "sourceLabel": {
    "en": "Source text",
    "ja": "元になる文章"
  },
  "sourcePlaceholder": {
    "en": "Paste settings or notes. Fields without a supported value will stay unchanged.",
    "ja": "設定値やメモを貼り付けてください。書かれていない項目は変更しません。"
  },
  "clipboard": {
    "en": "Read clipboard",
    "ja": "クリップボードから読む"
  },
  "clear": {
    "en": "Clear text",
    "ja": "文章を消す"
  },
  "keySettings": {
    "en": "API key settings",
    "ja": "APIキーの設定"
  },
  "keyLabel": {
    "en": "TypeSafe API key",
    "ja": "TypeSafe APIキー"
  },
  "keyPlaceholder": {
    "en": "Enter your key only here",
    "ja": "キーはここにだけ入力"
  },
  "remember": {
    "en": "Save the key in this browser",
    "ja": "このブラウザにキーを保存する"
  },
  "keyStorage": {
    "en": "Without saving, closing this popup forgets the key. Saved keys use Chrome extension storage.",
    "ja": "保存しない場合は、この画面を閉じるとキーを忘れます。保存先はChromeの拡張機能用ストレージです。"
  },
  "saveKey": {
    "en": "Apply settings",
    "ja": "設定を反映"
  },
  "forgetKey": {
    "en": "Delete saved key",
    "ja": "保存したキーを削除"
  },
  "privacy": {
    "en": "Creating proposals sends your text and field names/options to TypeSafe. API charges may apply. Existing field values are not sent.",
    "ja": "候補の作成時に、文章とフォームの項目名・選択肢をTypeSafeへ送信します。API利用料が発生する場合があります。既存の入力値は送りません。"
  },
  "analyze": {
    "en": "Create proposals with TypeSafe",
    "ja": "TypeSafeへ送って候補を作る"
  },
  "cancel": {
    "en": "Cancel",
    "ja": "中止"
  },
  "proposals": {
    "en": "Form proposals",
    "ja": "入力候補"
  },
  "reviewHint": {
    "en": "Choose the fields to change. Unchecked fields will be left alone.",
    "ja": "変更したい項目を選んでください。チェックを外した項目は触りません。"
  },
  "diagnostics": {
    "en": "Decision details (diagnostics)",
    "ja": "判定の詳細（診断用）"
  },
  "diagnosticHint": {
    "en": "Source text, field context, decision stages, and probabilities. No API key. You can copy this when needed; it disappears when the popup closes.",
    "ja": "元情報、項目の文脈、判定段階と確率です。APIキーは含みません。必要なときにコピーできます。この画面を閉じると消えます。"
  },
  "apply": {
    "en": "Fill selected fields",
    "ja": "選んだ項目に入力"
  },
  "undo": {
    "en": "Undo last fill",
    "ja": "直前の入力を戻す"
  },
  "submitHint": {
    "en": "Review the form and submit it yourself.",
    "ja": "フォームの送信は、内容を確認してからご自身で。"
  },
  "count": {
    "en": "{ready} proposals / {total} fields",
    "ja": "{ready}件の候補 / {total}項目"
  },
  "blank": {
    "en": "Leave blank",
    "ja": "空欄にする"
  },
  "unchanged": {
    "en": "Leave unchanged",
    "ja": "変更しない"
  },
  "on": {
    "en": "On",
    "ja": "オン"
  },
  "off": {
    "en": "Off",
    "ja": "オフ"
  },
  "cleared": {
    "en": "Text cleared.",
    "ja": "文章を消しました。"
  },
  "clipboardRead": {
    "en": "Clipboard read. Nothing has been sent yet.",
    "ja": "クリップボードを読みました。まだ送信していません。"
  },
  "clipboardError": {
    "en": "Could not read the clipboard. Paste the text into the source box.",
    "ja": "クリップボードを読めませんでした。文章欄に貼り付けてください。"
  },
  "keySaved": {
    "en": "API key saved in this browser.",
    "ja": "APIキーをこのブラウザに保存しました。"
  },
  "keyEphemeral": {
    "en": "The key is only used in this popup. Any previously saved key was deleted.",
    "ja": "キーはこの画面だけで使用します。保存済みのキーは削除しました。"
  },
  "keyDeleted": {
    "en": "API key deleted.",
    "ja": "APIキーを削除しました。"
  },
  "proposalsReady": {
    "en": "Proposals ready. Review them before filling.",
    "ja": "候補を作成しました。確認後に入力してください。"
  },
  "unsupported": {
    "en": " Custom widgets and iframes may be unsupported.",
    "ja": " 独自の選択UIやiframeは対象外になる場合があります。"
  },
  "proposalsReadyUnsupported": {
    "en": "Proposals ready. Review them before filling. Custom widgets and iframes may be unsupported.",
    "ja": "候補を作成しました。確認後に入力してください。 独自の選択UIやiframeは対象外になる場合があります。"
  },
  "applySummary": {
    "en": "Filled {filled}. Already matching: {unchanged}. Could not set: {failed}. Check the form.",
    "ja": "{filled}件を入力しました。{unchanged}件はすでに同じ値でした。{failed}件は設定できませんでした。フォームを確認してください。"
  },
  "undoSummary": {
    "en": "Restored {restored}. Later edits kept: {kept}. Could not restore: {failed}.",
    "ja": "{restored}件を元に戻しました。{kept}件は後から編集されたため残しました。{failed}件は戻せませんでした。"
  },
  "cancelled": {
    "en": "Cancelled.",
    "ja": "中止しました。"
  },
  "timeout": {
    "en": "The API did not respond in time.",
    "ja": "APIの応答が時間内に返りませんでした。"
  },
  "failed": {
    "en": "The operation failed.",
    "ja": "処理に失敗しました。"
  },
  "openPage": {
    "en": "Open the target page, then reopen the extension.",
    "ja": "対象ページを開いてから、拡張機能を開き直してください。"
  },
  "noAccess": {
    "en": "Cannot access forms on this page.",
    "ja": "このページではフォームにアクセスできません。"
  },
  "needKey": {
    "en": "Set your TypeSafe API key.",
    "ja": "TypeSafeのAPIキーを設定してください。"
  },
  "sourceHasKey": {
    "en": "The text contains your configured API key. Remove it first.",
    "ja": "文章に設定済みのAPIキーが含まれています。取り除いてください。"
  },
  "needSource": {
    "en": "Enter the source text.",
    "ja": "元の文章を入力してください。"
  },
  "noFields": {
    "en": "No supported fields found. Open collapsed sections and try again.",
    "ja": "対応するフォーム項目が見つかりませんでした。折りたたまれた項目を開いてから、もう一度試してください。"
  },
  "sourceChanged": {
    "en": "The text changed. Create proposals again.",
    "ja": "文章が変わりました。もう一度候補を作ってください。"
  },
  "needPlan": {
    "en": "Create proposals again.",
    "ja": "もう一度候補を作ってください。"
  },
  "chooseFields": {
    "en": "Select fields to fill.",
    "ja": "入力する項目を選んでください。"
  },
  "webOnly": {
    "en": "Open this on a normal web page. Chrome internal pages cannot be filled.",
    "ja": "通常のWebページで開いてください。Chrome内部ページには入力できません。"
  },
  "noTarget": {
    "en": "Could not get the target page.",
    "ja": "入力先を取得できませんでした。"
  },
  "sourceLimit": {
    "en": "Keep the source text within 12,000 characters.",
    "ja": "元の文章は12,000文字以内にしてください。"
  },
  "lineLimit": {
    "en": "Keep the source text within 120 lines.",
    "ja": "元の文章は120行以内にしてください。"
  },
  "fieldLimit": {
    "en": "Up to 160 fields are supported. Split the form.",
    "ja": "対象は160項目以内です。フォームを分けてください。"
  },
  "scanLimit": {
    "en": "More than 160 fields. Split the target form.",
    "ja": "160項目を超えています。対象フォームを分けてください。"
  },
  "passageUnknown": {
    "en": "Could not identify a supporting passage.",
    "ja": "根拠の行を確定できませんでした。"
  },
  "choiceUnknown": {
    "en": "Could not confirm the specified option.",
    "ja": "指定された選択値を確定できませんでした。"
  },
  "valueUnknown": {
    "en": "Could not confirm a value or explicit blank instruction in the passage.",
    "ja": "根拠の行から値または空欄指定を確定できませんでした。"
  },
  "candidateLimit": {
    "en": "Too many candidate values to resolve this field.",
    "ja": "候補の数が多すぎるため、値を確定できませんでした。"
  },
  "rangeUnknown": {
    "en": "Could not identify an exact source range.",
    "ja": "文章から値の範囲を確定できませんでした。"
  },
  "supported": {
    "en": "A proposal supported by the source text.",
    "ja": "元の文章に一致する候補です。"
  },
  "unsupportedValue": {
    "en": "Could not verify support in the source text.",
    "ja": "元の文章による裏付けを確認できませんでした。"
  },
  "progress": {
    "en": "Reading fields {start}–{end} of {total}…",
    "ja": "{start}〜{end} / {total} 項目を読み取っています…"
  },
  "pageChanged": {
    "en": "The target page changed. Scan it again.",
    "ja": "対象ページが変わりました。もう一度読み取ってください。"
  },
  "pageBusy": {
    "en": "A fill operation is already in progress.",
    "ja": "入力処理中です。"
  },
  "laterEdit": {
    "en": "Kept a later edit.",
    "ja": "その後の変更を残しました。"
  },
  "unknownOperation": {
    "en": "Unknown operation.",
    "ja": "不明な操作です。"
  },
  "fieldChanged": {
    "en": "The field or its value changed on the page.",
    "ja": "ページの項目または値が変わりました。"
  },
  "alreadyMatching": {
    "en": "Already matches.",
    "ja": "すでに同じ値です。"
  },
  "invalidValue": {
    "en": "This value cannot be set in this field.",
    "ja": "この値は項目に設定できません。"
  },
  "readback": {
    "en": "Filled and verified by readback.",
    "ja": "入力して読戻しを確認しました。"
  },
  "pageRejected": {
    "en": "The page did not accept the value.",
    "ja": "ページが値を受け付けませんでした。"
  },
  "writeFailed": {
    "en": "Could not fill this field.",
    "ja": "この項目の入力に失敗しました。"
  },
  "pageReverted": {
    "en": "The page changed the value after filling.",
    "ja": "入力後にページが値を変更しました。"
  },
  "authError": {
    "en": "The API key is invalid.",
    "ja": "APIキーが無効です。"
  },
  "forbidden": {
    "en": "You do not have permission to use the API.",
    "ja": "APIを利用する権限がありません。"
  },
  "badRequest": {
    "en": "The API rejected the request format.",
    "ja": "APIが要求形式を受け付けませんでした。"
  },
  "rateLimit": {
    "en": "API usage limit reached. Wait and try again.",
    "ja": "APIの利用上限に達しました。しばらく待ってやり直してください。"
  },
  "overloaded": {
    "en": "The API is busy. Wait and try again.",
    "ja": "APIが混雑しています。しばらく待ってやり直してください。"
  },
  "apiError": {
    "en": "API error ({code})",
    "ja": "APIエラー ({code})"
  },
  "malformed": {
    "en": "The API did not return valid answers.",
    "ja": "APIから有効な回答が返りませんでした。"
  }
};

export function resolveLanguage(preference, browserLanguage='en') {
  if(preference==='en'||preference==='ja')return preference;
  return /^ja(?:-|$)/i.test(browserLanguage)?'ja':'en';
}
export function translator(language) {
  const locale=resolveLanguage(language);
  return (key,values={})=>{
    const template=messages[key]?.[locale];
    if(template===undefined)throw new Error(`Unknown translation: ${key}`);
    return template.replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??`{${name}}`));
  };
}
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=Object.entries(messages).flatMap(([key,translations])=>Object.values(translations).map(template=>{
  const names=[];let cursor=0,pattern='';
  for(const match of template.matchAll(/\{(\w+)\}/g)) {
    pattern+=escape(template.slice(cursor,match.index))+'(.*?)';names.push(match[1]);cursor=match.index+match[0].length;
  }
  return {key,names,pattern:new RegExp('^'+pattern+escape(template.slice(cursor))+'$')};
}));
export function localizeMessage(text,language) {
  if(typeof text!=='string')return text||'';
  for(const {key,names,pattern} of patterns) {
    const match=text.match(pattern);
    if(match)return translator(language)(key,Object.fromEntries(names.map((name,i)=>[name,match[i+1]])));
  }
  return text;
}
