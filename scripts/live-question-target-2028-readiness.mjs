import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {login,query} from './question-production-live-client.mjs';
import {batchTargets} from './math-target-2028-batch.mjs';
import {targetReadiness} from './question-target-2028-readiness.mjs';
const specs=[...batchTargets,...await Promise.all([7,8,12].map(async g=>JSON.parse(await readFile(`data/question-math${g}-target-2028.json`,'utf8'))))].sort((a,b)=>a.gradeLevel-b.gradeLevel);
const report={environment:'staging',academicYear:'2027-2028',deployedSourceCommit:process.env.GITHUB_SHA??null,readOnlyInspection:true};
try{
 await login();const versions=await query("SELECT * FROM curriculum_versions WHERE academic_year='2027-2028' AND program_code='SCHOOL'");
 const rows=await query("SELECT cv.id version_id,o.code,o.title,o.official,o.active,n.active node_active,n.grade_level node_grade,n.academic_year node_year FROM curriculum_versions cv JOIN outcomes o ON o.curriculum_version_id=cv.id LEFT JOIN learning_nodes n ON n.id='ln_'||o.id WHERE cv.academic_year='2027-2028' AND cv.program_code='SCHOOL'");
 const questions=await query("SELECT cv.id version_id,COUNT(DISTINCT q.id) n FROM curriculum_versions cv JOIN outcomes o ON o.curriculum_version_id=cv.id JOIN question_learning_links l ON l.node_id='ln_'||o.id JOIN question_bank q ON q.id=l.question_id WHERE cv.academic_year='2027-2028' AND q.review_status='APPROVED' AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN') GROUP BY cv.id");
 report.grades=specs.map(s=>{const v=versions.find(v=>v.program_version===s.programVersion&&v.grade_level===s.gradeLevel);return targetReadiness(s,versions,rows,Number(questions.find(q=>q.version_id===v?.id)?.n??0));});
 report.campaigns=await query('SELECT id,status FROM question_production_campaigns ORDER BY id');report.jobs=await query('SELECT count(*) n FROM question_generation_jobs');report.bank=await query('SELECT count(*) n FROM question_bank');report.inspectionPassed=report.grades.every(g=>g.firstThemeImported);report.massProductionReady=false;report.examTracks={LGS:'SPECIFICATION_MAPPING_REQUIRED',TYT:'SPECIFICATION_MAPPING_REQUIRED',AYT:'SPECIFICATION_MAPPING_REQUIRED'};
 if(!report.inspectionPassed)process.exitCode=1;
}catch(e){report.inspectionPassed=false;report.error=e.message;process.exitCode=1;}
await mkdir('tmp/question-target-2028-readiness',{recursive:true});await writeFile('tmp/question-target-2028-readiness/evidence.json',JSON.stringify(report,null,2));console.log('QUESTION_TARGET2028_READINESS '+JSON.stringify(report));
