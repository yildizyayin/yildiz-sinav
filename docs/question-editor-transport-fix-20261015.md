# Current task: editor output transport

Scope is ONLY the incomplete-editor-output issue. Do not advance curriculum,
campaign admission, panel, billing or mass-production activation in this task.

## Root cause
One immutable staging diagnostic (`editor-transport-20261015-v1`, workflow
38737299387) captured a complete structured question JSON in Qwen's alternate
response field while `message.content` and `response` were null. The generic
reader did not recognize that transport, causing EDITOR_OUTPUT_INCOMPLETE.
The question was NOT absent. Its scientific/editorial quality is a separate test.

## Change
`readEditorPacket` handles this observed transport only for the configured Qwen
editor, one completion, finish_reason=stop, absent normal response and strict
whole JSON with only the questions property. It never extracts JSON from prose,
accepts truncation, resolves conflicting fields or applies to other models.
All existing packet, outcome, focus and independent scientific checks remain.

## Validation
57 focused tests passed, including the actual provider response fixture, normal
response compatibility, malformed/truncated/conflicting response rejection,
staging-only diagnostic access and no duplicate diagnostic calls. Typecheck passed.
The diagnostic observer can replay its saved response using the updated reader
with zero new model calls. Original job/editor-attempt records remain unchanged.

## Release boundary
Staging fix commit: be878dc5f6fdbcb79f8607d8888e423666e8885f.
Live replay verification pending in its dedicated workflow. No production campaign
was activated, no human/rights approval was granted and no quality acceptance
counts were raised. PR260 remains draft until the separate quality work passes.
Local-only0115 and related changes remain outside this task and this remote update.

After this task is confirmed, the next single task is independent end-to-end
quality validation. Do not conflate protocol repair with passing question quality.
