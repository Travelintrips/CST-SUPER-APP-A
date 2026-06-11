# AUDIT REPORT: Accounting, Tax & Financial Modules
**Tanggal Audit:** 09 Juni 2026  
**Scope:** Penjualan, Pembelian, Penerimaan, Pengeluaran, Accounting, Pajak, Laporan Pajak, Rekonsiliasi, Audit Trail  
**Auditor:** Automated Code Audit (7 parallel subagents)

---

## RINGKASAN EKSEKUTIF

Sistem ERP ini memiliki fondasi akuntansi yang **cukup solid** — double-entry enforced, multi-company isolation, auto-posting jurnal, dan reversal mechanism sudah ada. Namun terdapat **8 gap kritikal** dan **12 risiko medium** yang perlu ditangani sebelum sistem bisa dianggap audit-ready untuk pelaporan pajak formal.

---

## A. MODUL YANG SUDAH BENAR

### ✅ Accounting Core
- Double-entry validation ketat: `Math.abs(debit - credit) > 0.01` → throw error
- Multi-company isolation via `company_id` di semua tabel akuntansi
- Deduplication journal via `uniqueIndex("accounting_entries_source_uniq")`
- Reversal mechanism: `POST /entries/:id/reverse` (debit ↔ kredit)
- Status jurnal `draft` dan `posted`
- Cost center support untuk reporting departemen/proyek

### ✅ Alur Penjualan (Sales)
- Lifecycle status lengkap: `draft → sent → confirmed → done → cancelled`
- Payment status enum: `unpaid → partial → paid → overdue`
- Invoice status: `none → to_invoice → invoiced`
- Jurnal auto-post saat `invoiced`: DR Piutang / CR Pendapatan / CR PPN Keluaran
- COGS posting: DR HPP / CR Persediaan (via `postSalesCogs`)
- Sales return: reversal HPP + stock in otomatis
- Invoice reversal saat pembatalan (`postSalesInvoiceReversal`)

### ✅ Alur Pembelian (Purchase)
- Full cycle: PR → RFQ → VQ → PO → GRN → QC → VI → PayReq
- 3-way matching: PO ↔ GRN ↔ Vendor Invoice
- Jurnal GRN: DR Inventory / CR GR/IR Accrual
- Jurnal Vendor Bill: DR GR/IR / DR PPN Masukan / CR Hutang Usaha
- Jurnal Vendor Payment: DR Hutang Usaha / CR Bank
- Weighted Average Cost saat GRN dikonfirmasi
- Landed Cost allocation ke harga pokok barang
- Purchase Return: DR Hutang / CR Inventory + jurnal reversal

### ✅ Sistem Pajak
- Master `accounting_taxes`: kind (sale/purchase/withholding), cutType, link ke COA
- `transaction_taxes` sebagai tax ledger: baseAmount, taxAmount, period (YYYY-MM), status
- `tax_rules` engine untuk deteksi otomatis per tipe transaksi
- PPN Keluaran (sales) dan PPN Masukan (purchase) terpisah via `direction: input | output`
- PPh coverage: PPh 21 (5%), PPh 23 (2%), PPh 4(2) (10%), PPh 15 (1.1% freight)
- Auto-detect PPh 15 untuk Ocean Freight berdasarkan keyword "sea"/"kapal"
- NPWP dan Nomor Faktur Pajak fields di `transaction_taxes`
- Status pajak: `pending`, `paid`, `reported` dengan timestamp `paid_at`, `reported_at`

### ✅ Laporan Pajak & Rekonsiliasi
- Dashboard SPT Masa: rekap bulanan per tahun, status paid/reported/pending
- Laporan PPN Keluaran & Masukan per periode + kalkulasi Kurang/Lebih Bayar
- Rekap PPh 21, 23, 4(2) per jenis
- Export CSV via `/api/tax/export`
- Validasi kelengkapan: transaksi tanpa NPWP atau nomor faktur
- Rekonsiliasi Google Sheets dengan exact-match (Tanggal + Nominal + Jenis)
- Rekonsiliasi terjadwal otomatis + notifikasi WhatsApp admin
- Export XLSX + Print Preview untuk laporan rekonsiliasi

### ✅ Audit Trail (Partial)
- `erp_audit_logs`: action, module, reference_id, old_data (JSONB), new_data (JSONB), user_id
- `order_audit_logs` untuk modul logistik
- `activity_logs` dengan old_value/new_value
- `void_reason` di accounting_payments
- `rejection_reason` di approval workflow

