import { describe, expect, it } from 'vitest';
import {
  canReadExamCatalog,
  canReadInstitutionClassCatalog,
  canReadOpticalTemplateMetadata,
  canReadWorksheets,
} from '../worker/secure-entry';

describe('API content gateway role matrix', () => {
  it('keeps institution class catalog out of student and parent accounts', () => {
    expect(canReadInstitutionClassCatalog('SUPER_ADMIN')).toBe(true);
    expect(canReadInstitutionClassCatalog('INSTITUTION_MANAGER')).toBe(true);
    expect(canReadInstitutionClassCatalog('TEACHER')).toBe(true);
    expect(canReadInstitutionClassCatalog('GUIDANCE_TEACHER')).toBe(true);
    expect(canReadInstitutionClassCatalog('STUDENT')).toBe(false);
    expect(canReadInstitutionClassCatalog('PARENT')).toBe(false);
  });

  it('reserves optical template metadata for operational managers', () => {
    expect(canReadOpticalTemplateMetadata('SUPER_ADMIN')).toBe(true);
    expect(canReadOpticalTemplateMetadata('INSTITUTION_MANAGER')).toBe(true);
    expect(canReadOpticalTemplateMetadata('TEACHER')).toBe(false);
    expect(canReadOpticalTemplateMetadata('GUIDANCE_TEACHER')).toBe(false);
    expect(canReadOpticalTemplateMetadata('STUDENT')).toBe(false);
    expect(canReadOpticalTemplateMetadata('PARENT')).toBe(false);
  });

  it('does not expose institution-wide exam catalog to student/parent accounts', () => {
    expect(canReadExamCatalog('SUPER_ADMIN')).toBe(true);
    expect(canReadExamCatalog('INSTITUTION_MANAGER')).toBe(true);
    expect(canReadExamCatalog('TEACHER')).toBe(true);
    expect(canReadExamCatalog('GUIDANCE_TEACHER')).toBe(true);
    expect(canReadExamCatalog('STUDENT')).toBe(false);
    expect(canReadExamCatalog('PARENT')).toBe(false);
  });

  it('allows worksheets only to roles that use them', () => {
    expect(canReadWorksheets('SUPER_ADMIN')).toBe(true);
    expect(canReadWorksheets('INSTITUTION_MANAGER')).toBe(true);
    expect(canReadWorksheets('TEACHER')).toBe(true);
    expect(canReadWorksheets('GUIDANCE_TEACHER')).toBe(true);
    expect(canReadWorksheets('STUDENT')).toBe(true);
    expect(canReadWorksheets('PARENT')).toBe(false);
  });
});
