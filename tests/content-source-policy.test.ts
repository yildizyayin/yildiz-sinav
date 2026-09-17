import { describe,expect,it } from 'vitest';
import { hasRestrictedOfficialQuestionPayload,requiresVerifiedRightsBeforeApproval,restrictedOfficialPayloadFields,rightsBasisForCopyright,validateOfficialQuestionUrl } from '../worker/lib/content-source-policy';
import { inferOfficialSourceKind,validateOfficialSource } from '../worker/lib/official-education-source';

describe('real content and official question source policy',()=>{
 it('recognizes MEB EBA and OGM Material as official MEB EBA sources',()=>{
  expect(inferOfficialSourceKind('MEB','https://www.eba.gov.tr/')).toBe('MEB_EBA');
  expect(inferOfficialSourceKind('MEB','https://ogmmateryal.eba.gov.tr/')).toBe('MEB_EBA');
  expect(validateOfficialSource({sourceKind:'MEB_EBA',authority:'MEB',sourceUrl:'https://ogmmateryal.eba.gov.tr/'}).valid).toBe(true);
 });
 it('rejects EBA lookalike domains',()=>{
  const verdict=validateOfficialSource({sourceKind:'MEB_EBA',authority:'MEB',sourceUrl:'https://ogmmateryal.eba.gov.tr.evil.example/'});
  expect(verdict.valid).toBe(false);
 });
 it('keeps official question mappings metadata-only',()=>{
  const row={year:2026,questionNo:1,outcomeCode:'X',questionText:'Telifli soru metni',options:['A','B']};
  expect(hasRestrictedOfficialQuestionPayload(row)).toBe(true);
  expect(restrictedOfficialPayloadFields(row)).toEqual(expect.arrayContaining(['questionText','options']));
  expect(hasRestrictedOfficialQuestionPayload({year:2026,questionNo:1,outcomeCode:'X',difficulty:3})).toBe(false);
 });
 it('validates official question URLs against their declared source kind',()=>{
  expect(validateOfficialQuestionUrl({sourceKind:'OSYM',authority:'ÖSYM',url:'https://dokuman.osym.gov.tr/pdfdokuman/2026/YKS/'}).valid).toBe(true);
  expect(validateOfficialQuestionUrl({sourceKind:'OSYM',authority:'ÖSYM',url:'https://dokuman.osym.gov.tr.evil.example/file.pdf'}).valid).toBe(false);
  expect(validateOfficialQuestionUrl({sourceKind:'MEB_GENERAL',authority:'MEB',url:'https://odsgm.meb.gov.tr/'}).valid).toBe(true);
 });
 it('requires verified provenance for licensed/public-domain approval but not owned content',()=>{
  expect(requiresVerifiedRightsBeforeApproval('LICENSED')).toBe(true);
  expect(requiresVerifiedRightsBeforeApproval('PUBLIC_DOMAIN')).toBe(true);
  expect(requiresVerifiedRightsBeforeApproval('OWNED')).toBe(false);
  expect(rightsBasisForCopyright('LICENSED')).toBe('WRITTEN_LICENSE');
  expect(rightsBasisForCopyright('PUBLIC_DOMAIN')).toBe('PUBLIC_DOMAIN');
  expect(rightsBasisForCopyright('RESTRICTED')).toBe('RESTRICTED_REFERENCE');
 });
});
