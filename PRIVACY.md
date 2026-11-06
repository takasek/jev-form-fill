# Privacy notes

English · [日本語](PRIVACY.ja.md)

Jev Form Fill sends your source text and form field names, context, types, and options to TypeSafe when you click **Create proposals with TypeSafe**. The endpoint is `https://api.typesafe.ai/v1/systemone` and the model is `jev-latest`. Your API key is sent to TypeSafe in the authorization header. API charges may apply; consult TypeSafe’s terms and data policies for its processing.

Existing field values, cookies, the destination page URL, and the full page body are not included in analysis requests. Personal information appearing in field names or headings is part of the metadata sent. Source text is not automatically scrubbed of secrets.

Your API key normally stays in the open popup. Choosing **Save the key in this browser** and applying settings saves it in `chrome.storage.local`. Chrome sync is not used, and content-script access is disabled. This storage is not an OS credential vault. **Delete saved key** removes it. The UI language preference is also stored locally; selecting a language never saves the API key.

The clipboard is read only when you click **Read clipboard**. Source text and diagnostics are not persisted. Diagnostics contain source text and decisions; review them before sharing in a public issue. Plans and undo values are kept in the extension’s isolated world on the page and disappear on page reload or navigation.

Filled values are visible to the destination website. Its input/change handlers may send them to its server before you submit. The extension never submits forms automatically.

There is no analytics or application backend. GitHub distributes the code and does not receive extension analysis requests. The local test server records submitted fictional data under `.local/form-fill-lab/receipts/` on your computer; that directory is excluded from Git.

The macOS helper stores the chosen vault and identity item identifiers and its configuration. Opening the review reads that one item with the CLI. Only supported identity fields, such as names, addresses and contact details, reach the review window. Notes and credentials are excluded. Matching and preview run locally. Only confirmed values are applied to the destination site. Values are excluded from AI requests, extension storage, diagnostics and Undo history. Legacy field registrations use saved field references and labels.

After a 1Password fill, the extension blocks AI analysis of that document because the site could copy the value into field labels or headings.

Before applying a fill, the review window temporarily keeps the retrieved fields and your edits. It can recheck destinations after you interact with the page without reading the vault again. Candidates and edits are cleared when you confirm the fill, and are also lost when the window closes.

For read-only rechecks, the isolated page context keeps form element references and salted hashes until a new scan or page reload.
