/**
 * A084: a camera reading written back as the fixed-width TXT the optical reader would have produced, in the
 * layout of the same optical definition. Uploading that file goes through the normal TXT evaluation (A025)
 * and gives exactly the same results as the camera batch (round trip).
 */
import type { CanonicalRecord } from '../types';
import { fixedWidthFromDefinition } from './fmt';

type Slice = { start: number; end: number };
type FixedWidth = { recordLength: number; signature?: string; signatureStart?: number; fields: Record<string, Slice>; answers: Record<string, Slice> };

export function fixedWidthDefinition(parserDefinition: string | null | undefined): FixedWidth | null {
  let raw: unknown; try { raw = JSON.parse(parserDefinition || 'null'); } catch { return null; }
  const def = fixedWidthFromDefinition(raw as any) as any;
  if (!def || def.type !== 'fixed-width' || !Number.isInteger(def.recordLength)) return null;
  return { recordLength: def.recordLength, signature: def.signature, signatureStart: def.signatureStart, fields: def.fields || {}, answers: def.answers || {} };
}

/** Earliest run of columns no field or answer block uses, wide enough for the form signature. */
function freeSpan(def: FixedWidth, width: number): number | null {
  const used = new Array(def.recordLength).fill(false);
  for (const s of [...Object.values(def.fields), ...Object.values(def.answers)]) for (let i = Number(s.start); i < Number(s.end); i++) used[i] = true;
  for (let i = 0; i + width <= def.recordLength; i++) if (used.slice(i, i + width).every((u) => !u)) return i;
  return null;
}

export function recordToFixedWidthLine(record: CanonicalRecord, def: FixedWidth): string {
  const line = new Array<string>(def.recordLength).fill(' ');
  const put = (slice: Slice | undefined, value: string | undefined, align: 'left' | 'right' = 'left') => {
    if (!slice || !value) return;
    const width = Number(slice.end) - Number(slice.start);
    const text = [...value].slice(0, width);
    const padded = align === 'right' ? [...new Array(width - text.length).fill(' '), ...text] : [...text, ...new Array(width - text.length).fill(' ')];
    padded.forEach((ch, i) => { line[Number(slice.start) + i] = ch; });
  };
  if (def.signature) {
    const at = Number.isInteger(def.signatureStart) ? def.signatureStart! : freeSpan(def, def.signature.length);
    if (at !== null && at !== undefined) put({ start: at, end: at + def.signature.length }, def.signature);
  }
  put(def.fields.student_number, record.student_number, 'right');
  if (def.fields.name) put(def.fields.name, record.name?.toLocaleUpperCase('tr-TR'));
  else { const [first, ...rest] = (record.name || '').split(' '); put(def.fields.first_name, first); put(def.fields.last_name, rest.join(' ')); }
  put(def.fields.class, record.class_name?.replace(/\s|\//g, ''));
  put(def.fields.booklet, record.booklet);
  for (const [code, slice] of Object.entries(def.answers)) {
    const seq = record.answers_by_subject?.[code] ?? record.answers_by_subject?.[code.toUpperCase()];
    if (seq) put(slice, seq.replace(/_/g, ' '));
  }
  return line.join('');
}

export function recordsToFixedWidthText(records: CanonicalRecord[], def: FixedWidth): string {
  return records.map((r) => recordToFixedWidthLine(r, def)).join('\r\n') + '\r\n';
}
