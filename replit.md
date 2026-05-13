# BizPortal

BizPortal is a multi-module ERP system designed for internal operations, covering Sales, Purchase, Accounting, Logistics, Expense Management, Correspondence, Ecommerce, Trading, and POS.

## Run & Operate

To run BizPortal, ensure the following environment variables are set:

- `FONNTE_TOKEN`: Fonnte API token
- `FONNTE_ADMIN_WA`: Fallback WhatsApp admin group ID (can be overridden by DB)
- `ADMIN_EMAIL`: Admin email address
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`: SMTP configuration for email (optional)
- `PORTAL_ADMIN_KEY`: Key to claim admin role in the customer portal

Commands:

- **Start all services**: `pnpm dev`
- **Build API client**: `pnpm --filter @workspace/api-client-react run codegen` (after backend schema/route changes)
- **Database Migrations**:
    - Update Drizzle schema in `lib/db/src/schema/`
    - Generate migration: `drizzle-kit generate`
    - Push migration: `drizzle-kit push`

## Stack

- **Runtime**: Node.js 24, TypeScript 5.9
- **Backend**: Express 5, Drizzle ORM, Zod/v4, OpenID Connect (Auth)
- **Database**: PostgreSQL
- **Frontend**: React 19, Vite, Tailwind CSS, shadcn/ui, Wouter, TanStack Query v5, Orval
- **Storage**: Replit Object Storage
- **PDF**: `@react-pdf/renderer` (browser print)
- **Email**: Nodemailer
- **AI**: OpenAI GPT-4 Vision (via Replit AI Integrations proxy)
- **Barcode/QR**: ZXing

## Where things live

- **API Server**: `artifacts/api-server/`
- **Frontend (BizPortal)**: `artifacts/bizportal/`
- **Customer Portal**: `artifacts/customer-portal/`
- **CST Driver Mobile App**: `artifacts/cst-driver/`
- **DB Schema & Migrations**: `lib/db/src/schema/`
- **API Client (Orval-generated)**: `packages/api-client-react/`
- **API Routes**: `artifacts/api-server/src/routes/`
- **Frontend Pages**: `artifacts/bizportal/src/pages/`
- **Fonnte Webhook**: `artifacts/api-server/src/lib/orderNotification.ts`

## Architecture decisions

- **Monorepo Structure**: Utilizes `pnpm workspace` for managing multiple applications and shared libraries.
- **Full Double-Entry Accounting**: Every confirmed financial transaction automatically generates accounting entries for robust financial tracking.
- **Dynamic Customer Portal Content**: Website content is editable via an admin CMS and stored in the database, with hardcoded defaults as fallback.
- **Multi-channel Notifications**: Automated WhatsApp and email notifications are sent to admins, vendors, and customers for new logistic orders, ensuring broad communication.
- **Orval-generated API Client**: Frontend API interactions rely on automatically generated hooks, promoting type safety and reducing manual effort for API integration.
- **Unified Vendor Table**: `delivery_vendors` merged into `suppliers` — all vendor types (purchase & logistics service) live in one table. New fields: `serviceType`, `isActive`, `logo`, `eta`, `fee`, `note`, `sortOrder`. Portal API maps `contactEmail` → `email` for backward compat. `logistics-vendors` page redirects to `purchase/vendors`.
- **Vendor Etalase (Catalog)**: Each vendor has its own product/service catalog (`vendor_catalog_items` table). Catalog items have type (product/service), name, description, unit, price_base, markup_pct, is_active, sort_order. Managed via `/purchase/vendors/:id` detail page in BizPortal. API: `GET/POST /api/trading/suppliers/:id/catalog`, `PUT/DELETE /api/trading/suppliers/catalog/:itemId`.

## Product

- **Comprehensive ERP**: Manages sales, purchases, accounting, logistics, expenses, and more in a unified system.
- **Logistics Module**: Features freight shipment lifecycle management, RFQ/quote flows, stage tracking, and profitability analysis with operational expense comparison.
- **Customer Portal**: Public-facing portal with a homepage, freight cost calculator, mega menu for services, and i18n support.
- **Customer Portal Admin CMS**: Allows administrators to manage website content, services, and products dynamically.
- **Vendor Detail & Etalase**: Clicking the Store icon on any vendor row opens a dedicated detail page showing vendor info cards + an Etalase table. Per-item pricing with Harga Dasar, Markup (%), and Harga Jual computed live.
- **Integrated Object Storage**: Handles product images and document attachments with support for public and private access.
- **Document Generation**: Supports generating sales quotes/orders and Bills of Lading, with email integration for PDF attachments.
- **AI-Powered Document Scanning**: Utilizes OpenAI GPT-4 Vision for structured data extraction from scanned documents.

## User preferences

- Gunakan Bahasa Indonesia dalam semua komunikasi.
- Communicate concisely and clearly.
- Prefer iterative development with clear rationale for each step.
- Ask for confirmation before major architectural or schema changes.
- Provide detailed explanations for accounting logic and system integrations.
- Do **not** make changes to files outside the `artifacts`, `lib`, and `packages` directories.

## Gotchas

- Frontend API client (`@workspace/api-client-react`) requires regeneration via `pnpm --filter @workspace/api-client-react run codegen` after any backend schema or route changes.
- Accounting system includes an idempotent boot seeder that creates default Indonesian Chart of Accounts and standard taxes if they don't exist; be aware of this on initial setup or resets.
- Admin routes are protected by `requireAdmin` middleware, and customer portal admin access is granted via a `PORTAL_ADMIN_KEY`.
- Email functionality is dependent on `SMTP_HOST/USER/PASS` environment variables; if not configured, emails will not be sent.
- Document numbering follows `PREFIX/YYYY/NNNNNN` format.

## Pointers

- **Drizzle ORM Documentation**: For database schema definition and migrations.
- **Orval Documentation**: For API client generation.
- **TanStack Query Documentation**: For data fetching and state management in React.
- **Express.js Documentation**: For backend API development.
- **Replit Object Storage Documentation**: For file storage integration.
- **OpenAI GPT-4 Vision API Documentation**: For AI-powered document scanning.