import type { Env } from '../types';
import { all, one } from './db';
import { processorReadyForPersonalData, transferReadyForPersonalData } from './privacy-operations';

export type ExternalPrivacyGate =
  | { ok: true; serviceCode: string; enforcement: 'NON_PRODUCTION' | 'APPROVED'; processorId?: string }
  | { ok: false; serviceCode: string; code: 'PROCESSOR_REGISTRY_MISSING' | 'PROCESSOR_INACTIVE' | 'PROCESSOR_NOT_APPROVED' | 'TRANSFER_REGISTRY_MISSING' | 'TRANSFER_NOT_APPROVED' };

type ProcessorRow = {
  id: string;
  active: number;
  legal_review_status: string;
  dpa_status: string;
  training_on_customer_data: string;
};

type TransferRow = {
  status: string;
  transfer_mechanism: string;
};

export async function externalPersonalDataGate(env: Env, serviceCode: string): Promise<ExternalPrivacyGate> {
  const normalized = String(serviceCode || '').trim().toUpperCase();
  if (env.ENVIRONMENT !== 'production') return { ok: true, serviceCode: normalized, enforcement: 'NON_PRODUCTION' };

  const processor = await one<ProcessorRow>(env.DB.prepare(`
    SELECT id,active,legal_review_status,dpa_status,training_on_customer_data
    FROM processor_registry
    WHERE service_code=?
    LIMIT 1
  `).bind(normalized));
  if (!processor) return { ok: false, serviceCode: normalized, code: 'PROCESSOR_REGISTRY_MISSING' };
  if (!Boolean(processor.active)) return { ok: false, serviceCode: normalized, code: 'PROCESSOR_INACTIVE' };
  if (!processorReadyForPersonalData(processor)) return { ok: false, serviceCode: normalized, code: 'PROCESSOR_NOT_APPROVED' };

  const transfers = await all<TransferRow>(env.DB.prepare(`
    SELECT status,transfer_mechanism
    FROM international_transfer_registry
    WHERE processor_id=? AND status<>'RETIRED'
    ORDER BY created_at DESC
  `).bind(processor.id));
  if (!transfers.length) return { ok: false, serviceCode: normalized, code: 'TRANSFER_REGISTRY_MISSING' };
  if (transfers.some(row => !transferReadyForPersonalData(row))) {
    return { ok: false, serviceCode: normalized, code: 'TRANSFER_NOT_APPROVED' };
  }

  return { ok: true, serviceCode: normalized, enforcement: 'APPROVED', processorId: processor.id };
}
