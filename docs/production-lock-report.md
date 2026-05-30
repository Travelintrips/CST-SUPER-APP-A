# Phase 6 — Final Production Lock Report

**Tanggal:** 2026-05-30  
**Dibuat oleh:** Phase 6 Production Lock Process  
**Status Phase sebelumnya:** Phase 1–5 PASS (18/18 regression + 12/12 exceptions/governance)  
**Tujuan:** Mengunci sistem sebelum drop/delete fisik pada release berikutnya.

---

## A. BACKUP CHECKLIST

> Checklist ini **wajib diselesaikan sebelum menjalankan** migration drop atau perubahan schema apapun di production.

### A.1 Pre-Backup Verification

| # | Langkah | Perintah | Status |
|---|---|---|---|
| A.1.1 | Konfirmasi koneksi ke production DB | `psql $SUPABASE_PG_URL -c "SELECT NOW();"` | ☐ |
| A.1.2 | Cek versi PostgreSQL | `psql $SUPABASE_PG_URL -c "SELECT version();"` | ☐ |
| A.1.3 | Catat jumlah row tabel legacy | Lihat A.2 | ☐ |

### A.2 Row Count Verification (Tabel Legacy)

Jalankan sebelum backup dan sebelum drop:

```sql
SELECT 'workflow_events' AS tabel, COUNT(*) AS rows FROM workflow_events;
SELECT 'shipments'       AS tabel, COUNT(*) AS rows FROM shipments;
SELECT 'freight_shipments' AS tabel, COUNT(*) AS rows FROM freight_shipments;
```

**Expected result saat ini:**
| Tabel | Rows Expected | Keterangan |
|---|---|---|
| `workflow_events` | 0 | No active writer sejak Phase 1 |
| `shipments` | 0 | logistics.ts di-unmount Phase 4 |
| `freight_shipments` | N (aktif) | Tabel pengganti aktif |

### A.3 Full Database Snapshot

| # | Langkah | Perintah | Status |
|---|---|---|---|
| A.3.1 | pg_dump seluruh DB ke file lokal | `pg_dump "$SUPABASE_PG_URL" --format=custom --file="backup_prod_$(date +%Y%m%d_%H%M%S).dump"` | ☐ |
| A.3.2 | Verifikasi ukuran backup file | `ls -lh backup_prod_*.dump` | ☐ |
| A.3.3 | Test restore ke DB staging (opsional tapi sangat disarankan) | `pg_restore --list backup_prod_*.dump \| head -20` | ☐ |
| A.3.4 | Upload backup ke object storage / S3 | Manual — simpan di lokasi redundant | ☐ |

### A.4 Targeted Table Backup (untuk tabel yang akan di-drop)

```bash
# Backup tabel workflow_events (meski 0 rows, untuk audit trail)
pg_dump "$SUPABASE_PG_URL" \
  --table=workflow_events \
  --format=plain \
  --file="backup_workflow_events_$(date +%Y%m%d).sql"

# Backup tabel shipments beserta enum
pg_dump "$SUPABASE_PG_URL" \
  --table=shipments \
  --format=plain \
  --file="backup_shipments_$(date +%Y%m%d).sql"
```

| # | Langkah | Status |
|---|---|---|
| A.4.1 | Backup `workflow_events` ke SQL plain | ☐ |
| A.4.2 | Backup `shipments` ke SQL plain | ☐ |
| A.4.3 | Simpan file backup di minimal 2 lokasi berbeda | ☐ |
| A.4.4 | Catat checksum backup: `md5sum backup_*.sql` | ☐ |

### A.5 Schema Snapshot

```bash
# Snapshot DDL seluruh schema
pg_dump "$SUPABASE_PG_URL" --schema-only \
  --file="schema_snapshot_$(date +%Y%m%d_%H%M%S).sql"
```

| # | Langkah | Status |
|---|---|---|
| A.5.1 | Ambil schema-only dump | ☐ |
| A.5.2 | Simpan bersama backup data | ☐ |

---

## B. DROP MIGRATION DRAFT

**File:** `lib/db/migrations/next-release-drop-legacy-tables.sql`

> File migration sudah dibuat. **JANGAN dijalankan sekarang.** Lihat file untuk detail lengkap urutan eksekusi dan prasyarat.

### Ringkasan DROP Plan

