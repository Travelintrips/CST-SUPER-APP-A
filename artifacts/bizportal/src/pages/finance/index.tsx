import { AppShell } from "@/components/layout/AppShell";
import { ModuleHub } from "@/components/layout/ModuleHub";
import {
  BookOpen, BarChart2, Landmark, FileText, Wallet, GitMerge,
  FileSpreadsheet, Receipt, ArrowLeftRight, Layers, TrendingUp,
  CreditCard, Calculator, ShieldCheck, Shield, ShieldAlert,
  RotateCcw, DollarSign, CalendarDays, AlertTriangle, Send,
  Building2, ScanLine,
} from "lucide-react";

export default function FinanceHubPage() {
  return (
    <AppShell>
      <ModuleHub
        moduleIcon={BookOpen}
        moduleName="Finance"
        moduleDesc="Akuntansi, manajemen pajak, biaya operasional, dan aset"
        sections={[
          {
            label: "Akuntansi",
            cards: [
              {
                href: "/accounting/dashboard",
                icon: BarChart2,
                title: "Dashboard Akuntansi",
                desc: "Ringkasan posisi keuangan dan status akuntansi",
                accent: "bg-blue-500/10 text-blue-600 group-hover:bg-blue-500/20",
              },
              {
                href: "/accounting/entries",
                icon: FileText,
                title: "Jurnal Entry",
                desc: "Buat dan kelola entri jurnal akuntansi",
              },
              {
                href: "/accounting/payments",
                icon: Wallet,
                title: "Pembayaran",
                desc: "Penerimaan dan pengeluaran kas",
              },
              {
                href: "/accounting/reconciliation",
                icon: GitMerge,
                title: "Rekonsiliasi Bank (Manual)",
                desc: "Cocokkan entri jurnal vs saldo bank",
              },
              {
                href: "/accounting/bank-reconciliation",
                icon: ScanLine,
                title: "Rekonsiliasi Mutasi Bank",
                desc: "Import mutasi rekening & auto-match ke order/payment/invoice",
                accent: "bg-indigo-500/10 text-indigo-600 group-hover:bg-indigo-500/20",
              },
              {
                href: "/accounting/accounts",
                icon: Landmark,
                title: "Bagan Akun (CoA)",
                desc: "Chart of accounts dan struktur keuangan",
              },
              {
                href: "/accounting/other-transactions",
                icon: ArrowLeftRight,
                title: "Transaksi Lain",
                desc: "Penerimaan dan pengeluaran di luar operasional utama",
              },
              {
                href: "/accounting/paylabs",
                icon: CreditCard,
                title: "Transaksi Paylabs",
                desc: "Riwayat dan rekonsiliasi transaksi Paylabs",
              },
              {
                href: "/accounting/cost-centers",
                icon: Layers,
                title: "Cost Center",
                desc: "Kelola pusat biaya per divisi",
              },
              {
                href: "/accounting/gsheet",
                icon: FileSpreadsheet,
                title: "Google Sheets Sync",
                desc: "Sinkronisasi data akuntansi ke Google Sheets",
              },
            ],
          },
          {
            label: "Laporan Keuangan",
            cards: [
              {
                href: "/accounting/reports/trial-balance",
                icon: FileSpreadsheet,
                title: "Neraca Percobaan",
                desc: "Trial balance semua akun",
              },
              {
                href: "/accounting/reports/profit-loss",
                icon: TrendingUp,
                title: "Laba Rugi",
                desc: "Laporan profit & loss periode berjalan",
              },
              {
                href: "/accounting/reports/balance-sheet",
                icon: Wallet,
                title: "Neraca",
                desc: "Balance sheet perusahaan",
              },
              {
                href: "/accounting/reports/general-ledger",
                icon: BookOpen,
                title: "Buku Besar",
                desc: "General ledger semua transaksi",
              },
              {
                href: "/accounting/wht-reconciliation",
                icon: ShieldCheck,
                title: "Rekonsiliasi WHT",
                desc: "Cocokkan hutang withholding tax",
              },
              {
                href: "/accounting/audit-report",
                icon: AlertTriangle,
                title: "Audit Akuntansi",
                desc: "Laporan temuan dan audit trail akuntansi",
              },
            ],
          },
          {
            label: "Manajemen Pajak",
            cards: [
              {
                href: "/tax/dashboard",
                icon: BarChart2,
                title: "Dashboard Pajak",
                desc: "Ringkasan kewajiban dan status pajak",
                accent: "bg-green-500/10 text-green-600 group-hover:bg-green-500/20",
              },
              {
                href: "/tax/ppn",
                icon: Receipt,
                title: "PPN Masukan / Keluaran",
                desc: "Rekap faktur pajak masukan dan keluaran",
              },
              {
                href: "/tax/pph",
                icon: FileText,
                title: "PPh Witholding",
                desc: "Pemotongan pajak penghasilan",
              },
              {
                href: "/tax/spt",
                icon: FileSpreadsheet,
                title: "SPT Masa",
                desc: "Laporan SPT masa PPN dan PPh",
              },
              {
                href: "/tax/export-djp",
                icon: FileSpreadsheet,
                title: "Export DJP",
                desc: "e-Faktur dan e-Bupot untuk DJP",
              },
              {
                href: "/tax/transactions",
                icon: Receipt,
                title: "Semua Transaksi Pajak",
                desc: "Riwayat lengkap transaksi pajak",
              },
              {
                href: "/tax/reconciliation",
                icon: GitMerge,
                title: "Rekonsiliasi Pajak",
                desc: "Cocokkan pajak yang dibayar vs yang terutang",
              },
              {
                href: "/tax/rules",
                icon: Shield,
                title: "Master Aturan Pajak",
                desc: "Konfigurasi tarif dan aturan pajak",
              },
              {
                href: "/tax/missing-compliance",
                icon: ShieldAlert,
                title: "Kepatuhan Pajak",
                desc: "Transaksi yang belum memenuhi kepatuhan pajak",
              },
            ],
          },
          {
            label: "Expense & Asset",
            cards: [
              {
                href: "/expense/dashboard",
                icon: BarChart2,
                title: "Dashboard Expense",
                desc: "Monitor dan analisis biaya operasional",
                accent: "bg-amber-500/10 text-amber-600 group-hover:bg-amber-500/20",
              },
              {
                href: "/expense",
                icon: Receipt,
                title: "Semua Pengeluaran",
                desc: "Daftar dan kelola semua pengeluaran",
              },
              {
                href: "/expense/routine",
                icon: RotateCcw,
                title: "Biaya Rutin",
                desc: "Pengeluaran berulang dan otomatis",
              },
              {
                href: "/expense/kasbon",
                icon: Wallet,
                title: "Kasbon Karyawan",
                desc: "Pinjaman dan kasbon internal karyawan",
              },
              {
                href: "/expense/talangan",
                icon: DollarSign,
                title: "Dana Talangan",
                desc: "Pengeluaran yang ditagihkan kembali",
              },
              {
                href: "/expense/vendor-installments",
                icon: CalendarDays,
                title: "Cicilan Vendor",
                desc: "Jadwal cicilan pembayaran ke vendor",
              },
              {
                href: "/expense/vendor-payments",
                icon: Send,
                title: "Pembayaran Vendor",
                desc: "Proses pembayaran ke vendor",
              },
              {
                href: "/expense/approvals",
                icon: ShieldCheck,
                title: "Approvals Expense",
                desc: "Persetujuan pengeluaran yang pending",
              },
              {
                href: "/expense/budget",
                icon: Calculator,
                title: "Budget & Kurs",
                desc: "Anggaran operasional dan nilai tukar",
              },
              {
                href: "/expense/fixed-assets",
                icon: Landmark,
                title: "Fixed Assets",
                desc: "Daftar aset tetap perusahaan",
              },
              {
                href: "/expense/asset-depreciation",
                icon: TrendingUp,
                title: "Depresiasi Aset",
                desc: "Perhitungan dan jadwal depresiasi aset",
              },
              {
                href: "/expense/reports",
                icon: BarChart2,
                title: "Laporan Expense",
                desc: "Analisis dan laporan biaya operasional",
              },
            ],
          },
          {
            label: "Holding & Konsolidasi",
            cards: [
              {
                href: "/holding",
                icon: Building2,
                title: "Overview Perusahaan",
                desc: "Ringkasan semua entitas dalam holding",
                accent: "bg-purple-500/10 text-purple-600 group-hover:bg-purple-500/20",
              },
              {
                href: "/holding/dashboard",
                icon: BarChart2,
                title: "Dashboard Holding",
                desc: "Konsolidasi keuangan semua anak perusahaan",
              },
              {
                href: "/holding/pl-report",
                icon: TrendingUp,
                title: "Laba Rugi Holding",
                desc: "Laporan konsolidasi laba rugi",
              },
              {
                href: "/holding/cashflow-report",
                icon: Wallet,
                title: "Laporan Arus Kas",
                desc: "Konsolidasi arus kas seluruh perusahaan",
              },
            ],
          },
        ]}
      />
    </AppShell>
  );
}
