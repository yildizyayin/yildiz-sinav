# Nibiru acceptance checkpoint — 2026-10-09

## Latest continuation — release preparation and quota isolation

This section supersedes earlier unresolved-status notes below. Main is still c5d45c30b0f2350b605e304c59b87f3228e7da3b. Draft PR #229 is open, mergeable at inspection, and separate (head 12c9d8b792ffbb31471a851132328cb0cbc90b3a); mergeability is not acceptance evidence. No merge or deployment performed.

- Completed local alignment with the saved Astra/checkpoint revision 256a55dbb938008efc4c71613bfb75dc30c75f1d.
- Found an avoidable write path: Question Pool PR Preview automatically provisioned D1/R2 and loaded fixtures on every PR update. This is a quota risk, NOT proof of the source of today's exhaustion.
- Split that workflow: automatic typecheck/tests/build remain on PR events in a credential-free verify job. Remote preview now requires manual workflow_dispatch with create_remote_preview=true, after verify succeeds. Its own job rebuilds client assets because jobs do not share files. Default is false.
- Separated the 100K staging capacity suite from general full_acceptance. It additionally requires capacity_acceptance=true (default false). Requesting capacity without full acceptance fails before deployment. A workflow summary explicitly reports omitted capacity as NOT RUN, never verified by ordinary deployment success.
- Both edited workflows parsed successfully; checked defaults, dependencies, write gates, retained source checks, asset build and git whitespace. No new remote fixture, capacity or inference calls were made during this continuation. The previous code acceptance remains 826 tests plus eight bounded live provider cases; these workflow edits were not deployed or exercised against Cloudflare.

### Next exact actions

1. External configuration: add YOUTUBE_API_KEY and the four WHATSAPP_* secrets in GitHub's staging environment. Production uses PROD_YOUTUBE_API_KEY and corresponding PROD_WHATSAPP_* keys. Never paste credentials into chat. The previously verified staging Worker has none of these five keys; this is not a fresh production audit.
2. After synchronization in an authorized staging release, run bounded YouTube search/detail and browser playback checks. Verify WhatsApp handshake/signature, then delivery only to an explicitly designated owned recipient. Configuration alone is not live acceptance.
3. After the documented D1 daily reset, verify real logout and necessary write flows. Do not automatically seed a remote PR database or run 100K capacity acceptance as part of this check. Larger capacity work requires a separately reviewed account budget; no paid upgrade is authorized.
4. Review PR #229's evidence and the production release gates. Then wire the preserved Astra reference to existing real role routes/APIs, including guidance RBA, and verify responsive layouts before design deployment.
5. Natural Turkish server TTS remains unverified; paid TTS stays OFF. Broader academic review remains necessary beyond the sampled provider cases.

Manual CI controls after these changes reach the relevant branch:
- Question Pool PR Preview: select the intended source branch, leave create_remote_preview=false for source-only verification; true explicitly provisions and seeds remote resources.
- Deploy Cloudflare Worker: leave reseed_demo=false; full_acceptance=true runs general mutable acceptance. Leave capacity_acceptance=false unless a separate remote-capacity run and its account budget have been approved. This workflow deploys staging; it is not a read-only configuration check.

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
- Local verification after these additions: 826 tests passed, typecheck passed; UI build and workflow YAML validation passed. Final combined revision 5d78da55d859bbaf94e7322c01d31a69b3266917 passed GitHub run 37967035015: 826 tests, typecheck/build, Free preflight and all eight live provider cases.
- Free D1 writes reset at midnight UTC: 2026-10-10 03:00 Europe/Istanbul. Recheck real logout and data-writing acceptance after reset; do not purchase a plan, bypass the quota or rerun large private capacity fixtures while exhausted.
- No main merge, staging deploy, production deploy or design deployment performed in this follow-up.
- Before design release: configure/verify YouTube's key and real search/playback; configure WhatsApp and explicitly designate an owned test recipient for delivery acceptance; verify demo logout after quota reset; review separate PR #229 and production gate; wire the prepared Astra prototype to actual role/API pages and verify responsive layouts.

## Confirmed configuration dependencies and design handoff

Read-only Worker secret-name audit run 37967035074 confirmed that staging Worker yildiz-sinav-v1 has NONE of YOUTUBE_API_KEY, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID. No values were retrieved. Do not infer production configuration from this staging result.

