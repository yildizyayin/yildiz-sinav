# Nibiru acceptance checkpoint — 2026-10-09

## Source and release state

- Production/main baseline: `c5d45c30b0f2350b605e304c59b87f3228e7da3b`.
- Changes: `fix/nibiru-acceptance-20261009`. Not merged or deployed.
- Keep existing draft PR #229 and its private-fixture/capacity work separate.
- User preference: Free scope; no paid plan upgrade or credit purchase.

## Implemented fixes

1. GLM prompt roles now use actual newlines.
2. Provider connectivity requires the requested `OK`, rather than accepting any nonempty error text as success.
3. Paid Google/OpenAI/Unified TTS requires explicit `NIBIRU_PAID_VOICE_ENABLED=ON`; default is OFF. This opt-in has not been enabled.
4. Removed silent English MeloTTS fallback and incorrect OpenAI attribution.
5. Reject non-audio/JSON responses; successful configuration is distinct from recent live verification.
6. Voice readiness checks model identity and 24-hour evidence. A Standard-only test does not verify Premium. STT stores successful transcription evidence; configured microphones remain usable for the first real test.
7. Independent final AI answer guard blocks sampled explicit diagnostic claims, official impersonation, student labels and raw 11-digit identifiers. This is a bounded guard, not comprehensive MEB certification or factual validation.
8. Added isolated live acceptance with actual application prompt/router: three providers, missing-evidence/injection scenario, mathematical explanation, and synthetic Turkish Whisper audio. Allowlist, maximum ten inference requests, no retries or Gateway billing route. Local espeak-ng generates the STT fixture without a TTS service.

## Verified evidence

- GitHub run [37958103509](https://github.com/yildizyayin/yildiz-sinav/actions/runs/37958103509): 806 unit/integration tests passed; typecheck and production build passed.
- Demo read-only check at 2026-10-09 16:14:42 UTC: environment staging; WhatsApp disabled and not ready; all four configuration flags false (verify token, app secret, access token, phone ID). No outbound message sent.
- Demo voice status: binding configured, liveVerified false. Demo still runs the baseline; code corrections above are not deployed.
- Demo logout returned HTTP 500 again; local session cookie discarded. Root cause is not established here; keep tracked with other post-release technical issues.
- Real provider step BLOCKED, not passed: Cloudflare account subscriptions GET returned HTTP 403 (`FREE_PLAN_HTTP_403`). There were zero model/STT inference calls in these runs.

The final code also passed a separate TypeScript check for the live acceptance runner. The final update after this run is documentation and whitespace only.

## Remaining acceptance and next-session instructions

1. Verify Free account using a token with **Billing Read** permission on the relevant account, then rerun `Nibiru Bounded Acceptance`. Do not add Billing Write, purchase credits, or bypass the preflight. If a paid subscription is present, conduct a quota audit before inference; the current runner stops.
2. Inspect real model outputs and mathematical answer (7/8), missing-data handling and injection refusal. Sampled automated checks do not certify all Maarif answers. Keep teacher review for educational content.
3. Run prepared synthetic Turkish STT acceptance once Free preflight passes. Human-recorded audio and voice quality remain separate acceptance. No verified free Turkish server-side TTS provider is configured in this work; paid TTS remains OFF.
4. Demo WhatsApp needs its four credentials and platform enablement for live acceptance. Production WhatsApp configuration was not accessible through the demo account and is not inferred from it.
5. Signed callback, invalid-signature, oversized-body and delivery-receipt tests pass locally. A real outbound WhatsApp acceptance still requires an explicitly designated owned test recipient; do not send to students/parents without authorization.
6. Do not merge/deploy while provider acceptance is blocked. Do not rerun unrelated large D1/R2 private acceptance just to test Nibiru.

Official references: [Cloudflare subscription permissions](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/), [Workers AI Free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/).
