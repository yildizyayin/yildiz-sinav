import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveNibiruPageContext } from '../worker/lib/nibiru-page-context';
import { routeNibiruSpecialist } from '../worker/lib/nibiru-specialists';

describe('page-contextual Nibiru',()=>{
 it('normalizes only safe known navigation paths',()=>{
  expect(resolveNibiruPageContext('/academic-target?x=1')?.pageKey).toBe('ACADEMIC_TARGET');expect(resolveNibiruPageContext('//evil.test')).toBeNull();expect(resolveNibiruPageContext('/../secret')).toBeNull();
 });
 it('routes a student from preference page to guidance specialist',()=>{
  const route=routeNibiruSpecialist({role:'STUDENT'},'Bu sayfayı açıkla',{pathname:'/academic-target'});expect(route.specialist).toBe('GUIDANCE_COUNSELOR');expect(route.pageContext?.label).toBe('Hedef ve Tercih Robotu');
 });
 it('routes a student from assignments to education coach',()=>{
  expect(routeNibiruSpecialist({role:'STUDENT'},'Şimdi ne yapmalıyım?',{pathname:'/assignments'}).specialist).toBe('EDUCATION_COACH');
 });
 it('keeps role scope stronger than page context',()=>{
  expect(routeNibiruSpecialist({role:'PARENT'},'Bu sayfayı açıkla',{pathname:'/institutions'}).specialist).toBe('PARENT_GUIDE');expect(routeNibiruSpecialist({role:'TEACHER'},'Bu sayfayı açıkla',{pathname:'/licenses'}).specialist).toBe('SUBJECT_TEACHER');
 });
 it('shows the dock on every role layout and carries context into text and voice chat',()=>{
  const layout=readFileSync(new URL('../src/components/Layout.tsx',import.meta.url),'utf8'),dock=readFileSync(new URL('../src/components/NibiruContextDock.tsx',import.meta.url),'utf8'),page=readFileSync(new URL('../src/pages/Nibiru.tsx',import.meta.url),'utf8'),core=readFileSync(new URL('../worker/lib/nibiru.ts',import.meta.url),'utf8');expect(layout).toContain('<NibiruContextDock/>');expect(dock).toContain('Sesli ve tam ekran aç');expect(dock).toContain("context:{pathname:context.pathname}");expect(page).toContain("context:{pathname:pageContext?.pathname||'/'}");expect(core).toContain('uiContext yalnız kullanıcının açık olduğu sayfayı anlatır');
 });
});
