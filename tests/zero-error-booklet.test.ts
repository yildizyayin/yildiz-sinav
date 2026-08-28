import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const worker=readFileSync(new URL('../worker/student-books-entry.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/StudentBooks.tsx',import.meta.url),'utf8');
const plan=readFileSync(new URL('../docs/ANUNEX_MASTER_PLAN.md',import.meta.url),'utf8');

describe('zero error booklet completion',()=>{
 it('enforces package entitlement, student ownership and duplicate protection',()=>{
  expect(worker).toContain("featureAllowed(env,enr.institution_id,'ZERO_ERROR_BOOKLET')");
  expect(worker).toContain("z.student_id=?");
  expect(worker).toContain('BOOKLET_ALREADY_ACTIVE');
 });

 it('uses only tenant-visible printable questions with verified rights',()=>{
  expect(worker).toContain("q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?)");
  expect(worker).toContain("p.verification_status='VERIFIED'");
 });

 it('hides answers until an attempt and completes only answerable practice items',()=>{
  expect(worker).toContain('CASE WHEN a.id IS NOT NULL THEN q.correct_answer ELSE NULL END');
  expect(worker).toContain("bank_question_id IS NOT NULL AND item_status<>'MASTERED'");
  expect(worker).toContain('ANSWER_REQUIRED');
  for(const text of ['Sıfır Hata döngüsü','Hata kapatıldı','Tekrar gerekiyor','Yazdır / PDF kaydet'])expect(page).toContain(text);
 });

 it('records the new worksheet series rules and removed modules',()=>{
  expect(plan).toContain('Mavi Seri');expect(plan).toContain('her ders için 10 soru');
  expect(plan).toContain('Kırmızı Seri');expect(plan).toContain('her ders için 20 soru');
  expect(plan).toContain('Anlayarak Hızlı Okuma ve Akıllı Tahta bu ürünün güncel kapsamından çıkarılmıştır.');
 });
});
