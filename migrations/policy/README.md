# D1 migration policy

Cloudflare records applied migrations by their complete filename. The existing files, including their historically repeated numeric prefixes, must not be renamed, deleted, or edited. `existing-migrations.json` records their SHA-256 checksums. A correction to an applied migration belongs in a new SQL file.

The next migration starts at `0058_...sql`. Give every later file a unique, increasing four-digit prefix. Run `node scripts/check-migration-policy.mjs` before committing. CI applies the entire migration chain to a clean local D1 database as a separate check.
