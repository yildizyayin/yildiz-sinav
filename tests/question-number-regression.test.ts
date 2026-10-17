import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {outcomeDraftIssues} from '../worker/lib/question-generation-validation';
it('rejects the actual false-positive dörtyüz draft even though two models previously passed it',()=>{const q=JSON.parse(readFileSync(new URL('./fixtures/known-bad-compound-number.json',import.meta.url),'utf8'));expect(outcomeDraftIssues(q,{gradeLevel:5,outcomeCode:'MAT.5.1.1',outcomeTitle:'Altı basamaklı sayıları okuma ve yazmayı çok basamaklı sayılara genelleyebilme'})).toContain('INVALID_TURKISH_COMPOUND_NUMERAL');const fixed=JSON.parse(JSON.stringify(q).replaceAll('dörtyüz','dört yüz'));expect(outcomeDraftIssues(fixed,{gradeLevel:5,outcomeCode:'MAT.5.1.1'})).not.toContain('INVALID_TURKISH_COMPOUND_NUMERAL');});
