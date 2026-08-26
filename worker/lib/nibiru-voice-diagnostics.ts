export type VoiceActivationCode=
 | 'UNIFIED_BILLING_CREDITS_REQUIRED'
 | 'GATEWAY_CONFIGURATION_REQUIRED'
 | 'PROVIDER_CREDENTIAL_REQUIRED'
 | 'RATE_LIMITED'
 | 'MODEL_UNAVAILABLE'
 | 'UPSTREAM_PROVIDER_FAILED';

export type VoiceActivationDiagnostic={
 activationCode:VoiceActivationCode;
 detail:string;
 retryable:boolean;
};

function normalized(error:unknown){
 const raw=error instanceof Error?error.message:String(error||'');
 return raw.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,1200).toLowerCase();
}

export function classifyVoiceActivationFailure(error:unknown):VoiceActivationDiagnostic{
 const message=normalized(error);
 if(/credit|billing|balance|prepaid|payment|insufficient|quota.*fund/.test(message))return{
  activationCode:'UNIFIED_BILLING_CREDITS_REQUIRED',
  detail:'Cloudflare AI Gateway Unified Billing için kullanılabilir kredi/billing aktivasyonu gerekli görünüyor.',
  retryable:false,
 };
 if(/gateway|gateway id|ai gateway/.test(message))return{
  activationCode:'GATEWAY_CONFIGURATION_REQUIRED',
  detail:'Cloudflare AI Gateway yapılandırması veya gateway kimliği doğrulanmalıdır.',
  retryable:false,
 };
 if(/unauthori[sz]ed|forbidden|credential|api key|authentication|401|403/.test(message))return{
  activationCode:'PROVIDER_CREDENTIAL_REQUIRED',
  detail:'TTS sağlayıcı kimlik bilgisi veya yetkilendirmesi doğrulanmalıdır.',
  retryable:false,
 };
 if(/rate.?limit|too many requests|429/.test(message))return{
  activationCode:'RATE_LIMITED',
  detail:'TTS sağlayıcısı geçici hız limitine ulaştı.',
  retryable:true,
 };
 if(/model.*(not found|unavailable|unsupported)|404|model_not_found/.test(message))return{
  activationCode:'MODEL_UNAVAILABLE',
  detail:'Seçili TTS modeli bu hesap/rota için kullanılabilir görünmüyor.',
  retryable:false,
 };
 return{
  activationCode:'UPSTREAM_PROVIDER_FAILED',
  detail:'TTS sağlayıcısı canlı isteği tamamlamadı; upstream hata sınıfı kesinleştirilemedi.',
  retryable:true,
 };
}

export function sanitizedVoiceProviderError(error:unknown){
 const raw=error instanceof Error?error.message:String(error||'VOICE_PROVIDER_FAILED');
 return raw.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi,'Bearer [REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]').slice(0,1200);
}
