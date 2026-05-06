import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { getAuthToken, getAuthHeaders, removeAuthToken } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Truck, FileText, CheckCircle2, Clock, AlertCircle,
  ArrowRight, Building2, Phone, Mail, Package, LogOut,
} from "lucide-react";

interface VendorProfile {
  portalCustomer: {
    id: number; name: string; email: string; phone: string | null; company: string | null; role: string;
  };
  supplier: {
    id: number; name: string; phone: string | null; contactEmail: string | null;
    serviceType: string | null; isActive: boolean;
  } | null;
  rfqs: {
    id: number; rfqNumber: string; orderId: number; status: string;
    orderNumber: string; origin: string; destination: string;
    shipmentType: string; commodity: string | null; createdAt: string;
  }[];
  quotes: {
    id: number; rfqId: number; orderId: number; orderNumber: string;
    rfqNumber: string; vendorPrice: number; sellingPrice: number | null;
    estimatedPickup: string | null; estimatedDelivery: string | null;
    vendorNotes: string | null; quoteStatus: string; replySource: string | null;
    createdAt: string;
  }[];
}

function fmt(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

const RFQ_STATUS: Record<string, { label: string; cls: string }> = {
  open:   { label: "Open",   cls: "bg-yellow-100 text-yellow-800" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-700" },
  awarded:{ label: "Awarded",cls: "bg-green-100 text-green-800" },
};

const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  pending:  { label: "Menunggu", cls: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Dipilih",  cls: "bg-green-100 text-green-800" },
  rejected: { label: "Ditolak",  cls: "bg-red-100 text-red-800" },
};

export default function VendorDashboard() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token = getAuthToken();

  useEffect(() => {
    if (!token) { setLocation("/login"); return; }
    const headers = getAuthHeaders() as Record<string, string>;
    fetch("/api/portal/vendor/profile", { headers })
      .then(async (r) => {
        if (r.status === 401) { removeAuthToken(); setLocation("/login"); return; }
        if (!r.ok) throw new Error("Gagal memuat profil vendor");
        const data = await r.json() as VendorProfile;
        if (data.portalCustomer.role !== "vendor") {
          setLocation("/dashboard");
          return;
        }
        setProfile(data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, setLocation]);

  function handleLogout() {
    removeAuthToken();
    setLocation("/login");
  }

  if (!token) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Memuat dashboard vendor...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
            <p className="text-red-600 font-medium">{error}</p>
            <Button variant="outline" onClick={() => setLocation("/login")}>Kembali ke Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) return null;

  const { portalCustomer, supplier, rfqs, quotes } = profile;
  const openRfqs = rfqs.filter((r) => r.status === "open");
  const submittedQuotes = quotes.length;
  const approvedQuotes = quotes.filter((q) => q.quoteStatus === "approved").length;

  const quotedRfqIds = new Set(quotes.map((q) => q.rfqId));
  const pendingRfqs = openRfqs.filter((r) => !quotedRfqIds.has(r.id));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-border/60 sticky top-0 z-10">
        <div className="container px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Truck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm leading-tight">{portalCustomer.name}</p>
              <p className="text-xs text-muted-foreground">Vendor Portal</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" /> Keluar
          </Button>
        </div>
      </div>

      <div className="container px-4 md:px-6 py-8 space-y-8">

        {/* Welcome banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">
              Selamat datang, {portalCustomer.name.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-1">Pantau RFQ dan penawaran Anda di sini</p>
          </div>
          {pendingRfqs.length > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5">
              <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <p className="text-sm font-medium text-yellow-800">
                {pendingRfqs.length} RFQ belum dibalas
              </p>
            </div>
          )}
        </div>

        {/* Supplier link status */}
        {supplier ? (
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-green-900">Akun terhubung ke data vendor</p>
                  <p className="text-sm text-green-700 mt-0.5">
                    Terhubung sebagai: <strong>{supplier.name}</strong>
                    {supplier.serviceType && <> · {supplier.serviceType}</>}
                  </p>
                </div>
                <Badge className={supplier.isActive ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700"}>
                  {supplier.isActive ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-4">
                <Clock className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-900">Akun belum terhubung ke data vendor</p>
                  <p className="text-sm text-yellow-700 mt-0.5">
                    Hubungi admin CST Logistics untuk menghubungkan akun Anda dengan email <strong>{portalCustomer.email}</strong> atau nomor telepon yang terdaftar.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-primary text-primary-foreground rounded-xl p-5">
            <p className="text-xs text-primary-foreground/60 mb-1">RFQ Open</p>
            <p className="text-4xl font-bold">{openRfqs.length}</p>
          </div>
          <div className="bg-accent text-accent-foreground rounded-xl p-5">
            <p className="text-xs text-accent-foreground/70 mb-1">Penawaran Terkirim</p>
            <p className="text-4xl font-bold">{submittedQuotes}</p>
          </div>
          <div className="col-span-2 md:col-span-1 bg-green-600 text-white rounded-xl p-5">
            <p className="text-xs text-white/70 mb-1">Penawaran Dipilih</p>
            <p className="text-4xl font-bold">{approvedQuotes}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Open RFQs */}
          <Card className="border-none shadow-sm">
            <CardHeader className="border-b border-border/40 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4" /> RFQ Masuk
                  </CardTitle>
                  <CardDescription>Permintaan penawaran harga dari CST Logistics</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {rfqs.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Belum ada RFQ yang diterima</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rfqs.slice(0, 8).map((rfq) => {
                    const hasQuoted = quotedRfqIds.has(rfq.id);
                    const st = RFQ_STATUS[rfq.status] ?? { label: rfq.status, cls: "bg-gray-100 text-gray-700" };
                    return (
                      <div
                        key={rfq.id}
                        className="flex items-start justify-between p-4 rounded-lg border border-border/50 hover:bg-gray-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-mono text-xs font-medium text-primary">{rfq.rfqNumber}</p>
                            <Badge className={st.cls} variant="secondary">{st.label}</Badge>
                            {hasQuoted && (
                              <Badge className="bg-blue-100 text-blue-800" variant="secondary">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Sudah dibalas
                              </Badge>
                            )}
                            {!hasQuoted && rfq.status === "open" && (
                              <Badge className="bg-orange-100 text-orange-800" variant="secondary">
                                <AlertCircle className="h-2.5 w-2.5 mr-1" /> Belum dibalas
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium mt-1">{rfq.shipmentType}</p>
                          <p className="text-xs text-muted-foreground">{rfq.origin} → {rfq.destination}</p>
                          {rfq.commodity && <p className="text-xs text-muted-foreground">Komoditi: {rfq.commodity}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(rfq.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {rfqs.length > 8 && (
                    <p className="text-xs text-center text-muted-foreground pt-2">+{rfqs.length - 8} RFQ lainnya</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submitted quotes */}
          <div className="space-y-6">
            <Card className="border-none shadow-sm">
              <CardHeader className="border-b border-border/40 pb-4">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Penawaran Terkirim
                </CardTitle>
                <CardDescription>Harga yang sudah Anda submit ke CST Logistics</CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                {quotes.length === 0 ? (
                  <div className="text-center py-10">
                    <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Belum ada penawaran yang dikirim</p>
                    {openRfqs.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Balas RFQ via WhatsApp untuk mengirim penawaran
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {quotes.slice(0, 8).map((q) => {
                      const st = QUOTE_STATUS[q.quoteStatus] ?? { label: q.quoteStatus, cls: "bg-gray-100 text-gray-700" };
                      return (
                        <div key={q.id} className="p-4 rounded-lg border border-border/50">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-medium text-primary">{q.rfqNumber}</p>
                              <p className="font-semibold mt-1">{fmt(q.vendorPrice)}</p>
                              {q.estimatedPickup && (
                                <p className="text-xs text-muted-foreground">
                                  ETA Pickup: {q.estimatedPickup}
                                  {q.estimatedDelivery && ` · Delivery: ${q.estimatedDelivery}`}
                                </p>
                              )}
                              {q.vendorNotes && (
                                <p className="text-xs text-muted-foreground italic">{q.vendorNotes}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                Via {q.replySource === "whatsapp" ? "WhatsApp" : "Manual"} ·{" "}
                                {new Date(q.createdAt).toLocaleDateString("id-ID")}
                              </p>
                            </div>
                            <Badge className={st.cls} variant="secondary">{st.label}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Profile card */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" /> Profil Akun
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {portalCustomer.company && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span>{portalCustomer.company}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{portalCustomer.email}</span>
                </div>
                {portalCustomer.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span>{portalCustomer.phone}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-border/40 text-xs text-muted-foreground">
                  <p>Untuk membalas RFQ, kirim pesan WhatsApp ke nomor CST Logistics dengan format:</p>
                  <p className="font-mono bg-gray-100 rounded px-2 py-1 mt-1 text-xs">
                    {"<NO_RFQ> <HARGA>"}
                  </p>
                  <p className="mt-1">Contoh: <span className="font-mono">RFQ-260506-12345 5000000</span></p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
