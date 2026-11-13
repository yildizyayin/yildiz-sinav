/**
 * Nibiru — kişisel veri göndermeyen mod (owner, 13 Nov 2026).
 *
 * In production the full AI layer waits for the KVKK approval of the "Nibiru AI" processor, so every answer used to
 * come from fixed rules ("robot gibi", "aynı cevabı tekrarlıyor"). The owner chose a mode that sends no personal
 * data at all:
 *  - questions about the person's own data (nets, exams, weak outcomes, plan, class status) are answered by ANUNEX
 *    itself from the verified data, in varied, natural Turkish, with real actions (video segment, programme, write to
 *    the guidance teacher);
 *  - knowledge and conversation (explain a topic, ask me questions, how should I study, I'm bored …) go to Cloudflare
 *    Workers AI with ONLY: the message with names/e-mails/phones removed, the role, the grade level and the
 *    specialist's persona, plus the last few turns (also cleaned). No exam result, outcome success or identity.
 * Cloudflare's Workers AI terms set no age limit (unlike the Gemini API). The five specialists (Eğitim Koçu, Branş
 * Öğretmeni, Rehber Öğretmen, Veli Akademik Rehber, Kurum Akademik İçgörü) each get their own voice and limits.
 */
import type { AuthUser, Env } from '../types';
import { one } from './db';
import { redactDirectIdentifiers } from './privacy-minimization';
import { runNibiruInference, type chooseNibiruModelDecision } from './nibiru-model-router';
import { chatHistory, saveTurns, backActions, titleName, type NibiruAction } from './nibiru-gemini';
import type { NibiruSpecialist } from './nibiru-specialists';

const lower = (s: string) => String(s || '').toLocaleLowerCase('tr-TR');
export const trNum2 = (v: unknown, d = 2) => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(Number(v).toFixed(d)).toLocaleString('tr-TR', { maximumFractionDigits: d }));

/** A question about the person's own data (answered by ANUNEX), not general knowledge (answered by the model). */
export function isDataQuestion(message: string, intent: string) {
  if (['LATEST_EXAM', 'WEAK_OUTCOMES', 'TODAY_PLAN', 'STUDENT_GENERAL', 'CLASS_SUMMARY', 'INSTITUTION_SUMMARY', 'TODAY_STATUS', 'SENSITIVE_LABEL'].includes(intent)) return true;
  const m = lower(message);
  if (/(anlat|nedir|ne demek|nasıl (çözülür|yapılır|hesaplanır|bulunur|destek|çalış)|örnek ver|soru sor|soru hazırla|test et|açıkla|formül|kural(ı|lar)|ders planı|etkinlik|hazırla|öner(ir misin|ebilir misin| misin)|fikir|ipucu|taktik)/.test(m) && !/(net(im|ler|leri)|puan(ım)?|sonuç(um|ları)?|sınav(ım|ımda|ı)|deneme(m|mde))/.test(m)) return false;
  return /(net(im|ler|leri|i)?\b|puan|sonuç|sınav(ım|ımda|ı)|deneme(m|mde)?\b|zayıf|zorlan|eksi(ğ|k)|gelişim|başarı|sıra(m|lama)|ödev|föy|program|plan(ım)?\b|hedef|çocuğum|oğlum|kızım|sınıf(ım|ımın|lar)|öğrencilerim|kurum(um)?|nasıl gidiyor|durum(um|u))/.test(m);
}