---

## B. MODUL YANG BELUM LENGKAP

### ⚠️ 1. Jurnal PPN Masukan dari Expense — TIDAK masuk Buku Besar
**Masalah:** `postQuickExpenseJournal` tidak memisahkan PPN Masukan ke akun COA tersendiri. Nilai total (termasuk pajak) digabung ke akun beban. Akibatnya, **PPN Masukan dari expense tidak masuk ke Neraca** meskipun tercatat di `transaction_taxes`.

**Seharusnya:**
```
DR Akun Beban     = DPP (net of tax)
DR PPN Masukan    = tax amount
CR Kas/Bank/Hutang = total
```

**File:** `artifacts/api-server/src/routes/expenses.ts` → `postQuickExpenseJournal`

---

### ⚠️ 2. Retur Penjualan Tidak Membalik Invoice (Piutang)
**Masalah:** Fungsi `/sales/documents/:id/return` membalik COGS dan stok, tetapi **tidak otomatis membalik jurnal Invoice** (piutang dan pendapatan). Piutang tetap menggantung setelah barang dikembalikan kecuali ada proses manual.

**Seharusnya:** Retur penjualan harus membuat Credit Note yang membalik:
```
DR Pendapatan (reversal)
DR PPN Keluaran (reversal)
CR Piutang Usaha
```

**File:** `artifacts/api-server/src/routes/sales.ts`

---

### ⚠️ 3. PPh Withholding Tidak Otomatis saat Pembayaran
**Masalah:** Tidak ada mekanisme otomatis pemotongan PPh (PPh 23, PPh 4(2)) saat posting pembayaran di `postPaymentReceived`. Ini harus dilakukan manual atau tidak tercatat sama sekali.

**Seharusnya:** Saat vendor payment untuk jasa, jika ada withholding tax:
```
DR Hutang Usaha  = total invoice
CR Bank/Kas      = total invoice - PPh
CR PPh Payable   = PPh amount
```

**File:** `artifacts/api-server/src/lib/accounting.ts` → `postPaymentReceived`

---

### ⚠️ 4. Status Pembayaran Partial Tidak Auto-Update
**Masalah:** Enum `payment_status: partial` ada di schema, tetapi saat ada pembayaran masuk sebagian terhadap invoice, update status ke `partial` bergantung pada service eksternal yang tidak konsisten. Beberapa invoice bisa stuck di `unpaid` meski sudah ada partial payment.

**File:** `artifacts/api-server/src/routes/sales.ts`, `lib/paymentStatusService.ts` (jika ada)

---

### ⚠️ 5. Audit Trail Tidak Konsisten Antar Modul
**Masalah:** Field audit tidak seragam:

| Tabel | created_by | approved_by | cancelled_by | cancel_reason |
|-------|-----------|-------------|--------------|---------------|
| sales_documents | ✅ createdById | ❌ tidak ada | ❌ tidak ada | ❌ tidak ada |
| purchase_documents | ✅ createdById | ✅ approved_by | ❌ tidak ada | ❌ tidak ada |
| accounting_entries | ✅ createdById | ❌ tidak ada | ❌ tidak ada | di description |
| logistic_orders | ✅ createdByUserId | ✅ approvedAt | ❌ tidak ada | ✅ decline_reason |

Nama field tidak seragam: `created_by`, `created_by_id`, `created_by_user_id`.

---

### ⚠️ 6. Laporan Pajak Belum Ada Format PDF Resmi
**Masalah:** Export pajak hanya CSV biasa, belum ada:
- Template SPT Masa PPN (formulir 1111)
- Bukti Potong PPh 23 (format DJP)
- e-Faktur format file

---

### ⚠️ 7. PPh 21 Masih Flat Rate (Bukan Progresif/TER)
**Masalah:** PPh 21 menggunakan tarif flat 5%, belum mendukung:
- Tarif progresif Pasal 17 (5%/15%/25%/30%/35%)
- Metode TER (Tarif Efektif Rata-rata) sesuai PMK terbaru

---

### ⚠️ 8. Rekonsiliasi Bank Masih Manual/Google Sheets
**Masalah:** Tidak ada integrasi API Bank langsung. Rekonsiliasi bergantung pada copy-paste ke Google Sheets. Tidak ada fitur:
- Unmatched transactions report
- Duplicate match detection
- Partial match suggestion

