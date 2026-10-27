import { evaluatedExam, SHEETS } from './exam-flow';
import { createSession } from '../../worker/lib/auth';

/** Sonuç ağı operator setup shared by S030/S035 tests: synthetic MEB directory school and a dealer for İstanbul. */
export async function setup(opts: { sheets?: typeof SHEETS } = {}) {
  const t = await evaluatedExam('direct', { outcomes: true, sheets: opts.sheets });
  t.db.exec(`INSERT OR IGNORE INTO exam_channel_publications(id,exam_id,channel,status) VALUES('pub','${t.examId}','RESULT_NETWORK','ACTIVE');
    DELETE FROM exam_institutions WHERE exam_id='${t.examId}';
    INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES('740001','Pendik Deneme Lisesi','PENDIK DENEME LISESI','İstanbul','Pendik','https://www.meb.gov.tr/x');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerI','INSTITUTION_MANAGER','Bayi','u','u',1,NULL);
    INSERT INTO result_network_dealers(id,user_id,status) VALUES('dI','dealerI','APPROVED');
    INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,city) VALUES('sI','dI','CITY','İstanbul');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'dealerI']) cookies[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const result = (await import('../../worker/result-worker-entry')).default as any;
  Object.assign(t.env, { FILES: { put: async () => undefined, delete: async () => undefined, get: async () => null }, RESULT_LOOKUP_SECRET: 'synthetic-lookup-secret' });
  const call = async (who: string, path: string, init: { method?: string; body?: any } = {}) => {
    // users added by a test get a session on first use
    if (!cookies[who]) cookies[who] = (await createSession(t.env, who, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const form = init.body instanceof FormData;
    const r = await result.fetch(new Request(`https://sonuc.anunex.com${path}`, { method: init.method || 'GET', headers: { Cookie: cookies[who], Origin: 'https://sonuc.anunex.com', ...(init.body && !form ? { 'Content-Type': 'application/json' } : {}) }, ...(init.body ? { body: form ? init.body : JSON.stringify(init.body) } : {}) }), t.env, { waitUntil() {} });
    const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: r.status, data, text };
  };
  const line = (s: { no: string; name: string; TUR: string; MAT: string }) => '7108'.padEnd(10) + s.no.padStart(5) + s.name.padEnd(20) + '8A' + ' '.repeat(13) + 'A' + s.TUR.replace(/_/g, ' ').padEnd(20) + ' '.repeat(60) + s.MAT.replace(/_/g, ' ').padEnd(20) + ' '.repeat(20);
  const upload = (who: string, sheets: Array<{ no: string; name: string; TUR: string; MAT: string }>) => { const f = new FormData(); f.set('mebCode', '740001'); f.set('templateVersionId', 'optik-7108-sekonic-v1'); f.set('file', new File([sheets.map(line).join('\r\n')], 'deneme.txt', { type: 'text/plain' })); return call(who, `/api/admin/result-network/operations/exams/${t.examId}/preview-file`, { method: 'POST', body: f }); };
  return { t, call, upload };
}

