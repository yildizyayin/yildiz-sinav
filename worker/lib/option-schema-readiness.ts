/** Explicit readiness check for migrating the existing 4/5-option D1 schema.
 * Never infer support from the UI validator: the database is the authority.
 */
export const OPTION_COUNT_TABLES=['question_bank','exam_subjects','exam_questions','answer_keys'] as const;
export type OptionSchemaState={ready:boolean;tables:{name:string;allowsThree:boolean;found:boolean}[]};
export function optionSchemaState(rows:readonly {name:string;sql:string|null}[]):OptionSchemaState{
 const byName=new Map(rows.map(r=>[r.name,r.sql||'']));
 const tables=OPTION_COUNT_TABLES.map(name=>{
  const sql=byName.get(name);
  const found=typeof sql==='string';
  const match=sql?.match(/\boption_count\b[^,]*?CHECK\s*\(\s*option_count\s+IN\s*\(([^)]+)\)\s*\)/i);
  const values=match?.[1].split(',').map(x=>x.trim())||[];
  // Fail closed for unknown, missing, or unexpected constraints.
  return {name,found,allowsThree:found&&values.includes('3')&&values.includes('4')&&values.includes('5')};
 });
 return {ready:tables.every(t=>t.found&&t.allowsThree),tables};
}