---

## C. BUG & RISIKO

### 🔴 RISIKO TINGGI

| # | Bug/Risiko | Dampak | Lokasi |
|---|-----------|--------|--------|
| R1 | **PPN Masukan expense tidak ke neraca** | Laporan keuangan tidak akurat; PPN kredit tidak bisa diklaim | `expenses.ts → postQuickExpenseJournal` |
| R2 | **Retur penjualan tidak balik piutang** | Piutang menggantung setelah retur; AR overstated | `sales.ts → /return` |
| R3 | **Accounting fallback GR/IR → AP langsung** | Double-counting hutang jika `grirAccountId` tidak diset | `purchaseWorkflow.ts L628` |
| R4 | **Race condition doc number** | Nomor SO/PO duplikat di high concurrency → error 500 | `nextDocNumber()` di accounting |
| R5 | **Dua router untuk Purchase (purchase.ts + purchaseWorkflow.ts)** | PO dari `purchase.ts` bisa tidak punya field workflow → downstream error | `routes/purchase.ts` vs `routes/purchaseWorkflow.ts` |

### 🟡 RISIKO MEDIUM

| # | Bug/Risiko | Dampak | Lokasi |
|---|-----------|--------|--------|
| M1 | Race condition stok saat GRN + Sales simultan | Saldo stok bisa negatif atau salah | `purchaseWorkflow.ts L628` (non-atomic update) |
| M2 | Floating point di kalkulasi pajak (`Math.round(total * rate / 100)`) | Selisih 1-2 perak vs database `numeric` | `computeTax()`, `taxAutoService.ts` |
| M3 | Idempotency jurnal saat SO direvisi setelah invoiced | Jurnal tidak ter-update, nilai salah | `accounting.ts → postSalesInvoice` |
| M4 | `CREATE TABLE IF NOT EXISTS` dalam route handler | Anti-pattern; migrasi seharusnya di file migrasi | `vendorPayments.ts L20` |
| M5 | Purchase return tidak link ke GRN baris spesifik | Partial return tidak bisa dilacak per item | `purchaseWorkflow.ts → postPurchaseReturn` |
| M6 | Audit trigger via API saja (tidak ada DB trigger) | Update langsung ke DB atau migrasi script tidak ter-audit | Semua tabel transaksi |
| M7 | Validasi format NPWP/faktur pajak hanya teks bebas (tidak ada regex check) | Data pajak tidak valid bisa masuk laporan | `transaction_taxes` fields |
| M8 | Status pajak `draft` tidak ada (langsung `pending`) | Transaksi terhitung sebelum review | `transaction_taxes` schema |
| M9 | Kompensasi kelebihan PPN antar masa tidak otomatis | Kelebihan bayar PPN tidak terbawa ke masa berikutnya | `routes/tax.ts` |
| M10 | Debit Note tidak dihasilkan dari Purchase Return | Tidak ada dokumen formal ke vendor | `purchaseWorkflow.ts` |
| M11 | Tidak ada `cancel_reason` explicit di `sales_documents` | Audit tanpa context alasan pembatalan | `lib/db/src/schema/salesDocuments.ts` |
| M12 | PPh 21 tidak progresif/TER | Pelaporan PPh 21 tidak akurat untuk karyawan | `taxAutoService.ts` |

---

## D. FILE YANG PERLU DIUBAH

### Backend API Server
| File | Perubahan |
|------|-----------|
| `src/routes/expenses.ts` | Fix `postQuickExpenseJournal`: pisahkan PPN Masukan ke akun COA |
| `src/routes/sales.ts` | Tambah Credit Note / invoice reversal saat return |
| `src/lib/accounting.ts` | Tambah withholding tax handling di `postPaymentReceived` |
| `src/routes/purchaseWorkflow.ts` | Fix stok update jadi atomic, tambah link return → GRN line |
| `src/routes/vendorPayments.ts` | Pindah `CREATE TABLE` ke file migrasi |
| `src/lib/taxAutoService.ts` | Tambah status `draft`, validasi format NPWP/faktur |
| `src/routes/tax.ts` | Tambah kompensasi PPN, laporan unmatched/draft pajak |

