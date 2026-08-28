import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync(new URL('../migrations/0031_personal_book_practice.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/student-books-entry.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/StudentBooks.tsx',import.meta.url),'utf8');

describe('personalized book practice workflow',()=>{
 it('stores student-owned attempts and progress',()=>{
  expect(migration).toContain('CREATE TABLE IF NOT EXISTS personal_book_attempts');
  expect(migration).toContain('book_item_id TEXT NOT NULL REFERENCES student_personal_book_items');
  expect(worker).toContain('personal\\/items\\/');
  expect(worker).toContain("b.student_id=?");
  expect(worker).toContain('COUNT(DISTINCT CASE WHEN a.correct=1 THEN i.id END)');
 });

 it('does not reveal answers before the student attempts a question',()=>{
  expect(worker).toContain('CASE WHEN a.id IS NOT NULL THEN q.correct_answer ELSE NULL END');
  expect(worker).toContain('CASE WHEN a.id IS NOT NULL THEN q.solution_text ELSE NULL END');
  expect(page).toContain('Son cevabın:');
 });

 it('selects only tenant-accessible printable questions with verified rights',()=>{
  expect(worker).toContain("q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?)");
  expect(worker).toContain("p.verification_status='VERIFIED'");
  expect(worker).toContain("featureAllowed(env,enr.institution_id,'PERSONAL_BOOKS')");
 });

 it('provides an interactive reader and printable pdf workflow',()=>{
  for(const text of ['Kitaplarıma dön','Cevapla','Yazdır / PDF kaydet','print-book-cover'])expect(page).toContain(text);
 });
});
