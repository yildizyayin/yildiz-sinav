import { describe,expect,it } from 'vitest';
import { classifyVoiceActivationFailure,sanitizedVoiceProviderError } from '../worker/lib/nibiru-voice-diagnostics';

describe('Nibiru Voice activation diagnostics',()=>{
 it('classifies prepaid credit/billing blockers',()=>{
  expect(classifyVoiceActivationFailure(new Error('insufficient prepaid credits for unified billing')).activationCode).toBe('UNIFIED_BILLING_CREDITS_REQUIRED');
 });
 it('classifies gateway configuration blockers',()=>{
  expect(classifyVoiceActivationFailure(new Error('AI Gateway id not found')).activationCode).toBe('GATEWAY_CONFIGURATION_REQUIRED');
 });
 it('classifies credential blockers',()=>{
  expect(classifyVoiceActivationFailure(new Error('401 Unauthorized invalid API key')).activationCode).toBe('PROVIDER_CREDENTIAL_REQUIRED');
 });
 it('classifies rate limits and model availability',()=>{
  expect(classifyVoiceActivationFailure(new Error('429 Too Many Requests')).activationCode).toBe('RATE_LIMITED');
  expect(classifyVoiceActivationFailure(new Error('model not found')).activationCode).toBe('MODEL_UNAVAILABLE');
 });
 it('redacts bearer tokens and OpenAI-style keys from diagnostics',()=>{
  const safe=sanitizedVoiceProviderError(new Error('Bearer abc.def.ghi sk-secret123 failed'));
  expect(safe).not.toContain('abc.def.ghi');
  expect(safe).not.toContain('sk-secret123');
 });
});