### Database Schema
| File | Perubahan |
|------|-----------|
| `lib/db/src/schema/salesDocuments.ts` | Tambah `cancel_reason`, `cancelled_by`, `approved_by` |
| `lib/db/src/schema/purchaseDocuments.ts` | Tambah `cancelled_by`, `cancel_reason` |
| `lib/db/src/schema/accounting.ts` | Tambah status `draft` di `transaction_taxes` |

### Frontend BizPortal
| File | Perubahan |
|------|-----------|
| `src/pages/tax/ppn.tsx` | Tambah kompensasi PPN, export PDF |
| `src/pages/tax/pph.tsx` | Tambah laporan per karyawan PPh 21, progresif indicator |
| `src/pages/accounting/reconciliation.tsx` | Tambah unmatched/partial match report |
| `src/pages/sales/` | Tambah UI Credit Note dari retur |

---

## E. TABEL REKOMENDASI PRIORITAS

| Prioritas | Item | Dampak | Effort | Fase |
|-----------|------|--------|--------|------|
| 🔴 P1 | Fix jurnal PPN Masukan di Expense | Laporan keuangan akurat | M | 1 |
| 🔴 P1 | Fix retur penjualan → balik piutang (Credit Note) | AR tidak menggantung | M | 1 |
| 🔴 P1 | Fix GR/IR accounting fallback | Prevent double AP | S | 1 |
| 🔴 P2 | Withholding tax (PPh) otomatis saat payment | Compliance pajak | M | 2 |
| 🔴 P2 | Fix race condition doc number (SELECT FOR UPDATE / sequence) | Data integrity | S | 2 |
| 🟡 P3 | Atomic stock update di GRN | Data integrity stok | S | 2 |
| 🟡 P3 | Status `draft` di transaction_taxes | Workflow pajak | S | 2 |
| 🟡 P3 | Standardisasi audit fields di semua tabel | Compliance audit | M | 3 |
| 🟡 P4 | Validasi format NPWP/faktur (15/16 digit) | Data quality pajak | S | 3 |
| 🟡 P4 | Kompensasi kelebihan PPN ke masa berikutnya | Akurasi SPT PPN | M | 3 |
| 🟢 P5 | PPh 21 progresif / TER | Kepatuhan PPh 21 | L | 4 |
| 🟢 P5 | Laporan unmatched rekonsiliasi bank | Visibility rekonsiliasi | M | 4 |
| 🟢 P6 | Export PDF SPT / Bukti Potong format DJP | e-Filing ready | L | 5 |
| 🟢 P6 | Debit Note dari Purchase Return | Dokumen lengkap | M | 5 |
| 🟢 P6 | Pindah `CREATE TABLE` dari route ke migrasi | Code quality | S | 5 |

*Effort: S = < 4 jam, M = 4-16 jam, L = > 16 jam*

---

## F. RENCANA IMPLEMENTASI

### FASE 1 — Critical Accounting Fixes (Prioritas Laporan Keuangan)
**Target:** 3-5 hari  
**Tujuan:** Pastikan semua transaksi sudah masuk ke Buku Besar dengan benar

1. **Fix PPN Masukan Expense** (`expenses.ts`)
   - Pecah jurnal expense: DR Beban + DR PPN Masukan / CR Kas/Bank
   - Tambah parameter `taxAccountId` ke `postQuickExpenseJournal`

2. **Credit Note dari Retur Penjualan** (`sales.ts`)
   - Buat fungsi `postSalesReturnInvoice`: DR Pendapatan + DR PPN Keluaran / CR Piutang
   - Panggil di `/documents/:id/return` setelah `postSalesCogsReturn`

3. **Fix GR/IR Fallback** (`purchaseWorkflow.ts`)
   - Tambah warning jika `grirAccountId` tidak diset (jangan silently fall ke AP)
   - Atau: Hardcode akun GR/IR default saat seeding COA

---

### FASE 2 — Tax Compliance & Data Integrity
**Target:** 5-7 hari  
**Tujuan:** Pastikan pajak dipotong dan dicatat benar

4. **Withholding Tax di Payment** (`accounting.ts`)
   - Tambah parameter `withholdingTaxId` optional di `postPaymentReceived`
   - Jika ada WHT: DR AP = total, CR Bank = net, CR PPh Payable = WHT

5. **Atomic Doc Number** (`accounting.ts`)
   - Ganti `SELECT MAX(seq) + 1` dengan PostgreSQL `SEQUENCE` atau `SELECT ... FOR UPDATE`

