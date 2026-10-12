import {afterEach, describe, expect, it, vi} from 'vitest';
import {createDeviceSpeech, localTurkishVoice} from '../src/lib/device-speech';
const voice=(lang:string,localService=true)=>({lang,localService} as SpeechSynthesisVoice);
function setup(voices=[voice('tr-TR')]){
 class Utterance { constructor(public text:string){} voice:any;lang='';onstart:any;onend:any;onerror:any; }
 const synth={getVoices:()=>voices,cancel:vi.fn(),speak:vi.fn()} as unknown as SpeechSynthesis;
 const speech=createDeviceSpeech(synth,Utterance as any);
 return {synth,speech};
}
afterEach(()=>vi.useRealTimers());
describe('local Turkish device speech',()=>{
 it('never substitutes English or a remote voice for Turkish',()=>{
  expect(localTurkishVoice([voice('en-US'),voice('tr-TR',false)])).toBeNull();
  const {synth,speech}=setup([voice('en-US')]);expect(speech.speak('Merhaba',vi.fn(),vi.fn())).toBe(false);expect(synth.speak).not.toHaveBeenCalled();
 });
 it('sets actual Turkish voice, releases state on completion and ignores stale callbacks',()=>{
  const {synth,speech}=setup();const end=vi.fn(),error=vi.fn();
  speech.speak('Merhaba',end,error);const first=vi.mocked(synth.speak).mock.calls[0][0];const stale=first.onend!;
  speech.speak('Yeni yanıt',end,error);const second=vi.mocked(synth.speak).mock.calls[1][0];
  expect(second.lang).toBe('tr-TR');expect(second.voice?.localService).toBe(true);
  stale.call(first,{} as any);expect(end).not.toHaveBeenCalled();
  second.onend?.call(second,{} as any);expect(end).toHaveBeenCalledOnce();expect(error).not.toHaveBeenCalled();
 });
 it('reports silent browser failure instead of leaving speaking state stuck',()=>{
  vi.useFakeTimers();const {speech}=setup();const error=vi.fn();speech.speak('Merhaba',vi.fn(),error);vi.advanceTimersByTime(8000);expect(error).toHaveBeenCalledWith(expect.stringContaining('başlatamadı'));
 });
 it('cancels without error or stale state after leaving the page',()=>{
  vi.useFakeTimers();const {speech,synth}=setup();const end=vi.fn(),error=vi.fn();speech.speak('Merhaba',end,error);speech.cancel();vi.runAllTimers();expect(end).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(synth.cancel).toHaveBeenCalled();
 });
 it('surfaces playback errors and bounds answer length',()=>{
  const {speech,synth}=setup();const error=vi.fn();speech.speak('a'.repeat(5000),vi.fn(),error);const utterance=vi.mocked(synth.speak).mock.calls[0][0];expect(utterance.text).toHaveLength(3600);utterance.onerror?.call(utterance,{} as any);expect(error).toHaveBeenCalledOnce();
 });
});
