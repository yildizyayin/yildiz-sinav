import { describe,expect,it,vi } from 'vitest';
import { buildVoiceProviderPlan,prepareNibiruSpeechText,voiceProviderStatus,speakNibiru,voiceProviderStatusWithHealth,transcribeNibiruAudio } from '../worker/lib/nibiru-voice';
import { addPublicVoiceCors } from '../worker/nibiru-voice-entry';
import type { Env } from '../worker/types';

function env(values:Partial<Env>={}):Env{return {NIBIRU_PAID_VOICE_ENABLED:'ON',...values} as Env}
const ai={} as Ai;

describe('Nibiru Voice provider policy',()=>{
 it('cleans Nibiru prefix, markdown and links before speech',()=>{
  const text=prepareNibiruSpeechText('🤖 Nibiru: **Şimdi** [konuya](https://example.com) bakalım. https://example.com/test');
  expect(text).not.toContain('🤖');
  expect(text).not.toContain('**');
  expect(text).not.toContain('https://');
  expect(text).toContain('Şimdi');
 });

 it('keeps the public voice demo readable from the ANUNEX marketing origin',()=>{
  const headers=addPublicVoiceCors(new Request('https://app.anunex.com/api/public/nibiru/voice-demo',{headers:{Origin:'https://anunex.com'}}),new Headers({'content-type':'audio/mpeg'}));
  expect(headers.get('access-control-allow-origin')).toBe('https://anunex.com');
  expect(headers.get('vary')).toBe('Origin');
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

 it('keeps standard voice enabled when only direct OpenAI TTS is configured',()=>{
  const status=voiceProviderStatus(env({OPENAI_TTS_API_KEY:'secret'}));
  expect(status.standardReady).toBe(false);
  expect(status.standardConfigured).toBe(true);
 });

 it('uses Unified HD first in premium mode without direct OpenAI key',()=>{
  const plan=buildVoiceProviderPlan(env({AI:ai}),'PREMIUM');
  expect(plan.providers[0]).toBe('OPENAI_UNIFIED_TTS_HD');
 });

 it('reports Turkish STT configured when Workers AI binding exists',()=>{
  const status=voiceProviderStatus(env({AI:ai}));
  expect(status.stt.ready).toBe(false);
  expect(status.stt.configured).toBe(true);
  expect(status.stt.model).toBe('@cf/openai/whisper-large-v3-turbo');
  expect(status.standardReady).toBe(false);
  expect(status.standardConfigured).toBe(true);
  expect(status.liveVerified).toBe(false);
  expect(status.openaiUnified.detail).toContain('canlı probe');
 });
});


describe('Voice acceptance boundaries',()=>{
 it('blocks paid calls by default without contacting providers',async()=>{
  const run=vi.fn();
  const e=env({AI:{run} as unknown as Ai,NIBIRU_PAID_VOICE_ENABLED:undefined});
  expect(buildVoiceProviderPlan(e,'STANDARD').providers).toEqual([]);
  await expect(speakNibiru(e,'Türkçe test')).rejects.toThrow('VOICE_PAID_PROVIDERS_DISABLED');
  expect(run).not.toHaveBeenCalled();
 });
 it('does not use English MeloTTS after a Turkish provider failure',async()=>{
  const run=vi.fn().mockRejectedValue(new Error('unavailable'));
  await expect(speakNibiru(env({AI:{run} as unknown as Ai}),'Türkçe test')).rejects.toThrow('VOICE_PROVIDER_FAILED');
  expect(run).toHaveBeenCalledTimes(1);
  expect(run.mock.calls[0][0]).toBe('openai/tts-1');
 });
 it('rejects JSON returned as successful speech',async()=>{
  const run=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'model error'}),{headers:{'content-type':'application/json'}}));
  await expect(speakNibiru(env({AI:{run} as unknown as Ai}),'Türkçe test')).rejects.toThrow('NOT_AUDIO');
 });
 it('ignores old MeloTTS success incorrectly recorded as OpenAI',async()=>{
  const rows=[{provider:'OPENAI_UNIFIED_TTS',model:'@cf/myshell-ai/melotts',mode:'STANDARD',last_success_at:new Date().toISOString()}];
  const DB={prepare:()=>({all:async()=>({results:rows})})} as unknown as D1Database;
  const status=await voiceProviderStatusWithHealth(env({AI:ai,DB}));
  expect(status.openaiUnified.ready).toBe(false);
  expect(status.standardReady).toBe(false);
 });
});


it('reports STT ready only after matching recent transcription evidence',async()=>{
 const rows=[{provider:'CLOUDFLARE_WORKERS_AI_STT',model:'@cf/openai/whisper-large-v3-turbo',mode:'STANDARD',last_success_at:new Date().toISOString()}];
 const DB={prepare:()=>({all:async()=>({results:rows})})} as unknown as D1Database;
 const status=await voiceProviderStatusWithHealth(env({AI:ai,DB,NIBIRU_PAID_VOICE_ENABLED:'OFF'}));
 expect(status.stt.ready).toBe(true);
 expect(status.stt.liveVerified).toBe(true);
 expect(status.standardReady).toBe(false);
});


it('keeps STT direct when the gateway is explicitly disabled',async()=>{
 const run=vi.fn().mockResolvedValue({text:'Bugün matematik çalışacağım.'});
 const result=await transcribeNibiruAudio(env({AI:{run} as unknown as Ai,NIBIRU_AI_GATEWAY_ID:'OFF'}),new Uint8Array([1,2,3]));
 expect(result.text).toContain('matematik');
 expect(run.mock.calls[0][2]).toBeUndefined();
});

it('does not mark Premium ready from a Standard-only speech test',async()=>{
 const rows=[{provider:'OPENAI_UNIFIED_TTS',model:'openai/tts-1',mode:'STANDARD',last_success_at:new Date().toISOString()}];
 const DB={prepare:()=>({all:async()=>({results:rows})})} as unknown as D1Database;
 const status=await voiceProviderStatusWithHealth(env({AI:ai,DB}));
 expect(status.standardReady).toBe(true);
 expect(status.premiumReady).toBe(false);
});

it('expires old transcription success without losing configured state',async()=>{
 const rows=[{provider:'CLOUDFLARE_WORKERS_AI_STT',model:'@cf/openai/whisper-large-v3-turbo',mode:'STANDARD',last_success_at:new Date(Date.now()-25*60*60*1000).toISOString()}];
 const DB={prepare:()=>({all:async()=>({results:rows})})} as unknown as D1Database;
 const status=await voiceProviderStatusWithHealth(env({AI:ai,DB}));
 expect(status.stt.configured).toBe(true);
 expect(status.stt.ready).toBe(false);
});
