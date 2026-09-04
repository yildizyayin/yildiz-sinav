import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');

describe('ANUNEX / Nibiru canonical brand lock',()=>{
 it('keeps slogans in one source of truth',()=>{
  const brand=read('src/brand.ts');
  expect(brand).toContain("tagline:'BİLGİNİN YÖRÜNGESİNDE'");
  expect(brand).toContain("tagline:'ÖĞRENMENİN YAŞAYAN ZEKÂSI'");
 });

 it('uses the same brand source for ANUNEX and both Nibiru sizes',()=>{
  expect(read('src/components/AnunexBrand.tsx')).toContain("from '../brand'");
  expect(read('src/components/NibiruMark.tsx')).toContain("from '../brand'");
  expect(read('src/components/NibiruPlanetarySystem.tsx')).toContain("from '../brand'");
 });

 it('does not reintroduce the retired orbit/robot compact mark',()=>{
  const mark=read('src/components/NibiruMark.tsx');
  const css=read('src/components/NibiruMark.css');
  const interaction=read('src/components/NibiruInteractive.css');
  expect(mark).not.toContain('nibiru-eclipse');
  expect(mark).not.toContain('nibiru-orbit');
  expect(css).not.toContain('.nibiru-orbit');
  expect(interaction.toLowerCase()).not.toContain('nibiru-core i');
  expect(mark).toContain('nibiru-mark-aurora');
  expect(mark).toContain('NIBIRU_BRAND.tagline');
 });

 it('documents one Nibiru on every ANUNEX hostname',()=>{
  const standard=read('docs/ANUNEX_BRAND_STANDARD.md');
  for(const host of ['anunex.com','app.anunex.com','demo.anunex.com','sonuc.anunex.com'])expect(standard).toContain('`'+host+'`');
  expect(standard).toContain('gezegen, uydu veya dönen küçük nesne kullanılmaz');
 });
});
