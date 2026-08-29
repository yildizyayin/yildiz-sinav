import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {apiFeatureForPath} from '../worker/lib/feature-access';

const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

describe('P5 Öğrenci acceptance',()=>{
 it('keeps student-only routes and exposes a practical package-aware daily home',()=>{
  const app=read('src/App.tsx'),home=read('src/pages/StudentStandardHome.tsx'),layout=read('src/components/Layout.tsx');
  for(const path of ['/academic-target','/student-settings','/student-games','/question-review','/my-books','/my-results','/student-report','/wrong-answers','/student-growth'])expect(app).toContain(`path="${path}"`);
  expect(app).toContain("roles={['STUDENT']}");
  for(const feature of ['REPORTING','ASSIGNMENTS','WORKSHEETS','PERSONAL_BOOKS','ZERO_ERROR_BOOKLET','LEARNING_GRAPH','GUIDANCE_TESTS','GAMES'])expect(home).toContain(`enabled('${feature}')`);
  for(const label of ['Ödevlerim','Föylerim','Benim Kitaplarım','Sıfır Hata Rotam','Gelişim Yolculuğum','Rehberlik Testleri'])expect(home).toContain(label);
  expect(layout).toContain("STUDENT: [");
  expect(layout).toContain("{ to: '/assignments', label: 'Ödevlerim'");
 });

 it('scopes assignment, personal-book and zero-error data to the signed-in student',()=>{
  const assignments=read('worker/assignment-entry.ts'),books=read('worker/student-books-entry.ts');
  expect(assignments).toContain("if(user.role==='STUDENT'){if(!user.student_id)return forbidden()");
  expect(assignments).toContain('WHERE r.student_id=? AND a.status<>\'ARCHIVED\'');
  expect(assignments).toContain("const own=user.role==='STUDENT'&&user.student_id===studentId");
  expect(books).toContain("if(user.role!=='STUDENT'||!user.student_id)");
  expect(books).toContain('WHERE b.student_id=?');
  expect(books).toContain('WHERE id=? AND student_id=?');
  expect(books).toContain('WHERE z.student_id=?');
  expect(books).toContain('AND z.student_id=?');
 });

 it('keeps reports and learning graph on self scope without exposing another student',()=>{
  const reporting=read('worker/reporting-entry.ts'),intelligence=read('worker/student-intelligence-entry.ts');
  expect(reporting).toContain("if(user.role==='STUDENT')return {allowed:user.student_id===studentId");
  expect(reporting).toContain("if(user.role==='STUDENT')");
  expect(reporting).toContain('recordReportExport');
  expect(intelligence).toContain("if(user.role==='STUDENT')return user.student_id");
  expect(intelligence).toContain('studentIntelligenceAccess(env,user,studentId)');
 });

 it('never derives the student countdown from another institution exam',()=>{
  const scoped=read('worker/student-home-scope-entry.ts'),review=read('worker/standard-review-entry.ts');
  expect(review).toContain("import app from './student-home-scope-entry'");
  expect(scoped).toContain("e.institution_id=? OR EXISTS(SELECT 1 FROM exam_institutions ei WHERE ei.exam_id=e.id AND ei.institution_id=? AND ei.enabled=1)");
  expect(scoped).toContain('WHERE student_id=? ORDER BY CASE status');
  expect(scoped).toContain("user?.role!=='STUDENT'||!user.student_id");
 });

 it('blocks direct student module APIs when the institution package disables them',()=>{
  expect(apiFeatureForPath('/api/my-results')).toBe('REPORTING');
  expect(apiFeatureForPath('/api/my-outcomes')).toBe('REPORTING');
  expect(apiFeatureForPath('/api/assignment-center')).toBe('ASSIGNMENTS');
  expect(apiFeatureForPath('/api/worksheets')).toBe('WORKSHEETS');
  expect(apiFeatureForPath('/api/student-books/personal')).toBe('PERSONAL_BOOKS');
  expect(apiFeatureForPath('/api/student-books/zero-error')).toBe('ZERO_ERROR_BOOKLET');
  expect(apiFeatureForPath('/api/wrong-answers')).toBe('ZERO_ERROR_BOOKLET');
  expect(apiFeatureForPath('/api/student-intelligence/learning-graph')).toBe('LEARNING_GRAPH');
  expect(apiFeatureForPath('/api/student-standard/games')).toBe('GAMES');
  expect(apiFeatureForPath('/api/nibiru/guidance/instruments')).toBe('GUIDANCE_TESTS');
 });

 it('keeps printable/exportable student evidence behind self-scope audit paths',()=>{
  const reports=read('src/pages/Reports.tsx'),books=read('src/pages/StudentBooks.tsx');
  expect(reports).toContain("recordExport('CSV')");
  expect(reports).toContain("recordExport('PRINT_PDF')");
  expect(reports).toContain('window.print()');
  expect(books).toContain('Yazdır / PDF kaydet');
 });
});
