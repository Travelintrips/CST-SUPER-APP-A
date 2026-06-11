---
name: DB connection string order (lib/db)
description: SUPABASE_PG_URL can have stale/wrong credentials; dev mode must prefer SUPABASE_DATABASE_URL before SUPABASE_PG_URL to avoid ECIRCUITBREAKER cascade.
---

## Rule
In dev mode, `lib/db/src/index.ts` must resolve in this order:
1. `SUPABASE_DATABASE_URL_DEV`
2. `SUPABASE_DATABASE_URL`
3. `SUPABASE_PG_URL`
4. `DATABASE_URL`

**Why:** `SUPABASE_PG_URL` can hold outdated/expired credentials. If it is picked before `SUPABASE_DATABASE_URL`, every pool connection attempt fails with "password authentication failed for user postgres". Supabase pgBouncer then blocks all new connections with ECIRCUITBREAKER ("too many authentication failures, new connections are temporarily blocked"), making ALL services appear broken — even those that would have used the correct credentials.

**How to apply:** Any time login or DB queries fail with `ECIRCUITBREAKER` or "Failed query" across the board, check whether `SUPABASE_PG_URL` was resolved first. Swap the order in `lib/db/src/index.ts` if needed. Symptom confirmation: run `node -e "require('pg').Pool(...)..."` with `SUPABASE_DATABASE_URL` directly — if that returns OK but the API server still fails, the pool is picking a bad URL.
