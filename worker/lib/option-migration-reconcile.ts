/** Reconciliation gate for SQLite/D1 option-count table rebuilds.
 * Comparison deliberately fails closed and does not mutate the database.
 */
export type TableEvidence={table:string;before:number;after:number;beforeDistinctIds:number;afterDistinctIds:number};
export type MigrationEvidence={tables:TableEvidence[];foreignKeyViolations:number;integrityResult:string;expectedTables:string[]};
export function verifyChoiceMigrationEvidence(e:MigrationEvidence):{ok:boolean;issues:string[]}{
 const issues:string[]=[];
 const expected=['question_bank','exam_subjects','exam_questions','answer_keys'];
 if(expected.some(t=>!e.expectedTables.includes(t)))issues.push('EXPECTED_TABLE_MISSING');
 if(e.tables.length!==expected.length||new Set(e.tables.map(t=>t.table)).size!==expected.length)issues.push('TABLE_EVIDENCE_INCOMPLETE');
 for(const name of expected){
  const t=e.tables.find(x=>x.table===name);
  if(!t){issues.push('TABLE_NOT_CHECKED:'+name);continue}
  if(![t.before,t.after,t.beforeDistinctIds,t.afterDistinctIds].every(n=>Number.isSafeInteger(n)&&n>=0))issues.push('INVALID_COUNT:'+name);
  if(t.before!==t.after)issues.push('ROW_COUNT_CHANGED:'+name);
  if(t.beforeDistinctIds!==t.afterDistinctIds||t.afterDistinctIds!==t.after)issues.push('IDENTITY_MISMATCH:'+name);
 }
 if(e.foreignKeyViolations!==0)issues.push('FOREIGN_KEY_VIOLATION');
 if(e.integrityResult.toLowerCase()!=='ok')issues.push('SQLITE_INTEGRITY_FAILED');
 return {ok:issues.length===0,issues};
}