/** ANUNEX's own answer from verified data — varied, specific, no repeated stock sentence. */
export function dataAnswer(message: string, user: AuthUser, context: any): { answer: string; suggestions: string[]; videoOutcome?: string } | null {
  const m = lower(message);
  const you = user.role === 'STUDENT';
  if (context?.student) {
    const s = context.student; const name = titleName(s.first_name);
    const exams = context.exams || []; const latest = exams[0]; const prev = exams[1];
    const allWeak = context.weakOutcomes || [];
    // "matematikte en zayıf konum" → only that subject's outcomes, when it has any
    const asked = allWeak.filter((w: any) => w.subject_name && m.includes(lower(String(w.subject_name)).slice(0, 5)));
    const weak = (asked.length ? asked : allWeak).slice(0, 3);
    const subj = [...(context.subjects || [])].sort((a: any, b: any) => Number(a.success_percent) - Number(b.success_percent));
    const who = you ? '' : `${name} `;
    if (!latest) return { answer: you ? 'Henüz sonucu açıklanmış bir sınavın görünmüyor. İlk deneme sonucun gelince birlikte bakarız.' : `${name} için henüz sonucu açıklanmış bir sınav görünmüyor.`, suggestions: you ? ['Bugün ne çalışayım?', 'Bir konuyu anlatır mısın?'] : [] };
    const trend = prev && latest.net != null && prev.net != null ? Number(latest.net) - Number(prev.net) : null;
    const trendText = trend == null ? '' : Math.abs(trend) < 0.25 ? ` Bir önceki denemeyle (${prev.title}) hemen hemen aynı.` : trend > 0 ? ` Bir önceki denemeye göre ${trNum2(trend)} net artış var${you ? ', güzel gidiyorsun!' : '.'}` : ` Bir önceki denemeye göre ${trNum2(-trend)} net düşüş var; ${you ? 'moralini bozma, nedenine birlikte bakalım.' : 'birlikte nedenine bakılabilir.'}`;
    const weakList = weak.map((w: any) => `- **${w.subject_name}**: ${String(w.title).replace(/\.$/, '')} (%${ratePct(w.avg_success)})`).join('\n');
    if (/(zayıf|zorlan|eksi(ğ|k)|hangi (konu|ders|kazanım))/.test(m)) {
      if (!weak.length) return { answer: `${you ? 'Kazanım' : `${name} için kazanım`} düzeyinde henüz yeterli kanıt yok; birkaç sınav daha sonra daha net görünecek.`, suggestions: [] };
      return { answer: `${you ? 'Son sınavlarına göre' : `${name} için son sınavlara göre`} en çok pekiştirme isteyen yerler:\n${weakList}\n\n${you ? 'İstersen ilkinden başlayalım: kısa bir video bölümü izleyip birkaç soru çözebilirsin.' : 'Bunlar bir eksiklik etiketi değil, sıradaki öğrenme adımları.'}`, suggestions: you ? [`${weak[0].subject_name} konusunu anlatır mısın?`, 'Bugün ne çalışayım?'] : ['Evde nasıl destek olabilirim?'], videoOutcome: weak[0]?.code };
    }
    if (/(düş|art|gelişim|ilerle|yüksel|iyileş)/.test(m) && trend != null) {
      return { answer: `${who ? `${name}, ` : ''}son denemede (${latest.title}) ${trNum2(latest.net)} net.${trendText}${subj[0] ? `\n\nEn çok fark yaratabilecek ders şu an **${subj[0].name}** (%${trNum2(subj[0].success_percent, 0)}).` : ''}`.replace(/^, /, ''), suggestions: you ? ['Hangi konularda zorlanıyorum?', 'Bugün ne çalışayım?'] : ['Hangi konularda zorlanıyor?'], videoOutcome: weak[0]?.code };
    }
    const best = subj[subj.length - 1];
    return {
      answer: `${you ? 'Son denemen' : `${name} son denemede`} **${latest.title}**: ${trNum2(latest.net)} net${latest.score != null ? `, ${trNum2(latest.score)} puan` : ''} (${latest.correct_count} doğru, ${latest.wrong_count} yanlış, ${latest.blank_count} boş).${trendText}${best && subj.length > 1 ? `\n\nEn iyi giden ders **${best.name}** (%${trNum2(best.success_percent, 0)}), en çok destek isteyen **${subj[0].name}** (%${trNum2(subj[0].success_percent, 0)}).` : ''}${weak[0] ? `\n\nÖnce şuna bakmanı öneririm: ${weak[0].subject_name} · ${String(weak[0].title).replace(/\.$/, '')}.` : ''}`,
      suggestions: you ? ['Hangi konularda zorlanıyorum?', 'Bugün ne çalışayım?'] : ['Hangi konularda zorlanıyor?', 'Evde nasıl destek olabilirim?'],
      videoOutcome: you ? weak[0]?.code : undefined,
    };
  }
  if (context?.classes) {
    if (!context.classes.length) return { answer: 'Yetki alanınızda henüz bir sınıf görünmüyor. Kurum yöneticinizden sınıf/ders atamanızı kontrol etmesini isteyebilirsiniz.', suggestions: [] };
    const recent = (context.recent || []).slice(0, 3); const weak = (context.weakOutcomes || []).slice(0, 3);
    return {
      answer: `${context.classes.map((c: any) => `${c.name} (${c.student_count} öğrenci)`).join(', ')} sınıflarınız var.${recent.length ? `\n\nSon sınavlar:\n${recent.map((r: any) => `- ${r.title}${r.subject_name ? ` · ${r.subject_name}` : ''}: ortalama başarı %${trNum2(r.avg_success, 0)} (${r.student_count} öğrenci)`).join('\n')}` : ''}${weak.length ? `\n\nEn çok zorlanılan kazanımlar:\n${weak.map((w: any) => `- ${w.subject_name}: ${String(w.title).replace(/\.$/, '')} — %${ratePct(w.avg_success)} (${w.student_count} öğrenci)`).join('\n')}` : '\n\nKazanım düzeyinde henüz yeterli sonuç yok.'}`,
      suggestions: ['Bu kazanım için nasıl bir etkinlik yapabilirim?', 'Zorlanan öğrencilere nasıl destek olayım?'],
    };
  }
  if (context?.institution) return { answer: `${context.institution.name}: ${context.activeStudents} aktif öğrenci, ${context.activeClasses} sınıf.${context.pendingScans ? ` ${context.pendingScans} optik okuma bekliyor.` : ''}${context.todayExams ? ` Bugün ${context.todayExams} sınav var.` : ''}${(context.recentExams || []).length ? `\n\nSon sınavlar:\n${context.recentExams.slice(0, 3).map((e: any) => `- ${e.title}: ortalama ${trNum2(e.avg_net)} net (${e.result_count} sonuç)`).join('\n')}` : ''}`, suggestions: ['Bekleyen optikler var mı?'] };
  return null;
}

