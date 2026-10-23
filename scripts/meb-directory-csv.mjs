// S019: turns MEB's public school list (CSV with il, ilce, okul_adi, kurum_kodu, okul_turu, web_sitesi) into the
// Result Network directory template (MEB Kodu;Kurum Adı;İl;İlçe;Kurum Türü;Mülkiyet;Eğitim Seviyesi;Resmi URL).
// Only schools that sit exams (primary to high school) are kept; offices, guesthouses and centres are left out.
// Usage: node scripts/meb-directory-csv.mjs <meb-okullar.csv> <out.csv>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SCHOOL_LEVELS = {
  'İlkokul': 'İLKOKUL',
  'Ortaokul': 'ORTAOKUL', 'İmam Hatip Ortaokulu': 'ORTAOKUL',
  'Anadolu Lisesi': 'LİSE', 'Mesleki ve Teknik Anadolu Lisesi': 'LİSE', 'Anadolu İmam Hatip Lisesi': 'LİSE', 'Çok Programlı Anadolu Lisesi': 'LİSE',
  'Fen Lisesi': 'LİSE', 'Lise': 'LİSE', 'Spor Lisesi': 'LİSE', 'Güzel Sanatlar Lisesi': 'LİSE', 'Sosyal Bilimler Lisesi': 'LİSE',
};

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; continue; }
    if (c === '"') quoted = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const clean = (v) => String(v ?? '').replace(/[;\r\n"]/g, ' ').replace(/\s+/g, ' ').trim();

export function toDirectoryRows(records) {
  const seen = new Set(); const out = [];
  for (const r of records) {
    const level = SCHOOL_LEVELS[r.okul_turu];
    const code = String(r.kurum_kodu || '').trim();
    if (!level || !/^\d{5,12}$/.test(code) || seen.has(code) || !r.okul_adi || !r.il || !r.ilce) continue;
    seen.add(code);
    const url = /^https:\/\//.test(r.web_sitesi || '') ? r.web_sitesi : '';
    out.push([code, clean(r.okul_adi), clean(r.il), clean(r.ilce), clean(r.okul_turu), /^özel\s/i.test(r.okul_adi) ? 'PRIVATE' : 'PUBLIC', level, clean(url)]);
  }
  return out;
}

export function toCsv(rows) {
  return '﻿' + ['MEB Kodu;Kurum Adı;İl;İlçe;Kurum Türü;Mülkiyet;Eğitim Seviyesi;Resmi URL', ...rows.map((r) => r.join(';'))].join('\n') + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error('Kullanım: node scripts/meb-directory-csv.mjs <meb-okullar.csv> <cikti.csv>'); process.exit(1); }
  const rows = toDirectoryRows(parseCsv(readFileSync(input, 'utf8')));
  writeFileSync(output, toCsv(rows));
  console.log(JSON.stringify({ written: rows.length }));
}
