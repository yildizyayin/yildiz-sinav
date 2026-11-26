/**
 * İçerik Paketi: reads the package folder the owner selects (Kazanimlar/<KOD>/Sorular.json + media) into the shape the
 * server takes, one outcome at a time. Nothing is guessed: a question keeps the package's own id, answer and media
 * hashes; the server re-checks everything and hashes every file itself.
 */
export type PkgMedia = { sha256: string; bytes: number; path: string };
export type PkgQuestion = { id: string; outcome: string; stem: string; options: Record<string, string>; answer: string; solution: string; hint: string | null; difficulty: number; image: (PkgMedia & { alt: string }) | null; video: PkgMedia | null };
export type PkgOutcome = { code: string; grade: number; sourceLabel: string; topic: (PkgMedia & { seconds: number | null }) | null; questions: PkgQuestion[] };

const med = (v: any): PkgMedia | null => (v && v.sha256 && v.dosya ? { sha256: String(v.sha256).toLowerCase(), bytes: Number(v.bayt), path: String(v.dosya) } : null);

/** One Sorular.json → one outcome. */
export function outcomeFromJson(text: string): PkgOutcome {
  const d = JSON.parse(text);
  const k = d?.kazanim, list = Array.isArray(d?.sorular) ? d.sorular : null;
  if (!k?.kod || !list) throw new Error('Sorular.json beklenen biçimde değil (kazanim + sorular).');
  const code = String(k.kod);
  const grade = Number(code.split('.')[1]);
  const label = String(list[0]?.kaynak_etiketi || '').replace(/\s*·\s*[A-Z]{2,4}\d{3,4}-\d{2,3}\s*$/, '').trim();
  const topic = med(k.konu_anlatimi);
  return {
    code, grade, sourceLabel: label || 'ANUNEX içerik paketi',
    topic: topic ? { ...topic, seconds: k.sure_saniye != null ? Number(k.sure_saniye) : null } : null,
    questions: list.map((q: any) => {
      const image = med(q.gorsel);
      return {
        id: String(q.id), outcome: String(q.kazanim), stem: String(q.soru ?? ''), options: q.secenekler || {}, answer: String(q.dogru_cevap ?? ''),
        solution: String(q.yazili_cozum ?? ''), hint: q.ipucu ? String(q.ipucu) : null, difficulty: Number(q.zorluk),
        image: image ? { ...image, alt: String(q.gorsel_aciklamasi || 'Soru görseli') } : null, video: med(q.cozum_videosu),
      };
    }),
  };
}

/** The selected folder's files, found by the package path (the folder's own name in front is ignored). */
export function fileIndex(files: Array<{ name: string; webkitRelativePath?: string }>) {
  const map = new Map<string, any>();
  for (const f of files) {
    const p = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    const at = p.indexOf('Kazanimlar/');
    map.set(at >= 0 ? p.slice(at) : p, f);
  }
  return map;
}

export const packageName = (o: PkgOutcome) => `${o.code.split('.')[0].toLowerCase()}-${o.grade}`;
export const mimeOf = (path: string) => (/\.jpe?g$/i.test(path) ? 'image/jpeg' : /\.png$/i.test(path) ? 'image/png' : 'video/mp4');

/** What the server's preview / commit take for one outcome. */
export function requestBody(o: PkgOutcome, pkg: string, copyrightStatus: string, confirm = false) {
  const strip = (m: any) => (m ? { sha256: m.sha256, bytes: m.bytes } : null);
  return {
    package: pkg, gradeLevel: o.grade, sourceLabel: o.sourceLabel, copyrightStatus,
    outcome: { code: o.code, topic: o.topic ? { ...strip(o.topic), seconds: o.topic.seconds } : null },
    questions: o.questions.map((q) => ({ ...q, image: q.image ? { ...strip(q.image), alt: q.image.alt } : null, video: strip(q.video) })),
    ...(confirm ? { confirm: true } : {}),
  };
}

/** sha → package path for every file of the outcome. */
export function mediaPaths(o: PkgOutcome) {
  const m = new Map<string, string>();
  if (o.topic) m.set(o.topic.sha256, o.topic.path);
  for (const q of o.questions) { if (q.image) m.set(q.image.sha256, q.image.path); if (q.video) m.set(q.video.sha256, q.video.path); }
  return m;
}
