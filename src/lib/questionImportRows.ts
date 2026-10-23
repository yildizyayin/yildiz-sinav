/**
 * A082: turn a spreadsheet/JSON table into import rows. Turkish and English column headers are accepted;
 * unknown columns are ignored and nothing is filled in by guess — the server validates every row.
 */
const HEADERS: Record<string, string> = {
  kaynak: 'sourceLabel', 'kaynak etiketi': 'sourceLabel', source: 'sourceLabel', sourcelabel: 'sourceLabel',
  'sınıf': 'gradeLevel', sinif: 'gradeLevel', grade: 'gradeLevel', gradelevel: 'gradeLevel',
  'kazanım': 'outcomeCode', 'kazanım kodu': 'outcomeCode', kazanim: 'outcomeCode', 'kazanim kodu': 'outcomeCode', outcome: 'outcomeCode', outcomecode: 'outcomeCode',
  'soru': 'stem', 'soru kökü': 'stem', 'soru koku': 'stem', stem: 'stem',
  a: 'optionA', b: 'optionB', c: 'optionC', d: 'optionD', e: 'optionE', optiona: 'optionA', optionb: 'optionB', optionc: 'optionC', optiond: 'optionD', optione: 'optionE',
  'doğru cevap': 'correctAnswer', 'dogru cevap': 'correctAnswer', cevap: 'correctAnswer', answer: 'correctAnswer', correctanswer: 'correctAnswer',
  'çözüm': 'solution', cozum: 'solution', solution: 'solution',
  zorluk: 'difficultyLevel', difficulty: 'difficultyLevel', difficultylevel: 'difficultyLevel',
  telif: 'copyrightStatus', 'telif durumu': 'copyrightStatus', copyright: 'copyrightStatus', copyrightstatus: 'copyrightStatus',
};
export const headerKey = (h: string) => HEADERS[h.toLocaleLowerCase('tr-TR').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim()] ?? HEADERS[h.toLowerCase().replace(/[^a-z]/g, '')] ?? null;

export function toImportRows(table: Record<string, unknown>[]): Record<string, unknown>[] {
  return table.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r || {})) { const key = headerKey(k); if (key && v !== undefined && v !== null && String(v).trim() !== '') out[key] = typeof v === 'string' ? v.trim() : v; }
    return out;
  }).filter((r) => Object.keys(r).length > 0);
}

/** JSON may be an array of rows or {rows:[...]}/{questions:[...]}. */
export function rowsFromJson(text: string): Record<string, unknown>[] {
  const v = JSON.parse(text);
  const list = Array.isArray(v) ? v : Array.isArray(v?.rows) ? v.rows : Array.isArray(v?.questions) ? v.questions : null;
  if (!list) throw new Error('JSON bir dizi ya da { rows: [...] } olmalı.');
  return toImportRows(list);
}
