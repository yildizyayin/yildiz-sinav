/**
 * Nibiru Öğrenme Evreni — server-side academic checking (owner, 11 Nov 2026). Pure functions: the client never
 * decides what is right. Each content kind has a public part (sent to the student) and an answer part (kept here).
 *
 *  QUESTION / AUDIO_QUESTION  { correct: 'A' }                     ← { answer: 'A' }
 *  PAIRS (match, memory)      { pairs: [[leftId, rightId], …] }    ← { pairs: [[leftId, rightId], …] }
 *  SEQUENCE (order)           { order: [id, …] }                    ← { order: [id, …] }
 *  CLOZE (fill)               { blanks: { id: Accept } }            ← { blanks: { id: text } }
 *  HOTSPOT (visual)           { target: [regionId…], regions: [{ id, x, y, w, h } | { id, cx, cy, r }] } (0–1 units)
 *                                                                  ← { x, y } (0–1 units)
 *  STEPS (math journey)       { steps: { id: Accept } }             ← { steps: { id: text } }
 *  Accept = { accept?: string[]; numeric?: { value: number; tolerance?: number } }
 * An item is "correct" only when every part is right; `partial` (0–1) is shown to the student, never counted as a pass.
 */
export type Graded = { correct: boolean; partial: number; detail?: unknown };
export type Accept = { accept?: string[]; numeric?: { value: number; tolerance?: number } };

