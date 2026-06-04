import { useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { BarChart2, TrendingUp, DollarSign, ArrowLeft } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export default function SportCenterReports() {
  const [, navigate] = useLocation();
  const { activeCompanyId } = useCompany();
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [from, setFrom] = useState(thirtyDaysAgo);
  const [to, setTo] = useState(today);
  const [queryFrom, setQueryFrom] = useState(thirtyDaysAgo);
  const [queryTo, setQueryTo] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ["sport-center-reports", activeCompanyId, queryFrom, queryTo],
    queryFn: async () => {
      const qs = new URLSearchParams({ from: queryFrom, to: queryTo });
      if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
      const r = await fetch(`/api/sport-center/reports/revenue?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat");
      return r.json();
    },
  });

  const totalRevenue = (data?.monthly ?? []).reduce((s: number, m: any) => s + Number(m.revenue), 0);
  const totalTx = (data?.monthly ?? []).reduce((s: number, m: any) => s + Number(m.transactions), 0);

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sport-center/dashboard")} className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <BarChart2 className="h-6 w-6 text-cyan-400" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Laporan Revenue</h1>
            <p className="text-sm text-muted-foreground">Analisis pendapatan Sport Center</p>
          </div>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Dari</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-38" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sampai</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-38" />
            </div>
            <Button size="sm" onClick={() => { setQueryFrom(from); setQueryTo(to); }}>
              Tampilkan
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border/60 bg-emerald-900/10">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground mb-1">Total Revenue Periode</p>
              <p className="text-2xl font-bold text-emerald-400">{idr(totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-blue-900/10">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground mb-1">Total Transaksi</p>
              <p className="text-2xl font-bold text-blue-400">{totalTx}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Revenue Bulanan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Memuat…</p>
              ) : (data?.monthly ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Tidak ada data</p>
              ) : (
                <div className="space-y-2">
                  {(data?.monthly ?? []).map((m: any) => (
                    <div key={m.month} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{m.month}</span>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">{idr(Number(m.revenue))}</p>
                        <p className="text-xs text-muted-foreground">{m.transactions} transaksi</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Revenue per Fasilitas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Memuat…</p>
              ) : (data?.byFacility ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Tidak ada data</p>
              ) : (
                <div className="space-y-3">
                  {(data?.byFacility ?? []).map((f: any) => (
                    <div key={f.facility_name} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{f.facility_name}</p>
                        <p className="text-xs text-muted-foreground">{f.bookings} booking</p>
                      </div>
                      <p className="text-sm font-medium text-emerald-400">{idr(Number(f.revenue))}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Revenue per Metode Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(data?.byMethod ?? []).map((m: any) => (
                <div key={m.method} className="p-3 rounded-lg bg-muted/20 border border-border/40">
                  <p className="text-xs text-muted-foreground capitalize">{m.method}</p>
                  <p className="text-sm font-bold text-foreground mt-1">{idr(Number(m.total))}</p>
                  <p className="text-xs text-muted-foreground">{m.transactions} tx</p>
                </div>
              ))}
              {(data?.byMethod ?? []).length === 0 && !isLoading && (
                <p className="col-span-4 text-sm text-muted-foreground text-center py-4">Tidak ada data</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
