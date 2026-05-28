import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { getAuthToken, getAuthHeaders, removeAuthToken } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Truck, FileText, CheckCircle2, Clock, AlertCircle,
  Building2, Phone, Mail, Package, LogOut, Send, Pencil, X,
  ChevronDown, ChevronUp, RefreshCw,
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

interface QuoteFormState {
  vendorPrice: string;
  estimatedPickup: string;
  estimatedDelivery: string;
  estimatedDays: string;
  vendorNotes: string;
}

const emptyForm = (): QuoteFormState => ({
  vendorPrice: "", estimatedPickup: "", estimatedDelivery: "", estimatedDays: "", vendorNotes: "",
});

function fmt(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

const RFQ_STATUS: Record<string, { label: string; cls: string }> = {
  open:    { label: "Open",    cls: "bg-yellow-100 text-yellow-800" },
  closed:  { label: "Closed",  cls: "bg-gray-100 text-gray-700" },
  awarded: { label: "Awarded", cls: "bg-green-100 text-green-800" },
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

  // Per-RFQ form state: rfqId → form values
  const [openForms, setOpenForms] = useState<Record<number, QuoteFormState>>({});
  // Per-RFQ submission state
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});
  const [submitMsg, setSubmitMsg] = useState<Record<number, { ok: boolean; msg: string }>>({});
  // Expand/collapse RFQ cards
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const token = getAuthToken();
  const headers = getAuthHeaders() as Record<string, string>;

  const loadProfile = useCallback(() => {
    if (!token) { setLocation("/login"); return; }
    setLoading(true);
    fetch("/api/portal/vendor/profile", { headers })
      .then(async (r) => {
        if (r.status === 401) { removeAuthToken(); setLocation("/login"); return; }
        if (!r.ok) throw new Error("Gagal memuat profil vendor");
        const data = await r.json() as VendorProfile;
        if (data.portalCustomer.role !== "vendor") { setLocation("/dashboard"); return; }
        setProfile(data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  function handleLogout() { removeAuthToken(); setLocation("/login"); }

  function toggleForm(rfqId: number, existingQuote?: VendorProfile["quotes"][number]) {
    setOpenForms((prev) => {
      if (prev[rfqId]) {
        const next = { ...prev };
        delete next[rfqId];
        return next;
      }
      return {
        ...prev,
        [rfqId]: existingQuote
          ? {
              vendorPrice: String(existingQuote.vendorPrice),
              estimatedPickup: existingQuote.estimatedPickup ?? "",
              estimatedDelivery: existingQuote.estimatedDelivery ?? "",
              estimatedDays: "",
              vendorNotes: existingQuote.vendorNotes ?? "",
            }
          : emptyForm(),
      };
    });
    setSubmitMsg((prev) => { const n = { ...prev }; delete n[rfqId]; return n; });
  }

  function updateForm(rfqId: number, field: keyof QuoteFormState, val: string) {
    setOpenForms((prev) => ({ ...prev, [rfqId]: { ...prev[rfqId], [field]: val } }));
  }

  async function submitQuote(rfqId: number) {
    const form = openForms[rfqId];
    if (!form) return;
    const price = Number(form.vendorPrice.replace(/\./g, "").replace(",", "."));
    if (!price || price <= 0) {
      setSubmitMsg((p) => ({ ...p, [rfqId]: { ok: false, msg: "Harga wajib diisi dan harus lebih dari 0" } }));
      return;
    }
    setSubmitting((p) => ({ ...p, [rfqId]: true }));
    setSubmitMsg((p) => { const n = { ...p }; delete n[rfqId]; return n; });
    try {
      const r = await fetch("/api/portal/vendor/quotes", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          rfqId,
          vendorPrice: price,
          estimatedPickup: form.estimatedPickup || undefined,
          estimatedDelivery: form.estimatedDelivery || undefined,
          estimatedDays: form.estimatedDays ? Number(form.estimatedDays) : undefined,
          vendorNotes: form.vendorNotes || undefined,
        }),
      });
      const data = await r.json() as { success?: boolean; action?: string; message?: string };
      if (!r.ok || !data.success) throw new Error(data.message ?? "Gagal mengirim penawaran");
      setSubmitMsg((p) => ({
        ...p,
        [rfqId]: { ok: true, msg: data.action === "updated" ? "Penawaran diperbarui!" : "Penawaran berhasil dikirim!" },
      }));
      setOpenForms((prev) => { const n = { ...prev }; delete n[rfqId]; return n; });
      loadProfile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal mengirim";
      setSubmitMsg((p) => ({ ...p, [rfqId]: { ok: false, msg } }));
    } finally {
      setSubmitting((p) => ({ ...p, [rfqId]: false }));
    }
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
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={loadProfile} className="gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" /> Keluar
            </Button>
          </div>
        </div>
      </div>

      <div className="container px-4 md:px-6 py-8 space-y-8">

        {/* Welcome */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">
              Selamat datang, {portalCustomer.name.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-1">Pantau dan kirim penawaran RFQ langsung di sini</p>
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
                    Hubungi admin untuk menghubungkan akun dengan email{" "}
                    <strong>{portalCustomer.email}</strong>.
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

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* RFQ list — 3/5 */}
          <div className="lg:col-span-3 space-y-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" /> RFQ Masuk
              </h2>
              <p className="text-sm text-muted-foreground">Klik "Kirim Penawaran" untuk submit harga langsung</p>
            </div>

            {rfqs.length === 0 ? (
              <Card className="border-none shadow-sm">
                <CardContent className="py-12 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Belum ada RFQ yang diterima</p>
                </CardContent>
              </Card>
            ) : (
              rfqs.map((rfq) => {
                const hasQuoted = quotedRfqIds.has(rfq.id);
                const existingQuote = quotes.find((q) => q.rfqId === rfq.id);
                const st = RFQ_STATUS[rfq.status] ?? { label: rfq.status, cls: "bg-gray-100 text-gray-700" };
                const isExpanded = expanded[rfq.id] ?? false;
                const formOpen = !!openForms[rfq.id];
                const isSubmitting = !!submitting[rfq.id];
                const msg = submitMsg[rfq.id];
                const canQuote = rfq.status === "open" && !!supplier;

                return (
                  <Card key={rfq.id} className={`border shadow-sm transition-shadow ${formOpen ? "shadow-md ring-1 ring-primary/20" : ""}`}>
                    <CardContent className="pt-4 pb-4">
                      {/* Row 1: RFQ header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-mono text-xs font-semibold text-primary">{rfq.rfqNumber}</span>
                            <Badge className={st.cls} variant="secondary">{st.label}</Badge>
                            {hasQuoted ? (
                              <Badge className="bg-blue-100 text-blue-800" variant="secondary">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Sudah dibalas
                              </Badge>
                            ) : rfq.status === "open" ? (
                              <Badge className="bg-orange-100 text-orange-800" variant="secondary">
                                <AlertCircle className="h-2.5 w-2.5 mr-1" /> Belum dibalas
                              </Badge>
                            ) : null}
                          </div>
                          <p className="font-semibold text-sm">{rfq.shipmentType}</p>
                          <p className="text-xs text-muted-foreground">{rfq.origin} → {rfq.destination}</p>
                          {rfq.commodity && (
                            <p className="text-xs text-muted-foreground">Komoditi: {rfq.commodity}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(rfq.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          {canQuote && (
                            <Button
                              size="sm"
                              variant={formOpen ? "outline" : hasQuoted ? "outline" : "default"}
                              className="gap-1.5 text-xs h-8"
                              onClick={() => toggleForm(rfq.id, existingQuote)}
                            >
                              {formOpen ? (
                                <><X className="h-3 w-3" /> Batal</>
                              ) : hasQuoted ? (
                                <><Pencil className="h-3 w-3" /> Revisi</>
                              ) : (
                                <><Send className="h-3 w-3" /> Kirim Penawaran</>
                              )}
                            </Button>
                          )}
                          {existingQuote && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-xs h-8 text-muted-foreground"
                              onClick={() => setExpanded((p) => ({ ...p, [rfq.id]: !p[rfq.id] }))}
                            >
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              Detail
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Existing quote detail (expandable) */}
                      {existingQuote && isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-1 bg-gray-50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Penawaran Anda</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                            <div>
                              <span className="text-xs text-muted-foreground">Harga</span>
                              <p className="font-semibold">{fmt(existingQuote.vendorPrice)}</p>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground">Status</span>
                              <p>
                                <Badge className={QUOTE_STATUS[existingQuote.quoteStatus]?.cls ?? "bg-gray-100"} variant="secondary">
                                  {QUOTE_STATUS[existingQuote.quoteStatus]?.label ?? existingQuote.quoteStatus}
                                </Badge>
                              </p>
                            </div>
                            {existingQuote.estimatedPickup && (
                              <div>
                                <span className="text-xs text-muted-foreground">ETA Pickup</span>
                                <p className="text-sm">{existingQuote.estimatedPickup}</p>
                              </div>
                            )}
                            {existingQuote.estimatedDelivery && (
                              <div>
                                <span className="text-xs text-muted-foreground">ETA Delivery</span>
                                <p className="text-sm">{existingQuote.estimatedDelivery}</p>
                              </div>
                            )}
                          </div>
                          {existingQuote.vendorNotes && (
                            <p className="text-xs text-muted-foreground italic mt-1">{existingQuote.vendorNotes}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Via {existingQuote.replySource === "whatsapp" ? "WhatsApp" : existingQuote.replySource === "portal" ? "Portal" : "Manual"} ·{" "}
                            {new Date(existingQuote.createdAt).toLocaleDateString("id-ID")}
                          </p>
                        </div>
                      )}

                      {/* Submit form */}
                      {formOpen && (
                        <div className="mt-4 pt-4 border-t border-primary/20 space-y-4">
                          <p className="text-sm font-semibold text-primary">
                            {hasQuoted ? "Revisi Penawaran" : "Kirim Penawaran"}
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2">
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                Harga Penawaran (Rp) <span className="text-red-500">*</span>
                              </label>
                              <Input
                                placeholder="Contoh: 5000000"
                                value={openForms[rfq.id].vendorPrice}
                                onChange={(e) => updateForm(rfq.id, "vendorPrice", e.target.value)}
                                className="font-mono"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                ETA Pickup (opsional)
                              </label>
                              <Input
                                placeholder="Contoh: 2 hari kerja"
                                value={openForms[rfq.id].estimatedPickup}
                                onChange={(e) => updateForm(rfq.id, "estimatedPickup", e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                ETA Delivery (opsional)
                              </label>
                              <Input
                                placeholder="Contoh: 5–7 hari kerja"
                                value={openForms[rfq.id].estimatedDelivery}
                                onChange={(e) => updateForm(rfq.id, "estimatedDelivery", e.target.value)}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                                Catatan (opsional)
                              </label>
                              <Textarea
                                placeholder="Syarat, ketentuan, atau informasi tambahan..."
                                value={openForms[rfq.id].vendorNotes}
                                onChange={(e) => updateForm(rfq.id, "vendorNotes", e.target.value)}
                                rows={2}
                              />
                            </div>
                          </div>

                          {msg && (
                            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
                              {msg.ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                              {msg.msg}
                            </div>
                          )}

                          <div className="flex gap-3">
                            <Button
                              className="flex-1 gap-2"
                              onClick={() => void submitQuote(rfq.id)}
                              disabled={isSubmitting}
                            >
                              {isSubmitting
                                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Mengirim...</>
                                : <><Send className="h-4 w-4" /> {hasQuoted ? "Perbarui Penawaran" : "Kirim Penawaran"}</>}
                            </Button>
                            <Button variant="outline" onClick={() => toggleForm(rfq.id)} disabled={isSubmitting}>
                              Batal
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Success message after close */}
                      {!formOpen && msg?.ok && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                          {msg.msg}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Right sidebar — 2/5 */}
          <div className="lg:col-span-2 space-y-6">

            {/* Quotes history */}
            <Card className="border-none shadow-sm">
              <CardHeader className="border-b border-border/40 pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4" /> Penawaran Terkirim
                </CardTitle>
                <CardDescription>Semua penawaran yang sudah Anda submit</CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                {quotes.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Belum ada penawaran</p>
                    {openRfqs.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Klik "Kirim Penawaran" pada RFQ di sebelah kiri
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {quotes.map((q) => {
                      const st = QUOTE_STATUS[q.quoteStatus] ?? { label: q.quoteStatus, cls: "bg-gray-100 text-gray-700" };
                      return (
                        <div key={q.id} className="p-3 rounded-lg border border-border/50 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-mono text-xs font-medium text-primary">{q.rfqNumber}</p>
                            <Badge className={st.cls} variant="secondary">{st.label}</Badge>
                          </div>
                          <p className="font-semibold text-sm">{fmt(q.vendorPrice)}</p>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {q.estimatedPickup && <span>Pickup: {q.estimatedPickup}</span>}
                            {q.estimatedDelivery && <span>Delivery: {q.estimatedDelivery}</span>}
                          </div>
                          {q.vendorNotes && <p className="text-xs text-muted-foreground italic">{q.vendorNotes}</p>}
                          <p className="text-xs text-muted-foreground">
                            Via {q.replySource === "whatsapp" ? "WhatsApp" : q.replySource === "portal" ? "Portal" : "Manual"} ·{" "}
                            {new Date(q.createdAt).toLocaleDateString("id-ID")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Profile */}
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" /> Profil Akun
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
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
                <div className="pt-3 border-t border-border/40 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Cara kirim penawaran:</p>
                  <p>1. Klik <strong>"Kirim Penawaran"</strong> pada RFQ yang ingin dibalas</p>
                  <p>2. Isi harga dan keterangan, lalu kirim</p>
                  <p>3. Anda bisa revisi selama RFQ masih Open</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
