---
name: DB URL priority in dev mode
description: resolveConnectionString() in lib/db/src/index.ts had wrong candidate order for dev — SUPABASE_PG_URL (wrong project) was tried before SUPABASE_DATABASE_URL (correct project)
---

## The Rule
In `lib/db/src/index.ts` dev candidate order MUST be:
1. `SUPABASE_DATABASE_URL_DEV`
2. `SUPABASE_DATABASE_URL` ← correct project: nzdweipzckfszczzqtuw
3. `SUPABASE_PG_URL`         ← different project: xssrfshdrtdfupgqwfdw (wrong password)
4. `DATABASE_URL`

**Why:** `SUPABASE_PG_URL` points to a different Supabase project (xssrfshdrtdfupgqwfdw) with wrong credentials. Old order tried PG_URL before DATABASE_URL → Drizzle pool used wrong URL → "password authentication failed" on every query → ECIRCUITBREAKER → entire API unusable.

**How to apply:** If dev-login returns "Failed query" with "password authentication failed" but direct pg.Pool works, check which candidate URL resolveConnectionString() picks. Always keep SUPABASE_DATABASE_URL above SUPABASE_PG_URL in dev candidates.
