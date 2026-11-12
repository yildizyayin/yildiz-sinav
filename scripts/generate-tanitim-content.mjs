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

// Rehberlik örnek verisi (owner, 12 Nov 2026): a few meetings, messages, a weekly programme for the 8th grade,
// an annual plan and a screen diary, so the guidance screens can be shown. Invented, fixed ids, dates relative to today.
const G = 'usr_t_guidance', INST = 'inst_tanitim';
const monday = "date('now','+3 hours','-6 days','weekday 1')";
const at = (days, time) => `strftime('%Y-%m-%dT', date('now','+3 hours','${days >= 0 ? '+' : ''}${days} days')) || '${time}'`;
const gsql = [];
gsql.push(`INSERT OR REPLACE INTO guidance_meetings(id,institution_id,counselor_id,kind,area,topic,title,scheduled_at,status,summary,next_step,follow_up_date) VALUES
 ('gmt_t1',${q(INST)},${q(G)},'INDIVIDUAL','ACADEMIC','EXAM','Deneme sonrası değerlendirme',${at(0, '10:30')},'PLANNED',NULL,NULL,NULL),
 ('gmt_t2',${q(INST)},${q(G)},'PARENT','SOCIAL_EMOTIONAL','SCREEN',NULL,${at(0, '14:00')},'PLANNED',NULL,NULL,NULL),
 ('gmt_t3',${q(INST)},${q(G)},'GROUP','SOCIAL_EMOTIONAL','EXAM_ANXIETY','Sınav heyecanı grup çalışması',${at(2, '11:00')},'PLANNED',NULL,NULL,NULL),
 ('gmt_t4',${q(INST)},${q(G)},'INDIVIDUAL','ACADEMIC','STUDY',NULL,${at(-10, '09:00')},'DONE','Çalışma düzeni konuşuldu; hafta içi kısa tekrarlar önerildi.','İki hafta sonra yeniden görüş',date('now','+3 hours','+3 days'))`);
gsql.push(`INSERT OR REPLACE INTO guidance_meeting_students(meeting_id,student_id) VALUES('gmt_t1','stu_t8_1'),('gmt_t2','stu_t8_2'),('gmt_t3','stu_t8_3'),('gmt_t3','stu_t8_4'),('gmt_t3','stu_t8_5'),('gmt_t4','stu_t12_1')`);
gsql.push(`INSERT OR REPLACE INTO guidance_messages(id,institution_id,class_id,student_id,sender_user_id,sender_role,anonymous,category,body,urgent,status) VALUES
 ('gms_t1',${q(INST)},'cls_t8a',NULL,NULL,'STUDENT',1,'PEER_BULLYING','TANITIM · Teneffüste bir arkadaşımıza sürekli lakap takılıyor ve oyunlara alınmıyor.',1,'NEW'),
 ('gms_t2',${q(INST)},'cls_t8a','stu_t8_1','usr_t_stu8','STUDENT',0,'STUDY','TANITIM · Matematikte çok zorlanıyorum, görüşebilir miyiz?',0,'NEW')`);
gsql.push(`INSERT OR REPLACE INTO guidance_programs(id,institution_id,student_id,week_start,status,weekly_target,note,created_by,given_by,given_at) VALUES('gpr_t1',${q(INST)},'stu_t8_1',${monday},'GIVEN',200,'TANITIM · Pazar günü yanlışlarını tekrar etmeyi unutma.',${q(G)},${q(G)},CURRENT_TIMESTAMP)`);
const rows = [[1, 'sub_mat', 'Üslü ifadeler', 'ANUNEX', 'Soru Çöz', 30, 'WEAK', 'Son denemelerde bu kazanımda 6 sorudan 4’ü yanlış ya da boş.'], [1, 'sub_tur', 'Paragrafta ana düşünce', 'MAVI_FOY', 'Mavi Föy', 20, 'WORKSHEET', 'Bu haftanın föy takviminde.'],
  [2, 'sub_fen', 'Basit makineler', 'ANUNEX', 'Soru Çöz', 25, 'WEAK', 'Son denemelerde bu kazanımda 5 sorudan 3’ü yanlış ya da boş.'], [3, 'sub_mat', 'Kareköklü ifadeler', 'MAVI_FOY', 'Mavi Föy', 25, 'SUPPORT', 'Bu kazanımda destek döngüsü devam ediyor.'],
  [4, 'sub_tur', 'Cümlede anlam', 'MAVI_FOY', 'Mavi Föy', 20, 'WORKSHEET', 'Bu haftanın föy takviminde.'], [5, 'sub_mat', 'Pisagor bağıntısı', 'ANUNEX', 'Soru Çöz', 25, 'WEAK', 'Son denemelerde bu kazanımda 4 sorudan 3’ü yanlış ya da boş.'],
  [6, 'sub_tur', 'Sözcükte anlam', 'SIFIR_HATA', 'Sıfır Hata', 20, 'WEAK', 'Son denemelerde bu kazanımda 4 sorudan 2’si yanlış ya da boş.'], [7, null, 'Haftanın yanlışlarını tekrar', 'ANUNEX', 'Yanlış / Boş Sorularım', 35, 'REVIEW', 'Hafta içinde yanlış yapılan ve boş bırakılan soruların tekrarı.']];
rows.forEach((r, k) => gsql.push(`INSERT OR REPLACE INTO guidance_program_items(id,program_id,day,subject_id,topic,source,source_detail,target_count,origin,kind,reason,sort) SELECT ${q(`gpi_t${k}`)},'gpr_t1',${r[0]},${r[1] ? `(SELECT id FROM subjects WHERE id=${q(r[1])})` : 'NULL'},${q(r[2])},${q(r[3])},${q(r[4])},${r[5]},'SYSTEM',${q(r[6])},${q(r[7])},${k}`));
gsql.push(`INSERT OR IGNORE INTO guidance_annual_plans(id,institution_id,academic_year,theme,priorities,updated_by) VALUES('gap_t','${INST}','2027-2028',NULL,'TANITIM · Akran ilişkileri, sınav kaygısı, ekran kullanımı',${q(G)})`);
gsql.push(`INSERT OR REPLACE INTO guidance_plan_entries(id,plan_id,month,kind,area,title,grade_min,grade_max,status) VALUES('gpe_t1','gap_t',9,'SURVEY','ACADEMIC','Öğrenci bilgi formu',4,12,'DONE'),('gpe_t2','gap_t',11,'PARENT_SEMINAR','SOCIAL_EMOTIONAL','Ekran ve uyku veli semineri',NULL,NULL,'PLANNED'),('gpe_t3','gap_t',11,'CLASS_ACTIVITY','SOCIAL_EMOTIONAL','Zorbalığa seyirci kalma',5,8,'PLANNED'),('gpe_t4','gap_t',3,'CAREER','CAREER','Meslekleri tanıyorum',6,8,'PLANNED'),('gpe_t5','gap_t',5,'SURVEY','ACADEMIC','RİBA uygulaması',NULL,NULL,'PLANNED')`);
for (let k = 0; k < 6; k++) gsql.push(`INSERT OR REPLACE INTO guidance_screen_logs(student_id,institution_id,log_date,entered_by,screen_minutes,bedtime) VALUES('stu_t8_2',${q(INST)},date('now','+3 hours','-${k} days'),'STUDENT',${280 + k * 10},'00:${String(10 + k).padStart(2, '0')}')`);
out.push(...gsql.map((x) => `${x};`));

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/tanitim-content.sql', `${out.join('\n')}\n`);
console.log(`Generated ${n} more TANITIM activities → tmp/tanitim-content.sql`);