6. **Atomic Stock Update GRN** (`purchaseWorkflow.ts`)
   - Ganti manual update stok dengan `sql\`qty = qty + ${delta}\`` atomic

7. **Status `draft` di transaction_taxes** (schema + `taxAutoService.ts`)
   - Tambah `draft` ke enum status; transaksi baru masuk `draft`, di-promote ke `pending` saat di-post

---

### FASE 3 — Audit Trail Standardisasi
**Target:** 3-5 hari  
**Tujuan:** Semua transaksi traceable dan audit-ready

8. **Standardisasi field audit di sales_documents & purchase_documents** (schema migration)
   - Tambah kolom: `cancelled_by`, `cancel_reason`, `approved_by` (konsisten semua tabel)

9. **Validasi NPWP & Nomor Faktur** (`taxAutoService.ts` + frontend)
   - Regex NPWP: `^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}$` (15 digit dengan format)
   - Regex Faktur: `^\d{16}$`

10. **Kompensasi PPN** (`routes/tax.ts`)
    - Tambah endpoint `POST /api/tax/ppn/kompensasi` untuk carry-forward kelebihan bayar PPN ke masa berikutnya

---

### FASE 4 — Reporting Enhancements
**Target:** 7-10 hari  
**Tujuan:** Laporan lebih lengkap dan actionable

11. **PPh 21 Tarif Progresif** (`taxAutoService.ts`)
    - Implementasi tarif Pasal 17: bracket 5%/15%/25%/30%/35%
    - Tambah `ptkp_type` per karyawan sebagai basis PTKP

12. **Rekonsiliasi Bank — Unmatched & Partial Report** (`routes/accounting.ts`)
    - Endpoint: `GET /api/accounting/reconciliation/unmatched`
    - Frontend: Tab "Belum Cocok" di halaman rekonsiliasi

13. **Auto-update Payment Status Partial** (service/worker)
    - Worker yang re-check semua invoice dengan `payment_status != paid` dan hitung total payment received
    - Update ke `partial` jika 0 < received < total, `paid` jika received >= total

---

### FASE 5 — Document & e-Filing Ready
**Target:** 10-14 hari  
**Tujuan:** Siap untuk pelaporan pajak formal

14. **Export PDF Laporan Pajak** (frontend + backend)
    - Laporan Rekap PPN (format A4 dengan header perusahaan)
    - Bukti Potong PPh 23 (format standar DJP)
    - Gunakan `@react-pdf/renderer` (sudah tersedia di stack)

15. **Debit Note dari Purchase Return** (`purchaseWorkflow.ts`)
    - Auto-generate dokumen Debit Note saat purchase return dikonfirmasi
    - Tampil di list purchase documents dengan kind `debit_note`

16. **Pindah DDL dari Route ke Migrasi** (`vendorPayments.ts`)
    - Pindah `CREATE TABLE IF NOT EXISTS vendor_payments` ke file migrasi dedicated

---

## G. LAMPIRAN — COVERAGE MATRIX

| Modul | Jurnal Auto | Pajak Auto | Status Lifecycle | Reversal | Audit Log | Dokumen |
|-------|------------|-----------|-----------------|---------|-----------|---------|
| Sales Invoice | ✅ | ✅ PPN | ✅ Lengkap | ✅ | ⚠️ Parsial | ✅ |
| Sales Return | ⚠️ COGS only | ⚠️ Tidak balik PPN | ✅ | ⚠️ COGS only | ⚠️ | ⚠️ No Credit Note |
| Purchase Bill | ✅ | ✅ PPN Masukan | ✅ | ✅ | ⚠️ Parsial | ✅ |
| Purchase Payment | ✅ | ❌ No WHT | ✅ | N/A | ⚠️ | ✅ |
| Expense | ✅ | ⚠️ Tax record ada, jurnal tidak | ✅ | N/A | ⚠️ | ✅ |
| Bank Payment (AR) | ✅ | ❌ No WHT | ✅ | N/A | ⚠️ | ✅ |
| GRN | ✅ | N/A | ✅ | ✅ | ⚠️ | ✅ |
| Tax Ledger | ✅ | ✅ | ⚠️ No draft | N/A | ⚠️ | ⚠️ CSV only |

---

*Laporan ini dihasilkan dari audit otomatis. Sebelum implementasi, konfirmasi prioritas fase dengan tim bisnis.*
