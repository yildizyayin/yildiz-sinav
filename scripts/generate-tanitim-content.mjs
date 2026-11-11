// ANUNEX Tanıtım ortamı: more TANITIM activities, so every grade from 4 to 12 has something to play (owner, 11 Nov 2026).
// Written by ANUNEX for the showcase, tied to verified 2027–2028 outcomes by code, labelled "TANITIM" and left waiting
// for the owner's approval in Evren Merkezi. Idempotent (fixed ids). Output: tmp/tanitim-content.sql
import { mkdirSync, writeFileSync } from 'node:fs';

const YEAR = '2027-2028';
const q = (v) => (v == null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const out = [];
let n = 0;
const outcomeOf = (code) => `(SELECT o.id FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE cv.verified=1 AND cv.academic_year=${q(YEAR)} AND o.active=1 AND o.code=${q(code)} LIMIT 1)`;
const content = (code, kind, title, pub, answer) => {
  n++;
  out.push(`INSERT OR REPLACE INTO lu_game_contents (id,content_kind,outcome_id,academic_year,grade_level,subject_id,title,public_json,answer_json,owner_type,owner_id,copyright_status,review_status)
    SELECT ${q(`luc_tanitim_c${n}`)},${q(kind)},o.id,${q(YEAR)},o.grade_level,o.subject_id,${q(`TANITIM · ${title}`)},${q(JSON.stringify(pub))},${q(JSON.stringify(answer))},'PLATFORM',NULL,'OWNED','REVIEW' FROM outcomes o WHERE o.id=${outcomeOf(code)};`);
};
const pairs = (rows) => ({ pub: { left: rows.map((r, k) => ({ id: `l${k + 1}`, text: r[0] })), right: rows.map((r, k) => ({ id: `r${k + 1}`, text: r[1] })) }, answer: { pairs: rows.map((_, k) => [`l${k + 1}`, `r${k + 1}`]) } });
const seq = (prompt, items) => ({ pub: { prompt, items: items.map((t, k) => ({ id: `s${k + 1}`, text: t })) }, answer: { order: items.map((_, k) => `s${k + 1}`) } });
const steps = (problem, rows) => ({ pub: { problem, steps: rows.map(([p], k) => ({ id: `t${k + 1}`, prompt: p })) }, answer: { steps: Object.fromEntries(rows.map(([, a], k) => [`t${k + 1}`, { numeric: { value: a }, accept: [String(a).replace('.', ',')] }])) } });
const cloze = (text, answers) => ({ pub: { text: answers.reduce((t, _, k) => t.replace('[?]', `[b${k + 1}]`), text), blanks: answers.map((_, k) => ({ id: `b${k + 1}` })) }, answer: { blanks: Object.fromEntries(answers.map((a, k) => [`b${k + 1}`, typeof a === 'number' ? { numeric: { value: a }, accept: [String(a)] } : { accept: [a] }])) } });
const add = (code, kind, title, c) => content(code, kind, title, c.pub, c.answer);

// 4. sınıf fen
add('FB.4.4.1', 'PAIRS', 'Hâl değişimleri', pairs([['Buzun suya dönüşmesi', 'Erime'], ['Suyun buza dönüşmesi', 'Donma'], ['Suyun su buharına dönüşmesi', 'Buharlaşma'], ['Su buharının suya dönüşmesi', 'Yoğuşma']]));
add('FB.4.5.1', 'PAIRS', 'Mıknatısın kutupları', pairs([['Aynı kutuplar karşılaşınca', 'Birbirini iter'], ['Zıt kutuplar karşılaşınca', 'Birbirini çeker']]));
// 5. sınıf matematik
add('MAT.5.4.4', 'STEPS', 'Dikdörtgen bahçe', steps('Kısa kenarı 4 m, uzun kenarı 6 m olan dikdörtgen bir bahçe var.', [['Bahçenin çevresi kaç metredir?', 20], ['Bahçenin alanı kaç metrekaredir?', 24]]));
add('MAT.5.4.4', 'STEPS', 'Çit', steps('Çevresi 30 m olan dikdörtgen bir alanın kısa kenarı 5 m.', [['Uzun kenar kaç metredir?', 10], ['Alan kaç metrekaredir?', 50]]));
// 6. sınıf matematik
add('MAT.6.1.2', 'STEPS', '3 ile bölünebilme', steps('Bir sayı, rakamlarının toplamı 3’ün katıysa 3 ile tam bölünür. 4 152 sayısını inceleyelim.', [['4 + 1 + 5 + 2 = ?', 12], ['12 sayısı 3’e bölündüğünde kalan kaçtır?', 0]]));
add('MAT.6.1.3', 'PAIRS', 'Asal çarpanlar', pairs([['24', '2³ · 3'], ['45', '3² · 5'], ['28', '2² · 7']]));
// 7. sınıf matematik ve fen
add('MAT.7.1.7', 'STEPS', 'Elma fiyatı', steps('3 kg elma 90 TL ise 5 kg elma kaç TL’dir?', [['1 kg elma kaç TL?', 30], ['5 kg elma kaç TL?', 150]]));
add('MAT.7.1.3', 'SEQUENCE', 'Rasyonel sayıları sırala', seq('Sayıları küçükten büyüğe sırala.', ['−3/4', '−1/2', '1/3', '3/4']));
add('FB.7.5.5', 'PAIRS', 'Element sembolleri', pairs([['Hidrojen', 'H'], ['Karbon', 'C'], ['Oksijen', 'O'], ['Sodyum', 'Na']]));
add('FB.7.5.8', 'PAIRS', 'Karışımlar', pairs([['Tuzlu su', 'Homojen karışım'], ['Zeytinyağı ve su', 'Heterojen karışım']]));
// 9. sınıf matematik ve fizik
add('MAT.9.1.1', 'CLOZE', 'Kök dışına çıkar', cloze('√50 = [?]√2', [5]));
add('MAT.9.1.1', 'CLOZE', 'Negatif üs', cloze('2⁻³ = 1 / [?]', [8]));
add('FİZ.9.2.2', 'PAIRS', 'Skaler mi vektörel mi?', pairs([['Kütle', 'Skaler'], ['Kuvvet', 'Vektörel']]));
// 11. sınıf matematik
add('MAT.11.3.4', 'CLOZE', 'Logaritma', cloze('log₂ 8 = [?]', [3]));
add('MAT.11.3.4', 'CLOZE', 'Logaritma 2', cloze('log₃ 81 = [?]', [4]));
add('MAT.11.3.4', 'PAIRS', 'Logaritma kartları', pairs([['log₁₀ 100', '2'], ['log₂ 32', '5'], ['log₅ 1', '0']]));
// 12. sınıf matematik
add('MAT.12.1.1', 'STEPS', 'Aritmetik dizi', steps('İlk terimi 3, ortak farkı 4 olan aritmetik dizinin 10. terimini bul.', [['a₁₀ = a₁ + 9d; 9d = ?', 36], ['a₁₀ = ?', 39]]));
add('MAT.12.1.1', 'CLOZE', 'Geometrik dizi', cloze('2, 6, 18, [?], …', [54]));
add('MAT.12.1.1', 'CLOZE', 'Aritmetik dizi', cloze('5, 9, 13, [?], …', [17]));

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/tanitim-content.sql', `${out.join('\n')}\n`);
console.log(`Generated ${n} more TANITIM activities → tmp/tanitim-content.sql`);
