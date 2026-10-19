import {describe,it,expect} from 'vitest';
// @ts-expect-error Plain Node source collector is also used by Actions.
import {branchThemeOutcomes,assembleBranchProgram} from '../scripts/official-branch-catalog.mjs';
const spec={course:'tc-inkilap-tarihi-ve-ataturkculuk-dersi',grade:8};
const theme={title:'Birinci Ünite',url:'https://tymm.meb.gov.tr/tc-inkilap-tarihi-ve-ataturkculuk-dersi/unite/1'};
const page=(body:string)=>`<h1>Birinci Ünite</h1>Öğrenme Çıktıları ve Süreç Bileşenleri<div>${body}</div>İçerik Çerçevesi`;
describe('official branch source identity',()=>{
 it('preserves Unicode official codes and separates processes',()=>{
  expect(branchThemeOutcomes(page('<p><strong>İTA.8.1.1. Tarihî kaynakları yorumlayabilme</strong><br>a) Kaynakları inceler.</p>'),spec,theme)[0]).toMatchObject({code:'İTA.8.1.1',title:'Tarihî kaynakları yorumlayabilme'});
 });
 it('blocks conflicting official identities instead of overwriting',()=>{
  const result=assembleBranchProgram(spec,[{theme,html:page('<p>İTA.8.1.1. Kaynakları yorumlayabilme</p>')},{theme,html:page('<p>İTA.8.1.1. Farklı kaynakları çözümleyebilme</p>')}]);
  expect(result.importStatus).toBe('BLOCKED_CONTEXT_IDENTITY');expect(result.conflicts).toHaveLength(1);
 });
 it('retains repeated theme associations for the same outcome',()=>{
  const html=page('<p>İTA.8.1.1. Kaynakları yorumlayabilme</p>');
  const result=assembleBranchProgram(spec,[{theme,html},{theme:{...theme,url:theme.url+'2'},html}]);
  expect(result.outcomes).toHaveLength(1);expect(result.outcomes[0].sourceUrls).toHaveLength(2);
 });
 it('refuses missing source sections and title mismatches',()=>{
  expect(()=>branchThemeOutcomes('<h1>Birinci Ünite</h1>',spec,theme)).toThrow('OUTCOME_SECTION_MISSING');
  expect(()=>branchThemeOutcomes(page('<p>İTA.8.1.1. Kaynakları yorumlayabilme</p>'),spec,{...theme,title:'Yanlış'})).toThrow('THEME_TITLE_MISMATCH');
 });
});
it('accepts both official English code styles without rewriting',()=>{
 for(const code of ['ENG.5.7.L1','ENG5.7.L1'])expect(branchThemeOutcomes(page(`<p>${code}. Students can prepare for listening.</p>`),{course:'ingilizce-dersi-temel-egitim',grade:5},theme)[0].code).toBe(code);
});
it('rejects a source outcome assigned to the wrong grade',()=>{
 expect(()=>branchThemeOutcomes(page('<p>İTA.12.1.1. Kaynakları yorumlayabilme</p>'),spec,theme)).toThrow('OUTCOME_GRADE_MISMATCH');
});
