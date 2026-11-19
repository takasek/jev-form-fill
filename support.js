// Only operation metadata belongs here. Page text and native/API error messages can contain user data.
export function showSupport(document, manifest, operation) {
  const output=document.getElementById('support');
  const report={version:manifest?.version,build:manifest?.version_name,operation:operation.name};
  for (const key of ['stage','batch','batches','requests','httpStatus','error','fieldsFound']) {
    if (operation[key]!==undefined) report[key]=operation[key];
  }
  if (operation.results) report.rows=operation.results.map(row=>({
    id:row.id,selected:row.selected,wrote:!!row.wrote,
    status:row.status,reason:row.code || row.status,valueMatches:row.valueMatches ?? null
  }));
  output.value=JSON.stringify(report,null,2);
  output.closest('details').hidden=false;
}

export function scanErrorMessage(code,t) {
  const keys={field_limit:'scanLimit',insecure_context:'securePage',page_busy:'pageBusy'};
  return t(keys[code] || 'noAccess');
}
