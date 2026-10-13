import {describe,it,expect} from 'vitest';
import {optionSchemaState,OPTION_COUNT_TABLES} from '../worker/lib/option-schema-readiness';
describe('3-choice D1 schema release gate',()=>{
 const base=OPTION_COUNT_TABLES.map(name=>({name,sql:`CREATE TABLE ${name}(option_count INTEGER CHECK(option_count IN (4,5)))`}));
 it('rejects unchanged legacy 4/5 constraints',()=>expect(optionSchemaState(base).ready).toBe(false));
 it('rejects incomplete migrations and missing tables',()=>{
  const rows=base.map((x,i)=>i<3?{...x,sql:x.sql.replace('(4,5)','(3,4,5)')}:x);
  expect(optionSchemaState(rows).tables.filter(t=>!t.allowsThree).map(t=>t.name)).toEqual(['answer_keys']);
  expect(optionSchemaState(rows.slice(0,3)).ready).toBe(false);
 });
 it('accepts only all four updated schema definitions',()=>{
  expect(optionSchemaState(base.map(x=>({...x,sql:x.sql.replace('(4,5)','(3,4,5)')}))).ready).toBe(true);
 });
});
