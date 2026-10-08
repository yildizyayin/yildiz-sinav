import type { AuthUser, Env } from '../types';
import { all, badRequest, forbidden, json } from './db';

const TARGET = 10;
// String.trim() whitespace (including BOM and Unicode spaces); SQL trim's
// default only removes U+0020. Duplicate identity below still uses the
// coach selector's lower(trim(stem_text)) comparison unchanged.
const JS_TRIM_CHARS='char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)';

type OutcomeRow = {
 id:string;code:string|null;title:string;subject_id:string;subject_name:string;
 grade_level:number;curriculum_version_id:string;program_version:string;
};
type PoolRow = {
 outcome_id:string;approved_count:number;review_count:number;draft_count:number;
};

/** Aggregate platform-common question supply, without a student's exposure history. */
export async function getQuestionPoolCoverage(request:Request,env:Env,user:AuthUser):Promise<Response>{
 if(user.role!=='SUPER_ADMIN')return forbidden('Soru havuzu kapsamını yalnız Süper Admin görebilir.');
 const params=new URL(request.url).searchParams;
 const academicYear=params.get('academicYear')||'';
 const match=/^(\d{4})-(\d{4})$/.exec(academicYear);
 if(!match||Number(match[2])!==Number(match[1])+1)return badRequest('Eğitim yılı YYYY-YYYY biçiminde ardışık yıllar olmalıdır.','INVALID_ACADEMIC_YEAR');
 const gradeText=params.get('gradeLevel');
 const gradeLevel=gradeText===null?null:Number(gradeText);
 if(gradeText!==null&&(!/^(?:[1-9]|1[0-2])$/.test(gradeText)||!Number.isInteger(gradeLevel)))return badRequest('Sınıf düzeyi 1 ile 12 arasında olmalıdır.','INVALID_GRADE_LEVEL');
 const subjectId=params.get('subjectId');
 if(subjectId!==null&&(!subjectId.trim()||subjectId.length>100))return badRequest('Geçersiz ders kimliği.','INVALID_SUBJECT_ID');
 const cursor=params.get('cursor');
 if(cursor!==null&&(!cursor||cursor.length>100))return badRequest('Geçersiz sayfa imleci.','INVALID_CURSOR');
 const limitText=params.get('limit');
 const limit=limitText===null?50:Number(limitText);
 if(limitText!==null&&(!/^(?:[1-9]|[1-4]\d|50)$/.test(limitText)||!Number.isInteger(limit)))return badRequest('Sayfa sınırı 1 ile 50 arasında olmalıdır.','INVALID_LIMIT');

 const filters:string[]=['cv.academic_year=?','cv.verified=1','o.active=1','o.grade_level=cv.grade_level'];
 const bindings:(string|number)[]=[academicYear];
 if(gradeLevel!==null){filters.push('o.grade_level=?');bindings.push(gradeLevel)}
 if(subjectId!==null){filters.push('o.subject_id=?');bindings.push(subjectId)}
 if(cursor!==null){filters.push('o.id>?');bindings.push(cursor)}
 // Page the outcomes first. The following question query is scoped to these IDs only.
 const rows=await all<OutcomeRow>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.subject_id,s.name subject_name,o.grade_level,
   cv.id curriculum_version_id,cv.program_version
   FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
   JOIN subjects s ON s.id=o.subject_id
   WHERE ${filters.join(' AND ')} ORDER BY o.id LIMIT ?`).bind(...bindings,limit+1));
 const page=rows.slice(0,limit);
 if(!page.length)return json({ok:true,academicYear,target:TARGET,items:[],nextCursor:null});
 const placeholders=page.map(()=>'?').join(',');
 // JSON functions are guarded by CASE: malformed options must never abort a page.
 // The MC predicate matches validMultipleChoiceQuestion: 4/5 nonempty string
 // options or ordered {label,text} objects, matching count and A-E answer key.
 // The final GROUP BY implements the coach's lower(trim(stem)) + exact JSON
 // duplicate identity inside SQLite, returning at most one row per outcome.
 const questions=await all<PoolRow>(env.DB.prepare(`WITH scoped AS (
   SELECT o.id outcome_id,q.review_status,q.copyright_status,q.stem_text,
     q.options_json,q.correct_answer,q.option_count
   FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id
   JOIN question_bank q ON q.id=l.question_id
   WHERE o.id IN (${placeholders}) AND q.owner_type='PLATFORM'
     AND q.academic_year=? AND q.grade_level=o.grade_level AND q.subject_id=o.subject_id
     AND q.question_type='MULTIPLE_CHOICE' AND q.review_status IN ('APPROVED','REVIEW','DRAFT')
 ), classified AS (
   SELECT outcome_id,review_status,stem_text,options_json,
     CASE WHEN review_status='APPROVED'
       AND copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN')
       AND length(trim(stem_text,${JS_TRIM_CHARS}))>0 AND json_valid(options_json)=1
     THEN CASE WHEN json_type(options_json)='array'
       AND json_array_length(options_json) IN (4,5)
       AND COALESCE(option_count,json_array_length(options_json))=json_array_length(options_json)
       AND correct_answer IN ('A','B','C','D','E')
       AND instr('ABCDE',correct_answer)<=json_array_length(options_json)
       AND NOT EXISTS (
         SELECT 1 FROM json_each(options_json) option
         WHERE CASE WHEN option.type='text' THEN
           CASE WHEN length(trim(option.value,${JS_TRIM_CHARS}))>0 THEN 0 ELSE 1 END
         WHEN option.type='object' THEN
           CASE WHEN json_type(option.value,'$.label')='text'
             AND json_extract(option.value,'$.label')=char(65+CAST(option.key AS INTEGER))
             AND json_type(option.value,'$.text')='text'
             AND length(trim(json_extract(option.value,'$.text'),${JS_TRIM_CHARS}))>0
             THEN 0 ELSE 1 END
         ELSE 1 END=1
       ) THEN 1 ELSE 0 END ELSE 0 END approved
   FROM scoped
 ), unique_stems AS (
   SELECT outcome_id,lower(trim(stem_text)) normalized_stem,options_json,
     MAX(approved) approved_once,
     SUM(CASE WHEN review_status='REVIEW' THEN 1 ELSE 0 END) review_count,
     SUM(CASE WHEN review_status='DRAFT' THEN 1 ELSE 0 END) draft_count
   FROM classified GROUP BY outcome_id,lower(trim(stem_text)),options_json
 )
 SELECT outcome_id,SUM(approved_once) approved_count,
   SUM(review_count) review_count,SUM(draft_count) draft_count
 FROM unique_stems GROUP BY outcome_id`).bind(...page.map(row=>row.id),academicYear));
 const counts=new Map(questions.map(row=>[row.outcome_id,row]));
 const items=page.map(row=>{
  const count=counts.get(row.id),approvedUniqueCount=Number(count?.approved_count||0);
  return{id:row.id,code:row.code,title:row.title,subjectId:row.subject_id,
   subjectName:row.subject_name,gradeLevel:row.grade_level,
   curriculumVersionId:row.curriculum_version_id,programVersion:row.program_version,
   approvedUniqueCount,reviewCount:Number(count?.review_count||0),draftCount:Number(count?.draft_count||0),
   missingCount:Math.max(0,TARGET-approvedUniqueCount),status:approvedUniqueCount>=TARGET?'READY':'MISSING'};
 });
 return json({ok:true,academicYear,target:TARGET,items,nextCursor:rows.length>limit?page.at(-1)!.id:null});
}
