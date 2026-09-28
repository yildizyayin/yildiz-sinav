# 2026-09-28 staging write failures — root cause

The staging deploy itself completed successfully, including migrations, Worker deployment, demo-domain verification and seed loading. Multiple later endpoints that require D1 writes returned HTTP 500 in the same run. The explicit error surfaced by the Student Intelligence smoke was: `D1_ERROR: Your account has exceeded D1's free tier daily row write limit`.

This explains the same-run failures in exam `preview-file`, logout/session revocation, Nibiru pairing, personal book creation, student Standard preferences and question creation. These should not be treated as independent application regressions until the D1 write allowance is available again.

Remediation: automatic staging push deploys no longer reload demo fixtures or run the full write-heavy acceptance suite. Reseeding and full live acceptance are manual workflow inputs so the D1 write budget is consumed intentionally.