```sql
-- Step 1: Verifikasi 0 rows
SELECT COUNT(*) FROM workflow_events;  -- must = 0
SELECT COUNT(*) FROM shipments;        -- must = 0

-- Step 2: Drop indexes
DROP INDEX IF EXISTS workflow_events_status_idx;
DROP INDEX IF EXISTS workflow_events_entity_idx;

-- Step 3: Drop tabel workflow_events
DROP TABLE IF EXISTS workflow_events;

-- Step 4: Drop tabel shipments + enum
DROP TABLE IF EXISTS shipments;
DROP TYPE  IF EXISTS shipment_status;

-- Step 5: Verifikasi post-drop
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('workflow_events', 'shipments');
-- Expected: 0 rows
```

### Pembersihan Kode Bersama Migration

| File | Aksi |
|---|---|
| `lib/db/src/schema/workflowEvents.ts` | Hapus seluruh file |
| `lib/db/src/schema/shipments.ts` | Hapus seluruh file |
| `lib/db/src/schema/index.ts` | Hapus `export * from "./workflowEvents"` |
| `artifacts/api-server/src/lib/phase1Migration.ts` | Hapus block CREATE TABLE `workflow_events` (lines 9–29) |
| `artifacts/api-server/src/routes/logistics.ts` | Hapus seluruh file |

### Alasan Drop Aman

| Tabel | Rows | Active Reader | Active Writer | Pengganti |
|---|---|---|---|---|
| `workflow_events` | 0 | ❌ Tidak ada | ❌ Tidak ada | — (tidak pernah diimplementasikan) |
| `shipments` | 0 | ❌ Tidak ada (Phase 5: dashboard fix) | ❌ Tidak ada (Phase 4: unmount) | `freight_shipments` |

---

## C. ROLLBACK PLAN

> Jika terjadi masalah setelah DROP dijalankan, gunakan checklist ini.

### C.1 Restore `shipments`

**Kapan digunakan:** Ditemukan query atau aplikasi yang masih mengakses tabel `shipments` setelah drop.

```bash
# Step 1: Restore dari backup plain SQL
psql "$SUPABASE_PG_URL" < backup_shipments_YYYYMMDD.sql

# Step 2: Verifikasi restore
psql "$SUPABASE_PG_URL" -c "SELECT COUNT(*) FROM shipments;"

# Step 3: Re-create enum jika perlu (sudah ada di backup SQL, tapi manual fallback):
psql "$SUPABASE_PG_URL" -c "
  CREATE TYPE shipment_status AS ENUM (
    'pending', 'picked_up', 'in_transit',
    'out_for_delivery', 'delivered', 'failed'
  );
"

# Step 4: Re-create tabel jika backup tidak otomatis (fallback manual):
psql "$SUPABASE_PG_URL" -c "
  CREATE TABLE IF NOT EXISTS shipments (
    id               SERIAL PRIMARY KEY,
    order_id         INTEGER,
    tracking_number  TEXT NOT NULL UNIQUE,
    carrier          TEXT NOT NULL,
    status           shipment_status NOT NULL DEFAULT 'pending',
    origin           TEXT NOT NULL,
    destination      TEXT NOT NULL,
    estimated_delivery TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
  );
"
```

**Catatan:** Tabel `shipments` memiliki 0 rows, jadi restore tidak membawa data bisnis aktif. Restore murni untuk kompatibilitas schema.

**Pemulihan kode:**
1. Revert commit yang menghapus `lib/db/src/schema/shipments.ts`
2. Revert commit yang menghapus `export * from "./shipments"` di `index.ts`
3. Rebuild dan redeploy API server (`node build.mjs`)

---

### C.2 Restore `workflow_events`

**Kapan digunakan:** Ditemukan worker atau background process yang ternyata masih membutuhkan tabel ini.

```bash
# Step 1: Restore dari backup plain SQL
psql "$SUPABASE_PG_URL" < backup_workflow_events_YYYYMMDD.sql

# Step 2: Verifikasi restore
psql "$SUPABASE_PG_URL" -c "SELECT COUNT(*) FROM workflow_events;"

# Step 3: Re-create manual (fallback jika backup bermasalah):
psql "$SUPABASE_PG_URL" -c "
  CREATE TABLE IF NOT EXISTS workflow_events (
    id              SERIAL PRIMARY KEY,
    event_type      TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       INTEGER NOT NULL,
    company_id      INTEGER,
    payload         JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 3,
    process_after   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,
    error_message   TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS workflow_events_status_idx
    ON workflow_events(status, process_after);
  CREATE INDEX IF NOT EXISTS workflow_events_entity_idx
    ON workflow_events(entity_type, entity_id);
"
```