/** Turkish-aware text comparison: case (İ/ı), spaces, typographic quotes/dashes, trailing punctuation. */
export function normalizeAnswer(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[“”«»„]/g, '"').replace(/[‘’`´]/g, "'").replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[\s"'(]+|[\s"'.,;:!?)]+$/g, '')
    .toLocaleLowerCase('tr-TR');
}

const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

/** Numbers as students write them: "3,5", "-2", "1/4", "%25" (→ 25), "2³" (→ 8), "3·10²". Returns null when not a number. */
export function parseNumber(value: unknown): number | null {
  let s = String(value ?? '').trim().replace(/\s+/g, '').replace(/[−–—]/g, '-').replace(/[×·x*]/gi, '*').replace(/÷/g, '/').replace(/^%|%$/g, '');
  if (!s) return null;
  s = s.replace(/([0-9)])([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_, base, sup) => `${base}^${[...sup].map((c) => SUPERSCRIPT[c]).join('')}`);
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');   // 1.250,5 → 1250,5
  s = s.replace(/,/g, '.');
  if (!/^[-+*/^.\d()]+$/.test(s) || s.length > 40) return null;
  // tiny safe evaluator for + - * / ^ and parentheses
  let i = 0;
  const peek = () => s[i];
  const num = (): number => { const m = s.slice(i).match(/^\d+(\.\d+)?|^\.\d+/); if (!m) throw new Error('n'); i += m[0].length; return Number(m[0]); };
  const atom = (): number => { if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error(')'); return v; } if (peek() === '-') { i++; return -atom(); } if (peek() === '+') { i++; return atom(); } return num(); };
  const pow = (): number => { const b = atom(); if (peek() === '^') { i++; return b ** pow(); } return b; };
  const term = (): number => { let v = pow(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = pow(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = (): number => { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  try { const v = expr(); return i === s.length && Number.isFinite(v) ? v : null; } catch { return null; }
}

export function acceptMatches(rule: Accept, given: unknown): boolean {
  if (rule.numeric) {
    const n = parseNumber(given);
    if (n != null && Math.abs(n - rule.numeric.value) <= Math.max(1e-9, rule.numeric.tolerance ?? 1e-9)) return true;
  }
  const g = normalizeAnswer(given);
  return !!g && (rule.accept || []).some((a) => normalizeAnswer(a) === g);
}

const letters = (v: unknown) => String(v ?? '').trim().toLocaleUpperCase('tr-TR');

export function gradeItem(kind: string, answer: any, response: any): Graded {
  switch (kind) {
    case 'QUESTION':
    case 'AUDIO_QUESTION': {
      const ok = !!letters(response?.answer) && letters(response?.answer) === letters(answer?.correct);
      return { correct: ok, partial: ok ? 1 : 0 };
    }
    case 'PAIRS': {
      const want = new Map<string, string>((answer?.pairs || []).map((p: [string, string]) => [String(p[0]), String(p[1])]));
      const seen = new Set<string>(); let right = 0;
      for (const p of Array.isArray(response?.pairs) ? response.pairs : []) {
        const l = String(p?.[0] ?? ''), r = String(p?.[1] ?? '');
        if (seen.has(l)) continue; seen.add(l);
        if (want.get(l) === r) right++;
      }
      return { correct: want.size > 0 && right === want.size, partial: want.size ? right / want.size : 0 };
    }
    case 'SEQUENCE': {
      const want: string[] = (answer?.order || []).map(String), got: string[] = Array.isArray(response?.order) ? response.order.map(String) : [];
      const inPlace = want.filter((id, k) => got[k] === id).length;
      return { correct: want.length > 0 && got.length === want.length && inPlace === want.length, partial: want.length ? inPlace / want.length : 0 };
    }
    case 'CLOZE':
    case 'STEPS': {
      const rules: Record<string, Accept> = (kind === 'CLOZE' ? answer?.blanks : answer?.steps) || {};
      const given: Record<string, unknown> = (kind === 'CLOZE' ? response?.blanks : response?.steps) || {};
      const ids = Object.keys(rules);
      const results = Object.fromEntries(ids.map((id) => [id, acceptMatches(rules[id], given[id])]));
      const right = ids.filter((id) => results[id]).length;
      return { correct: ids.length > 0 && right === ids.length, partial: ids.length ? right / ids.length : 0, detail: results };
    }
    case 'HOTSPOT': {
      const x = Number(response?.x), y = Number(response?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return { correct: false, partial: 0 };
      const hit = (answer?.regions || []).find((r: any) => r.r != null ? (x - r.cx) ** 2 + (y - r.cy) ** 2 <= r.r ** 2 : x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      const ok = !!hit && (answer?.target || []).includes(hit.id);
      return { correct: ok, partial: ok ? 1 : 0 };
    }
    default:
      return { correct: false, partial: 0 };
  }
}

/** Checks a teacher's game content before it can be approved: shape, ids, and that the key fits the public part. */
export function validateContent(kind: string, pub: any, ans: any): string[] {
  const errors: string[] = [];
  const ids = (list: any) => (Array.isArray(list) ? list.map((x: any) => String(x?.id ?? '')) : []);
  const unique = (list: string[]) => list.length === new Set(list).size && list.every(Boolean);
  if (kind === 'PAIRS') {
    const l = ids(pub?.left), r = ids(pub?.right);
    if (l.length < 2 || l.length > 8) errors.push('Eşleştirme 2–8 kart çifti olmalı.');
    if (!unique(l) || !unique(r) || l.length !== r.length) errors.push('Kart kimlikleri benzersiz ve iki taraf eşit sayıda olmalı.');
    const pairs = Array.isArray(ans?.pairs) ? ans.pairs : [];
    if (pairs.length !== l.length || pairs.some((p: any) => !l.includes(String(p?.[0])) || !r.includes(String(p?.[1])))) errors.push('Her sol kartın tek doğru eşi olmalı.');
  } else if (kind === 'SEQUENCE') {
    const it = ids(pub?.items), order = (ans?.order || []).map(String);
    if (it.length < 3 || it.length > 8 || !unique(it)) errors.push('Sıralama 3–8 benzersiz öğe olmalı.');
    if (order.length !== it.length || order.some((id: string) => !it.includes(id))) errors.push('Doğru sıra bütün öğeleri bir kez içermeli.');
  } else if (kind === 'CLOZE' || kind === 'STEPS') {
    const parts = kind === 'CLOZE' ? ids(pub?.blanks) : ids(pub?.steps);
    const rules = (kind === 'CLOZE' ? ans?.blanks : ans?.steps) || {};
    if (!parts.length || parts.length > 8 || !unique(parts)) errors.push(kind === 'CLOZE' ? 'En az bir, en çok sekiz boşluk olmalı.' : 'En az bir, en çok sekiz adım olmalı.');
    for (const id of parts) { const r = rules[id]; if (!r || (!(r.accept || []).length && !r.numeric)) errors.push(`"${id}" için kabul edilen cevap yok.`); }
  } else if (kind === 'HOTSPOT') {
    if (!pub?.image?.url || !(Number(pub?.image?.width) > 0) || !(Number(pub?.image?.height) > 0)) errors.push('Görsel adresi ve boyutu gerekli.');
    if (!pub?.image?.alt) errors.push('Görsel için yazılı açıklama gerekli.');
    const regions = Array.isArray(ans?.regions) ? ans.regions : [];
    if (!regions.length || !unique(regions.map((r: any) => String(r?.id ?? '')))) errors.push('İşaretli bölgeler gerekli.');
    if (!(ans?.target || []).length || (ans.target as any[]).some((id) => !regions.some((r: any) => r.id === id))) errors.push('Doğru bölge işaretli bölgelerden biri olmalı.');
  } else if (kind === 'AUDIO_QUESTION') {
    if (!pub?.transcript) errors.push('Ses yoksa da etkinlik çalışsın diye yazılı metin gerekli.');
    if (!Array.isArray(pub?.options) || pub.options.length < 3 || pub.options.length > 5) errors.push('3–5 seçenek gerekli.');
    if (!/^[A-E]$/.test(letters(ans?.correct)) || 'ABCDE'.indexOf(letters(ans?.correct)) >= (pub?.options?.length || 0)) errors.push('Doğru seçenek seçeneklerden biri olmalı.');
  } else errors.push('Bilinmeyen içerik türü.');
  return errors;
}
