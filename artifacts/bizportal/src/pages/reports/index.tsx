import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart2,
  TrendingUp,
  ShoppingBag,
  PackageSearch,
  Receipt,
  FileText,
  Shield,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

const reports = [
  {
    href: "/reports/sales",
    title: "Laporan Penjualan B2B",
    desc: "Analisis omzet, pelanggan teratas, dan produk terlaris",
    icon: TrendingUp,
  },
  {
    href: "/reports/purchase",
    title: "Laporan Pembelian",
    desc: "Analisis pengeluaran, vendor teratas, dan barang yang sering dibeli",
    icon: ShoppingBag,
  },
  {
    href: "/reports/inventory-valuation",
    title: "Valuasi Persediaan",
    desc: "Nilai stok per gudang berdasarkan harga pokok",
    icon: PackageSearch,
  },
  {
    href: "/reports/ar-aging",
    title: "AR Aging",
    desc: "Umur piutang pelanggan per kategori jatuh tempo",
    icon: Receipt,
  },
  {
    href: "/reports/ap-aging",
    title: "AP Aging",
    desc: "Umur hutang ke vendor per kategori jatuh tempo",
    icon: FileText,
  },
  {
    href: "/reports/audit-log",
    title: "Audit Log Keamanan",
    desc: "Riwayat aktivitas dan perubahan data sistem",
    icon: Shield,
  },
];

export default function ReportsIndexPage() {
  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6" /> Laporan
          </h1>
          <p className="text-sm text-muted-foreground">
            Pilih laporan yang ingin ditampilkan
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => {
            const Icon = r.icon;
            return (
              <Link key={r.href} href={r.href}>
                <Card className="cursor-pointer transition-colors hover:bg-accent">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold">{r.title}</h3>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">{r.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