**Pemulihan kode:**
1. Revert commit yang menghapus `lib/db/src/schema/workflowEvents.ts`
2. Revert commit yang menghapus `export * from "./workflowEvents"` di `index.ts`
3. Revert penghapusan block di `phase1Migration.ts`
4. Rebuild dan redeploy API server

---

### C.3 Restore `logistics.ts` Route

**Kapan digunakan:** Ditemukan external sistem/integrasi yang ternyata masih memanggil endpoint legacy logistics.

```bash
# Route saat ini sudah di-unmount (di-comment di routes/index.ts).
# File logistics.ts masih ada di repo sampai release berikutnya.
```

**Langkah restore:**

1. Di `artifacts/api-server/src/routes/index.ts`, un-comment baris import dan mount:
   ```typescript
   import logisticsRouter from "./logistics.js";
   // ...
   app.use("/api/logistics", logisticsRouter);
   ```

2. Pastikan tabel `shipments` masih ada (lihat C.1 jika sudah di-drop).

3. Rebuild dan redeploy:
   ```bash
   cd artifacts/api-server && node build.mjs
   PORT=8080 NODE_ENV=production node --enable-source-maps ./dist/index.mjs
   ```

4. Test endpoint:
   ```bash
   curl -s "$API_URL/api/logistics/shipments" | jq '.total'
   ```

**Catatan:** Route ini hanya memiliki `GET /shipments` yang bersifat read-only. Semua write sudah diblokir oleh `deprecatedMiddleware` (return 410). Tidak ada risiko data corruption dari restore route ini.

---

### C.4 Rollback Decision Matrix

| Gejala | Tindakan |
|---|---|
| API error 500 terkait `relation "shipments" does not exist` | → Jalankan C.1 |
| API error 500 terkait `relation "workflow_events" does not exist` | → Jalankan C.2 |
| Endpoint `/api/legacy/shipments` 404 dan dibutuhkan | → Jalankan C.3 |
| Error Drizzle: `shipmentsTable is not defined` | → Revert schema file (C.1 step pemulihan kode) |
| Semua error di atas | → Restore full DB dari pg_dump (A.3.1) |

---

## D. FINAL REGRESSION TEST

**Tanggal run:** 2026-05-30  
**Environment:** Production (Replit hosted)  
**Phase sebelumnya yang lulus:** Phase 1–5 (18/18 regression + 12/12 exceptions/governance)

### D.1 RFQ V1 — Customer Portal

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R1.1 | Customer submit order baru | `POST /api/logistic-orders` | Order dibuat, status `"New Order"` | ☐ |
| R1.2 | Auto-create RFQ + notify vendor WA | `autoCreateRfqAndNotifyVendors()` | `logistic_order_rfqs` dibuat, WA terkirim | ☐ |
| R1.3 | Vendor load form via token | `GET /api/rfq/rfq-form?token=` | Form tampil dengan data order | ☐ |
| R1.4 | Vendor submit quote | `POST /api/rfq/vendor-quote` | `quoteStatus = "vendor_confirmed"` | ☐ |
| R1.5 | Vendor confirm via token | `POST /api/rfq/vendor-confirm` | Konfirmasi tersimpan, tidak bisa submit ulang | ☐ |
| R1.6 | Admin view choose-option | `GET /api/rfq/choose-option-form/:token` | Semua vendor quotes tampil | ☐ |
| R1.7 | Admin select vendor + kirim ke customer | `POST /api/rfq/choose-option` | `customerConfirmToken` di-set, WA terkirim | ☐ |
| R1.8 | Token invalid / expired | `GET /api/rfq/rfq-form?token=INVALID` | 404 Not Found | ☐ |

