import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync(new URL('../migrations/0032_worksheet_series.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/worksheet-admin-entry.ts',import.meta.url),'utf8');
const calendarWorker=readFileSync(new URL('../worker/lib/academic-growth.ts',import.meta.url),'utf8');
const admin=readFileSync(new URL('../src/pages/WorksheetAdmin.tsx',import.meta.url),'utf8');
const calendar=readFileSync(new URL('../src/pages/WorksheetCalendar.tsx',import.meta.url),'utf8');
const published=readFileSync(new URL('../src/pages/Worksheets.tsx',import.meta.url),'utf8');

describe('blue and red worksheet series',()=>{
 it('persists series, visible sequence and fixed question count',()=>{
  for(const column of ['series_code','series_sequence_no','questions_per_subject'])expect(migration).toContain(column);
  expect(worker).toContain("series==='RED'?20:10");
  expect(worker).toContain("series==='RED'?displaySequence+50:displaySequence");
 });

 it('allows Blue for grades 5-12 and Red only for grades 8 and 12',()=>{
  expect(worker).toContain("series==='BLUE'?(Number(grade)>=5&&Number(grade)<=12):(grade===8||grade===12)");
  expect(admin).toContain("series==='RED'?[8,12]:[5,6,7,8,9,10,11,12]");
 });

 it('locks every subject to its series question count before publication',()=>{
  expect(worker).toContain('Number(item.questionCount)!==Number(worksheet.questions_per_subject)');
  expect(worker).toContain('Number(s.question_count)!==Number(worksheet.questions_per_subject)');
  expect(admin).toContain('Soru sayısı seri kuralıyla sabittir');
 });

 it('exposes series in the annual calendar and student catalogue',()=>{
  expect(calendarWorker).toContain("url.searchParams.get('series')");
  expect(calendarWorker).toContain('w.series_sequence_no,w.questions_per_subject');
  for(const page of [calendar,published]){expect(page).toContain('Mavi');expect(page).toContain('Kırmızı');expect(page).toContain('questions_per_subject')}
 });
});
