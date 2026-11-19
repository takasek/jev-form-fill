import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grade,expected} from '../grader.js';
test('all fixture expectations are graded, including false and explicit empty strings',()=>{
  const fields=Object.fromEntries(expected.map(x=>[x.name,x.value]));
  const submitted=expected.filter(x=>x.group==='baseline' && x.value!==false).map(x=>[x.name,x.value===true?'on':x.value]);
  const report=grade(fields,submitted);
  assert.equal(report.baseline.passed,report.baseline.total);
  assert.equal(report.protection.passed,report.protection.total);
  assert.equal(report.rows.length,expected.length);
});
test('missing false and missing blank are failures rather than assumed defaults',()=>{
  const fields=Object.fromEntries(expected.map(x=>[x.name,x.value]));
  delete fields.a31;delete fields.a22;
  const report=grade(fields);
  assert.equal(report.rows.find(x=>x.name==='a31').ok,false);
  assert.equal(report.rows.find(x=>x.name==='a22').ok,false);
});
test('a copied billing value cannot pass for the unprovided shipping address',()=>{
  const fields=Object.fromEntries(expected.map(x=>[x.name,x.value]));
  fields.c12='060-0042';
  const report=grade(fields);
  assert.equal(report.rows.find(x=>x.name==='c12').ok,false);
  assert.equal(report.protection.passed,report.protection.total-1);
});

test('a matching DOM value missing from FormData fails the normal field while protection remains independent',()=>{
  const report=grade({a21:'004207',a31:false,a32:true,z11:'KEEP-RECOVERY-NAME'},[['a32','on']]);
  const reference=report.rows.find(row=>row.name==='a21');
  assert.equal(reference.domOk,true);
  assert.equal(reference.submissionOk,false);
  assert.equal(reference.ok,false);
  for(const name of ['a31','a32','z11']) assert.equal(report.rows.find(row=>row.name===name).ok,true);
});
