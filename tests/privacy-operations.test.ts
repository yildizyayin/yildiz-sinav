import { describe, expect, it } from 'vitest';
import {
  deletionJobCanExecute,
  incidentAuthorityDeadline,
  normalizeConsentPurposeCode,
  normalizePrivacyChannel,
  processorReadyForPersonalData,
  transferReadyForPersonalData,
} from '../worker/lib/privacy-operations';

describe('privacy operations release guards', () => {
  it('accepts only bounded consent purpose codes and known channels', () => {
    expect(normalizeConsentPurposeCode('nibiru_optional_personalization')).toBe('NIBIRU_OPTIONAL_PERSONALIZATION');
    expect(normalizeConsentPurposeCode('')).toBeNull();
    expect(normalizeConsentPurposeCode('bad purpose with spaces')).toBeNull();
    expect(normalizePrivacyChannel('mobile')).toBe('MOBILE');
    expect(normalizePrivacyChannel('telegram')).toBeNull();
  });

  it('computes the incident authority review clock at 72 hours only when personal data is involved', () => {
    expect(incidentAuthorityDeadline('2026-08-30T06:00:00.000Z', true)).toBe('2026-09-02T06:00:00.000Z');
    expect(incidentAuthorityDeadline('2026-08-30T06:00:00.000Z', false)).toBeNull();
    expect(incidentAuthorityDeadline('not-a-date', true)).toBeNull();
  });

  it('fails deletion closed unless approved and free of legal hold', () => {
    expect(deletionJobCanExecute('APPROVED', 0)).toBe(true);
    expect(deletionJobCanExecute('LEGAL_REVIEW', 0)).toBe(false);
    expect(deletionJobCanExecute('APPROVED', 1)).toBe(false);
  });

  it('fails external processors and transfers closed until compliance metadata is complete', () => {
    expect(processorReadyForPersonalData({ active: 1, legal_review_status: 'APPROVED', dpa_status: 'SIGNED', training_on_customer_data: 'DISABLED' })).toBe(true);
    expect(processorReadyForPersonalData({ active: 1, legal_review_status: 'PENDING', dpa_status: 'SIGNED', training_on_customer_data: 'DISABLED' })).toBe(false);
    expect(processorReadyForPersonalData({ active: 1, legal_review_status: 'APPROVED', dpa_status: 'MISSING', training_on_customer_data: 'DISABLED' })).toBe(false);
    expect(processorReadyForPersonalData({ active: 1, legal_review_status: 'APPROVED', dpa_status: 'SIGNED', training_on_customer_data: 'UNKNOWN' })).toBe(false);
    expect(transferReadyForPersonalData({ status: 'ACTIVE', transfer_mechanism: 'STANDARD_CONTRACT' })).toBe(true);
    expect(transferReadyForPersonalData({ status: 'ACTIVE', transfer_mechanism: 'TBD' })).toBe(false);
    expect(transferReadyForPersonalData({ status: 'DRAFT', transfer_mechanism: 'STANDARD_CONTRACT' })).toBe(false);
  });
});
