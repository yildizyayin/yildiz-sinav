import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const worker=readFileSync(new URL('../worker/lib/platform-expansion.ts',import.meta.url),'utf8');
const governance=readFileSync(new URL('../worker/question-bank-standard-entry.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/ContentCenter.tsx',import.meta.url),'utf8');

describe('question and content center',()=>{
 it('uses safe subject, outcome and institution selectors instead of raw ids',()=>{
  expect(worker).toContain('/api/platform/content-options');
  expect(worker).toContain("SELECT id,code,name,category FROM subjects WHERE active=1");
  expect(worker).toContain("node_type IN ('TOPIC','SUBTOPIC','OUTCOME','SKILL')");
  expect(page).toContain('Ders seçin');
  expect(page).toContain('Kazanım / beceri');
  expect(page).toContain('Kurum seçin');
  expect(page).not.toContain('Ders kodu');
 });

 it('protects question content and statistics by role and tenant',()=>{
  expect(worker).toContain("if(!['SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER'].includes(user.role))return forbidden()");
  expect(worker).toContain("q.owner_type='PLATFORM' OR (q.owner_type='INSTITUTION' AND q.owner_id=?)");
  expect(governance).toContain("owner_type='PLATFORM' OR (owner_type='INSTITUTION' AND owner_id=?)");
 });

 it('requires provenance before licensed or public-domain approval',()=>{
  expect(worker).toContain('question_provenance_records');
  expect(worker).toContain("initialStatus=user.role==='SUPER_ADMIN'&&copyright==='OWNED'?'APPROVED':'REVIEW'");
  expect(governance).toContain('requiresVerifiedRightsBeforeApproval');
  expect(governance).toContain("verification_status='VERIFIED'");
  expect(page).toContain('Hakları doğrula ve onayla');
 });

 it('builds documents only from printable tenant-accessible questions and validates video urls',()=>{
  expect(worker).toContain("copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN')");
  expect(worker).toContain("owner_type='PLATFORM' OR (owner_type='INSTITUTION' AND owner_id=?)");
  expect(worker).toContain("parsed.protocol!=='https:'");
  expect(page).toContain('Belge Oluşturucu');
  expect(page).toContain('Video Kütüphanesi');
 });
});
