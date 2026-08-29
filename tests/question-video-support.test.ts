import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const platform=readFileSync(new URL('../worker/lib/platform-expansion.ts',import.meta.url),'utf8');
const student=readFileSync(new URL('../worker/standard-entry.ts',import.meta.url),'utf8');
const review=readFileSync(new URL('../worker/standard-review-entry.ts',import.meta.url),'utf8');
const wrong=readFileSync(new URL('../worker/final-entry.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/pages/ContentCenter.tsx',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0038_question_video_support.sql',import.meta.url),'utf8');

describe('question video support governance',()=>{
 it('adds operational safety and provenance fields to publisher links',()=>{
  for(const field of ['provider','source_label','duration_seconds','safety_review_status','active','created_by','approved_by','approved_at'])expect(migration).toContain(`ADD COLUMN ${field}`);
 });

 it('requires a concrete question for a solution and question or outcome for topic support',()=>{
  expect(platform).toContain("linkType==='SOLUTION'&&!b.examQuestionId");
  expect(platform).toContain("linkType==='TOPIC'&&!b.examQuestionId&&!b.outcomeId");
  expect(platform).toContain("parsed.protocol!=='https:'");
 });

 it('limits management and approval to super admin with an audit trail',()=>{
  expect(platform).toContain("user.role!=='SUPER_ADMIN'");
  expect(platform).toContain("QUESTION_VIDEO_APPROVED");
  expect(platform).toContain('QUESTION_VIDEO_${action}');
 });

 it('shows only approved, active and safety-reviewed support to students',()=>{
  for(const source of [student,review,wrong]){
   expect(source).toContain("vl.approved=1");
   expect(source).toContain("vl.active=1");
   expect(source).toContain("vl.safety_review_status='APPROVED'");
  }
 });

 it('never reveals answer keys or video support before result publication',()=>{
  for(const source of [student,review,wrong])expect(source).toContain("dp.result_freeze_status='PUBLISHED'");
 });

 it('provides the super admin mapping, approve, revoke and archive controls',()=>{
  expect(ui).toContain('Yayınevi çözümü ve konu anlatımı');
  expect(ui).toContain('/api/platform/question-video-links');
  expect(ui).toContain("'APPROVE'");
  expect(ui).toContain("'REVOKE'");
  expect(ui).toContain("'ARCHIVE'");
 });
});
