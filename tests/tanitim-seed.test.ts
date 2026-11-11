import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import app from '../worker/preview-policy-production-entry';
import { validateContent } from '../worker/lib/learning-universe/grading';

/**
 * Tanıtım ortamı seed (owner, 11 Nov 2026): a 2027–2028 showcase school with every role and grades 4–12, invented
 * names only; TANITIM activities valid and waiting for the owner's approval; accounts can sign in.
 */
it('builds the showcase school on top of the migrations and the verified 2027–2028 programs', async () => {
  execFileSync('node', ['scripts/generate-tanitim-seed.mjs'], { env: { ...process.env, DEMO_PASSWORD: 'Tanitim.Test!1' }, stdio: 'pipe' });
  const sql = readFileSync('tmp/tanitim-seed.sql', 'utf8');
  const t = await evaluatedExam('direct');
  try {
    // the programs the deploy copies from production, here as a tiny synthetic stand-in with the same codes
    const codes: Array<[number, string, string]> = [[4, 'sub_mat', 'MAT.4.1.8'], [4, 'sub_mat', 'MAT.4.3.7'], [5, 'sub_mat', 'MAT.5.2.2'], [8, 'sub_mat', 'MAT.8.1.1'], [8, 'sub_mat', 'MAT.8.3.6'], [6, 'sub_fen', 'FB.6.1.1'], [6, 'sub_fen', 'FB.6.2.3'], [10, 'sub_mat', 'MAT.10.3.1']];
    t.db.exec(`INSERT OR IGNORE INTO subjects(id,code,name,category) VALUES('sub_ing','ING','İngilizce','VERBAL'),('sub_edb','EDB','Türk Dili ve Edebiyatı','VERBAL'),('sub_fiz','FIZ','Fizik','NUMERIC'),('sub_fen','FEN','Fen Bilimleri','NUMERIC')`);
    for (const g of [4, 5, 6, 7, 8, 9, 10, 11, 12]) t.db.exec(`INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,verified,program_code,authority) VALUES('cvt${g}','2027-2028',${g},'MAARIF',1,'SCHOOL','MEB')`);
    codes.forEach(([g, s, c], k) => t.db.exec(`INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,topic,title,official,active) VALUES('ot${k}','cvt${g}','${s}',${g},'${c}','Tanıtım','${c} sentetik',1,1)`));
    t.db.exec(sql);

    const one = (q: string) => t.db.prepare(q).get() as any;
    expect(one(`SELECT name,demo_mode FROM institutions WHERE id='inst_tanitim'`)).toEqual({ name: 'ANUNEX Tanıtım Okulu', demo_mode: 1 });
    expect(one(`SELECT academic_year FROM institution_seasons WHERE id='season_tanitim_2728'`).academic_year).toBe('2027-2028');
    expect(one(`SELECT count(*) n,count(DISTINCT grade_level) g FROM student_enrollments WHERE institution_id='inst_tanitim'`)).toEqual({ n: 72, g: 9 });
    expect(one(`SELECT count(*) n FROM users WHERE id LIKE 'usr_t_%'`).n).toBe(1 + 1 + 1 + 6 + 9 + 1);
    expect(one(`SELECT count(*) n FROM parent_student_links WHERE parent_user_id='usr_t_parent'`).n).toBe(2);
    expect(one(`SELECT enabled FROM institution_feature_overrides WHERE institution_id='inst_tanitim' AND feature_key='LEARNING_UNIVERSE'`).enabled).toBe(1);
    // every TANITIM activity found its outcome, is valid, labelled and waits for approval
    const rows = t.db.prepare(`SELECT c.*,o.grade_level og FROM lu_game_contents c JOIN outcomes o ON o.id=c.outcome_id WHERE c.id LIKE 'luc_tanitim_%'`).all() as any[];
    expect(rows.length).toBe((sql.match(/luc_tanitim_/g) || []).length);
    for (const r of rows) {
      expect(validateContent(r.content_kind, JSON.parse(r.public_json), JSON.parse(r.answer_json)), r.title).toEqual([]);
      expect(r).toMatchObject({ review_status: 'REVIEW', owner_type: 'PLATFORM', copyright_status: 'OWNED', academic_year: '2027-2028', grade_level: r.og });
      expect(r.title).toMatch(/^TANITIM · /);
    }
    // a demo account signs in
    Object.assign(t.env, { SESSION_SECRET: 'synthetic-session-secret' });
    const res = await (app as any).fetch(new Request('https://app.anunex.com/api/auth/login', { method: 'POST', headers: { Origin: 'https://app.anunex.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'ogrenci8.tanitim', password: 'Tanitim.Test!1', turnstileToken: 't' }) }), t.env, { waitUntil() {}, passThroughOnException() {} });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(readFileSync('tmp/tanitim-accounts.txt', 'utf8')).toContain('ogrenci12.tanitim');
  } finally { t.db.close(); }
}, 90000);
