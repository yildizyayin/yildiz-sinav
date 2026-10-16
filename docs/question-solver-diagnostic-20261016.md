# Current single task: independent solver operational failure

The blind-solver catch previously discarded the underlying exception. Safe
operational diagnostics now distinguish application timeout, provider timeout,
capacity/allocation, authentication, request rejection and invalid JSON protocol
without storing arbitrary exception messages or fields.

## Actual bounded evidence

| Record/run | Result |
| --- | --- |
| Original assembly38758027673,15Oct | Unavailable; exact exception lost by old catch. Not a valid candidate. |
| Diagnostic38918567722,16Oct | AI_TIMEOUT at the local90s deadline. No content verdict. |
| Named schema/deadline38919348428 | Provider code3046, before the240s local deadline. Not resolved by increasing the local wait. |
| JSON-object transport38920635671 | PROVIDER_TIMEOUT, code3046. Same candidate/source unchanged. |
| Independent Meta backup38921845813 | Responded, but scientific proof FAILED: invalid arithmetic and invented operands. Final editorial review not run. |

The same immutable candidate and official source hashes are used throughout.
No author/editor call, new pilot slot, question-bank write or student publication.
Pilot stays50/50. After all four16Oct controlled calls the ledger is137 charged+2869
held of10000; held/unknown usage is retained, never refunded.

## Current status: BLOCKED, not resolved

Provider access and mathematical correctness are different failure classes.
Nemotron remained unavailable through two transport formats. Meta returned a
response but invented operands and incorrect equations, e.g.632+148=760. The
local checker rejected it despite its answer letterC. No semantic reroll or
additional model call follows this scientific rejection. The valid-candidate
goal remains incomplete. The candidate itself was not changed to fit the model.

A single-backup mechanism is implemented and tested, but its staging setting
is removed after the failed Meta qualification. No unqualified backup is left
automatically enabled. No successful independent solver is claimed.

## Current implementation

Nemotron's model type is ChatCompletionsInput. A model-specific helper requests
JSON-object transport and provides the same application-owned scientific or
editorial schema in a trusted system message, before the untrusted candidate.
This avoids reliance on the provider's schema-constrained decoding path. Older
native model formats remain unchanged. Both requests retain reasoning, the
5000-token cap, model independence, a bounded240s deadline, and all actual facts.

The application checks exact proof fields, source-number values, arithmetic,
option completeness/uniqueness and the hidden answer-key comparison. Malformed
proof JSON is operational unavailability, never acceptance. The final editorial
parser still requires all six independent scores and rejects any passing claim
with a score below3. A transport change does not certify scientific quality.

Each diagnostic is a unique, immutable record in question_verifier_calibrations.
The JSON transport record is eligible ONLY after the same candidate's preserved
provider3046 failure. Staging-only Super Admin/same-origin/service-binding
permissions apply. Repeated requests reuse the saved result without AI calls.
No new model experiment follows a semantic rejection.

Construction remains AI_SOURCE_WITH_DETERMINISTIC_STRATEGY_EDITOR with
pureLlmEditorial=false. This source was previously edited several times; it is
not evidence of pure-LLM editorial reliability or first-pass autonomous quality.

## Validation and scope

117 focused tests, typecheck and build passed locally. Both earlier16Oct staging
deploys38918567147 and38919348158 passed full source checks, deployment and Nibiru
provider probes. The final configuration-only deploy must be checked to prove the unqualified
backup is disabled on the private generator as well as the app.

Production remains paused; main/production, other grades, monitoring UI, paid
plans, quota resets, mass production and migration0115 remain outside this task.
A single passing candidate would not establish500000-question readiness.

References: official Cloudflare model input definitions installed in
@cloudflare/workers-types; model docs and errors. The provider's issue16165
reports a similar schema/low-reasoning timeout on a DIFFERENT model; this is
only background for a controlled transport comparison, not proof of our cause.
https://developers.cloudflare.com/workers-ai/models/nemotron-3-120b-a12b/
https://developers.cloudflare.com/workers-ai/platform/errors/
https://github.com/cloudflare/workers-sdk/issues/16165


## Bounded fallback policy and next single decision

Only one allowlisted Meta backup can run after operational primary errors;
scientific/editorial rejections, quotas and author-model conflicts never trigger
it. Primary failures are preserved in fallback evidence. The candidate uses
GPT/Qwen/GLM, so Meta is independent, but independence alone does not establish
scientific competence. Backup output receives the same exact arithmetic, source
operand, answer and six-score editorial checks. Known usage settled to137, and
unknown primary reservations stayed held. No paid plan or billing change.

Meta budget rates26668 input/204805 output Neurons per million tokens were
checked against the official pricing page16Oct2026 and covered by tests.
https://developers.cloudflare.com/workers-ai/platform/pricing/

Next single technical decision: provide an independently computed mathematical
proof engine rather than using an LLM's unverified numeric trace as the only
scientific solver. Any such engine must use public question data only, keep the
key/solution hidden, and be tested independently of the writer/editor plan.
Do not hide these model failures, relax gates, reset the50 pilot or call the
current helper a500000-question production solution.
