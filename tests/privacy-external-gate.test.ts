import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { processorReadyForPersonalData, transferReadyForPersonalData } from '../worker/lib/privacy-operations';

const gateSource = readFileSync(new URL('../worker/lib/privacy-external-gate.ts', import.meta.url), 'utf8');
const nibiruSource = readFileSync(new URL('../worker/lib/nibiru-ai-proxy.ts', import.meta.url), 'utf8');
const whatsappSource = readFileSync(new URL('../worker/lib/whatsapp.ts', import.meta.url), 'utf8');

describe('external provider privacy gate', () => {
  it('requires approved processor governance before personal data leaves production', () => {
    expect(processorReadyForPersonalData({ active:1, legal_review_status:'APPROVED', dpa_status:'SIGNED', training_on_customer_data:'DISABLED' })).toBe(true);
    expect(processorReadyForPersonalData({ active:1, legal_review_status:'PENDING', dpa_status:'SIGNED', training_on_customer_data:'DISABLED' })).toBe(false);
    expect(processorReadyForPersonalData({ active:1, legal_review_status:'APPROVED', dpa_status:'MISSING', training_on_customer_data:'DISABLED' })).toBe(false);
    expect(processorReadyForPersonalData({ active:1, legal_review_status:'APPROVED', dpa_status:'SIGNED', training_on_customer_data:'UNKNOWN' })).toBe(false);
  });

  it('requires an explicit active transfer decision rather than assuming an API key is approval', () => {
    expect(transferReadyForPersonalData({ status:'ACTIVE', transfer_mechanism:'STANDARD_CONTRACT' })).toBe(true);
    expect(transferReadyForPersonalData({ status:'ACTIVE', transfer_mechanism:'NOT_CROSS_BORDER' })).toBe(true);
    expect(transferReadyForPersonalData({ status:'ACTIVE', transfer_mechanism:'TBD' })).toBe(false);
    expect(transferReadyForPersonalData({ status:'DRAFT', transfer_mechanism:'STANDARD_CONTRACT' })).toBe(false);
    expect(gateSource).toContain("if (!transfers.length) return { ok: false, serviceCode: normalized, code: 'TRANSFER_REGISTRY_MISSING' }");
  });

  it('gates Nibiru inference and WhatsApp delivery in production', () => {
    expect(nibiruSource).toContain("externalPersonalDataGate(env,'NIBIRU_AI')");
    expect(nibiruSource).toContain('PRIVACY_EXTERNAL_PROVIDER_BLOCKED');
    expect(whatsappSource.match(/externalPersonalDataGate\(env,'META_WHATSAPP'\)/g)?.length).toBe(2);
    expect(whatsappSource).toContain("reason:'PRIVACY_PROVIDER_BLOCKED'");
  });

  it('does not block provider health probes that send no student payload', () => {
    const probeBody = whatsappSource.match(/export async function probeWhatsAppProvider[\s\S]*?\n}\n\nexport async function sendWhatsAppText/)?.[0] || '';
    expect(probeBody).not.toContain('externalPersonalDataGate');
  });
});
