import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {utils,write} from '@e965/xlsx';
import {parseStudentTransfer} from '../worker/lib/transfer-import';

const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/pages/Transfers.tsx',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0033_transfer_center_safety.sql',import.meta.url),'utf8');

describe('secure transfer center',()=>{
 it('parses quoted CSV without inventing missing academic detail',()=>{
  const bytes=new TextEncoder().encode('öğrenci_no;ad_soyad;sınıf\n101;"Ada; Yılmaz";8/A').buffer;
  const parsed=parseStudentTransfer(bytes,'ogrenciler.csv');
  expect(parsed.format).toBe('CSV');expect(parsed.rows).toHaveLength(1);expect(parsed.rows[0]).toMatchObject({studentNumber:'101',name:'Ada; Yılmaz',gradeLevel:8,section:'A'});
  expect(parsed.rows[0].source).not.toHaveProperty('outcome');
 });

 it('reads real XLSX cells and validates required class data',()=>{
  const workbook=utils.book_new();utils.book_append_sheet(workbook,utils.aoa_to_sheet([['No','Ad Soyad','Sınıf','Şube'],['202','Mert Kaya',12,'B']]),'Öğrenciler');
  const bytes=write(workbook,{type:'array',bookType:'xlsx'}) as ArrayBuffer;const parsed=parseStudentTransfer(bytes,'ogrenciler.xlsx');
  expect(parsed.format).toBe('XLSX');expect(parsed.rows[0]).toMatchObject({studentNumber:'202',name:'Mert Kaya',gradeLevel:12,section:'B',issues:[]});
 });

 it('requires preview, row resolution and explicit confirmation before commit',()=>{
  expect(worker).toContain("'PREVIEW',?,?,?,?");expect(worker).toContain('IMPORT_CONFIRMATION_REQUIRED');expect(worker).toContain('IMPORT_ROW_REQUIRES_RESOLUTION');
  expect(worker).toContain('userCanAccessInstitution');expect(page).toContain('Henüz gerçek öğrenci tablolarına yazılmadı');expect(page).toContain('Mevcut öğrenciyle eşleştir');
 });

 it('records reversible mutations and preserves history on rollback',()=>{
  for(const text of ['import_commit_mutations','rolled_back_at','resolution_note'])expect(migration).toContain(text);
  expect(worker).toContain("'IMPORT_ROLLED_BACK'");expect(worker).toContain("SET status='ARCHIVED'");expect(worker).toContain('historyPreserved:true');
  expect(page).toContain('Güvenli Geri Al');expect(page).toContain('akademik geçmiş korundu');
 });

 it('blocks duplicate committed files and exposes a CSV error report',()=>{
  expect(worker).toContain('IMPORT_FILE_ALREADY_COMMITTED');expect(worker).toContain("crypto.subtle.digest('SHA-256',bytes)");expect(worker).toContain('Content-Disposition');expect(page).toContain('Hata raporu');
 });
});
