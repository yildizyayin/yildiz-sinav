# Current task: independent solver failure diagnosis

The previous strategy-assembly candidate was BLOCKED because the blind solver
was unavailable. Its exact exception was lost by a catch-all. The old record is
immutable and is not reclassified as a content failure or a passing candidate.

## Changes

- Blind-solver failures now keep a safe diagnostic category, numeric provider
  code and allowlisted HTTP status. Provider messages and arbitrary exception
  fields are not persisted. The final-review exception also keeps this safe
  classification while preserving its existing diagnosticCode contract.
- One fixed diagnostic record, independent-solver-diagnostic-20261016-v1, checks
  the existing candidate only after the immutable operational failure. It
  validates the candidate hash, official curriculum and packet shape, and
  rechecks the source after verification. It cannot call an author/editor,
  change the pilot cap, write questions to the bank or publish to students.
- Staging-only, same-origin Super Admin service binding. Repeat calls reuse the
  report without invoking providers. The daily10000-Neuron budget is unchanged;
  no unknown usage is refunded and no paid plan is activated.
- Construction remains explicitly AI_SOURCE_WITH_DETERMINISTIC_STRATEGY_EDITOR,
  pureLlmEditorial=false. This is not a proof of pure-LLM editorial reliability.

## Validation

21 focused tests, typecheck and build passed locally. Tests cover safe error
classification, no retry, immutable old failures, exhausted pilot preservation,
permission/source guards and the requirement that both independent stages pass.
Live diagnostic run38918567722 returned AI_TIMEOUT at the existing90s local
deadline. This is a measured operational failure, not a wrong answer. Pilot
50/50 and the previous assembly record are unchanged. Today's ledger after the
call:0 charged,947 held of10000. No unknown reservation was refunded.

The installed Cloudflare model type for Nemotron is ChatCompletionsInput, whose
response_format JSON schema requires the name/schema/strict envelope. Our
`as any` call had hidden a bare-schema contract mismatch. Both independent
requests now use a model-specific helper checked with `satisfies` against the
actual model input. Older native models retain their existing bare schema.
No scientific schema fields, scores, prompt facts or token caps are removed.

Nemotron's reasoned independent calls now have a bounded240s local deadline;
other models retain their original limits. One separate contract-fix record is
eligible only after the preserved operational diagnostic, with the same
candidate and source hashes. It is not a semantic reroll. Its live result is
pending, so no passing candidate is claimed yet.

Reference: Cloudflare's model page and installed official workers-types
ChatCompletionsInput/ResponseFormatJSONSchema definitions. The generic Workers
JSON-mode documentation and SDK utility describe older bare-schema inputs; the
specific model type is used here rather than changing every provider globally.
https://developers.cloudflare.com/workers-ai/models/nemotron-3-120b-a12b/
https://developers.cloudflare.com/workers-ai/platform/errors/

## Scope

Production remains paused. Only the existing grade5 MAT.5.1.2 candidate is
involved. Main/production, curriculum expansion, the monitoring UI, mass
production and migration0115 are outside this task.