### D.2 RFQ V2 — BizPortal

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R2.1 | Admin buat RFQ dari order | `POST /api/rfq-v2/:orderId/create` | Status → `admin_review` | ☐ |
| R2.2 | Admin blast ke vendor terpilih | `POST /api/rfq-v2/:rfqId/blast` | `rfq_vendor_links` dibuat, WA/email terkirim | ☐ |
| R2.3 | Vendor buka link reply | `GET /api/rfq-v2/vendor-form/:token` | Form tampil dengan detail RFQ | ☐ |
| R2.4 | Vendor submit reply (harga + ETA) | `POST /api/rfq-v2/vendor-reply` | Reply tersimpan, status link → `replied` | ☐ |
| R2.5 | Admin view comparison | BizPortal `logistics-rfq-comparison.tsx` | Semua vendor reply tampil side-by-side | ☐ |
| R2.6 | Admin pilih vendor | `POST /api/rfq-v2/:rfqId/select-vendor` | Status → `vendor_selected` | ☐ |
| R2.7 | Admin kirim quote ke customer | `POST /api/rfq-v2/:rfqId/send-quote` | Status → `customer_quoted`, WA/email terkirim | ☐ |
| R2.8 | Duplicate vendor reply | Token yang sudah di-reply | 409 Conflict | ☐ |

### D.3 Vendor Mini Form (VMF)

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R3.1 | Admin buat form link (vendor target) | `POST /api/vendor-form/links` | Token link dibuat, dapat dibuka tanpa login | ☐ |
| R3.2 | Vendor load form via token | `GET /api/vendor-form/form/:token` | Schema fields tampil sesuai serviceType | ☐ |
| R3.3 | Vendor submit form lengkap | `POST /api/vendor-form/submit` | Saved di `vendor_mini_form_submissions` | ☐ |
| R3.4 | Vendor submit form dengan field wajib kosong | `POST /api/vendor-form/submit` | 400 dengan `missingFields` list | ☐ |
| R3.5 | Duplicate submit (sudah dikunci) | Submit ulang ke link yang locked | 409 "Penawaran sudah dikunci" | ☐ |
| R3.6 | Max submission quota tercapai | Submit ke link yang sudah full | 400 QUOTA_EXCEEDED | ☐ |
| R3.7 | Link deactivated oleh admin | Load form link yang dinonaktifkan | 410 Gone | ☐ |
| R3.8 | Vendor coba buka admin-only link | `formTarget = "admin"`, akses dari vendor | 404 Not Found | ☐ |
| R3.9 | External URL di attachmentUrl | `attachmentUrl = "https://evil.com/..."` | 400 — only `/objects/...` accepted | ☐ |
| R3.10 | Admin notification WA saat submission | Submit dari vendor | Admin WA berisi offer summary | ☐ |

### D.4 Customer Approval

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R4.1 | Customer approve via VMF link | `POST /api/vendor-form/customer-approval` | `customer_approvals.status = "approved"` | ☐ |
| R4.2 | Customer reject via VMF link | `POST /api/vendor-form/customer-approval` | `customer_approvals.status = "rejected"` | ☐ |
| R4.3 | Auto SO creation on approval | Setelah approve | `sales_documents` record dibuat, SO number di-set | ☐ |
| R4.4 | Customer approve via logistic confirm | `POST /api/rfq/:id/approve` | `logistic_orders.customerConfirmStatus = "confirmed"` | ☐ |
| R4.5 | Idempotent re-approve (token sama) | Approve kedua kali dengan token sama | 409 "Penawaran ini sudah direspons sebelumnya" | ☐ |
| R4.6 | Rate limit approval endpoint | 6+ request dalam 10 menit (token sama) | 429 Too Many Requests | ☐ |
| R4.7 | WA notifikasi admin setelah approve | Customer approve | Admin WA berisi SO number + nama customer | ☐ |

### D.5 Fulfillment

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R5.1 | Admin assign driver ke order | `POST /api/fulfillment/:orderId/assign-driver` | `driver_jobs` record dibuat | ☐ |
| R5.2 | Driver terima notifikasi job | WA ke driver saat assignment | WA dengan detail order + rute | ☐ |
| R5.3 | Driver update status: `PICKED_UP` | `PATCH /api/driver/jobs/:jobId/status` | Status update valid, activity log dibuat | ☐ |
| R5.4 | Driver update status: `IN_TRANSIT` | Valid transition dari `PICKED_UP` | Status berubah, WA ke customer | ☐ |
| R5.5 | Driver coba transisi tidak valid | `COMPLETED` → `IN_TRANSIT` | 400 dengan `allowedTransitions` | ☐ |
| R5.6 | Vendor fulfillment assignment | `POST /api/vendor-fulfillment` | `vendor_fulfillment_links` dibuat | ☐ |
| R5.7 | Order status sync ke logistic_orders | Setelah driver update | `logistic_orders.status` ikut update | ☐ |

