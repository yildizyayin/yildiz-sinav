# Private rubric export panel lifecycle — 2026-10-07

Four mounted React/happy-dom tests exercise PrivateRubricExportPanel directly without a remount key. Before the fix, three failed: A/B/A allowed an old prepare response to overwrite the latest job, busy/capability carried into another scope, and an old refresh rejection erased a newly loaded job. Retry request identity already passed.

The panel now changes its scope epoch in a layout effect and invalidates it on cleanup. Scope changes clear job/error/busy/capability before the next capability request. Capability, prepare and refresh completions check mounted status and the captured epoch; prepare/refresh also check their operation generation. Request identity still stays stable for retry and changes for a deliberately new export. Existing parent remount keys remain in place; the panel's own correctness no longer relies on them.

After the fix, all four tests pass. Pending server jobs continue independently; suppressing an old UI completion does not cancel a committed server export. These are controlled DOM simulation tests, not browser engine tests or provider acceptance. No feature flag or export infrastructure was activated.

Open acceptance work, in order:

1. Native browser coverage: authenticated roles, loading and navigation, actual CSV download and spreadsheet opening, mobile/PDF/A-B booklet/camera flow, service worker offline/update behavior.
2. Cloudflare staging: account/token access, required Queue/DLQ/private R2 and bindings, migration checks, provider-side expiration/revocation/privacy behavior.
3. Verified official Maarif content by grade/subject and expert review of learning outputs/process/rubric mapping.
4. Authenticated distributed load for 10,000 simultaneous result viewers and the defined 1,000,000-user/request scenario; record measured limits and mitigations.
5. Final release review, environment/domain validation and production publication in the agreed release scope.
6. Approved design rollout after technical acceptance, including coherent desktop/mobile panels and domain branding.

Annual seat licensing/year transition remains analysis-only under the user's prior instruction. These acceptance items must not be represented as completed merely because local unit and integration tests pass.
