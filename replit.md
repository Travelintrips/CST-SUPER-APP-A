# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Object Storage

- Replit Object Storage backs product images (e-commerce) and per-transaction
  documents (POS). Required env: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`,
  `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS`.
- API endpoints (Clerk-auth required):
  - `POST /api/storage/uploads/request-url` → `{uploadURL, objectPath}`.
    Validates max 10MB and allowed MIME prefixes (`image/`, `application/pdf`).
  - `GET /api/storage/objects/*` → streams private objects (auth required).
  - `GET /api/storage/public-objects/*` → streams public assets.
- Storage paths: server only stores normalized internal paths
  (`/objects/<entityId>`). External URLs are rejected at the write boundary.
  The web client prepends `/api/storage` when displaying.
- Frontend helper: `@workspace/object-storage-web` provides `useUpload` and
  `ObjectUploader` (Uppy-based dashboard) for uploads from React.

## Codegen Notes

- After running orval, the auto-generated `lib/api-zod/src/index.ts` re-exports
  both `./generated/api` and `./generated/api.schemas`, which causes duplicate
  symbol errors. Workflow: run `pnpm exec orval`, then overwrite that file with
  a single line: `export * from "./generated/api";`, then `pnpm -w run typecheck:libs`.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
