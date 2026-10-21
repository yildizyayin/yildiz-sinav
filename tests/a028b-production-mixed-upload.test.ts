import { describe, expect, it } from 'vitest';
import { evaluatedExam, SHEETS } from './helpers/exam-flow';
import { parseFmtText } from '../worker/lib/fmt';

/**
 * A028b.3: in production the preview policy makes the user pick one optic when several are allowed. A TXT
 * holding a sayısal 7108 sheet and a sözel 840-style sheet must still be read: the chosen optic plus the
 * other optic this institution may use. Optics of another institution are never used, even if the client
 * names them.
 */
const FMT = (code: string) => [
  ...[...code].map((c, i) => `01=01=10=10=K=D=${c}=X2=KOD-${i + 1}=`),
  '01=10=02=06=K=D=0123456789=X2=ÖĞRENCİ NO=',
  '33=61=02=21=K=D=ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ=X2=ADI SOYADI=',
  '01=09=22=23=K=D=5678 =X2=SINIF=',
  '13=13=08=10=K=Y=A B=X2=KİTAPÇIK=',
  '16=19=24=27=K=Y=ABCD=X2=TÜRKÇE=',
].join('\n');

describe('A028b.3: one TXT with two forms through the production upload policy', () => {
  it('reads the chosen 7108 lines and the allowed 840 lines; another institution’s optic is not used', async () => {
    const t = await evaluatedExam('direct');
    try {
      const add = (id: string, code: string, owner: string | null) => {
        const def = parseFmtText(FMT(code), `OPT_K-${code}_SEKONIC.fmt`).definition;
        t.db.prepare(`INSERT INTO optical_templates(id,name,status,active,owner_type,owner_id) VALUES(?,?,?,?,?,?)`).run(id, `Sekonic Optik ${code} (${id})`, 'READY', 1, owner ? 'INSTITUTION' : 'CENTRAL', owner);
        t.db.prepare(`INSERT INTO optical_template_versions(id,template_id,version,parser_definition,active) VALUES(?,?,?,?,1)`).run(`${id}v1`, id, '1', JSON.stringify(def));
        t.db.prepare(`INSERT INTO optical_definition_validations(optical_template_version_id,parser_test_passed,parser_test_record_count) VALUES(?,1,1)`).run(`${id}v1`);
      };
      t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('rival','Rival School','RIVAL','ACTIVE')`);
      add('opt840', '840', null);
      const sozel = (s: typeof SHEETS[number]) => '840' + s.no.padStart(5) + s.name.padEnd(20) + '8A' + 'A' + s.TUR.replace(/_/g, ' ');
      const sayisal = (s: typeof SHEETS[number]) => '7108'.padEnd(10) + s.no.padStart(5) + s.name.padEnd(20) + '8A' + ' '.repeat(13) + 'A' + ' '.repeat(80) + s.MAT.replace(/_/g, ' ').padEnd(20) + ' '.repeat(20);
      const text = SHEETS.flatMap((s) => [sozel(s), sayisal(s)]).join('\r\n');
      const upload = async (template: string, extra: Record<string, string> = {}) => {
        const form = new FormData(); form.set('institutionId', 'school'); form.set('templateVersionId', template); form.set('file', new File([text], 'lgs-tum.txt', { type: 'text/plain' }));
        for (const [k, v] of Object.entries(extra)) form.set(k, v);
        return t.request(`/api/exams/${t.examId}/preview-file`, 'POST', form);
      };
      const ok = await upload('optik-7108-sekonic-v1');
      expect(ok.response.status, ok.text).toBe(200);
      expect(ok.data.detection.forms.map((f: any) => f.id).sort()).toEqual(['opt840v1', 'optik-7108-sekonic-v1']);
      expect(ok.data.total).toBe(2);

      // The only 840 optic belongs to another institution: the mixed file is refused, even when the client
      // sends its own candidate list.
      t.db.exec(`UPDATE optical_templates SET owner_type='INSTITUTION',owner_id='rival' WHERE id='opt840'`);
      const refused = await upload('optik-7108-sekonic-v1', { policyCandidateIds: 'optik-7108-sekonic-v1,opt840v1' });
      expect(refused.response.status).toBe(400);
      expect(refused.text).toContain('uyuşmuyor');
    } finally { t.db.close(); }
  }, 60000);
});
