import {auditOptionMigration,type SchemaObject} from './option-migration-audit';
import type {Env} from '../types';
import {all} from './db';

/** Read-only D1 inventory. Never mutates live or test data. */
export async function inspectThreeOptionMigration(env:Pick<Env,'DB'>){
 const objects=await all<SchemaObject>(env.DB.prepare(
  "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') AND name NOT LIKE 'sqlite_%'"
 ));
 const audit=auditOptionMigration(objects);
 const fkRows=await Promise.all(['question_bank','exam_subjects','exam_questions','answer_keys'].map(async table=>{
  const rows=await all<any>(env.DB.prepare('PRAGMA foreign_key_list('+table+')'));
  return {table,foreignKeys:rows.map(r=>({from:r.from,to:r.to,refTable:r.table,onDelete:r.on_delete}))};
 }));
 const rowCounts=await Promise.all(['question_bank','exam_subjects','exam_questions','answer_keys'].map(async table=>{
  const row=await env.DB.prepare('SELECT count(*) count FROM '+table).first<{count:number}>();
  return {table,count:Number(row?.count||0)};
 }));
 return {...audit,foreignKeys:fkRows,rowCounts};
}