### D.6 POD (Proof of Delivery)

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R6.1 | Driver submit POD (foto + nama penerima) | `POST /api/pod/:jobId` (via CST Driver app) | `driver_jobs.status = "DELIVERED"`, `podReceiverName` tersimpan | ☐ |
| R6.2 | POD foto tersimpan di object storage | Upload foto POD | URL tersimpan di `driver_photos` | ☐ |
| R6.3 | OCR scan POD dokumen | `POST /api/pod-ocr/scan` | Structured data extracted via GPT-4 Vision | ☐ |
| R6.4 | OCR result tersimpan | Setelah OCR berhasil | Row di `pod_ocr_results` dibuat | ☐ |
| R6.5 | WA notifikasi delivery ke customer | POD submitted | Customer WA berisi konfirmasi delivered | ☐ |
| R6.6 | Activity log POD submission | Setelah submit | `activity_logs` row `action = "pod_submitted"` | ☐ |

### D.7 Invoice

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R7.1 | Generate customer invoice dari SO | BizPortal → Sales → Generate Invoice | `sales_documents` record dengan `kind = "invoice"` | ☐ |
| R7.2 | Invoice number format | Generate invoice | Format `INV/YYYY/NNNNN` — sequential | ☐ |
| R7.3 | Invoice PDF preview | Klik preview di BizPortal | PDF render via `@react-pdf/renderer` tanpa error | ☐ |
| R7.4 | Email invoice ke customer | Kirim email invoice | Attachment PDF terkirim ke email customer | ☐ |
| R7.5 | Vendor bill dari purchase order | Purchase → Receive → Generate Bill | `purchase_documents` record dengan `kind = "bill"` | ☐ |
| R7.6 | Accounting entries otomatis | Setelah invoice confirmed | Double-entry di `transactions` (Piutang + Pendapatan) | ☐ |
| R7.7 | Invoice PDF via print browser | `window.print()` dari BizPortal | Layout print bersih tanpa UI chrome | ☐ |

### D.8 Manual Payment

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R8.1 | Staff catat payment manual | `POST /api/payments` | `payments` record dibuat, invoice → `paid` | ☐ |
| R8.2 | Accounting entry payment | Setelah payment dicatat | Debit Kas/Bank + Credit Piutang di `transactions` | ☐ |
| R8.3 | Payment amount > invoice | Overpayment input | 400 atau warning "Melebihi nilai invoice" | ☐ |
| R8.4 | Generate payment link Paylabs | `POST /api/payments/paylabs/create-link` | Paylabs payment URL dikembalikan | ☐ |
| R8.5 | Payment history tampil di BizPortal | GET payments by invoice | List payment tersedia di detail invoice | ☐ |
| R8.6 | Laporan cashflow terupdate | Setelah payment dicatat | Dashboard cashflow include payment baru | ☐ |

### D.9 Paylabs Webhook

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R9.1 | Paylabs kirim webhook `PAID` | `POST /api/payments/paylabs/webhook` | Invoice → `paid`, accounting entries dibuat | ☐ |
| R9.2 | Webhook signature valid | Payload dengan signature benar | 200 OK, diproses | ☐ |
| R9.3 | Webhook signature invalid | Payload dengan signature salah/kosong | 400 atau 401, payload diabaikan | ☐ |
| R9.4 | Webhook idempotent | Sama payload dikirim dua kali | Kedua kali 200 OK, data tidak duplikat | ☐ |
| R9.5 | Webhook status selain `PAID` | `PENDING` / `FAILED` / `EXPIRED` | Dicatat di log, tidak mengubah invoice status | ☐ |
| R9.6 | WA notifikasi payment | Setelah webhook `PAID` diproses | Customer WA berisi konfirmasi pembayaran | ☐ |

