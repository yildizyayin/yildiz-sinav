import {describe,expect,it} from 'vitest';
import {checkNibiruAnswer} from '../worker/lib/nibiru-answer-policy';
describe('Nibiru final answer guard',()=>{
 it.each([
  ['Nibiru: Ben MEB çalışanıyım.','OFFICIAL_IMPERSONATION'],
  ['Nibiru: Sana DEHB tanısı koydum.','DIAGNOSTIC_CLAIM'],
  ['Nibiru: Sen tembelsin.','STUDENT_LABEL'],
  ['Nibiru: Bu öğrenci başarısızdır.','STUDENT_LABEL'],
  ['Nibiru: Telefonu 905551112233 değil, TCKN 10000000146.','RAW_PERSONAL_IDENTIFIER'],
  ['Nibiru: MEB çalışanı yaklaşımıyla puanını yorumluyorum.','OFFICIAL_IMPERSONATION'],
  ['Nibiru: Ortak paydaが必要です.','NON_TURKISH_SCRIPT'],
  ['Nibiru: 8’i ortak pay yapalım.','ACADEMIC_TERMINOLOGY'],
 ])('blocks %s',(text,reason)=>expect(checkNibiruAnswer(text)).toEqual({ok:false,reason}));
 it.each([
  'Nibiru: Tembel değilsin; bugün kısa bir pekiştirme çalışması yararlı olabilir.',
  'Nibiru: Tanı koyamam. Gerekirse rehber öğretmeninle görüşebilirsin.',
  'Nibiru: MEB çalışanı değilim; akademik yapay zekâ asistanıyım.',
  'Nibiru: 3/4 + 1/8 = 7/8. Önce ortak payda olarak 8 kullanırız.',
  'Nibiru: Tek sınavdan genel bir öğrenci etiketi çıkaramayız.',
 ])('preserves constructive explanations: %s',text=>expect(checkNibiruAnswer(text).ok).toBe(true));
});
