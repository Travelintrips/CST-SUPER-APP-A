import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useListLogisticOrders, useGetLogisticOrderSummary,
  useUpdateLogisticOrderStatus,
  getListLogisticOrdersQueryKey, getGetLogisticOrderSummaryQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { STATUS_OPTIONS, STATUS_COLORS, SHIPMENT_TYPES, OrderStatus } from "@/lib/services-data";
import {
  Package, Ship, CheckCircle, TrendingUp, Search, LogOut, Filter,
  ChevronRight, Users, Clock,
} from "lucide-react";

const ADMIN_KEY = "logistic_admin_auth";

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [authed, setAuthed] = useState(() => localStorage.getItem(ADMIN_KEY) === "1");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateLogisticOrderStatus();

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const params = {
    status: statusFilter || undefined,
    shipmentType: typeFilter || undefined,
    search: debouncedSearch || undefined,
  };

  const { data: orders = [], isLoading } = useListLogisticOrders(params, {
    query: { enabled: authed, queryKey: getListLogisticOrdersQueryKey(params) },
  });

  const { data: summary } = useGetLogisticOrderSummary({
    query: { enabled: authed },
  });

  function handleLogin() {
    if (password === "admin123") {
      localStorage.setItem(ADMIN_KEY, "1");
      setAuthed(true);
      setLoginError("");
    } else {
      setLoginError("Password salah. Coba lagi.");
    }
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_KEY);
    setAuthed(false);
    setPassword("");
  }

  function handleInlineStatusChange(orderId: number, status: string) {
    updateStatus.mutate(
      { id: orderId, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Status diperbarui: ${status}` });
          queryClient.invalidateQueries({ queryKey: getListLogisticOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLogisticOrderSummaryQueryKey() });
        },
        onError: () => toast({ title: "Gagal memperbarui status", variant: "destructive" }),
      }
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
              <Ship className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Logistic Ordering System</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
              <Input
                type="password"
                placeholder="Masukkan password admin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              {loginError && <p className="text-xs text-destructive mt-1">{loginError}</p>}
            </div>
            <Button className="w-full" onClick={handleLogin}>Masuk</Button>
          </div>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setLocation("/")}>
            Kembali ke Beranda
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-accent" />
            <span className="font-bold text-sm text-foreground">Admin Dashboard</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-3.5 h-3.5 mr-1" /> Logout
          </Button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total Orders", value: summary.totalOrders, icon: Package, color: "text-foreground" },
              { label: "New Orders", value: summary.newOrders, icon: Clock, color: "text-blue-600" },
              { label: "Confirmed", value: summary.confirmedOrders, icon: CheckCircle, color: "text-emerald-600" },
              { label: "Completed", value: summary.completedOrders, icon: Users, color: "text-green-600" },
              { label: "Est. Revenue", value: formatCurrency(summary.totalEstimatedRevenue), icon: TrendingUp, color: "text-accent", isText: true },
            ].map(({ label, value, icon: Icon, color, isText }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className={`font-bold ${isText ? "text-base" : "text-2xl"} ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari nama perusahaan, PIC, atau nomor order..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-44">
                <Filter className="w-3.5 h-3.5 mr-1" />
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Semua Status</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Semua Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Semua Tipe</SelectItem>
                {SHIPMENT_TYPES.map(({ type }) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Daftar Pesanan ({orders.length})</h2>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Memuat data...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="font-medium text-foreground">Tidak ada pesanan</p>
              <p className="text-sm text-muted-foreground mt-1">Belum ada pesanan masuk</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Order #", "Perusahaan", "PIC", "Tipe", "Route", "Total", "Status", "Tanggal", ""].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-mono font-semibold text-foreground">{order.orderNumber}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{order.companyName}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{order.customerName}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{order.shipmentType}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{order.origin} → {order.destination}</td>
                      <td className="px-4 py-3 text-sm font-bold text-accent">{formatCurrency(order.grandTotal)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={order.status}
                          onValueChange={(val) => handleInlineStatusChange(order.id, val)}
                        >
                          <SelectTrigger className={`h-7 text-xs border-0 px-2 font-medium w-36 ${STATUS_COLORS[order.status as OrderStatus] || "bg-gray-100 text-gray-800"}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(order.createdAt)}</td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setLocation(`/admin/orders/${order.id}`)}>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