const PERSONA: Record<NibiruSpecialist, string> = {
  NIBIRU_CORE: 'Genel akademik asistansın; kısa ve yönlendirici ol.',
  EDUCATION_COACH: 'Eğitim koçusun: çalışma planı, zaman yönetimi, motivasyon ve verimli çalışma tekniklerinde (Pomodoro, aralıklı tekrar, yanlış defteri) somut, küçük adımlar öner.',
  SUBJECT_TEACHER: 'Branş öğretmenisin: konuyu MEB müfredatına ve sınıf düzeyine uygun, örnekle, adım adım anlat; istenirse çoktan seçmeli (A-D) soru sor ve cevabı hemen verme.',
  GUIDANCE_COUNSELOR: 'Rehber öğretmen gibi destekleyicisin: duyguyu önce anla, yargılama, küçük bir adım öner; meslek ve lise/üniversite tercihlerinde genel bilgi ver. Teşhis koyma; ciddi bir sıkıntıda okuldaki rehber öğretmenle konuşmayı öner.',
  PARENT_GUIDE: 'Veli akademik rehberisin: veliye çocuğunu evde nasıl destekleyeceğini sade, uygulanabilir, suçlamayan bir dille anlat (rutin, ortam, iletişim, ekran süresi).',
  INSTITUTION_INSIGHT: 'Kurum akademik içgörü uzmanısın: okul yöneticisine ölçme-değerlendirme, sınav planlama ve öğretmen iş birliği konusunda kısa, uygulanabilir öneriler ver.',
};

