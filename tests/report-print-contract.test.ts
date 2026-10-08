import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const reports=readFileSync(new URL('../src/pages/Reports.tsx',import.meta.url),'utf8');
const exam=readFileSync(new URL('../src/components/FrozenExamReport.tsx',import.meta.url),'utf8');
const practice=readFileSync(new URL('../src/components/FrozenPracticeReport.tsx',import.meta.url),'utf8');
const foyGame=readFileSync(new URL('../src/components/FrozenFoyGameReport.tsx',import.meta.url),'utf8');

it('mounts all frozen report sections in the same printable Reports document',()=>{
 expect(reports).toContain('window.print()');
 expect(reports).toContain('<FrozenExamReport');
 expect(reports).toContain('<FrozenPracticeReport');
 expect(reports).toContain('<FrozenFoyGameReport');
 expect(reports).toContain('Yazdır / PDF');
});

it('keeps student-facing frozen report language descriptive rather than claiming official score/rank',()=>{
 expect(exam).toContain('resmî puan');
 expect(practice).toContain('resmî puan');
 expect(foyGame).toContain('Mini oyun puanı sınav başarısına çevrilmez');
 expect(foyGame).toContain('Mini oyun puanı doğru/yanlış/boş toplamına katılmaz');
});

it('keeps FOY/game print output inside the same role-scoped report selection',()=>{
 expect(reports).toContain('key={`${scopeKey}-foy-game`}');
 expect(foyGame).toContain('/frozen-expanded');
 expect(foyGame).toContain('restrictedToSubjects');
 expect(foyGame).toContain('Yazdır / PDF ile bu görünüm de çıktıya dahil edilir.');
});
