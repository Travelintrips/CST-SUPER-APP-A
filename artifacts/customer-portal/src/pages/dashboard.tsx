import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetPortalMe, useListPortalOrders, useListPortalLogisticOrders } from "@workspace/api-client-react";
import { getAuthToken, getAuthHeaders, removeAuthToken } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import {
  Truck, Plus, Ship, Clock, FileText, Navigation,
  ArrowRight, Package, UploadCloud, MapPin, Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageContext";

interface DashboardStats {
  totalOrders: number;
  activeOrders: number;
  completedOrders: number;
  invoiceOutstandingCount: number;
  invoiceOutstandingAmount: number;
  trackingActive: number;
}

const LOGISTIC_STATUS_COLOR: Record<string, string> = {
  "Order Received":    "bg-yellow-100 text-yellow-800",
  "Admin Review":      "bg-orange-100 text-orange-800",
  "RFQ Sent":          "bg-amber-100 text-amber-800",
  "Quote Received":    "bg-cyan-100 text-cyan-800",
  "Customer Approval": "bg-blue-100 text-blue-800",
  "Vendor Confirmed":  "bg-indigo-100 text-indigo-800",
  "In Progress":       "bg-sky-100 text-sky-800",
  "Pickup":            "bg-violet-100 text-violet-800",
  "In Transit":        "bg-purple-100 text-purple-800",
  "Arrived":           "bg-teal-100 text-teal-800",
  "Delivered":         "bg-green-100 text-green-800",
  "POD Uploaded":      "bg-emerald-100 text-emerald-800",
  "Invoice Issued":    "bg-indigo-100 text-indigo-800",
  "Payment Received":  "bg-teal-100 text-teal-800",
  "Completed":         "bg-emerald-100 text-emerald-800",
  "Cancelled":         "bg-red-100 text-red-800",
};

const LOGISTIC_STATUS_ID: Record<string, string> = {
  "Order Received":    "Order Diterima",
  "Admin Review":      "Ditinjau Admin",
  "RFQ Sent":          "RFQ Terkirim",
  "Quote Received":    "Penawaran Masuk",
  "Customer Approval": "Menunggu Persetujuan",
  "Vendor Confirmed":  "Vendor Dikonfirmasi",
  "In Progress":       "Sedang Diproses",
  "Pickup":            "Penjemputan",
  "In Transit":        "Dalam Perjalanan",
  "Arrived":           "Tiba di Tujuan",
  "Delivered":         "Terkirim",
  "POD Uploaded":      "Bukti Terkirim",
  "Invoice Issued":    "Invoice Diterbitkan",
  "Payment Received":  "Pembayaran Diterima",
  "Completed":         "Selesai",
  "Cancelled":         "Dibatalkan",
};

function idr(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

const PENDING_QUOTE_STATUSES   = new Set(["Order Received", "Admin Review", "RFQ Sent", "Quote Received"]);
const PENDING_APPROVAL_STATUSES = new Set(["Customer Approval"]);
const ACTIVE_STATUSES           = new Set(["Vendor Confirmed", "In Progress", "Pickup", "In Transit", "Arrived"]);

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const token   = getAuthToken();
  const headers = getAuthHeaders() as Record<string, string>;
  const { t }   = useLanguage();
  const qc      = useQueryClient();

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  useEffect(() => {
    if (!token) return;
    const es = new EventSource("/api/ecommerce/events");
    es.addEventListener("logistic_order_status_changed", () => {
      qc.invalidateQueries({ queryKey: ["listPortalLogisticOrders", token] });
    });
    return () => es.close();
  }, [token, qc]);

  const { data: customer, isLoading: isLoadingUser, error: userError } = useGetPortalMe({
    query: { queryKey: ["getPortalMe", token], enabled: !!token, retry: 1 },
    request: { headers },
  });

  const { data: ordersResponse, isLoading: isLoadingCrm } = useListPortalOrders({
    query: { queryKey: ["listPortalOrders", token], enabled: !!token },
    request: { headers },
  });

  const { data: logisticResponse, isLoading: isLoadingLogistic } = useListPortalLogisticOrders({
    query: { queryKey: ["listPortalLogisticOrders", token], enabled: !!token },
    request: { headers },
  });

  const { data: dashStats } = useQuery<DashboardStats>({
    queryKey: ["portal-dashboard-stats", token],
    queryFn: async () => {
      const r = await fetch("/api/portal/me/dashboard-stats", { headers });
      if (!r.ok) throw new Error("stats error");
      return r.json() as Promise<DashboardStats>;
    },
    enabled: !!token,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (userError) { removeAuthToken(); setLocation("/login"); }
  }, [userError, setLocation]);

  if (!token) return null;

  const logisticOrders = Array.isArray(logisticResponse) ? logisticResponse : [];
  const crmOrders      = Array.isArray(ordersResponse)   ? ordersResponse   : [];

  const allOrders = [
    ...logisticOrders.map((o) => ({
      _key:          `log-${o.id}`,
      displayNumber: o.orderNumber,
      subtitle:      `${o.shipmentType ?? "Logistik"} · ${o.origin ?? ""} → ${o.destination ?? ""}`,
      status:        o.status,
      displayStatus: LOGISTIC_STATUS_ID[o.status] ?? o.status,
      statusColor:   LOGISTIC_STATUS_COLOR[o.status] ?? "bg-gray-100 text-gray-800",
      grandTotal:    o.grandTotal,
      createdAt:     o.createdAt,
      trackUrl:      `/track?order=${encodeURIComponent(o.orderNumber)}`,
    })),
    ...crmOrders.map((o) => ({
      _key:          `crm-${o.id}`,
      displayNumber: o.docNumber,
      subtitle:      "Sales Order",
      status:        o.status,
      displayStatus: LOGISTIC_STATUS_ID[o.status] ?? o.status,
      statusColor:   "bg-gray-100 text-gray-800",
      grandTotal:    o.grandTotal,
      createdAt:     o.createdAt,
      trackUrl:      null as string | null,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const isLoadingOrders   = isLoadingCrm || isLoadingLogistic;
  const shipmentAktif     = dashStats?.activeOrders ?? logisticOrders.filter((o) => ACTIVE_STATUSES.has(o.status)).length;
  const menungguPenawaran = logisticOrders.filter((o) => PENDING_QUOTE_STATUSES.has(o.status)).length;
  const menungguApproval  = logisticOrders.filter((o) => PENDING_APPROVAL_STATUSES.has(o.status)).length;
  const invoicePending    = dashStats?.invoiceOutstandingCount ?? 0;
  const invoiceAmount     = dashStats?.invoiceOutstandingAmount ?? 0;
  const recentOrders      = allOrders.slice(0, 8);

  const STAT_CARDS = [
    {
      label:  "Shipment Aktif",
      value:  isLoadingOrders ? "—" : shipmentAktif,
      icon:   Truck,
      bg:     "bg-sky-50",
      icon_c: "text-sky-600",
      badge:  shipmentAktif > 0 ? { label: "Aktif",   cls: "bg-sky-50 text-sky-700 border-sky-100" } : null,
    },
    {
      label:  "Menunggu Penawaran",
      value:  isLoadingOrders ? "—" : menungguPenawaran,
      icon:   Clock,
      bg:     "bg-amber-50",
      icon_c: "text-amber-600",
      badge:  menungguPenawaran > 0 ? { label: "Proses", cls: "bg-amber-50 text-amber-700 border-amber-100" } : null,
    },
    {
      label:  "Menunggu Approval",
      value:  isLoadingOrders ? "—" : menungguApproval,
      icon:   Navigation,
      bg:     "bg-blue-50",
      icon_c: "text-blue-600",
      badge:  menungguApproval > 0 ? { label: "Perlu aksi", cls: "bg-blue-50 text-blue-700 border-blue-100" } : null,
    },
    {
      label:    "Invoice Belum Dibayar",
      value:    invoicePending,
      sub:      invoicePending > 0 ? idr(invoiceAmount) : null,
      icon:     FileText,
      bg:       invoicePending > 0 ? "bg-orange-50" : "bg-slate-50",
      icon_c:   invoicePending > 0 ? "text-orange-600" : "text-slate-400",
      ring:     invoicePending > 0,
      badge:    invoicePending > 0 ? { label: "Bayar", cls: "bg-orange-50 text-orange-700 border-orange-100" } : null,
    },
  ];

  const QUICK_ACTIONS = [
    { label: "Buat Permintaan Baru", icon: Plus,        href: "/jasa",            cls: "bg-sky-600 hover:bg-sky-700 text-white shadow-sm shadow-sky-200" },
    { label: "Upload Dokumen",        icon: UploadCloud, href: "/portal-dokumen",  cls: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200" },
    { label: "Tracking Shipment",     icon: MapPin,      href: "/track",           cls: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200" },
    { label: "Lihat Invoice",         icon: Receipt,     href: "/portal-invoice",  cls: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200" },
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50 py-8">
      <div className="container px-4 md:px-6 max-w-5xl">

        {/* Welcome */}
        <div className="mb-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t("dashboard.welcomeBack")}{!isLoadingUser && customer?.name ? `, ${customer.name.split(" ")[0]}` : ""} 👋
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Berikut ringkasan aktivitas pengiriman Anda.</p>
          </div>
          <Link href="/jasa">
            <Button className="gap-2 bg-sky-600 hover:bg-sky-700 shadow-sm">
              <Plus className="h-4 w-4" /> Buat Permintaan
            </Button>
          </Link>
        </div>

        {/* 4 KPI stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {STAT_CARDS.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label} className={`border-none shadow-sm ${s.ring ? "ring-1 ring-orange-200" : ""}`}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center`}>
                      <Icon className={`h-[18px] w-[18px] ${s.icon_c}`} />
                    </div>
                    {s.badge && (
                      <Badge className={`text-[11px] border ${s.badge.cls}`}>{s.badge.label}</Badge>
                    )}
                  </div>
                  <p className="text-3xl font-bold text-slate-900">{s.value}</p>
                  {s.sub && <p className="text-xs font-semibold text-orange-600 mt-0.5">{s.sub}</p>}
                  <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
          {QUICK_ACTIONS.map(({ label, icon: Icon, href, cls }) => (
            <Link key={href} href={href}>
              <button className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95 ${cls}`}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-left leading-tight">{label}</span>
              </button>
            </Link>
          ))}
        </div>

        {/* Shipment Terbaru */}
        <Card className="border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
            <CardTitle className="text-base font-semibold text-slate-800">Shipment Terbaru</CardTitle>
            <Link href="/orders">
              <Button variant="ghost" size="sm" className="gap-1 text-sky-600 hover:text-sky-700 hover:bg-sky-50 text-xs h-8">
                Lihat Semua <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0 px-0 pb-0">
            {isLoadingOrders ? (
              <div className="space-y-px">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-slate-100 rounded animate-pulse w-40" />
                      <div className="h-3 bg-slate-100 rounded animate-pulse w-56" />
                    </div>
                    <div className="h-6 bg-slate-100 rounded-full animate-pulse w-24" />
                  </div>
                ))}
              </div>
            ) : recentOrders.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {recentOrders.map((order) => (
                  <div
                    key={order._key}
                    className={`flex items-center justify-between px-6 py-3.5 transition-colors ${
                      order.trackUrl ? "cursor-pointer hover:bg-sky-50/60" : "hover:bg-slate-50/80"
                    }`}
                    onClick={() => order.trackUrl && setLocation(order.trackUrl)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                        <Ship className="h-4 w-4 text-sky-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-800 truncate">{order.displayNumber}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[200px]">{order.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <Badge className={`text-[11px] border-0 ${order.statusColor}`}>{order.displayStatus}</Badge>
                      <span className="text-sm font-semibold text-slate-700 hidden sm:block">{formatCurrency(order.grandTotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-14 px-6">
                <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
                  <Package className="h-7 w-7 text-sky-300" />
                </div>
                <h3 className="font-semibold text-slate-700 mb-1">Belum ada shipment</h3>
                <p className="text-slate-400 text-sm mb-5">Mulai buat permintaan pengiriman pertama Anda.</p>
                <Link href="/jasa">
                  <Button size="sm" className="bg-sky-600 hover:bg-sky-700 gap-2 shadow-sm">
                    <Plus className="h-3.5 w-3.5" /> Buat Permintaan
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
