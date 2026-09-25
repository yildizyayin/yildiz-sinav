# Nibiru Multi-AI Orchestration

Nibiru is the single user-facing AI identity. Model/provider names are implementation details and are not exposed as separate assistants to students, parents, teachers, or institutions.

## Control plane

1. Authentication / tenant / role authorization
2. Verified academic context builder (D1/RAG)
3. Nibiru specialist router
4. Workload classifier
5. Model router
6. Cloudflare AI Gateway
7. Provider/model execution with fallback
8. Response policy + deterministic academic evidence
9. Audit / Gateway observability

AI Gateway is the transport, logging, cost, rate-limit and fallback control layer; it is not an assistant persona.

## Default routing matrix

| Workload | Nibiru specialist | Primary | Fallbacks | Why |
| --- | --- | --- | --- | --- |
| Fast facts | Nibiru Core | GLM 4.7 Flash | Meta | Cheap and fast verified-data summaries |
| Daily study plan | Education Coach | GLM 4.7 Flash | Meta → NVIDIA | High-frequency workload; deterministic plan engine remains source of truth |
| Guidance / motivation | Guidance Counselor | Meta Llama 4 Scout | NVIDIA → GLM | Natural supportive language; numeric target gap is calculated outside the LLM |
| Hard math/science reasoning | Subject Teacher | NVIDIA Nemotron 3 120B | Meta → GLM | Multi-step quantitative reasoning |
| Normal subject explanation | Subject Teacher | Meta Llama 4 Scout | NVIDIA → GLM | Natural tutoring/explanation language |
| Parent explanation | Parent Guide | Meta Llama 4 Scout | GLM | Clear, calm development summaries |
| Institution/class analysis | Institution Insight | NVIDIA Nemotron 3 120B | GLM → Meta | Multi-signal trend and aggregate analysis |

Default model IDs:
- FAST: `@cf/zai-org/glm-4.7-flash`
- META: `@cf/meta/llama-4-scout-17b-16e-instruct`
- NVIDIA: `@cf/nvidia/nemotron-3-120b-a12b`

## Non-negotiable rules

- The LLM never calculates authoritative net/score/ranking/target gap if a deterministic engine exists.
- The LLM receives only role-authorized, tenant-scoped academic context.
- Personalized requests use `skipCache=true` at AI Gateway to avoid cross-user response caching.
- Provider failure triggers ordered fallback; Nibiru remains one identity.
- A model may explain evidence but must not invent missing evidence.
- RBA/guidance assessment data becomes available to Guidance AI only after real counselor review.
- Psychological/medical diagnosis is out of scope.
- Production model changes must be configuration changes, not persona rewrites.

## Configuration

Environment variables:

- `NIBIRU_AI_GATEWAY_ID` — Gateway name, defaults to `default`.
- `NIBIRU_ROUTER_MODE` — `SMART`, `FAST_ONLY`, or `LEGACY`.
- `NIBIRU_FAST_MODEL` — cheap/fast model override.
- `NIBIRU_META_MODEL` — natural-language/tutoring model override.
- `NIBIRU_REASONING_MODEL` — reasoning/analysis model override.
- `NIBIRU_CUSTOM_MODEL` — optional third-party/custom model accessible through AI Gateway.
- `NIBIRU_CUSTOM_MODEL_MODE` — `PRIMARY`, `FALLBACK`, or `OFF`.
- `NIBIRU_AI_MODEL` — old single-model compatibility setting used only in `LEGACY` mode.

## Cost-control modes

`SMART` is the normal mode. Frequent workloads use the fast model; deep models are used only when needed.

`FAST_ONLY` is an emergency/cost-protection mode. Every free-form Nibiru inference uses the fast model while deterministic engines keep functioning.

`LEGACY` keeps the previous single-model behavior for rollback compatibility.

## Future providers

The router accepts generic model IDs. Additional providers (for example a future Google/OpenAI/Anthropic or self-hosted model) can be introduced through Cloudflare AI Gateway without changing Nibiru personas, role policies, context builders, or UI. The new provider is an execution engine, not a new assistant identity.
