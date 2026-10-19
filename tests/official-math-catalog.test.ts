import {expect,it} from 'vitest';
import {mathThemeLinks,mathThemeOutcomes,assertSameMathCatalog,fullMathCsv} from '../scripts/official-math-catalog.mjs';
import catalog from '../data/question-full-math-target-2028.json';
import {parseCurriculumCsv} from '../worker/lib/curriculum-import';
it('pins all eight reviewed grade catalogs and creates valid full-theme CSV rows',()=>{
 expect(catalog.grades.map(g=>g.grade)).toEqual([5,6,7,8,9,10,11,12]);expect(catalog.grades.reduce((n,g)=>n+g.outcomes.length,0)).toBe(177);
 for(const g of catalog.grades){const parsed=parseCurriculumCsv(fullMathCsv(g),'SCHOOL',g.grade);expect(parsed.errors).toEqual([]);expect(parsed.rows).toHaveLength(g.outcomes.length);expect(parsed.rows.every(r=>r.issues.length===0)).toBe(true);expect(new Set(g.outcomes.map(o=>o.code)).size).toBe(g.outcomes.length);}
});
it('takes links only from the same official subject and checks the grade heading',()=>{
 const html='<h1>Matematik Dersi 12.Sınıf</h1>'+[305,306,307].map(i=>`<a href="/matematik-dersi/unite/${i}">${i}. Tema: Başlık</a>`).join('')+'<a href="https://example.com/matematik-dersi/unite/1">Tema: Yanlış</a><script><a href="/matematik-dersi/unite/2">Tema</a></script>';
 expect(mathThemeLinks(html,12)).toHaveLength(3);expect(()=>mathThemeLinks(html,11)).toThrow('INDEX_GRADE_MISMATCH');expect(()=>mathThemeLinks('<h1>12.Sınıf</h1>',12)).toThrow();
});
it('ignores later lesson examples and rejects missing, conflicting or duplicated official outcome headings',()=>{
 const theme={title:'1. Tema: Diziler',url:'https://tymm.meb.gov.tr/matematik-dersi/unite/305'};
 const html='<h1>1. Tema: Diziler</h1>Öğrenme Çıktıları ve Süreç Bileşenleri<strong>MAT.12.1.1. Dizilerin özelliklerine ilişkin muhakeme yapabilme</strong>İçerik Çerçevesi<strong>MAT.12.1.2. Bu bölüm çıktı olarak alınmamalı</strong>';
 expect(mathThemeOutcomes(html,12,theme).map(r=>r.code)).toEqual(['MAT.12.1.1']);
 expect(()=>mathThemeOutcomes(html.replace('MAT.12.','MAT.11.'),12,theme)).toThrow();expect(()=>mathThemeOutcomes('<script>'+html+'</script>',12,theme)).toThrow();
 expect(()=>mathThemeOutcomes(html.replace('İçerik Çerçevesi','<strong>MAT.12.1.1. Dizilerin özelliklerine ilişkin muhakeme yapabilme</strong>İçerik Çerçevesi'),12,theme)).toThrow('DUPLICATE_THEME_OUTCOME');
});
it('requires review after a source title, code or theme list changes, but permits formatting hash changes',()=>{
 const same=structuredClone(catalog.grades);same[0].indexHash='format-only';expect(()=>assertSameMathCatalog(catalog.grades,same)).not.toThrow();
 for(const mutate of [(s:any)=>s[0].outcomes[0].title+=' changed',(s:any)=>s[0].themes.pop(),(s:any)=>s[0].outcomes[0].code='MAT.5.99.1']){const changed=structuredClone(catalog.grades);mutate(changed);expect(()=>assertSameMathCatalog(catalog.grades,changed)).toThrow('OFFICIAL_CATALOG_CHANGED_REVIEW_REQUIRED');}
});