### D.10 Exception Flow

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R10.1 | Buat exception baru | `POST /api/exceptions` | Record di `exceptions` table, status `open` | ☐ |
| R10.2 | Assign exception ke staff | `PATCH /api/exceptions/:id` | `assignedTo` field terupdate | ☐ |
| R10.3 | Update severity | Ubah dari `high` ke `critical` | Field tersimpan, audit log dibuat | ☐ |
| R10.4 | Resolve exception | `PATCH /api/exceptions/:id` status → `resolved` | Status berubah, `resolvedAt` timestamp di-set | ☐ |
| R10.5 | Filter exception by module | `GET /api/exceptions?module=logistics` | Hanya exceptions dari modul logistics | ☐ |
| R10.6 | BizPortal list exceptions | `exceptions/index.tsx` | Semua exceptions tampil dengan filter + sorting | ☐ |
| R10.7 | Exception WA notification (critical) | Buat exception severity=critical | Admin WA notification terkirim | ☐ |
| R10.8 | Close exception | Status → `closed` | Tidak bisa di-reopen tanpa explicit action | ☐ |

### D.11 Governance Health

| # | Test Case | Route / File | Expected | Result |
|---|---|---|---|---|
| R11.1 | AI agent execution dicatat | `logExecution()` dipanggil | Row di `ai_agent_executions` dibuat | ☐ |
| R11.2 | Safety check trigger approval queue | Action dengan risk score > threshold | Row di `ai_approval_queue`, status `pending` | ☐ |
| R11.3 | Staff approve AI action | `POST /api/ai-approvals/:id/approve` | Action lanjut dieksekusi | ☐ |
| R11.4 | Staff reject AI action | `POST /api/ai-approvals/:id/reject` | Action dibatalkan, status `rejected` | ☐ |
| R11.5 | BizPortal tampilkan approval queue | `ai-approvals.tsx` | List pending approvals tampil | ☐ |
| R11.6 | Expired approval auto-rejected | Approval tidak di-respond dalam timeout | Status → `expired`, action tidak dieksekusi | ☐ |
| R11.7 | Governance health endpoint | `GET /api/ai-approvals/health` | JSON summary: pending/approved/rejected counts | ☐ |
| R11.8 | AI agent log retention | Query `ai_agent_executions` | Data tidak auto-deleted, tersedia untuk audit | ☐ |

### D.12 Summary Tabel Regression

| Flow | Total Test | Pass | Fail | Skip |
|---|---|---|---|---|
| D.1 RFQ V1 Customer Portal | 8 | ☐ | ☐ | ☐ |
| D.2 RFQ V2 BizPortal | 8 | ☐ | ☐ | ☐ |
| D.3 Vendor Mini Form | 10 | ☐ | ☐ | ☐ |
| D.4 Customer Approval | 7 | ☐ | ☐ | ☐ |
| D.5 Fulfillment | 7 | ☐ | ☐ | ☐ |
| D.6 POD | 6 | ☐ | ☐ | ☐ |
| D.7 Invoice | 7 | ☐ | ☐ | ☐ |
| D.8 Manual Payment | 6 | ☐ | ☐ | ☐ |
| D.9 Paylabs Webhook | 6 | ☐ | ☐ | ☐ |
| D.10 Exception | 8 | ☐ | ☐ | ☐ |
| D.11 Governance Health | 8 | ☐ | ☐ | ☐ |
| **TOTAL** | **81** | **☐** | **☐** | **☐** |

**Threshold GO:** 81/81 PASS, atau semua Critical PASS + tidak ada High yang FAIL.

---

## E. GO / NO-GO RECOMMENDATION

### E.1 Kondisi Saat Ini (2026-05-30)

| Dimensi | Status | Detail |
|---|---|---|
| **Phase 1–5 Regression** | ✅ PASS | 18/18 + 12/12 exceptions/governance |
| **Tabel legacy `workflow_events`** | ✅ SIAP DROP | 0 rows, 0 active reader/writer, confirmed Phase 5 |
| **Tabel legacy `shipments`** | ✅ SIAP DROP | 0 rows, reader di dashboard.ts sudah dipindah ke `freight_shipments` (Phase 5) |
| **Route `logistics.ts`** | ✅ SIAP DELETE | Di-unmount Phase 4, tidak ada dependent import aktif |
| **Migration file** | ✅ DIBUAT | `lib/db/migrations/next-release-drop-legacy-tables.sql` |
| **Rollback plan** | ✅ TERDOKUMENTASI | Section C dengan langkah lengkap |
| **Phase 6 regression (D.1–D.11)** | ⏳ BELUM DIJALANKAN | 81 test case tersedia, perlu dieksekusi di production |

