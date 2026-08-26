import { describe,expect,it } from 'vitest';
import { buildVoiceProviderPlan,prepareNibiruSpeechText,voiceProviderStatus } from '../worker/lib/nibiru-voice';
import type { Env } from '../worker/types';

function env(values:Partial<Env>={}):Env{return values as Env}
const ai={} as Ai;

describe('Nibiru Voice provider policy',()=>{
 it('cleans Nibiru prefix, markdown and links before speech',()=>{
  const text=prepareNibiruSpeechText('🤖 Nibiru: **Şimdi** [konuya](https://example.com) bakalım. https://example.com/test');
  expect(text).not.toContain('🤖');
  expect(text).not.toContain('**');
  expect(text).not.toContain('https://');
  expect(text).toContain('Şimdi');
 });

 it('uses Unified Billing standard TTS when Google is not configured',()=>{
  const plan=buildVoiceProviderPlan(env({AI:ai}),'STANDARD');
  expect(plan.providers[0]).toBe('OPENAI_UNIFIED_TTS');
 });

 it('uses Google WaveNet first for standard voice when configured',()=>{
  const plan=buildVoiceProviderPlan(env({AI:ai,GOOGLE_TTS_SERVICE_ACCOUNT_JSON:'{"client_email":"x","private_key":"y"}'}),'STANDARD');
  expect(plan.providers[0]).toBe('GOOGLE_WAVENET');
  expect(plan.providers).toContain('OPENAI_UNIFIED_TTS');
 });

 it('uses direct GPT-4o Mini TTS first in premium mode when secret exists',()=>{
  const plan=buildVoiceProviderPlan(env({AI:ai,OPENAI_TTS_API_KEY:'secret'}),'PREMIUM');
  expect(plan.providers[0]).toBe('OPENAI_GPT4O_MINI_TTS');
 });

 it('uses Unified HD first in premium mode without direct OpenAI key',()=>{
  const plan=buildVoiceProviderPlan(env({AI:ai}),'PREMIUM');
  expect(plan.providers[0]).toBe('OPENAI_UNIFIED_TTS_HD');
 });

 it('reports Turkish STT ready when Workers AI binding exists',()=>{
  const status=voiceProviderStatus(env({AI:ai}));
  expect(status.stt.ready).toBe(true);
  expect(status.stt.model).toBe('@cf/openai/whisper-large-v3-turbo');
  expect(status.standardReady).toBe(true);
 });
});
