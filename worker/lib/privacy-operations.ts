export type PrivacyChannel = 'WEB' | 'MOBILE' | 'EMAIL' | 'PAPER' | 'OTHER';

const CHANNELS: readonly PrivacyChannel[] = ['WEB', 'MOBILE', 'EMAIL', 'PAPER', 'OTHER'];
const CONSENT_PURPOSE = /^[A-Z0-9][A-Z0-9_.:-]{1,79}$/;

export function normalizePrivacyChannel(value: unknown, fallback: PrivacyChannel = 'WEB'): PrivacyChannel | null {
  const normalized = String(value || fallback).trim().toUpperCase();
  return (CHANNELS as readonly string[]).includes(normalized) ? normalized as PrivacyChannel : null;
}

export function normalizeConsentPurposeCode(value: unknown): string | null {
  const normalized = String(value || '').trim().toUpperCase();
  return CONSENT_PURPOSE.test(normalized) ? normalized : null;
}

export function incidentAuthorityDeadline(awarenessAt: string | Date, personalDataInvolved: boolean): string | null {
  if (!personalDataInvolved) return null;
  const date = awarenessAt instanceof Date ? awarenessAt : new Date(awarenessAt);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(date.getTime() + 72 * 60 * 60 * 1000).toISOString();
}

export function deletionJobCanExecute(status: string, legalHold: number | boolean): boolean {
  return status === 'APPROVED' && !Boolean(legalHold);
}

export type ProcessorReadinessInput = {
  active: number | boolean;
  legal_review_status: string;
  dpa_status: string;
  training_on_customer_data: string;
};

export function processorReadyForPersonalData(input: ProcessorReadinessInput): boolean {
  if (!Boolean(input.active)) return true;
  if (!['APPROVED', 'NOT_APPLICABLE'].includes(input.legal_review_status)) return false;
  if (!['SIGNED', 'NOT_APPLICABLE'].includes(input.dpa_status)) return false;
  if (input.training_on_customer_data === 'UNKNOWN') return false;
  return true;
}

export type TransferReadinessInput = {
  status: string;
  transfer_mechanism: string;
};

export function transferReadyForPersonalData(input: TransferReadinessInput): boolean {
  if (input.status === 'RETIRED') return true;
  if (input.status !== 'ACTIVE') return false;
  return input.transfer_mechanism !== 'TBD';
}