export function knowledgePrompt(role: string, specialist: NibiruSpecialist, grade: number | null) {
  const you = role === 'STUDENT' ? 'Öğrenciye "sen" diye, samimi bir abi/abla gibi konuş.' : 'Kullanıcıya "siz" diye, sıcak ama saygılı konuş.';
  return `Sen Nibiru'sun: ANUNEX'in akademik asistanı. Türkçe konuş. ${you} ${PERSONA[specialist] || PERSONA.NIBIRU_CORE}
${grade ? `Kullanıcının sınıf düzeyi: ${grade}. sınıf. Anlatımını buna göre ayarla.` : ''}
Kurallar:
- Kısa ve doğal yaz: 2-5 cümlelik paragraflar, gerekirse "- " ile madde. Kalıp cümle ve gereksiz selamlama yok; önceki cevaplarını tekrarlama.
- Kişinin sınav sonuçlarını, netlerini ya da notlarını BİLMİYORSUN; bunları sorarsa "Sonuçlarını sorman yeterli, ben sistemden bakarım" de. Asla sayı uydurma.
- Konu anlatımında en fazla ~180 kelime, sonunda tek bir kısa kontrol sorusu.
- Duygu paylaşılırsa önce anlayış göster. Tıbbi/psikolojik teşhis koyma. Kendine ya da başkasına zarar söz konusuysa okuldaki rehber öğretmene ve 112'ye yönlendir.
- Kişisel bilgi (ad, telefon, adres, şifre) isteme. Kapsam dışı konularda (siyaset, tartışmalı dinî konular, flört, şiddet, kopya) nazikçe derse dön.
Cevabın sonuna, yeni bir satırda, kullanıcının sorabileceği en fazla 2 kısa takip sorusunu şöyle yaz: "ÖNERİ: ...".`;
}

function knownNames(user: AuthUser, context: any) {
  const out = String(user.display_name || '').split(/\s+/);
  if (context?.student) out.push(String(context.student.first_name || ''), String(context.student.last_name || ''));
  return out.filter((x) => x.length >= 3);
}
/** outcome_results.success_rate is 0–1; shown as a whole percent */
const ratePct = (v: unknown) => trNum2(Number(v) <= 1 ? Number(v) * 100 : Number(v), 0);
export function clean(text: string, names: string[]) { return redactDirectIdentifiers(String(text || ''), names).text.replace(/\b0?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, '[telefon]'); }

export async function knowledgeAnswer(env: Env, user: AuthUser, message: string, channelKey: string, context: any, decision: ReturnType<typeof chooseNibiruModelDecision>): Promise<{ answer: string; suggestions: string[] } | null> {
  if (!env.AI) return null;
  const settings = await one<any>(env.DB.prepare(`SELECT enabled FROM nibiru_settings WHERE id='platform'`)).catch(() => null);
  if (settings && !settings.enabled) return null;
  const names = knownNames(user, context);
  const grade = context?.student?.grade_level ?? (context?.classes?.[0]?.grade_level ?? null);
  const history = (await chatHistory(env, user.id, `${channelKey}:bilgi`).catch(() => [])).slice(-6);
  const messages = [
    { role: 'system' as const, content: knowledgePrompt(user.role, decision.specialist, grade ? Number(grade) : null) },
    ...history.map((h: any) => ({ role: (h.speaker === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant', content: clean(h.text, names).slice(0, 1200) })),
    { role: 'user' as const, content: clean(message, names).slice(0, 1500) },
  ];
  // Workers AI only — no external provider ever gets this conversation
  const local = { ...decision, candidates: decision.candidates.filter((c) => !['GROQ', 'CUSTOM'].includes(String(c.family))) };
  if (!local.candidates.length) return null;
  const inference = await runNibiruInference(env, local, messages as any, { role: user.role, intent: 'KNOWLEDGE', environment: env.ENVIRONMENT || 'unknown', privacyRedactions: 0 } as any).catch(() => null);
  const raw = String(inference?.text || '').trim();
  if (!raw) return null;
  const lines = raw.split('\n');
  const suggestions = lines.filter((l) => /^\s*ÖNERİ\s*:/i.test(l)).map((l) => l.replace(/^\s*ÖNERİ\s*:\s*/i, '').replace(/^["“]|["”]$/g, '').trim()).filter(Boolean).slice(0, 3);
  const answer = lines.filter((l) => !/^\s*ÖNERİ\s*:/i.test(l)).join('\n').replace(/^Nibiru\s*[:·-]\s*/i, '').trim();
  if (!answer) return null;
  await saveTurns(env, user.id, `${channelKey}:bilgi`, message, answer).catch(() => undefined);
  return { answer, suggestions };
}

export async function dataActions(env: Env, user: AuthUser, context: any, videoOutcome?: string): Promise<NibiruAction[]> {
  const raw: any[] = [];
  if (videoOutcome) raw.push({ type: 'VIDEO', outcome: videoOutcome });
  if (user.role === 'STUDENT' || user.role === 'PARENT') raw.push({ type: 'PLAN' });
  return backActions(env, user, raw, context);
}
