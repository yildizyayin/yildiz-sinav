import {describe,it,expect} from 'vitest';
import {verifyChoiceMigrationEvidence} from '../worker/lib/option-migration-reconcile';
const names=['question_bank','exam_subjects','exam_questions','answer_keys'];
const base=()=>({tables:names.map(table=>({table,before:3,after:3,beforeDistinctIds:3,afterDistinctIds:3})),foreignKeyViolations:0,integrityResult:'ok',expectedTables:names});
describe('three-choice schema migration verification gate',()=>{
 it('accepts only complete integrity and identity evidence',()=>expect(verifyChoiceMigrationEvidence(base()).ok).toBe(true));
 it('blocks lost exam answers',()=>{
  const e=base();e.tables[3].after=2;
  expect(verifyChoiceMigrationEvidence(e).issues).toContain('ROW_COUNT_CHANGED:answer_keys');
 });
 it('blocks corrupt relations',()=>{
  const e=base();e.foreignKeyViolations=1;
  expect(verifyChoiceMigrationEvidence(e).issues).toContain('FOREIGN_KEY_VIOLATION');
 });
 it('blocks duplicate / missing source identities',()=>{
  const e=base();e.tables[0].afterDistinctIds=2;
  expect(verifyChoiceMigrationEvidence(e).issues).toContain('IDENTITY_MISMATCH:question_bank');
 });
 it('blocks incomplete or untrusted verification',()=>{
  const e=base();e.expectedTables=['question_bank'];e.integrityResult='corrupt';
  expect(verifyChoiceMigrationEvidence(e).ok).toBe(false);
 });
});
