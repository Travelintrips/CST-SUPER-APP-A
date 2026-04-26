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

## AI Document Scan

- Endpoint `POST /api/scan-document` accepts multipart form upload (field `file`) of image (JPG, PNG, WEBP) or PDF.
- Uses OpenAI GPT Vision (via Replit AI Integrations proxy) to extract structured JSON data from the document.
- Extracts: partyName, partyEmail, docDate, dueDate, notes, line items (name, qty, unitPrice), shipment fields.
- Frontend component: `artifacts/bizportal/src/components/ScanDocumentDialog.tsx` — shows scan button, handles upload, displays preview, calls `/api/scan-document`, returns `ScannedDocumentData`.
- Integrated into Sales Quotation Editor (`Scan Dokumen` button) and Purchase RFQ Editor.
- Env vars: `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` (auto-provisioned by Replit AI Integrations).

## Email with PDF Attachment

- Endpoints `POST /api/sales/documents/:id/email` and `POST /api/purchase/documents/:id/email`.
- Accepts `{ to, subject?, body? }` in request body. Generates PDF from the document, attaches it, and sends via SMTP.
- Email library: `nodemailer` (externalized in esbuild config). SMTP helper: `artifacts/api-server/src/lib/mailer.ts`.
- Required env vars (must be set by user): `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- If SMTP not configured, endpoints return HTTP 503 with Indonesian error message.
- Frontend component: `artifacts/bizportal/src/components/SendEmailDialog.tsx` — dialog with To/Subject/Body + PDF attachment badge.
- Integrated into Sales Quotation Editor and Purchase RFQ Editor (`Kirim Email` button, visible when document exists).

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

## Master Item Penjualan

- Products table extended with 4 new columns (added via ALTER TABLE):
  `item_type` (text: "barang"|"jasa", default "barang"), `unit` (text, default "pcs"),
  `subcategory` (text, nullable), `is_active` (boolean, default true).
- Schema file: `lib/db/src/schema/products.ts`.
- API: `GET /api/ecommerce/products` supports query params `search`, `itemType`,
  `subcategory`, `isActive`; `POST/PUT` accept all new fields.
- Seed endpoint: `POST /api/ecommerce/seed-items` — idempotent, creates 10 logistics
  service items across sub-categories (Udara, Laut, Darat, Pabean, etc.).
- Frontend page: `artifacts/bizportal/src/pages/sales/items.tsx` at `/sales/items`
  (linked from Sales sidebar "Master Item" with Boxes icon).
- LOGISTICS_SUBCATEGORIES: `["Udara","Laut","Darat","Pabean","Handling","Trucking",
  "Container","Freight Forwarding","Lainnya"]`
- UNITS: `["pcs","kg","cbm","container","shipment","dokumen","trip","ton","hari"]`

## Sales & Purchase Modules

- BizPortal includes Odoo-style Sales and Purchase modules (admin role only).
- Sales: quotations (SQ/YYYY/00001) → confirm → sales orders (SO) with invoice
  (`none|to_invoice|invoiced`) and delivery (`none|to_deliver|delivered`)
  sub-statuses. Customers managed at `/sales/customers`. Master items at `/sales/items`.
- Purchase: RFQs (RFQ/YYYY/00001) → confirm → purchase orders (PO) with receive
  and bill sub-statuses. Vendors are the existing `suppliers` table from Trading.
- Both editors expose a `taxRateId` (PPN) selector. Sales/Purchase document rows
  store `taxRateId`, `taxAmount`, and `grandTotal` (subtotal + taxAmount).
  New documents auto-fill from `accountingSettings.defaultSalesTaxId` /
  `defaultPurchaseTaxId`.
- Sales Quotation/Order editor item picker: Popover-based `ItemPicker` component
  with live search (name/SKU), filter by jenis (barang/jasa) and sub-kategori,
  per-item unit/price display, "Custom" option, and "Tambah Item Baru ke Master" link.
  Selecting an item auto-fills name, unit price, and default sales tax.
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

## Freight Forwarding Module

- Route: `/logistics/freight` (admin, logistics roles)
- DB tables: `freight_shipments`, `freight_rfqs`, `freight_quotes`
- Enums: `freight_shipment_status` (draft→rfq_sent→confirmed→in_transit→completed/cancelled), `freight_quote_status` (pending/approved/rejected)
- API routes (under `/api/logistics/`): `freight-shipments` (CRUD), `freight-shipments/:id/rfqs` (POST), `freight-rfqs/:id` (PUT), `freight-rfqs/:rfqId/quotes` (POST), `freight-quotes/:id` (PUT/DELETE), `freight-quotes/:id/approve` (POST)
- Approving a quote → sets that quote to approved, all others in same RFQ to rejected, closes the RFQ, sets shipment status to confirmed
- Shipment numbers auto-generated server-side: `FS/YYYY/nnnnnn`; RFQ numbers: `RFQ-F/YYYY/nnnnnn`
- Frontend: list page at `/logistics/freight`, full-page editor at `/logistics/freight/new` and `/logistics/freight/edit/:id`, detail page at `/logistics/freight/:id` (with RFQ management, quote comparison, approve button)
- Print packing list via `window.print()` — a hidden print-only section in the detail page renders the packing list
- AppShell: Logistics converted from flat nav item to group with sub-items (Pengiriman, Freight Forwarding)
- Document Management: `freight_attachments` table extended with `doc_type` (BL/AWB/PIB/PEB/DO/Invoice/PackingList), `doc_number`, `doc_date`, `doc_status` (draft/issued/submitted/received), `invoice_id`; API routes GET/POST/PUT/DELETE at `/api/logistics/freight-shipments/:id/attachments` and `/api/logistics/freight-shipments/:id/attachments/:id`; `FreightAttachmentsPanel` has 3 tabs: **Dokumen Resmi** (structured document upload form with type/number/date/status + inline editing per row), **Foto Kargo** (camera upload), **Scan Barcode/QR** (ZXing); panel integrated into freight detail page

### Profitability Report per Shipment

- Endpoint: `GET /api/logistics/freight-shipments/:id/profitability`
- Returns: `{ revenue, totalCost, profit, margin, currency, shipmentNumber, invoiceStatus }`
- Revenue = `grandTotal` of the linked Sales Order (only when `invoiceStatus = "invoiced"`, else 0)
- Total Cost = sum of all posted expenses linked to the shipment
- Frontend card on freight detail page shows 4 KPIs (Revenue, Total Cost, Profit, Margin %) with green/red color coding

### Business Validation Rules

- **No Shipment → No Invoice**: `POST /api/sales/documents/:id/actions/mark_invoiced` returns 400 if no linked freight shipment exists
- **No Sales Order → No Shipment**: `POST /api/logistics/freight-shipments` requires `salesDocId`; freight editor shows required SO picker
- **No Category → No Expense**: `POST /api/expenses` requires `categoryId`
- Quote approval stores `approvedVendorName` (string field on `freight_shipments` table)

### Demo Seed Data (`artifacts/api-server/src/lib/seedDemoData.ts`)

- Idempotent startup seed (checks for `SO-DEMO-2026-001` before running)
- Creates: 8 expense categories, 1 demo customer (PT. Ekspedisi Nusantara), 1 confirmed+invoiced Sales Order (IDR 19,000,000), 1 in-transit freight shipment (FS-DEMO-2026-001, Jakarta→Singapore, FCL 20'), 3 freight documents (BL, Packing List, PEB), 3 expenses (Ocean Freight IDR 12.5M posted, Handling IDR 1.8M posted, Customs IDR 750K draft)
- Demo profitability: Revenue 19,000,000 / Cost 15,050,000 / Profit 3,950,000 / Margin 20.8%
- Chained after `seedLogisticsServiceItems()` in `index.ts` to ensure product IDs are available

### Sales Order ↔ Shipment Linkage (Module 7 completion)

- `freight_shipments.sales_doc_id` (FK → `sales_documents.id`) links shipments to their originating Sales Order.
- `freight_shipments.transport_mode` mirrors Sales Order transport mode on the shipment.
- `sales_documents` has logistics fields: `origin`, `destination`, `transport_mode`, `etd` (date), `eta` (date).
- Sales Order editor (`quotation-editor.tsx`) has a "Detail Logistik" card (origin, destination, transport mode, ETD, ETA) and, on the order view, a "Shipment / Job Terkait" panel that lists linked shipments + a "Buat Pengiriman" button. The button links to `/logistics/freight/new?salesDocId=X&origin=...&destination=...&consigneeName=...&transportMode=...` to pre-fill the new shipment form.
- Freight editor (`logistics-freight-editor.tsx`) reads all URL params on mount to pre-fill origin, destination, consigneeName, transportMode, and sets salesDocId state.
- Freight detail page (`logistics-freight-detail.tsx`) shows a "Sales Order & Invoice" card when `salesDocId` is set: displays SO number, customer name, grand total, invoice status badge, and a "Lihat Sales Order" button; shows a callout when invoice status is `to_invoice`.
- Freight list endpoint accepts `?salesDocId=N` filter.

### Logistics Service Items Seed

- `artifacts/api-server/src/lib/seedLogisticsItems.ts` — idempotent startup seed that inserts 10 pre-defined logistics jasa items into `products` (itemType="jasa", subcategory="Logistics Services"):
  - SVC-OCEAN-FREIGHT, SVC-AIR-FREIGHT, SVC-TRUCKING, SVC-HANDLING, SVC-CUSTOMS, SVC-PPJK, SVC-PORT-CHARGES, SVC-STORAGE, SVC-EMKL, SVC-INSURANCE
- Called in `index.ts` alongside `seedAccountingDefaults()` using `.onConflictDoNothing({ target: productsTable.sku })`.
- These appear in the item picker on Sales Orders filtered by `itemType = jasa`.

## Expense / Biaya Operasional Module

- Routes: `/expense` (list), `/expense/new` (create), `/expense/:id` (edit/detail), `/expense/categories` (categories management)
- DB tables: `expense_categories`, `expenses`, `expense_attachments`
- Expense number auto-generated: `EXP/YYYY/NNNNN`
- Status flow: `draft` → `submitted` → `approved` → `posted` → `paid` / `rejected`
- Expense types: `vendor_bill`, `reimbursement`, `internal`
- API routes (under `/api/expenses/`): CRUD at `/`, `/:id`, status actions at `/:id/action` (submit/approve/reject/post/pay/reset), attachments at `/:id/attachments`, categories CRUD at `/categories`, seed at `/seed-categories`
- Posting action: creates accounting journal entry via `postEntry()` using the PUR (purchase) journal; lines: DR expense_account, DR ppnInput (if tax), CR payable_account
- Expense categories have: `expenseAccountId` (debit) and `payableAccountId` (credit) — can be overridden per expense
- Seed categories: TRUCKING, HANDLING, STORAGE, CUSTOMS, DOCUMENT, FREIGHT, CONTAINER, OPERATIONAL, REIMBURSEMENT (requiresAttachment=true), VENDOR
- AppShell: "Biaya Operasional" nav group (icon: DollarSign) with sub-items "Daftar Expense" and "Kategori Biaya"
- Frontend pages: `artifacts/bizportal/src/pages/expense/index.tsx`, `editor.tsx`, `categories.tsx`
- Schema: `lib/db/src/schema/expenses.ts`
- API route: `artifacts/api-server/src/routes/expenses.ts`

## Correspondence Module

- Route: `/correspondences` (admin role only)
- DB tables: `correspondences` (kind enum: email/whatsapp/letter/other, direction: inbound/outbound) and `correspondence_attachments`
- API: CRUD at `/api/correspondences` with full attachment management (`/api/correspondences/:id/attachments`)
- Frontend: full list, filter by kind/direction/search, create/edit dialog, detail view with attachment upload, delete confirmation
- Attachment upload via object storage (reuses `useUpload` hook); image attachments render inline in detail view
- OCR (Google Cloud Vision) deferred — placeholder extractedText field on attachments for manual or future API input
- Gmail OAuth deferred — manual entry for now
