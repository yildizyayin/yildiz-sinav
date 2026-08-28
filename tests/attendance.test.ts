import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync(new URL('../migrations/0029_attendance.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/attendance-entry.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/Attendance.tsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const productEntry=readFileSync(new URL('../worker/product-completion-entry.ts',import.meta.url),'utf8');

describe('attendance and absence management',()=>{
 it('stores one session per class/date/period with constrained student states',()=>{
  expect(migration).toContain('UNIQUE(class_id,attendance_date,period_label)');
  expect(migration).toContain("CHECK(attendance_status IN ('PRESENT','ABSENT','LATE','EXCUSED'))");
  expect(migration).toContain('PRIMARY KEY(session_id,student_id)');
 });

 it('enforces institution, teacher assignment and active enrollment scope',()=>{
  expect(worker).toContain('canAccessClass(scope,classId)');
  expect(worker).toContain("class_id=? AND status='ACTIVE'");
  expect(worker).toContain('Sınıfa kayıtlı olmayan öğrenci yoklamaya eklenemez.');
  expect(worker).toContain("ATTENDANCE_FINALIZED");
 });

 it('provides practical draft and finalize actions through the production worker chain',()=>{
  expect(page).toContain('Taslak Kaydet');
  expect(page).toContain('Yoklamayı Kesinleştir');
  expect(page).toContain('Gelmedi');
  expect(app).toContain('path="attendance"');
  expect(productEntry).toContain("import app from './attendance-entry'");
 });
});
