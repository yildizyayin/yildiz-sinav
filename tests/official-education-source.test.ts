import { describe,expect,it } from 'vitest';
import { inferOfficialSourceKind,validateOfficialSource } from '../worker/lib/official-education-source';

describe('official education source policy',()=>{
 it('recognizes MEB TYMM, TTKB curriculum, OSYM and YOK Atlas hosts',()=>{
  expect(inferOfficialSourceKind('MEB','https://tymm.meb.gov.tr/ogretim-programlari/')).toBe('MEB_TYMM');
  expect(inferOfficialSourceKind('TTKB','https://mufredat.meb.gov.tr/Programlar.aspx')).toBe('MEB_MUFREDAT');
  expect(inferOfficialSourceKind('ÖSYM','https://www.osym.gov.tr/TR,99999/2026-yks.html')).toBe('OSYM');
  expect(inferOfficialSourceKind('YÖK','https://yokatlas.yok.gov.tr/')).toBe('YOK_ATLAS');
 });
 it('rejects lookalike domains and non-https sources',()=>{
  expect(validateOfficialSource({sourceKind:'MEB_TYMM',authority:'MEB',sourceUrl:'https://tymm.meb.gov.tr.evil.example/program'}).valid).toBe(false);
  expect(validateOfficialSource({sourceKind:'YOK_ATLAS',authority:'YÖK',sourceUrl:'https://yokatlas.yok.gov.tr.evil.example/'}).valid).toBe(false);
  expect(validateOfficialSource({sourceKind:'OSYM',authority:'ÖSYM',sourceUrl:'http://www.osym.gov.tr/'}).valid).toBe(false);
 });
 it('rejects authority mismatches',()=>{
  const verdict=validateOfficialSource({sourceKind:'YOK_ATLAS',authority:'MEB',sourceUrl:'https://yokatlas.yok.gov.tr/'});
  expect(verdict.valid).toBe(false);if(!verdict.valid)expect(verdict.code).toBe('OFFICIAL_SOURCE_AUTHORITY_MISMATCH');
 });
 it('accepts official subdomains only inside the approved root',()=>{
  expect(validateOfficialSource({sourceKind:'OSYM',authority:'ÖSYM',sourceUrl:'https://dokuman.osym.gov.tr/example.pdf'}).valid).toBe(true);
  expect(validateOfficialSource({sourceKind:'MEB_GENERAL',authority:'MEB',sourceUrl:'https://odsgm.meb.gov.tr/'}).valid).toBe(true);
 });
 it('rejects future verification timestamps',()=>{
  const future=new Date(Date.now()+3*24*60*60*1000).toISOString();const verdict=validateOfficialSource({sourceKind:'MEB_TYMM',authority:'MEB',sourceUrl:'https://tymm.meb.gov.tr/',sourceVerifiedAt:future});
  expect(verdict.valid).toBe(false);if(!verdict.valid)expect(verdict.code).toBe('OFFICIAL_SOURCE_VERIFIED_AT_FUTURE');
 });
});
