/**
 * D1 option-count schema migration preflight.
 * A destructive SQLite table rebuild is forbidden until FK dependencies,
 * indexes, triggers and original table DDL have been inventoried.
 */
export const OPTION_SCHEMA_TABLES=['question_bank','exam_subjects','exam_questions','answer_keys'] as const;
export type SchemaObject={type:string;name:string;tbl_name:string;sql:string|null};
export function auditOptionMigration(objects:readonly SchemaObject[]){
 const findings:string[]=[];
 for(const table of OPTION_SCHEMA_TABLES){
  const row=objects.find(o=>o.type==='table'&&o.name===table);
  if(!row?.sql) findings.push('MISSING_TABLE:'+table);
  else if(!/\boption_count\b/.test(row.sql)) findings.push('MISSING_OPTION_COLUMN:'+table);
 }
 const references=objects.filter(o=>o.sql&&OPTION_SCHEMA_TABLES.some(t=>new RegExp('\\bREFERENCES\\s+["\\x60]?'+t+'\\b','i').test(o.sql!)));
 const dependent=objects.filter(o=>['index','trigger','view'].includes(o.type)&&OPTION_SCHEMA_TABLES.some(t=>o.tbl_name===t||new RegExp('\\b'+t+'\\b','i').test(o.sql||'')));
 return {safeToAutoRebuild:false,findings,
  inboundReferences:references.map(x=>x.name).sort(),
  dependentObjects:dependent.map(x=>x.name).sort(),
  requiresBackup:true,requiresForeignKeyCheck:true,requiresRowCountComparison:true};
}
