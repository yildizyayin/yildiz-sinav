export function artifactVerificationPassed(record:any,version:number):boolean {
 return Number.isSafeInteger(version)&&version>0&&record?.status==='VERIFIED'&&record.certificate_current===1&&record.snapshot_version===version&&Number.isSafeInteger(record.expected_count)&&record.expected_count>0&&record.verified_count===record.expected_count;
}
export function artifactJobStatus(status:string,phase:'preparation'|'verification'|'queue'){
 if(phase==='queue')return status==='DONE'?'Bu kuyruk turu tamamlandı':status==='ERROR'?'Yeniden denenecek':status==='PENDING'?'Bekliyor / ilerliyor':'Kontrol edilmeli';
 if(status==='INVALIDATED')return phase==='preparation'?'Yeniden hazırlama gerekiyor':'Yeniden denetim gerekiyor';
 if(phase==='preparation')return status==='PREPARED'?'Hazırlama turu tamamlandı':status==='RUNNING'?'Hazırlanıyor':'Kontrol edilmeli';
 return status==='VERIFIED'?'Denetim turu tamamlandı':status==='VERIFYING'?'Denetleniyor':'Kontrol edilmeli';
}
export function artifactErrorText(code?:string){
 const messages:Record<string,string>={
  RESULT_ARTIFACT_BACKGROUND_DISABLED:'Arka plan hazırlama henüz etkin değil.',
  RESULT_ARTIFACT_VERIFICATION_DISABLED:'Dosya denetimi henüz etkin değil.',
  RESULT_ARTIFACT_SOURCE_INCOMPLETE:'Bazı öğrencilerin dondurulmuş sonucu eksik.',
  RESULT_ARTIFACT_SOURCE_INVALID:'Sonuç ile kurum kapsamı uyuşmuyor.',
  RESULT_ARTIFACT_MANIFEST_CONFLICT:'Dosya kaydı sonuç kaynağıyla uyuşmuyor.',
  RESULT_ARTIFACT_SOURCE_CHANGED:'Kaynak değişti; hazırlama ve denetim yenilenmeli.',
  RESULT_ARTIFACT_VERIFICATION_FAILED:'Eksik veya uyuşmayan dosya bulundu; denetim tamamlanamadı.',
  RESULT_ARTIFACT_PREPARATION_FAILED:'Hazırlama tamamlanamadı; yeniden deneme bekleniyor.',
  RESULT_ARTIFACT_AUDIT_UNAVAILABLE:'Dosya denetimi tamamlanamadı; yeniden deneme bekleniyor.',
  RESULT_ARTIFACT_QUEUE_SEND_FAILED:'Kuyruk gönderimi tamamlanamadı; yeniden gönderim bekleniyor.',
  RESULT_ARTIFACT_QUEUE_PROCESS_FAILED:'Kuyruk işlemi tamamlanamadı; yeniden deneme bekleniyor.',
  RESULT_ARTIFACT_QUEUE_PAGE_FAILED:'Bu sayfa tamamlanamadı; yeniden deneme bekleniyor.',
 };
 return code?messages[code]||'İşlem durumu yeniden kontrol edilmeli.':'';
}
