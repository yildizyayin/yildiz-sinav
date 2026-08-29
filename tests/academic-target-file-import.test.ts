import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { autoTargetMapping, mapAndValidateTargetRows, parseDelimitedTargetFile } from '../worker/lib/academic-target-file-import';

describe('official target file import',()=>{
 it('parses semicolon CSV including quoted delimiters',()=>{
  const parsed=parseDelimitedTargetFile('\uFEFFOkul Kodu;Okul Adı;İl\n100;"Anunex; Fen Lisesi";Ankara');
  expect(parsed.delimiter).toBe(';');expect(parsed.headers).toEqual(['Okul Kodu','Okul Adı','İl']);expect(parsed.records[0]['Okul Adı']).toBe('Anunex; Fen Lisesi');
 });
 it('auto maps Turkish LGS headers and validates numeric fields',()=>{
  const headers=['Okul Kodu','Okul Adı','İl','Taban Puan','Yüzdelik Dilim'];const mapping=autoTargetMapping('MEB_EOKUL',headers);
  const result=mapAndValidateTargetRows('MEB_EOKUL',headers,[{'Okul Kodu':'100','Okul Adı':'Fen Lisesi','İl':'Ankara','Taban Puan':'480,25','Yüzdelik Dilim':'0,72'}],mapping,'https://e-okul.meb.gov.tr/','2026-08-29');
  expect(mapping).toMatchObject({externalCode:'Okul Kodu',name:'Okul Adı',city:'İl'});expect(result.mappingIssues).toEqual([]);expect(result.rows[0].issues).toEqual([]);expect(result.rows[0].mapped.baseScore).toBe(480.25);
 });
 it('blocks duplicate official codes and malformed ranks before commit',()=>{
  const headers=['program_code','university_name','program_name','score_type','success_rank'];const mapping=autoTargetMapping('OSYM',headers);const records=[{program_code:'42',university_name:'Üniversite',program_name:'Tıp',score_type:'SAY',success_rank:'ilk bin'},{program_code:'42',university_name:'Üniversite',program_name:'Tıp',score_type:'SAY',success_rank:'500'}];
  const result=mapAndValidateTargetRows('OSYM',headers,records,mapping,'https://www.osym.gov.tr/','2026-08-29');expect(result.rows[0].issues.join(' ')).toContain('sayısal');expect(result.rows[1].issues.join(' ')).toContain('tekrar');
 });
 it('persists staged rows and reversible mutation snapshots',()=>{
  const migration=readFileSync(new URL('../migrations/0036_official_target_file_import.sql',import.meta.url),'utf8');expect(migration).toContain('academic_target_import_jobs');expect(migration).toContain('academic_target_import_rows');expect(migration).toContain('before_json');expect(migration).toContain("'ROLLED_BACK'");
 });
 it('exposes upload, mapping, approval, audit and safe rollback flow',()=>{
  const worker=readFileSync(new URL('../worker/lib/academic-target-file-import.ts',import.meta.url),'utf8'),entry=readFileSync(new URL('../worker/official-knowledge-entry.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../src/pages/AcademicTargetAdmin.tsx',import.meta.url),'utf8');expect(entry).toContain('handleAcademicTargetFileImport');expect(worker).toContain('OFFICIAL_TARGET_FILE_PREVIEWED');expect(worker).toContain('OFFICIAL_TARGET_FILE_COMMITTED');expect(worker).toContain('OFFICIAL_TARGET_FILE_ROLLED_BACK');expect(worker).toContain("status='COMMITTING'");expect(ui).toContain('Kolonları eşle');expect(ui).toContain('Güvenli Geri Al');
 });
});
