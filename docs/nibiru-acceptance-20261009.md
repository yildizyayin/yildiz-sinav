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

1. Strict follow-up run 37962439334 passed all eight sampled live cases, 813 offline tests, typecheck and build. Read-only artifact review run 37962698841 confirmed no injected metrics or official impersonation in missing-data answers. Educational quality is still NOT accepted: GLM math says “ortak pay” instead of “ortak payda” in one sentence; Meta math includes a Japanese phrase. Add language/output-quality controls and test wider academic samples before release. Do not mark pedagogical quality or comprehensive Maarif conformity as verified.
2. Retain the existing bounded guard and teacher review. No verified Free Turkish server TTS provider is configured; paid TTS is OFF. Human audio and voice quality require separate acceptance.
3. Configure WhatsApp's four credentials and enable it for integration verification. A real outbound acceptance requires an explicitly designated owned test recipient.
4. Merge/deploy only after provider acceptance is resolved and required release checks are reviewed. Existing draft PR #229 and private D1/R2/capacity work remain separate.
5. Audit YouTube integration next before applying the panel design. Source already contains learning_videos, VIDEO_LIBRARY licensing, super-admin creation, question support, short-video search, candidate scoring and seven-day cache. This is source evidence only, not a live API acceptance. Verify API activation/quota, approved-channel and curriculum review controls, playback and student access.

Official references: [Cloudflare subscription permissions](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/), [Workers AI Free allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/).

## Added roadmap decision — 2026-10-09 19:22 Europe/Istanbul

User requested YouTube integration after Nibiru model, voice and WhatsApp acceptance and before applying the panel design. First audit existing YouTube/video library code and role/license gates. Then implement controlled educational video links/search, question/outcome association and in-panel playback as supported by the verified APIs and existing modules. Final integration scope remains to be agreed; do not duplicate existing capabilities or mark planned items as working. Maintain the Free-scope preference and record integration/test outcomes here.

## Current handoff — token update completed

- Cloudflare permission/Free preflight, exact-OK connectivity for all three configured models and synthetic Turkish Whisper STT are verified.
- Code revision tested: 74468672d91ab5f6c076a8e66face8e6c38033da. Evidence retained in GitHub run 37962439334.
- Final output review distinguishes passing bounded automation from remaining terminology/language quality defects. No main merge or deployment has occurred.
- Next engineering work: Turkish output validation and academic quality lane/review, then WhatsApp setup/owned-recipient acceptance, YouTube activation/audit and design application. Turkish server TTS and logout HTTP 500 remain unresolved.

## Remaining technical work — 2026-10-09 follow-up

- Branch code 8fc6aca373e8da68d78751340a390d114e99fe0e passed GitHub run 37965077065: 823 tests, typecheck, build, Free preflight and eight real provider cases (ten requests). Output review run 37965332220 found correct 7/8 explanations, no earlier foreign-script leakage or common-numerator confusion. This is sampled acceptance only.
- Added bounded final guards for the observed Japanese script leakage and incorrect “ortak pay yapalım” expression. Unsafe output uses the existing safe response; no arbitrary automatic mathematical rewriting.
- YouTube candidates now require public/processed/embeddable video metadata, non-age-restricted status, valid IDs and availability in TR. Timed provider requests fail safely. New validated-v2 cache namespace excludes older unchecked candidates; seven-day expiry remains. Automatic candidates are marked reviewRequired in student support.
- Provider status now separates configured from liveVerified; mere secret presence never proves delivery/playback.
- YouTube secret synchronization was missing from deployment workflows. Added optional YOUTUBE_API_KEY to staging and PROD_YOUTUBE_API_KEY-to-YOUTUBE_API_KEY to both production workflows. Staging deploy now explicitly uses the staging GitHub environment. Empty secrets do not overwrite existing Worker values.
- Demo logout diagnosis run 37966566715 confirmed D1_ERROR: the account exhausted its Free daily row-write allocation. Logout returned 500; reusing the cookie still returned auth/me 200. Temporary tails were deleted. The cause is verified quota exhaustion, not an inferred schema fault.
- Added explicit HTTP 503 SESSION_REVOCATION_TEMPORARILY_UNAVAILABLE for this observed quota error. Do not clear the cookie or pretend the server session is revoked. Other storage errors remain errors.
- Local verification after these additions: 826 tests passed, typecheck passed; UI build and workflow YAML validation passed. Final GitHub verification is required for the new combined revision.
- Free D1 writes reset at midnight UTC: 2026-10-10 03:00 Europe/Istanbul. Recheck real logout and data-writing acceptance after reset; do not purchase a plan, bypass the quota or rerun large private capacity fixtures while exhausted.
- No main merge, staging deploy, production deploy or design deployment performed in this follow-up.
- Before design release: configure/verify YouTube's key and real search/playback; configure WhatsApp and explicitly designate an owned test recipient for delivery acceptance; verify demo logout after quota reset; review separate PR #229 and production gate; wire the approved Astra prototype to actual role/API pages and verify responsive layouts.
