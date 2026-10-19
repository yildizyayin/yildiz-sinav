# Current single task: independent quality screening

The editor transport issue is complete. This task ONLY checks scientific and
editorial screening; it does not start question production or broaden curriculum.

## Frozen benchmark
Record: independent-quality-20261015-v1. Each item is evaluated once; an existing
record is returned without new AI calls. Source hash and actual findings persist.

1. Correct table-based decision problem: must pass with independent scores.
2. Same source with wrong answer key: must fail.
3. Explicitly incorrect worked arithmetic: must fail for INVALID_ARITHMETIC.
4. Contradictory table price: must fail.
5. Actual Qwen packet with incorrect distractor explanations: must fail, and the
   reviewer must mention option/distractor/explanation problems.
6. Actual invalid compound Turkish number writing: must fail for the specific
   language rule, not an unrelated error.

Every model-based result requires the configured independent reviewer and a
separate blind-solve record proving key and solution were hidden. Missing scores,
timeouts and unavailable models are NOT accepted as scientific rejections.
There are no producer calls, student publications, human approvals or changes to
the old pilot quota. All calls use the existing daily AI budget ledger.

## Evidence
Final local checks:66 tests passed across6 files, including generation runner and editor transport regressions. Typecheck and build passed.
Staging source/deployment run38738842559 passed.
First live six-case run38738842623 completed with5/6 expected results. Correct control passed; four seeded/real faults were detected. The actual Qwen distractor case never reached editorial review because the blind model produced an invalid number-reading calculation. This was NOT counted as successful distractor detection.

A narrow exact cardinal-reading proof now handles only the recognized canonical request, without seeing the stored key or solution. Other question types keep model-based solving. A linked immutable continuation record may complete ONLY the never-reached editorial check, retaining all five unchanged results and the failed original report. It cannot re-run a completed negative editorial decision.
Passing this small benchmark would not certify publisher-level production,
global originality, all MEB outcomes or500,000-question throughput.


## Final result and honest limits
- First record/run38738842623:5/6; blind model emitted invalid reading arithmetic.
- Linked reading-proof run38740103032: the exact public-input proof worked, but
  the independent AI reviewer then FALSELY ACCEPTED the bad distractor notes.
  That result remains BLOCKED and was not rewritten or retried for a better score.
- A deterministic guard now rejects explicit nine-digit partial-group claims
  whose following whole-number conclusion contradicts them, when the billion and
  units groups are explicitly unchanged. It does not infer arbitrary unstated
  operations from prose. This catches the actual C/D explanation contradiction.
- Final linked record:independent-quality-20261015-v1-distractor-proof-v1.
- Final live run38740916702 PASSED: all6 expected outcomes,0 new model calls,
  unchanged pilot49/50. The five previously valid results were retained.
- The final report explicitly records independentReviewerFalsePositiveObserved
  and mitigatedByDeterministicGuard. It does not certify model-only reliability.

The known six-case pipeline regression is complete. This is a small grade5
scientific/editorial benchmark, not end-to-end autonomous author/editor production,
all-six-grade coverage, global originality verification or500k capacity proof.
Production remains paused; no student question or human/rights approval was created.
Per user request, STOP after this single task. Next task must be chosen separately.
