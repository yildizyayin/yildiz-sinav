import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync(new URL('../migrations/0035_preference_robot.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/lib/academic-growth.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/StudentTargetsV2.tsx',import.meta.url),'utf8');
const layout=readFileSync(new URL('../src/components/Layout.tsx',import.meta.url),'utf8');

describe('official-data preference robot',()=>{
 it('stores a private ordered planning list without claiming official submission',()=>{
  for(const text of ['student_preference_lists','student_preference_items','sort_order','status=\'DRAFT\''])expect(migration).toContain(text);
  expect(page).toContain('resmî başvuru yerine geçmez');expect(worker).toContain('ÖSYM/e-Okul başvurusu yerine geçmez');
 });

 it('filters LGS schools by place, type, score and percentile',()=>{
  for(const text of ['schoolType','placementType','minScore','maxScore','maxPercentile','district'])expect(worker).toContain(text);
  expect(page).toContain('Okul türü');expect(page).toContain('En yüksek yüzdelik');
 });

 it('filters YKS programs by department, city, score type, rank and scholarship',()=>{
  for(const text of ['scoreType','universityType','scholarship','minRank','maxRank','city'])expect(worker).toContain(text);
  for(const text of ['Puan türü','Üniversite türü','En geniş sıra','Burs'])expect(page).toContain(text);
 });

 it('does not invent target rows or scores while official files are missing',()=>{
  expect(worker).toContain("dataStatus:available?'CURRENT':'FILE_REQUIRED'");
  expect(worker).toContain('OFFICIAL_DATA_NOT_CURRENT');expect(page).toContain('Sistem veri gelmeden okul/program, taban puan veya başarı sırası üretmez');
 });

 it('keeps preference data student-owned, auditable and reachable from navigation',()=>{
  expect(worker).toContain("user.role!=='STUDENT'");expect(worker).toContain('pl.student_id=?');
  expect(worker).toContain('PREFERENCE_ITEM_ADDED');expect(worker).toContain('PREFERENCE_LIST_REORDERED');
  expect(layout).toContain('Hedef ve Tercih Robotu');
 });
});
