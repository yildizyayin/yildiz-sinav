import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {youtubeCandidatePolicy} from '../worker/standard-entry';

describe('YouTube candidate governance',()=>{
 it('accepts only short, public, embeddable, age-safe and relevant candidates',()=>{
  expect(youtubeCandidatePolicy({title:'8. sınıf üslü sayılar kısa konu anlatımı',duration_seconds:105,relevance_score:.45,embeddable:true,privacy_status:'public',age_restricted:false})).toEqual({passed:true,flags:[]});
 });

 it('rejects duration, visibility, embedding, age and low-match policy failures',()=>{
  const result=youtubeCandidatePolicy({title:'Genel video',duration_seconds:300,relevance_score:.05,embeddable:false,privacy_status:'unlisted',age_restricted:true});
  expect(result.passed).toBe(false);
  expect(result.flags).toEqual(expect.arrayContaining(['NOT_EMBEDDABLE','NOT_PUBLIC','AGE_RESTRICTED','DURATION_OUT_OF_RANGE','LOW_OUTCOME_MATCH']));
 });

 it('blocks unsafe title vocabulary before AI ranking',()=>{
  const result=youtubeCandidatePolicy({title:'Casino bahis hilesi',duration_seconds:90,relevance_score:.8,embeddable:true,privacy_status:'public',age_restricted:false});
  expect(result.flags).toContain('UNSAFE_TITLE');
 });

 it('keeps AI selection separate from human approval',()=>{
  const source=readFileSync(new URL('../worker/standard-entry.ts',import.meta.url),'utf8');
  expect(source).toContain("human_review_status='APPROVED'");
  expect(source).toContain("reason:'HUMAN_REVIEW_REQUIRED'");
  expect(source).toContain("'PENDING',CURRENT_TIMESTAMP");
  expect(source).not.toContain('INSERT OR REPLACE INTO youtube_micro_video_candidates');
 });

 it('uses strict safe search and requests embeddable short videos',()=>{
  const source=readFileSync(new URL('../worker/standard-entry.ts',import.meta.url),'utf8');
  expect(source).toContain("searchUrl.searchParams.set('safeSearch','strict')");
  expect(source).toContain("searchUrl.searchParams.set('videoEmbeddable','true')");
  expect(source).toContain("searchUrl.searchParams.set('videoDuration','short')");
 });

 it('allows only super admin to approve candidates and audits the decision',()=>{
  const source=readFileSync(new URL('../worker/lib/platform-expansion.ts',import.meta.url),'utf8');
  expect(source).toContain("YOUTUBE_CANDIDATE_${action}");
  expect(source).toContain("aiCanApprove:false");
  expect(source).toContain("humanApprovalRequired:true");
  expect(source).toContain("row.policy_status!=='PASSED'");
 });

 it('provides a visible human review queue',()=>{
  const source=readFileSync(new URL('../src/pages/ContentCenter.tsx',import.meta.url),'utf8');
  expect(source).toContain('YouTube aday inceleme kuyruğu');
  expect(source).toContain('AI yalnız uygun adayları sıralar');
  expect(source).toContain('Öğrenciye aç');
 });
});
