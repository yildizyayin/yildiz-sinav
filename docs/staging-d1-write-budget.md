# Staging D1 write-budget policy

Staging push deploys must not continuously reload synthetic fixtures or run the full write-heavy live acceptance suite. Source verification (`typecheck`, unit/integration tests, build), deployment, domain verification and the Nibiru provider probe remain automatic.

Synthetic demo fixtures are reloaded only through a manual `workflow_dispatch` run with `reseed_demo=true`. The full live acceptance/KVKK suite is run only through a manual `workflow_dispatch` run with `full_acceptance=true`.

Reason: repeated staging pushes previously consumed the Cloudflare D1 free-tier daily row-write allowance and caused unrelated write endpoints (exam preview, logout/session revocation, personal book creation, student preferences, question creation) to fail with HTTP 500. The application code remains tested automatically; milestone live acceptance is explicit so D1 write capacity is spent intentionally.
