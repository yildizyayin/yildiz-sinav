import {describe,it,expect} from 'vitest';
import {auditOptionMigration} from '../worker/lib/option-migration-audit';
describe('D1 three-option migration safety',()=>{
 const tables=['question_bank','exam_subjects','exam_questions','answer_keys'].map(name=>({type:'table',name,tbl_name:name,sql:`CREATE TABLE ${name}(option_count INTEGER CHECK(option_count IN (4,5)))`}));
 it('requires backup, FK checks, and row comparisons before any rebuild',()=>{
  const result=auditOptionMigration(tables);
  expect(result).toMatchObject({safeToAutoRebuild:false,findings:[],requiresBackup:true,requiresForeignKeyCheck:true,requiresRowCountComparison:true});
 });
 it('discovers inbound foreign keys, indexes and triggers that must survive',()=>{
  const result=auditOptionMigration([...tables,
   {type:'table',name:'question_learning_links',tbl_name:'question_learning_links',sql:'CREATE TABLE question_learning_links(question_id TEXT REFERENCES question_bank(id))'},
   {type:'index',name:'idx_qb',tbl_name:'question_bank',sql:'CREATE INDEX idx_qb ON question_bank(option_count)'},
   {type:'trigger',name:'audit_qb',tbl_name:'question_bank',sql:'CREATE TRIGGER audit_qb AFTER UPDATE ON question_bank BEGIN SELECT 1; END'}]);
  expect(result.inboundReferences).toContain('question_learning_links');
  expect(result.dependentObjects).toEqual(['audit_qb','idx_qb']);
 });
 it('fails closed when any base table is absent',()=>expect(auditOptionMigration(tables.slice(1)).findings).toContain('MISSING_TABLE:question_bank'));
});
