import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {apiFeatureForPath} from '../worker/lib/feature-access';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

describe('P5 Branş Öğretmeni acceptance',()=>{
  it('shows the active assignment scope and hides package-disabled actions',()=>{
    const home=read('src/pages/StandardRoleHomes.tsx'),classes=read('src/pages/Classes.tsx');
    expect(home).toContain('Aktif Yetki Kapsamı');
    expect(home).toContain('Aktif sınıf ataması yok');
    expect(home).toContain('hasAssignment&&');
    for(const feature of ['EXAM_CENTER','REPORTING','QUESTION_BANK','WORKSHEETS'])expect(home).toContain(`enabled('${feature}')`);
    for(const feature of ['EXAM_CENTER','ATTENDANCE','ASSIGNMENTS','REPORTING'])expect(classes).toContain(`enabled('${feature}')`);
    expect(classes).toContain("enabled('REPORTING')&&<Link className=\"secondary\" to=\"/reports\"");
  });

  it('limits question discovery and creation to exact active subject-grade assignments',()=>{
    const worker=read('worker/lib/platform-expansion.ts'),page=read('src/pages/ContentCenter.tsx');
    expect(worker).toContain("ta.assignment_type='SUBJECT'");
    expect(worker).toContain("se.status='ACTIVE'");
    expect(worker).toContain("(q.subject_id=? AND q.grade_level=?)");
    expect(worker).toContain('teacherContentAllowed(await teacherContentScope(env,user),String(b.subjectId),grade)');
    expect(worker).toContain('subjectGrades:scope||null');
    expect(page).toContain("const scopedEducator=user?.role==='TEACHER'||user?.role==='GUIDANCE_TEACHER'");
    expect(page).toContain('subjectGrades.filter(row=>row.subject_id===subjectId)');
  });

  it('protects teacher edits, statistics and Studio documents with the same scope',()=>{
    const governance=read('worker/question-bank-standard-entry.ts'),worker=read('worker/lib/platform-expansion.ts');
    expect(governance).toContain('educatorCanAccessQuestion');
    expect(governance).toContain('ta.subject_id=q.subject_id AND c.grade_level=q.grade_level');
    expect(governance).toContain("'QUESTION_UPDATED'");
    expect(governance).toContain("'QUESTION_REVIEWED'");
    expect(worker).toContain('documents:scope===null?rows:rows.filter');
    expect(worker).toContain('Yalnız aktif sınıf ve branş atamanız için belge oluşturabilirsiniz.');
  });

  it('requires a selected assigned class before reading or applying a worksheet',()=>{
    const worker=read('worker/lib/academic-growth.ts'),page=read('src/pages/WorksheetCalendar.tsx');
    expect(worker).toContain('classRequired:true');
    expect(worker).toContain("ta.class_id=? AND c.institution_id=ta.institution_id");
    expect(worker).toContain("ta.assignment_type='SUBJECT'");
    expect(worker).toContain('w.grade_level=c.grade_level');
    expect(worker).toContain("subjectIds=user.role==='TEACHER'");
    expect(worker).toContain("uuid('wcal')");
    expect(worker).toContain("'WORKSHEET_APPLIED'");
    expect(page).toContain('Atanmış sınıf');
    expect(page).toContain("body:JSON.stringify({classId:classId||null})");
  });

  it('enforces report and content package gates on direct API calls',()=>{
    expect(apiFeatureForPath('/api/teacher/insights')).toBe('REPORTING');
    expect(apiFeatureForPath('/api/platform/content-options')).toBe('QUESTION_BANK');
    expect(apiFeatureForPath('/api/question-bank-standard/stats')).toBe('QUESTION_BANK');
    expect(apiFeatureForPath('/api/worksheet-calendar')).toBe('WORKSHEETS');
  });
});
