import { describe, expect, it } from 'vitest';
import { parseFmtText } from '../worker/lib/fmt';
import { parseWithTemplate } from '../worker/lib/parse';

describe('FMT optical definitions', () => {
  it('recognizes the proprietary Sekonic Optik 129 mapping', () => {
    const fmt = [
      // The complete row list of the real OPT_K-129 file (A025): every grid the reader writes, in order.
      '61=46=04=D=*= =',
      '01=01=10=10=K=D=1=X2=KOD-1=',
      '10=10=10=10=K=D=2=X2=KOD-2=',
      '30=30=02=02=K=D=9=X2=KOD-3=',
      '01=10=02=09=K=D=0123456789=X2=OKUL KODU=',
      '01=10=11=15=K=D=0123456789=X2=ÖĞRENCİ NO=',
      '33=61=02=21=K=D=ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ=X2=ADI SOYADI=',
      '20=29=02=12=K=D=0123456789=X2=TC/TEL=',
      '02=08=22=22=K=D=1 2 3 4=X2=ALAN=',
      '01=09=18=18=K=D=  1 1 1  =X2=SINIF-1=',
      '01=09=18=18=K=D=9 0 1 2 M=X2=SINIF-2=',
      '01=29=19=19=K=D=ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ=X2=ŞUBE=',
      '20=29=14=16=K=D=0123456789=X2=GRUP=',
      '10=11=34=34=K=D=12=X2=OTURUM NO=',
      '13=13=08=10=K=Y=A B=X2=KİTAPÇIK=',
      '16=55=24=28=K=Y=ABCDE=X2=TÜRKÇE=',
      '16=61=30=34=K=Y=ABCDE=X2=SOSYAL BİLİMLER=',
      '16=55=36=40=K=Y=ABCDE=X2=MATEMATİK=',
      '16=55=42=46=K=Y=ABCDE=X2=FEN BİLİMLERİ=',
    ].join('\n');
    const result = parseFmtText(fmt, 'OPTİK-129_SEKONIC.fmt');
    expect(result.ok).toBe(true);
    expect(result.definition).toMatchObject({ recordLength: 222, formType: 'TYT' });
    expect(result.definition?.answers.TYT_TUR).toMatchObject({ start: 56, end: 96, questionCount: 40 });
    expect(result.definition?.answers.TYT_SOS).toMatchObject({ start: 96, end: 142, questionCount: 46 });
    expect(result.definition?.fields).toMatchObject({ student_number: { start: 11, end: 16 }, name: { start: 16, end: 36 }, tckn: { start: 36, end: 47 }, class: { start: 48, end: 51 }, booklet: { start: 55, end: 56 } });
  });

  it('A028b: any Sekonic form is laid out from its own rows (a middle-school sözel form, e.g. 840)', () => {
    const fmt = [
      '01=10=02=11=K=D=0123456789=X2=ÖĞRENCİ NO=',
      '33=61=02=21=K=D=ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ=X2=ADI SOYADI=',
      '01=09=22=22=K=D=5 6 7 8=X2=SINIF=',
      '01=29=23=23=K=D=ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ=X2=ŞUBE=',
      '13=14=08=11=K=Y=ABCD=X2=KİTAPÇIK=',
      '16=35=24=27=K=Y=ABCD=X2=TÜRKÇE=',
      '16=25=30=33=K=Y=ABCD=X2=T.C. İNKILAP TARİHİ VE ATATÜRKÇÜLÜK=',
      '16=25=36=39=K=Y=ABCD=X2=DİN KÜLTÜRÜ VE AHLAK BİLGİSİ=',
      '16=25=42=45=K=Y=ABCD=X2=İNGİLİZCE=',
    ].join('\n');
    const result = parseFmtText(fmt, 'OPT_K-840_SEKONIC.fmt');
    expect(result.ok, result.errors.join(' ')).toBe(true);
    expect(result.definition).toMatchObject({ recordLength: 10 + 20 + 1 + 1 + 2 + 20 + 10 + 10 + 10, formType: 'SCHOOL', formName: 'Sekonic Optik 840' });
    expect(result.definition?.fields).toMatchObject({ student_number: { start: 0, end: 10 }, name: { start: 10, end: 30 }, class: { start: 30, end: 32 }, booklet: { start: 32, end: 34 } });
    expect(Object.fromEntries(Object.entries(result.definition!.answers).map(([k, v]) => [k, [v.start, v.length]]))).toEqual({ TUR: [34, 20], INK: [54, 10], DIN: [64, 10], YAB: [74, 10] });
  });

  it('converts a tabular FMT mapping into a validated definition', () => {
    const fmt = [
      'type;code;start;length;questionCount',
      'field;student_number;1;5;',
      'field;name;6;20;',
      'field;class;26;3;',
      'field;booklet;29;1;',
      'answer;MAT;30;10;10',
    ].join('\n');
    const result = parseFmtText(fmt, 'tyt.fmt');
    expect(result.ok).toBe(true);
    expect(result.definition?.fields.student_number).toMatchObject({ start: 0, end: 5 });
    expect(result.definition?.answers.MAT).toMatchObject({ start: 29, end: 39, questionCount: 10 });
  });

  it('uses the embedded fixed-width parser for FMT records', () => {
    const definition = { type: 'fmt', recordLength: 20, fields: { student_number: { start: 0, end: 4 }, name: { start: 4, end: 12 }, class: { start: 12, end: 15 }, booklet: { start: 15, end: 16 } }, answers: { MAT: { start: 16, end: 20 } }, fixedWidth: { type: 'fixed-width', recordLength: 20, fields: { student_number: { start: 0, end: 4 }, name: { start: 4, end: 12 }, class: { start: 12, end: 15 }, booklet: { start: 15, end: 16 } }, answers: { MAT: { start: 16, end: 20 } } } };
    const result = parseWithTemplate('0001AHMET   7/AAABCD', 'optik.dat', { id: 'fmt-1', name: 'FMT', parser_definition: JSON.stringify(definition) });
    expect(result.records[0]).toMatchObject({ student_number: '0001', name: 'AHMET', booklet: 'A' });
    expect(result.records[0].answers_by_subject.MAT).toBe('ABCD');
  });
});