### E.2 Syarat GO

Semua poin berikut **harus** terpenuhi sebelum release berikutnya menjalankan DROP:

- [ ] **G1** — Phase 6 regression test: semua 81 test case PASS (atau semua Critical PASS)
- [ ] **G2** — Full DB backup berhasil dibuat dan diverifikasi (pg_restore clean)
- [ ] **G3** — Targeted backup `workflow_events` + `shipments` tersimpan
- [ ] **G4** — `SELECT COUNT(*) FROM workflow_events` = 0 di production
- [ ] **G5** — `SELECT COUNT(*) FROM shipments` = 0 di production
- [ ] **G6** — Deploy kode bersih (hapus Drizzle schema + file) sudah live sebelum DROP dijalankan
- [ ] **G7** — Maintenance window dikomunikasikan ke tim ops
- [ ] **G8** — DBA / tech lead sign-off

### E.3 Syarat NO-GO (STOP jika salah satu terjadi)

| Kondisi | Tindakan |
|---|---|
| Phase 6 regression ada **Critical FAIL** | Block release — investigasi dan fix dulu |
| `COUNT(*) > 0` pada tabel yang akan di-drop | Investigasi sumber data, jangan drop |
| DB backup gagal atau corrupted | Jangan lanjutkan — ulangi backup |
| Ditemukan hidden caller ke `shipmentsTable` atau `workflowEventsTable` | Update cleanup list, re-audit |
| API server gagal start setelah deploy kode bersih | Rollback deploy, investigasi build error |

### E.4 Rekomendasi Final

> **REKOMENDASI: CONDITIONAL GO** ✅ (pending Phase 6 regression run + backup)

Berdasarkan Phase 1–5 audit yang sudah PASS dan konfirmasi bahwa kedua tabel legacy memiliki 0 rows dan 0 active callers, sistem dalam kondisi **SIAP** untuk release drop pada siklus berikutnya.

**Urutan aksi yang direkomendasikan:**

1. **Sekarang (Phase 6 prep):**
   - Jalankan seluruh 81 regression test di D.1–D.11
   - Ambil DB snapshot per checklist A

2. **Pada release berikutnya:**
   - Deploy kode bersih (hapus schema files + logistics.ts) ke production
   - Verify API server start bersih
   - Jalankan `lib/db/migrations/next-release-drop-legacy-tables.sql` step by step
   - Verifikasi post-drop (Step 5 di migration file)

3. **Jangan dilakukan:**
   - Jangan drop `logisticRfq.ts` — V1 RFQ masih aktif dipakai customer portal
   - Jangan modify `whatsapp_template_configs` — 107 rows data produksi aktif
   - Jangan drop `logisticRfqV2.ts` — V2 RFQ aktif di BizPortal

---

## F. LAMPIRAN

### F.1 File Terkait Phase 6

| File | Tujuan |
|---|---|
| `lib/db/migrations/next-release-drop-legacy-tables.sql` | DROP migration draft (jangan jalankan sekarang) |
| `docs/phase5-cleanup-report.md` | Detail audit Phase 5 |
| `docs/REGRESSION_CHECKLIST.md` | Checklist regression lengkap (Phase 1–5) |
| `lib/db/src/schema/workflowEvents.ts` | Schema legacy — akan dihapus |
| `lib/db/src/schema/shipments.ts` | Schema legacy — akan dihapus |
| `artifacts/api-server/src/routes/logistics.ts` | Route legacy — akan dihapus |
| `artifacts/api-server/src/lib/phase1Migration.ts` | Berisi CREATE TABLE `workflow_events` — perlu partial cleanup |

### F.2 Riwayat Phase

| Phase | Status | Catatan |
|---|---|---|
| Phase 1 | ✅ COMPLETE | Schema migration, order lifecycle, RFQ V1 |
| Phase 2 | ✅ COMPLETE | VMF, customer approval, SO creation |
| Phase 3 | ✅ COMPLETE | Fulfillment, POD, invoice, payment |
| Phase 4 | ✅ COMPLETE | logistics.ts freeze, system hardening, exceptions |
| Phase 5 | ✅ COMPLETE | Dashboard fix, deprecation headers, cleanup audit |
| Phase 6 | ⏳ IN PROGRESS | Production lock, regression, backup, drop prep |
