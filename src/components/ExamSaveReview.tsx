import type { ParsedAnswerEntry } from '../lib/guidedDefinitions';

type Subject = { subjectId: string; questionCount: number; questionStart?: number; optionCount: number };
export function reviewExamInputs(subjects: Subject[], booklets: string, entries: ParsedAnswerEntry[], mappings: { subjectId: string; questionNo: number; outcomeId: string }[]) {
  const codes = [...new Set(booklets.split(',').map(b => b.trim().toUpperCase()).filter(Boolean))];
  const keyChecks = codes.map(code => {
    let actual = 0; let expected = 0; let validShape = true;
    for (const subject of subjects) {
      const entry = entries.find(e => e.subjectId === subject.subjectId && e.bookletCode === code);
      expected += subject.questionCount;
      if (!entry || entry.answers.length !== subject.questionCount || (entry.optionCount && entry.optionCount !== subject.optionCount)) validShape = false;
      for (let index = 0; index < subject.questionCount; index++) {
        const accepted = entry?.acceptedAnswers?.[index];
        const answers = Array.isArray(accepted) ? accepted : accepted ? [accepted] : [entry?.answers?.[index] || ''];
        const validAnswer = subject.optionCount === 4 ? /^[ABCD]$/ : /^[ABCDE]$/;
        if (validAnswer.test(entry?.answers?.[index] || '') && answers.length > 0 && answers.every(answer => validAnswer.test(answer))) actual++;
      }
    }
    return { code, actual, expected, complete: validShape && expected > 0 && actual === expected };
  });
  const expectedOutcomes = subjects.reduce((total, subject) => total + subject.questionCount, 0);
  const mapped = new Set(mappings.filter(m => m.outcomeId && subjects.some(s => s.subjectId === m.subjectId && m.questionNo >= (s.questionStart || 1) && m.questionNo < (s.questionStart || 1) + s.questionCount)).map(m => `${m.subjectId}:${m.questionNo}`)).size;
  return { keyChecks, mapped, expectedOutcomes, warnings: !keyChecks.length || keyChecks.some(k => !k.complete) || mapped < expectedOutcomes };
}
export function ExamSaveReview({ review, strict, busy, onCancel, onConfirm }: { review: ReturnType<typeof reviewExamInputs>; strict: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="exam-review-overlay"><section className="exam-review-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-save-title"><h2 id="exam-save-title">Kaydetmeden önce kontrol edin</h2><p>Sınav taslak olarak oluşturulur. Eksik alanları daha sonra tamamlayabilirsiniz.</p>{review.keyChecks.map(key => <div key={key.code} className={`exam-review-check ${key.complete ? 'ok' : 'error'}`}><strong>{key.code} kitapçığı · {key.complete ? 'Cevap anahtarı tamam' : 'Cevap anahtarı eksik veya geçersiz'}</strong><small>{key.actual}/{key.expected} soru için geçerli cevap veya soru durumu</small></div>)}<div className={`exam-review-check ${review.mapped === review.expectedOutcomes && review.expectedOutcomes > 0 ? 'ok' : strict ? 'error' : 'warn'}`}><strong>Kazanımlar · {review.mapped}/{review.expectedOutcomes} soru eşleşti</strong><small>{strict ? 'Tüm kazanımlar tamamlanana kadar aktifleştirme kapalıdır; taslak kaydedilebilir.' : 'Eksik kazanımlar isteğe bağlıdır; taslak kaydına engel olmaz.'}</small></div><footer><button className="secondary" disabled={busy} onClick={onCancel}>Geri dön</button><button className="primary" disabled={busy} onClick={onConfirm}>{busy ? 'Kaydediliyor…' : review.warnings ? 'Yine de oluştur' : 'Taslağı oluştur'}</button></footer></section></div>;
}
