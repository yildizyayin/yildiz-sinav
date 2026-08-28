import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync(new URL('../migrations/0030_assignment_center.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/assignment-entry.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/AssignmentCenter.tsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

describe('physical and digital assignment center',()=>{
 it('links assignments to a class and a normalized source kind',()=>{
  expect(migration).toContain('ADD COLUMN class_id');
  expect(migration).toContain('ADD COLUMN source_kind');
  expect(migration).toContain('idx_assignments_class_due');
 });

 it('enforces feature, class assignment and active enrollment scope',()=>{
  expect(worker).toContain("f.feature_key='ASSIGNMENTS'");
  expect(worker).toContain('canAccessClass(scope,classId)');
  expect(worker).toContain("class_id=? AND status='ACTIVE'");
  expect(worker).toContain('Ödev alıcıları bu sınıfın aktif öğrencilerinden seçilmelidir.');
 });

 it('supports physical books, digital links, worksheets and progress tracking',()=>{
  for(const value of ['PHYSICAL_BOOK','DIGITAL_BOOK','WORKSHEET','TASK'])expect(worker).toContain(value);
  expect(worker).toContain('Dijital kitap bağlantısı HTTPS olmalıdır.');
  expect(worker).toContain('ASSIGNMENT_PROGRESS_UPDATED');
  for(const text of ['Fiziksel kitap','Dijital kitap','Ödevi Ver','Tamamladım'])expect(page).toContain(text);
  expect(app).toContain('path="assignments"');
 });
});
