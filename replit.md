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

## Sales & Purchase Modules

- BizPortal includes Odoo-style Sales and Purchase modules (admin role only).
- Sales: quotations (SQ/YYYY/00001) → confirm → sales orders (SO) with invoice
  (`none|to_invoice|invoiced`) and delivery (`none|to_deliver|delivered`)
  sub-statuses. Customers managed at `/sales/customers`.
- Purchase: RFQs (RFQ/YYYY/00001) → confirm → purchase orders (PO) with receive
  and bill sub-statuses. Vendors are the existing `suppliers` table from Trading.
- Both editors expose a `taxRateId` (PPN) selector. Sales/Purchase document rows
  store `taxRateId`, `taxAmount`, and `grandTotal` (subtotal + taxAmount).
  New documents auto-fill from `accountingSettings.defaultSalesTaxId` /
  `defaultPurchaseTaxId`.
- Backend routes (`/api/sales`, `/api/purchase`) are gated by `requireAdmin`
  middleware (`artifacts/api-server/src/lib/requireAdmin.ts`). All endpoints
  return 401 without auth and 403 for non-admin users.
- Frontend sidebar uses collapsible groups (shadcn `SidebarMenuSub`) with active
  group auto-expanded on mount.

## Accounting Module (Phase 1)

- Odoo-style double-entry accounting at `/accounting/*` (admin only).
- Schema (`lib/db/src/schema/accounting.ts`):
  - `chart_of_accounts` (code, name, type asset/liability/equity/income/expense, isActive)
  - `accounting_journals` (code, name, kind sales/purchase/bank/cash/general)
  - `accounting_taxes` (name, kind sale/purchase, rate, account)
  - `accounting_entries` (entryNumber, date, journalId, ref, description, status draft/posted, totalDebit, totalCredit)
  - `accounting_entry_lines` (entryId, accountId, debit, credit, description)
  - `accounting_settings` (singleton row with default account & tax mappings)
- Idempotent boot seed (`artifacts/api-server/src/lib/accountingSeed.ts`)
  installs Indonesian default CoA (~20 accounts), 5 journals, PPN 11%
  (Keluaran/Masukan), and accountingSettings only when chart_of_accounts is empty.
- Routes (`artifacts/api-server/src/routes/accounting.ts`):
  full CRUD on accounts/journals/taxes/entries; reports for trial-balance,
  general-ledger, profit-loss, balance-sheet; settings GET/PATCH.
- Auto-posting helpers (`artifacts/api-server/src/lib/accounting.ts`) called
  fire-and-forget from sales/purchase action endpoints and payment webhooks:
  - Invoice sales doc → DR AR / CR Sales Income + CR PPN Output
  - Bill purchase doc → DR Purchase + DR PPN Input / CR AP
  - Sales payment paid → DR Bank / CR AR
  - Purchase payment paid → DR AP / CR Bank
  - POS transaction (any method) → DR Cash/Bank / CR Sales Income (journal CSH for cash/qris, BNK for card/transfer)
  - E-commerce order delivered → DR AR / CR Sales Income (journal SAL)
  - Trading stock received → DR Inventory / CR AP (journal PUR, amount = qty × costPrice)
  Each posting is idempotent via pre-insert duplicate guard on (source, source_id).
  `onConflictDoNothing()` used without target (partial index on the column pair
  is incompatible with Postgres `ON CONFLICT` target syntax).
- Frontend pages: `pages/accounting/{accounts,journals,taxes,entries,
  entry-detail,settings}.tsx` and `pages/accounting/reports/{trial-balance,
  general-ledger,profit-loss,balance-sheet}.tsx`. Sidebar group "Akunting" in
  `AppShell.tsx`.
- Settings page (`accounting/settings.tsx`) has 16 mapping fields split across 4
  cards: AR/AP/income/expense/PPN (Sales & Purchase), Bank/Cash/Inventory/COGS
  (POS & Trading), Sales/Purchase/Bank/Cash journals, Sales/Purchase default taxes.
- accountingSettings DB columns added for Phase 2: `cashJournalId`,
  `defaultCashAccountId`, `inventoryAccountId`, `cogsAccountId`.
- Sales/purchase PUT endpoints recompute `taxAmount`/`grandTotal` server-side
  whenever lines change OR `taxRateId` changes (server-authoritative).
- Doc-number generators use `MAX(seq)+1` over `doc_number LIKE 'PREFIX/YYYY/%'`
  (not `count(*) by kind`) to avoid duplicate-key collisions on the global
  `doc_number` unique constraint.
- `app.ts` has a global Express error handler that logs unhandled errors via
  pino and returns `{message:"Internal Server Error"}` (in dev it also returns
  `error: <message>`; suppressed in production).

## Admin Allowlist

- `requireAdmin` and the `users` route promote a user to `admin` if their
  verified Clerk email matches `ADMIN_EMAILS` (default
  `divatranssoetta@gmail.com`) or its domain matches `ADMIN_EMAIL_DOMAINS`
  (comma-separated, default empty). The dev environment sets
  `ADMIN_EMAIL_DOMAINS=example.com` so the e2e testing helper (which signs in
  arbitrary `*@example.com` users) can exercise admin-gated routes.

## Codegen Notes

- After running orval, the auto-generated `lib/api-zod/src/index.ts` re-exports
  both `./generated/api` and `./generated/api.schemas`, which causes duplicate
  symbol errors. Workflow: run `pnpm exec orval`, then overwrite that file with
  a single line: `export * from "./generated/api";`, then `pnpm -w run typecheck:libs`.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Correspondence Module

- Route: `/correspondences` (admin role only)
- DB tables: `correspondences` (kind enum: email/whatsapp/letter/other, direction: inbound/outbound) and `correspondence_attachments`
- API: CRUD at `/api/correspondences` with full attachment management (`/api/correspondences/:id/attachments`)
- Frontend: full list, filter by kind/direction/search, create/edit dialog, detail view with attachment upload, delete confirmation
- Attachment upload via object storage (reuses `useUpload` hook); image attachments render inline in detail view
- OCR (Google Cloud Vision) deferred — placeholder extractedText field on attachments for manual or future API input
- Gmail OAuth deferred — manual entry for now