Next steps:
1. Add YOUTUBE_API_KEY to GitHub staging environment (restrict the Google key to YouTube Data API v3); add PROD_YOUTUBE_API_KEY in production when preparing that release. Existing deployment code now synchronizes them. Enable and verify the API using a bounded search/detail request and playback; do not enable paid billing to bypass quotas.
2. Add the four WhatsApp settings in staging and production's corresponding PROD_ keys. Verify webhook, signed callbacks and delivery using an explicitly designated owned recipient. No outbound message has been sent in this work.
3. At/after 2026-10-10 03:00 Europe/Istanbul, recheck D1 write availability and real logout. Free-budget protection must also apply to large fixture/capacity work; the cause of this day's write consumption has not been attributed.
4. Keep Turkish paid TTS OFF; Turkish STT is verified but natural Turkish server TTS remains a separate pending capability.
5. Review PR #229 and release gates separately, then apply the prepared Astra design to actual role routes and APIs, test web/mobile, and deploy after the design release is ready.

The existing Astra reference prototype is preserved at docs/design/anunex-super-admin-astra-prototype.html. It is a visual mockup, with simulated forms/actions, NOT a functioning production panel. Existing actual API/permission/RBA/report workflows must be wired; do not replace them with mock interactions. Global design direction remains light/airy content, left navigation, module-specific universe colors and no purple. Panel order: Super Admin, institution/chain, guidance (including RBA), subject teacher, student, parent.

No deployment or merge performed. New-session continuation: read this checkpoint and branch head first; continue the configuration-dependent acceptances and design wiring without repeating completed provider/permission fixes.


## Credential correction — 2026-10-09 21:08 Europe/Istanbul

User says the keys were saved yesterday. Do not request re-entry before checking production. Historical context confirms repository CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID and Cloudflare token updates; it does not establish that YouTube/Meta integration keys were saved.

Fresh read-only run 37971096622, staging job 113957610706:
- Effective GitHub staging context has CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Neither the plain nor PROD_ variant of YouTube or the four WhatsApp secrets is available there.
- Cloudflare staging Worker yildiz-sinav-v1 still lacks the five integration secret names. Values were not printed/read from Cloudflare. No sync or deployment performed.
- Production job 113957611193 is WAITING for the existing production environment required reviewer yildizyayin. It has not run, so production key presence remains UNKNOWN.
- Existing GitHub protection requires Review deployments -> production -> Approve and deploy on the run page. Despite that UI wording, this workflow only checks presence and performs GET requests; it does not deploy or mutate the app. The connector has no deployment-review action, so account review must be completed by the user. Do not remove/bypass environment protection or infer missing production keys from staging.

Next: once the existing review gate is approved, inspect production job presence results. Then identify naming/environment/synchronization differences before any request to recreate keys.


## Production credential audit completed — 2026-10-09 21:10 Europe/Istanbul

Run 37971096622 production job 113957611193 completed successfully after the required environment review. Effective GitHub production context contains CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, but none of the plain or PROD_ variants of YouTube/WhatsApp integration keys. The production Worker yildiz-sinav-prod secret-name GET also confirms none of YOUTUBE_API_KEY or the four WHATSAPP_* names. This resolves production UNKNOWN from the preceding section. These are presence-only results, no values printed, no deployment or synchronization.

User requested moving on to YouTube and WhatsApp. Proceed with Google project/YouTube Data API v3 activation and API-key setup first, then Meta Cloud API application/test-number setup and webhook integration. Reuse any existing Google/Meta provider configuration if present; the absence of keys in the audited deploy contexts does not prove absence in provider dashboards or another repository. Never ask for raw keys in chat. Save YouTube key as YOUTUBE_API_KEY in staging and PROD_YOUTUBE_API_KEY in production; WhatsApp uses four plain staging and corresponding PROD_ production secrets. Keep paid upgrades off and designate an owned test recipient before outbound delivery.


## YouTube key accepted — 2026-10-09 21:28 Europe/Istanbul

User created a key in Google project anunex-nibiru with YouTube Data API v3 enabled, and reported adding it as YOUTUBE_API_KEY in staging and PROD_YOUTUBE_API_KEY in production. Read-only run 37973511000 staging job 113965849567 confirms effective staging YOUTUBE_API_KEY is present. Two real Google requests (one search, one video-details GET) succeeded; 3 returned videos met the sampled public/processed/embeddable/TR/age metadata conditions. No key values printed. This verifies key/API access, NOT actual browser playback, curriculum quality or end-to-end student support.

Staging Worker secret-name check still lacks YOUTUBE_API_KEY: it has NOT been synchronized. No application deployment or D1 writes occurred. Production job 113965850028 awaits the existing production review gate; its key presence/API result is not yet verified. Ask user to Review deployments -> production -> Approve and deploy for this read-only run, without recreating their key. Next manual provider step: Meta apps dashboard, inspect any existing ANUNEX/Nibiru WhatsApp application before creating a duplicate. WhatsApp secrets remain absent in the fresh staging result.
