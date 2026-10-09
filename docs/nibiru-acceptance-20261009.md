# Nibiru acceptance checkpoint — 2026-10-09

## Source and release state

- Production/main baseline: `c5d45c30b0f2350b605e304c59b87f3228e7da3b`.
- Changes: `fix/nibiru-acceptance-20261009`. Not merged or deployed.
- Keep existing draft PR #229 and its private-fixture/capacity work separate.
- User preference: Free scope; no paid plan upgrade or credit purchase.

## Implemented fixes

1. GLM now uses structured system/user messages. Its fast lane disables template thinking so the bounded completion budget produces visible answers. Nemotron uses its documented low-effort template controls and forces nonempty content.
2. Provider connectivity requires the requested `OK`, rather than accepting any nonempty error text as success.
3. Paid Google/OpenAI/Unified TTS requires explicit `NIBIRU_PAID_VOICE_ENABLED=ON`; default is OFF. This opt-in has not been enabled.
4. Removed silent English MeloTTS fallback and incorrect OpenAI attribution.
5. Reject non-audio/JSON responses; successful configuration is distinct from recent live verification.
6. Voice readiness checks model identity and 24-hour evidence. A Standard-only test does not verify Premium. STT stores successful transcription evidence; configured microphones remain usable for the first real test.
7. Independent final AI answer guard blocks sampled explicit diagnostic claims, official impersonation, student labels and raw 11-digit identifiers. This is a bounded guard, not comprehensive MEB certification or factual validation.
8. Added isolated live acceptance with actual application prompt/router: three providers, missing-evidence/injection scenario, mathematical explanation, and synthetic Turkish Whisper audio. Allowlist, maximum ten inference requests, no retries or Gateway billing route. Local espeak-ng generates the STT fixture without a TTS service.

## Verified evidence

- Token update propagated: subscription and Workers AI API calls no longer return 403.
- Read-only account audit found Cloudflare Free plans and R2 Paid activation; R2 is a separate storage product. The preflight excludes R2 from the Workers AI plan classification and still rejects non-Free Workers subscriptions or unknown paid products.
- Run [37961531111](https://github.com/yildizyayin/yildiz-sinav/actions/runs/37961531111): 812 tests, typecheck and build passed. All three exact-OK connectivity probes passed. Meta and NVIDIA passed both sampled educational cases. Whisper transcribed “Bugün matematik çalışacağım.”
- GLM's two educational cases were empty: provider HTTP 200, finish_reason length, 900 completion tokens, zero visible content. Replaced ineffective reasoning_effort low with the official template enable_thinking false. Follow-up run [37962037486](https://github.com/yildizyayin/yildiz-sinav/actions/runs/37962037486) passed the then-current automated checks, but manual output review found a GLM issue: it reused unverified 90-net/450-point claims and said “MEB çalışanı yaklaşımıyla”. This automated pass is insufficient for final educational acceptance. Added an official-role framing guard regression and a missing-evidence test that forbids repeating the injected metrics. Clarified the system policy to distinguish user claims from verified records. Follow-up run: [37962439334](https://github.com/yildizyayin/yildiz-sinav/actions/runs/37962439334).
- Every live acceptance run is limited to ten allowlisted inference requests; no paid upgrade, external TTS or Gateway billing route.
- Demo WhatsApp remains disabled/not ready, with all four credential flags false. No outbound message sent. Production configuration is not inferred from demo.
- Demo voice binding is configured but liveVerified false; these branch corrections are not deployed.
- Demo logout returned HTTP 500; root cause remains unresolved and tracked with post-release issues.

## Remaining acceptance and next-session instructions

1. Recheck stricter follow-up run 37962439334 and its synthetic outputs; do not rely on the earlier automated pass. Sampled acceptance does not certify all Maarif content.
2. Retain the existing bounded guard and teacher review. No verified Free Turkish server TTS provider is configured; paid TTS is OFF. Human audio and voice quality require separate acceptance.
3. Configure WhatsApp's four credentials and enable it for integration verification. A real outbound acceptance requires an explicitly designated owned test recipient.
4. Merge/deploy only after provider acceptance is resolved and required release checks are reviewed. Existing draft PR #229 and private D1/R2/capacity work remain separate.
5. Audit YouTube integration next before applying the panel design. Source already contains learning_videos, VIDEO_LIBRARY licensing, super-admin creation, question support, short-video search, candidate scoring and seven-day cache. This is source evidence only, not a live API acceptance. Verify API activation/quota, approved-channel and curriculum review controls, playback and student access.

Official references: [Cloudflare subscription permissions](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/), [Workers AI Free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/).

## Added roadmap decision — 2026-10-09 19:22 Europe/Istanbul

User requested YouTube integration after Nibiru model, voice and WhatsApp acceptance and before applying the panel design. First audit existing YouTube/video library code and role/license gates. Then implement controlled educational video links/search, question/outcome association and in-panel playback as supported by the verified APIs and existing modules. Final integration scope remains to be agreed; do not duplicate existing capabilities or mark planned items as working. Maintain the Free-scope preference and record integration/test outcomes here.
