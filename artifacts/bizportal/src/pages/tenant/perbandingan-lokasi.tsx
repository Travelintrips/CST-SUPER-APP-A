import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { MapPin, TrendingUp, Users, Building2, AlertTriangle } from "lucide-react";

interface LokData {
  lokasi: string;
  company_id: number;
  total_tenant: number;
  tenant_aktif: number;
  total_unit: number;
  unit_tersedia: number;
  unit_terisi: number;
  total_pendapatan: number;
  total_piutang: number;
  invoice_overdue: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n ?? 0);
}

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

function StatRow({ label, a, b, fmtFn = String }: { label: string; a: any; b: any; fmtFn?: (v: any) => string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex gap-8">
        <span className="text-sm font-semibold text-indigo-700 w-32 text-right">{fmtFn(a)}</span>
        <span className="text-sm font-semibold text-violet-700 w-32 text-right">{fmtFn(b)}</span>
      </div>
    </div>
  );
}

export default function TenantPerbandinganLokasiPage() {
  const { data, isLoading } = useQuery<{ data: LokData[] }>({
    queryKey: ["tenant-perbandingan-lokasi"],
    queryFn: async () => {
      const r = await fetch("/api/tenant/perbandingan-lokasi", { credentials: "include" });
      if (!r.ok) throw new Error("Gagal");
      return r.json();
    },
    staleTime: 60_000,
  });

  const locs = data?.data ?? [];
  const sc = locs.find((l) => l.company_id === 1);
  const tod = locs.find((l) => l.company_id === 2);

  return (
    <AppShell>
      <div className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="h-6 w-6 text-rose-600" />Perbandingan Lokasi</h1>
          <p className="text-sm text-muted-foreground mt-1">Sport Center vs TOD M1 — statistik side by side</p>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-12">Memuat...</p>
        ) : (
          <>
            {/* Header cards */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-indigo-200 bg-indigo-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-indigo-700">
                    <Building2 className="h-5 w-5" />Sport Center
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-violet-200 bg-violet-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-violet-700">
                    <Building2 className="h-5 w-5" />TOD M1
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Tenant Aktif", valA: sc?.tenant_aktif ?? 0, valB: tod?.tenant_aktif ?? 0, icon: <Users className="h-4 w-4" /> },
                { label: "Unit Terisi", valA: sc?.unit_terisi ?? 0, valB: tod?.unit_terisi ?? 0, icon: <Building2 className="h-4 w-4" /> },
                { label: "Pendapatan", valA: sc?.total_pendapatan ?? 0, valB: tod?.total_pendapatan ?? 0, icon: <TrendingUp className="h-4 w-4" />, money: true },
                { label: "Invoice Overdue", valA: sc?.invoice_overdue ?? 0, valB: tod?.invoice_overdue ?? 0, icon: <AlertTriangle className="h-4 w-4" />, warn: true },
              ].map((m) => (
                <Card key={m.label}>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">{m.icon}{m.label}</p>
                    <div className="flex gap-3 mt-1 items-end">
                      <div>
                        <p className="text-[10px] text-indigo-600">SC</p>
                        <p className={`text-lg font-bold ${m.warn && m.valA > 0 ? "text-red-700" : "text-indigo-700"}`}>
                          {m.money ? fmt(m.valA) : m.valA}
                        </p>
                      </div>
                      <div className="text-muted-foreground/30 text-lg pb-0.5">|</div>
                      <div>
                        <p className="text-[10px] text-violet-600">TOD</p>
                        <p className={`text-lg font-bold ${m.warn && m.valB > 0 ? "text-red-700" : "text-violet-700"}`}>
                          {m.money ? fmt(m.valB) : m.valB}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Detailed comparison table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Detail Perbandingan</CardTitle>
                  <div className="flex gap-6 text-sm">
                    <span className="text-indigo-700 font-semibold">Sport Center</span>
                    <span className="text-violet-700 font-semibold">TOD M1</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <StatRow label="Total Penyewa"     a={sc?.total_tenant ?? 0}    b={tod?.total_tenant ?? 0} />
                <StatRow label="Penyewa Aktif"     a={sc?.tenant_aktif ?? 0}    b={tod?.tenant_aktif ?? 0} />
                <StatRow label="Total Unit"        a={sc?.total_unit ?? 0}      b={tod?.total_unit ?? 0} />
                <StatRow label="Unit Tersedia"     a={sc?.unit_tersedia ?? 0}   b={tod?.unit_tersedia ?? 0} />
                <StatRow label="Unit Terisi"       a={sc?.unit_terisi ?? 0}     b={tod?.unit_terisi ?? 0} />
                <StatRow label="Tingkat Hunian"
                  a={pct(sc?.unit_terisi ?? 0, sc?.total_unit ?? 0) + "%"}
                  b={pct(tod?.unit_terisi ?? 0, tod?.total_unit ?? 0) + "%"} />
                <StatRow label="Total Pendapatan"  a={sc?.total_pendapatan ?? 0} b={tod?.total_pendapatan ?? 0} fmtFn={fmt} />
                <StatRow label="Total Piutang"     a={sc?.total_piutang ?? 0}   b={tod?.total_piutang ?? 0} fmtFn={fmt} />
                <StatRow label="Invoice Overdue"   a={sc?.invoice_overdue ?? 0} b={tod?.invoice_overdue ?? 0} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
