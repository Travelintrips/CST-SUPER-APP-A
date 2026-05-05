# BizPortal — Multi-Division Business Management System

## Overview

BizPortal is an Odoo-style, multi-module ERP built as a **pnpm workspace monorepo**. It covers Sales, Purchase, Accounting, Logistics (Freight Forwarding), Expense Management, Correspondence, Ecommerce, Trading, and POS in a single integrated system. The primary audience is internal operations staff and administrators for a freight-forwarding / trading company based in Indonesia (IDR currency, Bahasa Indonesia UI).

## User Preferences

- Communicate concisely and clearly.
- Prefer iterative development with clear rationale for each step.
- Ask for confirmation before major architectural or schema changes.
- Provide detailed explanations for accounting logic and system integrations.
- Do **not** make changes to files outside the `artifacts`, `lib`, and `packages` directories.

## Monorepo Structure

```
/
├── artifacts/
│   ├── api-server/         Express 5 REST API backend (TypeScript)
│   ├── bizportal/          React + Vite frontend (TypeScript)
│   ├── cst-driver/         CST Driver — Expo (React Native) mobile app for truck drivers
│   ├── customer-portal/    Public-facing customer portal (React + Vite, port 23434, path /customer-portal/)
│   ├── logistic-order/     Export Import & Logistic Ordering System (React + Vite, port 19368, path /logistic-order/)
│   └── mockup-sandbox/     Component preview / design sandbox
├── lib/
│   └── db/                 Drizzle ORM schema + migrations (PostgreSQL)
└── packages/
    └── api-client-react/   Orval-generated React Query hooks from OpenAPI spec
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 (strict) |
| Backend | Express 5, Drizzle ORM, Zod/v4 |
| Database | PostgreSQL |
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui |
| Auth | Clerk (email + OAuth; `requireAdmin` middleware on all admin routes) |
| Routing | Wouter (frontend) |
| Data fetching | TanStack Query v5 + Orval-generated hooks |
| File storage | Replit Object Storage (`@workspace/object-storage-web`) |
| PDF generation | `@react-pdf/renderer` via print-to-PDF browser flow |
| Email | Nodemailer via SMTP (sends PDF attachments) |
| AI | OpenAI GPT-4 Vision via Replit AI Integrations proxy |
| Barcode/QR | ZXing (in-browser scanning) |

## Database Schema (`lib/db/src/schema/`)

| File | Key Tables |
|---|---|
| `users.ts` | `users` — Clerk userId, role (`admin`, `ecommerce`, `trading`, `logistics`, `pos`) |
| `customers.ts` | `customers` — Sales customers |
| `suppliers.ts` | `suppliers` — Purchase vendors |
| `products.ts` | `products`, `productCategories` — Master items with `itemType`, `unit`, `subcategory`, `isActive` |
| `stocks.ts` | `stocks` — Inventory movements |
| `salesDocuments.ts` | `salesDocuments`, `salesDocumentLines` — Quotations & Sales Orders; enums: `salesDocKindEnum` (quote/order), `salesDocStatusEnum`, `salesInvoiceStatusEnum`, `salesDeliveryStatusEnum`, `salesPaymentStatusEnum` |
| `purchaseDocuments.ts` | `purchaseDocuments`, `purchaseDocumentLines` — RFQs & Purchase Orders |
| `payments.ts` | `payments` — Payment records linked to sales/purchase documents |
| `accounting.ts` | `chartOfAccounts`, `accountingJournals`, `accountingTaxes`, `accountingEntries`, `accountingEntryLines` — Full double-entry accounting |
| `freightShipments.ts` | `freightShipments`, `freightRfqs`, `freightQuotes` — Freight lifecycle; status enum: `draft → rfq_sent → confirmed → in_transit → completed → cancelled` |
| `freightAttachments.ts` | `freightAttachments` — Photos, documents, and scanned BL/QR attached to shipments |
| `shipmentStages.ts` | `shipmentStages` — Booking / Trucking / Handling / Customs sub-stages per shipment |
| `expenses.ts` | `expenseCategories`, `expenses`, `expenseLines` — Operational expenses with `draft → submitted → approved → paid / rejected` workflow; linked to accounting CoA |
| `correspondences.ts` | `correspondences` — Inbound/outbound communications (email, WhatsApp, letter) with attachments |
| `orders.ts` | `orders` — Ecommerce orders |
| `shipments.ts` | `shipments` — Ecommerce shipments |
| `transactions.ts` | `transactions` — POS / trading transactions |
| `apiResponseTimes.ts` | `apiResponseTimes` — Internal API latency logging |
| `portalCustomers.ts` | `portal_customers` — Public portal customer accounts (separate from Clerk users); `portal_customer_services` — service subscriptions |
| `drivers.ts` | `drivers` — CST Driver accounts (email/password, vehicle info, license); auth via custom HMAC-SHA256 JWT |
| `driverJobs.ts` | `driver_jobs` (pgEnum `driver_job_status`), `driver_job_logs` (status history), `driver_photos` (delivery/POD photos) |

## API Routes (`artifacts/api-server/src/routes/`)

| Route file | Mounted at | Key responsibilities |
|---|---|---|
| `health.ts` | `/health` | Health check |
| `users.ts` | `/api/users` | User profile CRUD, role management |
| `dashboard.ts` | `/api/dashboard` | Summary metrics |
| `sales.ts` | `/api/sales` | Customer CRUD, quotation/order lifecycle, PDF/email actions |
| `purchase.ts` | `/api/purchase` | Vendor CRUD, RFQ/PO lifecycle |
| `freight.ts` | `/api/logistics` | Freight shipment CRUD, RFQ/quote flow, stage management, profitability |
| `logistics.ts` | `/api/logistics` | Additional logistics helpers |
| `expenses.ts` | `/api/expenses` | Expense category + expense CRUD, status transitions |
| `accounting.ts` | `/api/accounting` | CoA, journals, taxes, entries; auto-post helpers; boot seeder |
| `reports.ts` | `/api/reports` | Trial Balance, General Ledger, P&L, Balance Sheet |
| `payments.ts` | `/api/payments` | Payment recording for sales/purchase docs |
| `correspondences.ts` | `/api/correspondences` | Correspondence CRUD + attachments |
| `scanDocument.ts` | `/api/scan-document` | OpenAI GPT-4 Vision structured extraction |
| `storage.ts` | `/api/storage` | Object storage upload/download (public & private) |
| `ecommerce.ts` | `/api/ecommerce` | Ecommerce product/order management |
| `trading.ts` | `/api/trading` | Trading module |
| `pos.ts` | `/api/pos` | POS module |
| `driver.ts` | `/api/driver` (mobile) + `/api/drivers` (admin) | Driver mobile auth (login/me), job list/status updates, photo/POD upload; admin CRUD for drivers + job assignment to freight shipments |

Document numbering follows the pattern `PREFIX/YYYY/NNNNNN` (e.g., `SHP/2026/123456`).

## Frontend Pages (`artifacts/bizportal/src/pages/`)

| File/Dir | Path | Description |
|---|---|---|
| `dashboard.tsx` | `/` | Business metrics summary |
| `sales/` | `/sales/*` | Customer list, quotation/order editor, detail view |
| `purchase/` | `/purchase/*` | Vendor list, RFQ/PO editor, detail view |
| `logistics.tsx` | `/logistics` | Logistics overview |
| `logistics-freight.tsx` | `/logistics/freight` | Freight shipment list with status filter |
| `logistics-freight-detail.tsx` | `/logistics/freight/:id` | Shipment detail, RFQ/quote management, stage tracking, Biaya Operasional expenses with cost comparison summary (vs. approved quote + actualCost), attachments, profitability, **Driver Trucking panel** (assign driver, view job status) |
| `logistics-drivers.tsx` | `/logistics/drivers` | Driver management — list/create/edit drivers, stats cards, job history expansion |
| `logistics-freight-editor.tsx` | `/logistics/freight/edit/:id` | Edit shipment fields |
| `logistics-freight-bl.tsx` | `/logistics/freight/:id/bl` | Bill of Lading print view |
| `expense/` | `/expense/*` | Expense list, new/edit form, detail view |
| `accounting/` | `/accounting/*` | CoA, journals, taxes, entries, financial reports |
| `accounting/reconciliation.tsx` | `/accounting/reconciliation` | Bank reconciliation — filter by account & period, mark/unmark lines, summary cards, Print + Export XLSX |
| `reports/` | `/reports/*` | P&L, Balance Sheet, Trial Balance, General Ledger |
| `correspondences.tsx` | `/correspondences` | Communication log |
| `ecommerce.tsx` | `/ecommerce` | Ecommerce module |
| `trading.tsx` | `/trading` | Trading module |
| `pos.tsx` | `/pos` | POS module |
| `users.tsx` | `/users` | Admin user management |
| `settings.tsx` | `/settings` | System configuration |
| `welcome.tsx` | `/welcome` | Onboarding / welcome screen |

## Key Implementation Notes

### Accounting System
- Full double-entry: every confirmed sale, purchase, and expense creates `accountingEntries` + `accountingEntryLines`.
- An idempotent boot seeder at startup creates the default Indonesian Chart of Accounts and standard taxes if they don't exist.
- `requireAdmin` middleware wraps all accounting routes.

### Freight Module
- Shipments link to `salesDocuments` via `salesDocId` for revenue linkage.
- Profitability endpoint aggregates approved quote total vs. actual cost.
- The Biaya Operasional (operational expenses) card on the detail page shows all linked expenses, sums them, and compares the total against `actualCost` (shipment field) and/or `quotedCost` (approved vendor quote total) with a color-coded variance row.
- Attachments support camera capture, file upload, and ZXing barcode/QR scanning.

### Expense Module
- `expenseCategories` link to CoA accounts (`expenseAccountId`, `payableAccountId`).
- Expenses can be linked to a `shipmentId` (freight) or standalone.
- Status flow: `draft → submitted → approved → paid` or `→ rejected`.

### API Client
- All frontend API calls go through Orval-generated hooks in `@workspace/api-client-react`.
- After backend schema or route changes, run `pnpm --filter @workspace/api-client-react run codegen` to regenerate.

### Customer Portal — Public Website Pages

The customer portal (`/customer-portal/`) has been upgraded with the following pages and sections:

- **Homepage** (`home.tsx`): Hero → Trust Signals → **Layanan Populer** (dark section with 4 service cards) → **Promo & Penawaran** (3 promo cards with badges) → **Kalkulator CTA Banner** → Tentang Kami → Mengapa Pilih Kami → CTA → Kontak
- **Freight Cost Calculator** (`/calculator`): Estimates sea freight, air freight, customs, domestic, warehousing, and project cargo with CBM/volumetric weight formulas, insurance (0.5%), express (+20%), displayed in IDR.
- **Navbar**: Services item now has a **mega menu** (8 service links with icons + descriptions, desktop hover, mobile accordion). Calculator link added.
- **i18n**: New keys added to `id-ID` and `en-US` blocks: `nav.calculator`, `servicesMenu.*`, `homePromo.*`, `calculator.*` (other 16 languages fall back to en-US).

### Customer Portal Admin CMS
- Route: `/customer-portal/admin` — accessible only after login.
- **Claim admin**: any logged-in user can enter `PORTAL_ADMIN_KEY` (set as Replit Secret) to promote their account to `role = 'admin'` and receive a refreshed JWT.
- **Admin tabs**: "Konten Website" (hero/about/contact text), "Kelola Layanan" (edit service name/desc/image), "Kelola Produk" (edit product name/desc/price/image).
- **Image upload**: admin can upload images via presigned URL from `POST /api/portal/admin/upload-url`; images stored in Replit Object Storage and served at `/api/storage/public-objects/...`.
- **Dynamic content**: homepage (`home.tsx`) loads from `GET /api/portal/content` and falls back to hardcoded defaults. Editable keys: `hero_title`, `hero_subtitle`, `hero_cta`, `about_title`, `about_body`, `contact_phone`, `contact_email`, `contact_address`, `footer_tagline`.
- DB tables: `portal_customers.role` (default `'customer'`), `portal_content` (key/value/updated_at).
- JWT payload now includes `role` field; `isPortalAdmin()` helper in `auth.ts` decodes it client-side.

### Object Storage
- Product images and document attachments use Replit Object Storage.
- Private objects require a signed URL; public objects are served directly.

### Document Generation
- Sales quotes/orders: React component rendered via browser print (`window.print()`).
- Bill of Lading: Dedicated print page at `/logistics/freight/:id/bl`.
- Emails: PDFs generated server-side via Puppeteer-style flow or sent as attachments by Nodemailer.

### WhatsApp Notifications (Fonnte)
Admin notifications are sent via [Fonnte](https://fonnte.com) on these events:
- **Logistic Order baru** (dari Customer Portal) — `logisticOrders.ts`
- **Sales Quotation / Sales Order baru** (dari BizPortal) — `sales.ts`
- **E-commerce Order baru** (dari Customer Portal) — `ecommerce.ts`
- **Status logistic order berubah** (notif ke customer) — `logisticOrders.ts`

Required env vars (set as Replit Secrets):
| Variable | Purpose |
|---|---|
| `FONNTE_TOKEN` | API token dari akun Fonnte |
| `FONNTE_ADMIN_WA` | Nomor WhatsApp admin yang menerima notifikasi (format: `628xxxxxxxxxx`) |

If either is missing, notifications are silently skipped — no error thrown.

## Development Workflow

1. Backend changes: edit routes in `artifacts/api-server/src/routes/`, update schema in `lib/db/src/schema/`, run migrations.
2. Schema changes: update Drizzle schema → push migration → regenerate Orval client.
3. Frontend: edit pages in `artifacts/bizportal/src/pages/`; components in `artifacts/bizportal/src/components/`.
4. Both workflows (`artifacts/api-server: API Server` and `artifacts/bizportal: web`) must be running for the app to function.
