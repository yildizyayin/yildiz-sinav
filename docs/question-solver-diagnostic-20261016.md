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
| JSON-object transport38920635671 | Pending. Do not claim a working solver or passing candidate yet. |

The same immutable candidate and official source hashes are used throughout.
No author/editor call, new pilot slot, question-bank write or student publication.
Pilot stays50/50. After the first two16Oct calls the ledger is0 charged+1897
held of10000; held/unknown usage is retained, never refunded.

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

104 focused tests, typecheck and build passed locally. Both earlier16Oct staging
deploys38918567147 and38919348158 passed full source checks, deployment and Nibiru
provider probes. Latest deployment/controlled-review result must be checked.

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
