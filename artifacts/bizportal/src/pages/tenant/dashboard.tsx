import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useLocation } from "wouter";
import { Store, Users, FileText, DollarSign, Clock, ArrowRight, Building2, AlertTriangle, Receipt } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

type Summary = {
  tenants: { total: number; active: number };
  bookings: { total: number; unpaid: number };
  revenue: number;
  pendingPayments: number;
  invoices: { total: number; overdue: number; pending: number; piutang: number };
  units: { total: number; occupied: number; available: number };
};

export default function TenantDashboard() {
  const { activeCompanyId } = useCompany();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<Summary>({
    queryKey: ["tenant-dashboard", activeCompanyId],
    queryFn: async () => {
      const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
      const r = await fetch(`/api/tenant/dashboard${qs}`, { credentials: "include" });
      return r.json();
    },
  });

  const topCards = [
    {
      label: "Tenant Aktif",
      value: data?.tenants.active ?? 0,
      sub: `dari ${data?.tenants.total ?? 0} tenant terdaftar`,
      icon: Store, color: "text-blue-400", href: "/tenant/tenants",
    },
    {
      label: "Invoice Overdue",
      value: data?.invoices.overdue ?? 0,
      sub: `+${data?.invoices.pending ?? 0} belum bayar, ${data?.invoices.overdue === 0 ? "0" : data?.invoices.overdue} sebagian`,
      icon: AlertTriangle, color: "text-red-400", href: "/tenant/invoices",
      highlight: (data?.invoices.overdue ?? 0) > 0,
    },
    {
      label: "Bukti Bayar Pending",
      value: data?.pendingPayments ?? 0,
      sub: "menunggu persetujuan admin",
      icon: Clock, color: "text-yellow-400", href: "/tenant/payments",
    },
    {
      label: "Total Piutang",
      value: idr(data?.invoices.piutang ?? 0),
      sub: `Pendapatan Jun: ${idr(data?.revenue ?? 0)}`,
      icon: DollarSign, color: "text-emerald-400", href: "/tenant/invoices",
    },
  ];

  const unitOccupied = data?.units.occupied ?? 0;
  const unitTotal = data?.units.total ?? 0;
  const unitPct = unitTotal > 0 ? Math.round((unitOccupied / unitTotal) * 100) : 0;

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Store className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard Tenant</h1>
            <p className="text-sm text-muted-foreground">Ringkasan operasional tenant</p>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {topCards.map((c) => (
            <Card key={c.label}
              className={`border-border/60 cursor-pointer hover:border-border transition-colors ${c.highlight ? "border-red-700/60" : ""}`}
              onClick={() => navigate(c.href)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground mt-3">{c.label}</p>
                <p className="text-2xl font-bold text-foreground mt-1">{isLoading ? "…" : c.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Unit Status Bar */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-teal-400" />
                <span className="text-sm font-medium text-foreground">Status Unit Mall</span>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={() => navigate("/tenant/units")}>
                Lihat Denah <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="w-full h-3 rounded-full bg-muted overflow-hidden flex">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${unitPct}%` }} />
              <div className="h-full bg-emerald-500 flex-1" />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                Terisi — {unitOccupied}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                Tersedia — {data?.units.available ?? 0}
              </span>
              {unitTotal > 0 && (
                <span className="ml-auto font-medium text-foreground">{unitPct}% terpakai</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1" onClick={() => navigate("/tenant/tenants")}>
            <Users className="h-4 w-4" /> Kelola Tenant
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate("/tenant/units")}>
            <Building2 className="h-4 w-4" /> Unit Kantin
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate("/tenant/invoices")}>
            <Receipt className="h-4 w-4" /> Invoice
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate("/tenant/bookings")}>
            <FileText className="h-4 w-4" /> Penyewaan
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate("/tenant/payments")}>
            <DollarSign className="h-4 w-4" /> Pembayaran
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
