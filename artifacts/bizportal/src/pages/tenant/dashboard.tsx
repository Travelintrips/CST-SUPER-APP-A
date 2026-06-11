import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useLocation } from "wouter";
import { Store, Users, FileText, DollarSign, Clock, ArrowRight, AlertCircle, TrendingUp, Receipt } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

type Summary = {
  tenants: { total: number; active: number };
  bookings: { total: number; unpaid: number };
  revenue: number;
  pendingPayments: number;
  units?: { total: number; available: number; occupied: number; maintenance: number; sport_center: number; tod_m1: number };
  invoices?: { total: number; paid: number; unpaid_count: number; overdue: number; total_outstanding: number; paid_this_month: number };
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

  const mainCards = [
    { label: "Total Penyewa", value: data?.tenants.total ?? 0, sub: `${data?.tenants.active ?? 0} aktif`, icon: Store, color: "text-blue-400", href: "/tenant/tenants" },
    { label: "Penyewaan", value: data?.bookings.total ?? 0, sub: `${data?.bookings.unpaid ?? 0} belum lunas`, icon: FileText, color: "text-purple-400", href: "/tenant/bookings" },
    { label: "Pendapatan Sewa", value: idr(data?.revenue ?? 0), sub: "Pembayaran terkonfirmasi", icon: DollarSign, color: "text-emerald-400", href: "/tenant/payments" },
    { label: "Pembayaran Pending", value: data?.pendingPayments ?? 0, sub: "Menunggu konfirmasi", icon: Clock, color: "text-yellow-400", href: "/tenant/payments" },
  ];

  const invoiceCards = [
    { label: "Total Invoice", value: data?.invoices?.total ?? 0, sub: `${data?.invoices?.paid ?? 0} lunas`, icon: Receipt, color: "text-violet-400", href: "/tenant/invoices" },
    { label: "Belum Lunas", value: data?.invoices?.unpaid_count ?? 0, sub: "Unpaid + Sebagian + Terkirim", icon: AlertCircle, color: "text-yellow-400", href: "/tenant/invoices?status=unpaid" },
    { label: "Jatuh Tempo", value: data?.invoices?.overdue ?? 0, sub: "Melewati due date", icon: AlertCircle, color: "text-red-400", href: "/tenant/invoices?status=overdue" },
    { label: "Tagihan Bulan Ini", value: idr(data?.invoices?.paid_this_month ?? 0), sub: "Dibayar bulan ini", icon: TrendingUp, color: "text-emerald-400", href: "/tenant/invoices" },
  ];

  const totalOutstanding = data?.invoices?.total_outstanding ?? 0;

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Store className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard Penyewa</h1>
            <p className="text-sm text-muted-foreground">Ringkasan penyewa, penyewaan, dan pembayaran sewa</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {mainCards.map((c) => (
            <Card key={c.label} className="border-border/60 cursor-pointer hover:border-border transition-colors" onClick={() => navigate(c.href)}>
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

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4 text-violet-400" /> Invoice Penyewa
            </h2>
            {totalOutstanding > 0 && (
              <span className="text-xs text-yellow-400 font-medium">
                Total piutang: {idr(totalOutstanding)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {invoiceCards.map((c) => (
              <Card key={c.label} className="border-border/60 cursor-pointer hover:border-border transition-colors" onClick={() => navigate(c.href)}>
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
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1" onClick={() => navigate("/tenant/tenants")}>
            <Users className="h-4 w-4" /> Kelola Penyewa
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate("/tenant/bookings")}>
            <FileText className="h-4 w-4" /> Penyewaan
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate("/tenant/payments")}>
            <DollarSign className="h-4 w-4" /> Pembayaran
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate("/tenant/invoices")}>
            <Receipt className="h-4 w-4" /> Invoice
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
