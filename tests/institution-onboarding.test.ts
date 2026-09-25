import { describe, expect, it } from 'vitest';
import { generatedInstitutionCode, normalizeInstitutionCreateBody } from '../worker/lib/institution-onboarding';

const manager = { displayName: 'Kurum Yöneticisi', email: 'yonetici@example.com', password: 'guclu-sifre-123' };

describe('institution onboarding contract', () => {
  it('normalizes a manual institution and keeps the trial enabled by default', () => {
    const result = normalizeInstitutionCreateBody({
      sourceType: 'manual', name: '  Örnek Kolej  ', city: 'Ankara', district: 'Çankaya', institutionType: 'college',
      academicYear: '2026-2027', manager, features: ['exam_center', 'exam_center', 'unknown'],
    });

    expect(result.name).toBe('Örnek Kolej');
    expect(result.sourceType).toBe('MANUAL');
    expect(result.packageCode).toBe('STANDARD');
    expect(result.startTrial).toBe(true);
    expect(result.features).toEqual(['EXAM_CENTER']);
    expect(result.studentLimit).toBe(500);
  });

  it('requires the official code for MEB-sourced institutions', () => {
    expect(() => normalizeInstitutionCreateBody({ sourceType: 'MEB', name: 'Anadolu Lisesi', city: 'Ankara', district: 'Çankaya', manager }))
      .toThrow('MEB kurum kodu zorunludur');
  });

  it('requires a manager login and rejects weak passwords', () => {
    expect(() => normalizeInstitutionCreateBody({ name: 'Kurum', city: 'Ankara', district: 'Çankaya', manager: { displayName: 'Yönetici', email: 'yonetici@example.com', password: '123' } }))
      .toThrow('en az 8 karakter');
  });

  it('creates a stable-format automatic Anunex code', () => {
    expect(generatedInstitutionCode('inst_12345678-abcd')).toBe('ANX-5678ABCD');
  });
});
