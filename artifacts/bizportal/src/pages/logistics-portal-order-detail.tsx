import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLogisticOrder,
  useListLogisticOrderRfqs,
  useListLogisticOrderQuotes,
  useCreateLogisticOrderRfq,
  useCreateLogisticOrderQuote,
  useUpdateLogisticOrderQuote,
  useApproveLogisticOrderQuote,
  useUpdateLogisticOrderStatus,
  getListLogisticOrderRfqsQueryKey,
  getListLogisticOrderQuotesQueryKey,
  getListLogisticOrdersQueryKey,
  getGetLogisticOrderQueryKey,
} from "@workspace/api-client-react";
import type { LogisticQuote, LogisticRfq } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  ArrowLeft, PackageOpen, Send, Plus, CheckCircle, Edit, Star, Zap, TrendingDown,
  RefreshCw, MessageCircle, Trash2, ListChecks, Link, Link2, Copy, ExternalLink, Loader2, Eye,
} from "lucide-react";

const idr = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const STATUS_COLORS: Record<string, string> = {
  "New Order": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Under Review": "bg-blue-100 text-blue-800 border-blue-200",
  "Quotation Sent": "bg-purple-100 text-purple-800 border-purple-200",
  "Confirmed": "bg-teal-100 text-teal-800 border-teal-200",
  "In Progress": "bg-orange-100 text-orange-800 border-orange-200",
  "Completed": "bg-green-100 text-green-800 border-green-200",
  "Cancelled": "bg-red-100 text-red-800 border-red-200",
};

interface VendorRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  serviceType: string | null;
  isActive: boolean;
  eta: string;
}

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const hhmm = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Kemarin ${hhmm}`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) + " " + hhmm;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hari ini";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function LogisticsPortalOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id ?? "0", 10);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();

  const [rfqDialog, setRfqDialog] = useState(false);
  const [selectedVendors, setSelectedVendors] = useState<number[]>([]);
  const [rfqNotes, setRfqNotes] = useState("");

  // ── Vendor Tracker & Lihat Link Form dialog ────────────────────────────────
  interface VendorTrackerEntry {
    vendorId: number;
    vendorName: string;
    phone: string | null;
    hasPhone: boolean;
    hasOpened: boolean;
    hasSubmitted: boolean;
    formUrl: string | null;
    quote: {
      vendorPrice: number;
      estimatedDays: number | null;
      estimatedPickup: string | null;
      estimatedDelivery: string | null;
      vendorNotes: string | null;
      submittedAt: string | null;
      replySource: string;
      quoteStatus: string;
    } | null;
  }
  // Keep old interface alias for compat with dialog
  type VendorFormLink = VendorTrackerEntry;
  const [linkFormDialog, setLinkFormDialog] = useState(false);
  const [linkFormData, setLinkFormData] = useState<{ rfqNumber: string; vendors: VendorTrackerEntry[] } | null>(null);
  const [linkFormLoading, setLinkFormLoading] = useState(false);

  // Inline tracker (auto-refresh)
  const [trackerData, setTrackerData] = useState<{ rfqNumber: string; vendors: VendorTrackerEntry[] } | null>(null);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [trackerLastUpdated, setTrackerLastUpdated] = useState<Date | null>(null);

  async function fetchTrackerData(silent = false) {
    if (!silent) setTrackerLoading(true);
    try {
      const res = await fetch(`/api/logistic/orders/${orderId}/vendor-form-links`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json() as { rfqNumber: string; vendors: VendorTrackerEntry[] };
        setTrackerData(data);
        setTrackerLastUpdated(new Date());
      }
    } catch { /* silent */ } finally {
      setTrackerLoading(false);
    }
  }

  // Auto-refresh tracker when RFQ tab is visible
  useEffect(() => {
    if (rfqs.length === 0) return;
    void fetchTrackerData();
    const interval = setInterval(() => void fetchTrackerData(true), 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, rfqs.length]);
  const [resendingVendorIds, setResendingVendorIds] = useState<Set<number>>(new Set());
  const [resendResults, setResendResults] = useState<Record<number, "ok" | "fail">>({});

  const [quoteDialog, setQuoteDialog] = useState<{ open: boolean; rfqId: number; vendorId?: number } | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    vendorId: "", vendorPrice: "", estimatedPickup: "", estimatedDelivery: "",
    estimatedDays: "", vendorNotes: "", markupType: "percentage", markupPercentage: "0",
    fixedSellingPrice: "",
  });

  const [editDialog, setEditDialog] = useState<LogisticQuote | null>(null);
  const [editForm, setEditForm] = useState({
    vendorPrice: "", estimatedPickup: "", estimatedDelivery: "", estimatedDays: "",
    vendorNotes: "", markupType: "percentage", markupPercentage: "0", fixedSellingPrice: "",
  });

  const [approveDialog, setApproveDialog] = useState<LogisticQuote | null>(null);
  const [adminReply, setAdminReply] = useState("");

  // [MULTI-MODE] Vendor Offers state
  const [offerDialog, setOfferDialog] = useState(false);
  const [offerForm, setOfferForm] = useState({
    vendorId: "", offerPrice: "", finalCustomerPrice: "",
    vehicleYear: "", carrierName: "", transitDays: "", notes: "",
  });
  const [sendingOptions, setSendingOptions] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Lihat Link Form state (legacy dialog kept for copy-link usage)
  const [linkDialog, setLinkDialog] = useState(false);
  const [vendorFormLinks, setVendorFormLinks] = useState<VendorFormLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  function openLinkDialog() {
    setLinkDialog(true);
    setLinksLoading(true);
    fetch(`/api/logistic/orders/${orderId}/vendor-form-links`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        // New response format: { vendors: [...] } instead of { links: [...] }
        const vendors = (d.vendors ?? d.links ?? []) as VendorFormLink[];
        setVendorFormLinks(vendors);
        setLinksLoading(false);
      })
      .catch(() => setLinksLoading(false));
  }

  function copyLink(url: string, name: string) {
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: `Link ${name} disalin`, description: url.slice(0, 60) + "…" });
    });
  }

  const { data: order, isLoading } = useGetLogisticOrder(orderId);
  const { data: rfqs = [] } = useListLogisticOrderRfqs(orderId);
  const { data: comparison, refetch: refetchQuotes } = useListLogisticOrderQuotes(orderId);
  const quotes = comparison?.quotes ?? [];
  const cheapest = comparison?.cheapest;
  const fastest = comparison?.fastest;
  const recommended = comparison?.recommended;

  const { data: vendors = [] } = useQuery<VendorRow[]>({
    queryKey: ["logistic-vendors"],
    queryFn: async () => {
      const res = await fetch("/api/logistic/orders/vendors");
      if (!res.ok) throw new Error("Failed to load vendors");
      return res.json() as Promise<VendorRow[]>;
    },
  });

  // [MULTI-MODE] Vendor Offers query
  interface VendorOffer {
    id: number; orderId: number; vendorId: number | null; vendorName: string | null;
    transportMode: string | null; offerPrice: number; vehicleYear: number | null;
    carrierName: string | null; transitDays: number | null; notes: string | null;
    isSelectedByAdmin: boolean; finalCustomerPrice: number | null;
    optionLabel: string | null; status: string;
  }
  const { data: vendorOffers = [], refetch: refetchOffers } = useQuery<VendorOffer[]>({
    queryKey: ["vendor-offers", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/logistic/orders/${orderId}/vendor-offers`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<VendorOffer[]>;
    },
  });

  interface AiChatMessage { id: number; role: string; content: string; createdAt: string }
  interface AiChatSession { id: number; sessionToken: string; logisticOrderId: number | null; createdAt: string }
  interface AiChatData { session: AiChatSession; messages: AiChatMessage[] }

  const isAiOrder = !!(order && (order as { source?: string }).source === "ai_agent");
  const { data: chatData, refetch: refetchChat } = useQuery<AiChatData>({
    queryKey: ["ai-chat", orderId],
    enabled: isAiOrder,
    queryFn: async () => {
      const res = await fetch(`/api/ai-agent/session/by-order/${orderId}`);
      if (!res.ok) throw new Error("Chat tidak ditemukan");
      return res.json() as Promise<AiChatData>;
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatData]);

  async function handleAdminReply() {
    if (!adminReply.trim() || !chatData?.session.sessionToken) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/ai-agent/session/${chatData.session.sessionToken}/admin-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: adminReply.trim() }),
      });
      if (res.ok) {
        setAdminReply("");
        await refetchChat();
        toast({ title: t.common.success });
      } else {
        toast({ title: t.common.error, variant: "destructive" });
      }
    } catch {
      toast({ title: t.common.error, variant: "destructive" });
    } finally {
      setSendingReply(false);
    }
  }

  const createRfq = useCreateLogisticOrderRfq();
  const createQuote = useCreateLogisticOrderQuote();
  const updateQuote = useUpdateLogisticOrderQuote();
  const approveQuote = useApproveLogisticOrderQuote();
  const updateStatus = useUpdateLogisticOrderStatus();

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: getListLogisticOrderRfqsQueryKey(orderId) });
    qc.invalidateQueries({ queryKey: getListLogisticOrderQuotesQueryKey(orderId) });
    qc.invalidateQueries({ queryKey: getGetLogisticOrderQueryKey(orderId) });
    qc.invalidateQueries({ queryKey: getListLogisticOrdersQueryKey() });
  }

  // [MULTI-MODE] Vendor Offer handlers
  async function handleCreateOffer() {
    const vp = parseFloat(offerForm.offerPrice);
    if (isNaN(vp) || vp <= 0) { toast({ title: "Harga vendor wajib diisi", variant: "destructive" }); return; }
    const payload: Record<string, unknown> = { offerPrice: vp };
    if (offerForm.vendorId) payload.vendorId = parseInt(offerForm.vendorId);
    if (offerForm.finalCustomerPrice) payload.finalCustomerPrice = parseFloat(offerForm.finalCustomerPrice);
    if (offerForm.vehicleYear) payload.vehicleYear = parseInt(offerForm.vehicleYear);
    if (offerForm.carrierName) payload.carrierName = offerForm.carrierName;
    if (offerForm.transitDays) payload.transitDays = parseInt(offerForm.transitDays);
    if (offerForm.notes) payload.notes = offerForm.notes;
    try {
      const res = await fetch(`/api/logistic/orders/${orderId}/vendor-offers`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      toast({ title: "Opsi berhasil ditambahkan" });
      setOfferDialog(false);
      setOfferForm({ vendorId: "", offerPrice: "", finalCustomerPrice: "", vehicleYear: "", carrierName: "", transitDays: "", notes: "" });
      void refetchOffers();
    } catch { toast({ title: t.common.error, variant: "destructive" }); }
  }

  async function handleDeleteOffer(offerId: number) {
    if (!confirm("Hapus opsi ini?")) return;
    try {
      await fetch(`/api/logistic/orders/vendor-offers/${offerId}`, { method: "DELETE" });
      void refetchOffers();
    } catch { toast({ title: t.common.error, variant: "destructive" }); }
  }

  async function handleSendOptions() {
    setSendingOptions(true);
    try {
      const res = await fetch(`/api/logistic/orders/${orderId}/send-customer-options`, { method: "POST" });
      const body = await res.json() as { ok?: boolean; message?: string; optionCount?: number };
      if (!res.ok) throw new Error(body.message ?? "Gagal");
      toast({ title: `${body.optionCount ?? 0} opsi berhasil dikirim ke customer via WA` });
      void refetchOffers();
      invalidateAll();
    } catch (e: unknown) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSendingOptions(false);
    }
  }

  function handleSendRfq() {
    if (selectedVendors.length === 0) {
      toast({ title: t.common.error, variant: "destructive" });
      return;
    }
    createRfq.mutate(
      { id: orderId, data: { vendorIds: selectedVendors, notes: rfqNotes || undefined } },
      {
        onSuccess: (rfq) => {
          toast({ title: t.common.success });
          setRfqDialog(false);
          setSelectedVendors([]);
          setRfqNotes("");
          invalidateAll();
        },
        onError: () => toast({ title: t.common.error, variant: "destructive" }),
      }
    );
  }

  function handleCreateQuote() {
    if (!quoteDialog) return;
    const vp = parseFloat(quoteForm.vendorPrice.replace(/[.,]/g, ""));
    if (!quoteForm.vendorId || isNaN(vp) || vp <= 0) {
      toast({ title: t.common.error, variant: "destructive" });
      return;
    }
    const mp = parseFloat(quoteForm.markupPercentage) || 0;
    const fp = quoteForm.fixedSellingPrice ? parseFloat(quoteForm.fixedSellingPrice) : undefined;
    createQuote.mutate(
      {
        id: orderId,
        data: {
          rfqId: quoteDialog.rfqId,
          vendorId: parseInt(quoteForm.vendorId, 10),
          vendorPrice: vp,
          estimatedPickup: quoteForm.estimatedPickup || undefined,
          estimatedDelivery: quoteForm.estimatedDelivery || undefined,
          estimatedDays: quoteForm.estimatedDays ? parseInt(quoteForm.estimatedDays) : undefined,
          vendorNotes: quoteForm.vendorNotes || undefined,
          markupType: quoteForm.markupType,
          markupPercentage: mp,
          fixedSellingPrice: fp,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t.common.success });
          setQuoteDialog(null);
          setQuoteForm({ vendorId: "", vendorPrice: "", estimatedPickup: "", estimatedDelivery: "", estimatedDays: "", vendorNotes: "", markupType: "percentage", markupPercentage: "0", fixedSellingPrice: "" });
          invalidateAll();
        },
        onError: () => toast({ title: t.common.error, variant: "destructive" }),
      }
    );
  }

  function openEditDialog(q: LogisticQuote) {
    setEditDialog(q);
    setEditForm({
      vendorPrice: String(q.vendorPrice),
      estimatedPickup: q.estimatedPickup ?? "",
      estimatedDelivery: q.estimatedDelivery ?? "",
      estimatedDays: q.estimatedDays != null ? String(q.estimatedDays) : "",
      vendorNotes: q.vendorNotes ?? "",
      markupType: q.markupType,
      markupPercentage: String(q.markupPercentage),
      fixedSellingPrice: q.fixedSellingPrice != null ? String(q.fixedSellingPrice) : "",
    });
  }

  function handleUpdateQuote() {
    if (!editDialog) return;
    const vp = parseFloat(editForm.vendorPrice);
    if (isNaN(vp) || vp <= 0) {
      toast({ title: t.common.error, variant: "destructive" });
      return;
    }
    updateQuote.mutate(
      {
        quoteId: editDialog.id,
        data: {
          vendorPrice: vp,
          estimatedPickup: editForm.estimatedPickup || undefined,
          estimatedDelivery: editForm.estimatedDelivery || undefined,
          estimatedDays: editForm.estimatedDays ? parseInt(editForm.estimatedDays) : undefined,
          vendorNotes: editForm.vendorNotes || undefined,
          markupType: editForm.markupType,
          markupPercentage: parseFloat(editForm.markupPercentage) || 0,
          fixedSellingPrice: editForm.fixedSellingPrice ? parseFloat(editForm.fixedSellingPrice) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t.common.success });
          setEditDialog(null);
          invalidateAll();
          refetchQuotes();
        },
        onError: () => toast({ title: t.common.error, variant: "destructive" }),
      }
    );
  }

  function handleApproveQuote() {
    if (!approveDialog) return;
    approveQuote.mutate(
      { id: orderId, data: { quoteId: approveDialog.id } },
      {
        onSuccess: () => {
          toast({ title: t.common.success });
          setApproveDialog(null);
          invalidateAll();
        },
        onError: () => toast({ title: t.common.error, variant: "destructive" }),
      }
    );
  }

  function previewSellingPrice(vp: number, mt: string, mp: number, fp: number | null): number {
    if (mt === "fixed_price" && fp != null) return fp;
    return vp + (vp * mp / 100);
  }

  async function openLinkFormDialog() {
    setLinkFormDialog(true);
    setLinkFormLoading(true);
    setResendResults({});
    try {
      const res = await fetch(`/api/logistic/orders/${orderId}/vendor-form-links`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json() as { message?: string }).message ?? "Gagal memuat link form");
      setLinkFormData(await res.json() as { rfqNumber: string; vendors: VendorFormLink[] });
    } catch (e: unknown) {
      toast({ title: "Gagal memuat link form", description: e instanceof Error ? e.message : "Coba lagi", variant: "destructive" });
      setLinkFormDialog(false);
    } finally {
      setLinkFormLoading(false);
    }
  }

  async function handleResendVendorWa(vendorId: number) {
    setResendingVendorIds((prev) => new Set(prev).add(vendorId));
    setResendResults((prev) => { const n = { ...prev }; delete n[vendorId]; return n; });
    try {
      const res = await fetch(`/api/logistic/orders/${orderId}/resend-rfq`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vendorIds: [vendorId] }),
      });
      const data = await res.json() as { ok?: boolean; sentCount?: number; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Gagal mengirim ulang");
      setResendResults((prev) => ({ ...prev, [vendorId]: (data.sentCount ?? 0) > 0 ? "ok" : "fail" }));
      if ((data.sentCount ?? 0) > 0) toast({ title: "WA berhasil dikirim ulang" });
      else toast({ title: "Tidak ada WA terkirim", description: "Vendor mungkin tidak memiliki nomor WA", variant: "destructive" });
    } catch (e: unknown) {
      setResendResults((prev) => ({ ...prev, [vendorId]: "fail" }));
      toast({ title: "Gagal kirim ulang", description: e instanceof Error ? e.message : "Coba lagi", variant: "destructive" });
    } finally {
      setResendingVendorIds((prev) => { const n = new Set(prev); n.delete(vendorId); return n; });
    }
  }

  // Filter vendors: active + serviceType compatible with order shipment type
  // Vendors with null/empty serviceType ("Semua tipe") always appear
  const activeVendors = vendors.filter((v) => {
    if (!v.isActive) return false;
    if (!v.serviceType) return true;
    const st = v.serviceType.toLowerCase().trim();
    if (!st || st === "semua tipe" || st === "all") return true;
    const orderType = (order?.shipmentType ?? "").toLowerCase().trim();
    if (!orderType) return true;
    return orderType.includes(st) || st.includes(orderType);
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell>
        <div className="p-6">
          <p className="text-muted-foreground">Order tidak ditemukan.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/logistics/portal-orders")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Kembali
          </Button>
        </div>
      </AppShell>
    );
  }

  const latestRfq: LogisticRfq | undefined = rfqs[0];

  return (
    <AppShell>
      <div className="space-y-6 p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/logistics/portal-orders")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <PackageOpen className="h-5 w-5" />
                {order.orderNumber}
              </h1>
              <Badge className={`${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-800"} border text-xs`}>
                {order.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {order.customerName} · {order.companyName} · {order.email} · {order.phone}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {order.status === "New Order" || order.status === "Under Review" ? (
              <Button size="sm" className="gap-2" onClick={() => setRfqDialog(true)}>
                <Send className="h-4 w-4" /> Kirim RFQ ke Vendor
              </Button>
            ) : null}
            {rfqs.length > 0 && (
              <Button size="sm" variant="outline" className="gap-2" onClick={openLinkDialog}>
                <Link2 className="h-4 w-4" /> Lihat Link Form
              </Button>
            )}
            {order.status === "Confirmed" && (
              <Button
                size="sm"
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  const params = new URLSearchParams({
                    kind: "order",
                    fromPortal: order.orderNumber,
                    customer: order.customerName,
                    origin: order.origin,
                    destination: order.destination,
                    ...(order.finalSellingPrice != null ? { price: String(order.finalSellingPrice) } : {}),
                  });
                  navigate(`/sales/quotations/new?${params.toString()}`);
                }}
              >
                <Plus className="h-4 w-4" /> Buat Sales Order
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue={isAiOrder ? "chat-ai" : "detail"}>
          <TabsList>
            <TabsTrigger value="detail">Detail Order</TabsTrigger>
            <TabsTrigger value="rfq">
              RFQ & Quotes
              {quotes.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] w-4 h-4">
                  {quotes.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="options" className="gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              Opsi Customer
              {vendorOffers.length > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-green-600 text-white text-[10px] w-4 h-4">
                  {vendorOffers.length}
                </span>
              )}
            </TabsTrigger>
            {isAiOrder && (
              <TabsTrigger value="chat-ai" className="gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                Chat AI
                {chatData && chatData.messages.length > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-violet-600 text-white text-[10px] w-4 h-4">
                    {chatData.messages.length}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── Tab 1: Order Detail ── */}
          <TabsContent value="detail" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Info Pengiriman</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="Tipe" value={order.shipmentType} />
                  <InfoRow label="Rute" value={`${order.origin} → ${order.destination}`} />
                  {order.commodity && <InfoRow label="Komoditi" value={order.commodity} />}
                  {order.cargoDescription && <InfoRow label="Kargo" value={order.cargoDescription} />}
                  {order.grossWeight != null && <InfoRow label="Berat" value={`${order.grossWeight} kg`} />}
                  {order.volumeCbm != null && <InfoRow label="Volume" value={`${order.volumeCbm} CBM`} />}
                  {order.requiredDate && <InfoRow label="Tgl Butuh" value={order.requiredDate} />}
                  {order.paymentType && <InfoRow label="Pembayaran" value={order.paymentType} />}
                  {order.notes && <InfoRow label="Catatan" value={order.notes} />}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Nilai Order</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="Subtotal" value={idr(order.subtotal)} />
                  <InfoRow label="Pajak" value={idr(order.tax)} />
                  <InfoRow label="Total Estimasi" value={<span className="font-bold text-base">{idr(order.grandTotal)}</span>} />
                  {order.finalSellingPrice != null && (
                    <InfoRow label="Harga Jual Final" value={<span className="font-bold text-green-700">{idr(order.finalSellingPrice)}</span>} />
                  )}
                  {order.approvedVendorName && <InfoRow label="Vendor Dipilih" value={order.approvedVendorName} />}
                  {order.quotationSentAt && (
                    <InfoRow label="Penawaran Dikirim" value={new Date(order.quotationSentAt).toLocaleString("id-ID")} />
                  )}
                </CardContent>
              </Card>
            </div>

            {(order.items ?? []).length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Item Layanan</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Layanan</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(order.items ?? []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-sm">{item.serviceName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                          <TableCell className="text-right text-sm">{idr(item.subtotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Tab 2: RFQ & Quotes ── */}
          <TabsContent value="rfq" className="space-y-4 mt-4">
            {/* Vendor Response Tracker */}
            {rfqs.length > 0 && (
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      Vendor Response Tracker
                      {trackerData && (
                        <span className="text-xs font-normal text-muted-foreground">
                          — {trackerData.rfqNumber}
                        </span>
                      )}
                    </CardTitle>
                    {trackerLastUpdated && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Diperbarui {trackerLastUpdated.toLocaleTimeString("id-ID")} · auto-refresh 30s
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => void fetchTrackerData()}
                      disabled={trackerLoading}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${trackerLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      onClick={openLinkFormDialog}
                    >
                      <Link className="h-3.5 w-3.5" /> Link Form
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {trackerLoading && !trackerData ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Memuat data vendor...</span>
                    </div>
                  ) : !trackerData || trackerData.vendors.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Tidak ada vendor di RFQ ini.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {trackerData.vendors.map((v) => {
                        const statusColor = v.hasSubmitted
                          ? "bg-green-50 border-l-4 border-l-green-500"
                          : v.hasOpened
                          ? "bg-yellow-50 border-l-4 border-l-yellow-400"
                          : "bg-background border-l-4 border-l-gray-200";

                        const statusBadge = v.hasSubmitted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircle className="h-3 w-3" /> Sudah Submit
                          </span>
                        ) : v.hasOpened ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            <Eye className="h-3 w-3" /> Sudah Buka Form
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                            <MessageCircle className="h-3 w-3" /> Belum Respons
                          </span>
                        );

                        const isResending = resendingVendorIds.has(v.vendorId);
                        const resendResult = resendResults[v.vendorId];

                        return (
                          <div key={v.vendorId} className={`px-4 py-3 ${statusColor}`}>
                            <div className="flex items-start gap-3 flex-wrap">
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{v.vendorName}</span>
                                  {statusBadge}
                                  {!v.hasPhone && (
                                    <span className="text-xs text-orange-500 border border-orange-200 rounded-full px-2 py-0.5">No WA</span>
                                  )}
                                </div>
                                {v.phone && (
                                  <p className="text-xs text-muted-foreground">{v.phone}</p>
                                )}
                                {v.quote && (
                                  <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
                                    <div>
                                      <span className="text-muted-foreground">Harga Vendor: </span>
                                      <span className="font-semibold text-green-700">
                                        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v.quote.vendorPrice)}
                                      </span>
                                    </div>
                                    {v.quote.estimatedDays != null && (
                                      <div>
                                        <span className="text-muted-foreground">ETA: </span>
                                        <span className="font-medium">{v.quote.estimatedDays} hari</span>
                                      </div>
                                    )}
                                    {v.quote.estimatedPickup && (
                                      <div>
                                        <span className="text-muted-foreground">Pickup: </span>
                                        <span>{v.quote.estimatedPickup}</span>
                                      </div>
                                    )}
                                    {v.quote.submittedAt && (
                                      <div>
                                        <span className="text-muted-foreground">Submit: </span>
                                        <span>{new Date(v.quote.submittedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                                      </div>
                                    )}
                                    {v.quote.vendorNotes && (
                                      <div className="col-span-2 sm:col-span-4">
                                        <span className="text-muted-foreground">Catatan: </span>
                                        <span className="italic">{v.quote.vendorNotes}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              {!v.hasSubmitted && (
                                <Button
                                  size="sm"
                                  variant={resendResult === "ok" ? "default" : resendResult === "fail" ? "destructive" : "outline"}
                                  className={`h-7 gap-1.5 text-xs shrink-0 ${resendResult === "ok" ? "bg-green-600 hover:bg-green-700" : ""}`}
                                  disabled={isResending || !v.hasPhone}
                                  title={!v.hasPhone ? "Tidak ada nomor WA" : "Kirim ulang WA dengan link form"}
                                  onClick={() => handleResendVendorWa(v.vendorId)}
                                >
                                  {isResending
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : resendResult === "ok"
                                    ? <CheckCircle className="h-3 w-3" />
                                    : <MessageCircle className="h-3 w-3" />}
                                  {isResending ? "Mengirim..." : resendResult === "ok" ? "Terkirim!" : resendResult === "fail" ? "Coba Lagi" : "Kirim Ulang WA"}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Comparison Summary */}
            {quotes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ComparisonCard
                  icon={<TrendingDown className="h-4 w-4 text-green-600" />}
                  label="Termurah"
                  quote={cheapest}
                  badge="bg-green-100 text-green-800"
                />
                <ComparisonCard
                  icon={<Zap className="h-4 w-4 text-yellow-600" />}
                  label="Tercepat"
                  quote={fastest}
                  badge="bg-yellow-100 text-yellow-800"
                />
                <ComparisonCard
                  icon={<Star className="h-4 w-4 text-purple-600" />}
                  label="Rekomendasi"
                  quote={recommended}
                  badge="bg-purple-100 text-purple-800"
                />
              </div>
            )}

            {/* Quotes Table */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">
                  Penawaran Vendor ({quotes.length})
                </CardTitle>
                {latestRfq && order.status !== "Quotation Sent" && order.status !== "Confirmed" && order.status !== "Completed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => {
                      setQuoteForm({ vendorId: "", vendorPrice: "", estimatedPickup: "", estimatedDelivery: "", estimatedDays: "", vendorNotes: "", markupType: "percentage", markupPercentage: "0", fixedSellingPrice: "" });
                      setQuoteDialog({ open: true, rfqId: latestRfq.id });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Tambah Manual
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {quotes.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada penawaran. Kirim RFQ ke vendor atau tambah manual.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead className="text-right">Harga Vendor</TableHead>
                        <TableHead>Markup</TableHead>
                        <TableHead className="text-right">Harga Jual</TableHead>
                        <TableHead>ETA</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sumber</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map((q) => {
                        const isCheapest = cheapest?.id === q.id;
                        const isFastest = fastest?.id === q.id;
                        const isRecommended = recommended?.id === q.id;
                        const isApproved = q.quoteStatus === "approved";
                        return (
                          <TableRow key={q.id} className={isApproved ? "bg-green-50" : ""}>
                            <TableCell>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-sm">{q.vendorName}</span>
                                {isCheapest && <Badge className="text-[10px] bg-green-100 text-green-800 border-0 px-1 py-0">Murah</Badge>}
                                {isFastest && <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-0 px-1 py-0">Cepat</Badge>}
                                {isRecommended && <Badge className="text-[10px] bg-purple-100 text-purple-800 border-0 px-1 py-0">★ Rekomendasi</Badge>}
                              </div>
                              {q.vendorNotes && <p className="text-xs text-muted-foreground mt-0.5">{q.vendorNotes}</p>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {idr(q.vendorPrice)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {q.markupType === "fixed_price"
                                ? `Fix: ${idr(q.fixedSellingPrice)}`
                                : `${q.markupPercentage}%`}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              {idr(q.sellingPrice)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {q.estimatedPickup && <div>Pickup: {q.estimatedPickup}</div>}
                              {q.estimatedDelivery && <div>Kirim: {q.estimatedDelivery}</div>}
                              {q.estimatedDays != null && <div>{q.estimatedDays} hari</div>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${
                                isApproved ? "bg-green-100 text-green-800 border-green-200"
                                : q.quoteStatus === "rejected" ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-700"
                              }`}>
                                {isApproved ? "✓ Approved" : q.quoteStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {q.replySource === "whatsapp" ? "🟢 WA" : "Manual"}
                              {q.replyTimestamp && (
                                <div>{new Date(q.replyTimestamp).toLocaleDateString("id-ID")}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              {!isApproved && order.status !== "Quotation Sent" && order.status !== "Confirmed" && order.status !== "Completed" && (
                                <div className="flex gap-1.5 justify-end">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => openEditDialog(q)}>
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-7 px-2 text-xs gap-1"
                                    title="Approve & Kirim ke Customer"
                                    onClick={() => setApproveDialog(q)}
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Approve
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* ── Tab 3: Opsi Customer (Multi-Mode) ── */}
          <TabsContent value="options" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Opsi Anonim untuk Customer ({vendorOffers.length})</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setOfferDialog(true)}>
                      <Plus className="h-3.5 w-3.5" /> Tambah Opsi
                    </Button>
                    {vendorOffers.some((o) => o.status !== "CUSTOMER_CHOSEN") && vendorOffers.length > 0 && (
                      <Button
                        size="sm"
                        className="h-7 gap-1.5 text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => void handleSendOptions()}
                        disabled={sendingOptions}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {sendingOptions ? "Mengirim..." : "Kirim ke Customer via WA"}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {vendorOffers.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada opsi. Tambahkan minimal 1 opsi vendor, lalu kirim ke customer.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Label</TableHead>
                        <TableHead>Vendor (Internal)</TableHead>
                        <TableHead className="text-right">Harga Vendor</TableHead>
                        <TableHead className="text-right">Harga Customer</TableHead>
                        <TableHead>Info</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendorOffers.map((o) => (
                        <TableRow key={o.id} className={o.status === "CUSTOMER_CHOSEN" ? "bg-green-50" : ""}>
                          <TableCell className="font-medium text-sm">{o.optionLabel ?? `#${o.id}`}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{o.vendorName ?? o.carrierName ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{idr(o.offerPrice)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            {idr(o.finalCustomerPrice ?? o.offerPrice)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground space-y-0.5">
                            {o.vehicleYear && <div>Tahun: {o.vehicleYear}</div>}
                            {o.transitDays && <div>Transit: {o.transitDays} hari</div>}
                            {o.notes && <div className="max-w-[160px] truncate">{o.notes}</div>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${
                              o.status === "CUSTOMER_CHOSEN" ? "bg-green-100 text-green-800 border-green-200" :
                              o.status === "OPTIONS_SENT" ? "bg-blue-100 text-blue-800 border-blue-200" :
                              o.status === "CUSTOMER_REJECTED" ? "bg-red-100 text-red-800 border-red-200" :
                              "bg-gray-100 text-gray-700"
                            }`}>
                              {o.status === "CUSTOMER_CHOSEN" ? "✓ Dipilih" :
                               o.status === "OPTIONS_SENT" ? "Terkirim" :
                               o.status === "CUSTOMER_REJECTED" ? "Ditolak" : "Menunggu"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {o.status === "PENDING" && (
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                                onClick={() => void handleDeleteOffer(o.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {order.optionsToken && (
              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="p-4 text-sm space-y-1">
                  <p className="font-medium text-blue-800">Link opsi sudah dikirim ke customer:</p>
                  <a
                    href={`/choose-option/${order.optionsToken}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 underline text-xs break-all"
                  >
                    /choose-option/{order.optionsToken}
                  </a>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Tab 4: Chat AI ── */}
          {isAiOrder && (
            <TabsContent value="chat-ai" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-violet-600" />
                    Riwayat Percakapan AI
                    <span className="text-xs font-normal text-muted-foreground">— order dibuat via chatbot CST Logistics</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Messages */}
                  <div className="border rounded-xl bg-gray-50 p-3 space-y-3 max-h-[420px] overflow-y-auto">
                    {!chatData ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Memuat riwayat chat...</p>
                    ) : chatData.messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Tidak ada pesan</p>
                    ) : (
                      chatData.messages.reduce<{ lastDateStr: string | null; els: React.ReactNode[] }>(
                        (acc, msg) => {
                          const dateStr = msg.createdAt ? new Date(msg.createdAt).toDateString() : null;
                          if (dateStr && dateStr !== acc.lastDateStr) {
                            const label = formatDateLabel(msg.createdAt);
                            if (label) {
                              acc.els.push(
                                <div key={`sep-${msg.id}`} className="flex items-center gap-2 py-1">
                                  <div className="flex-1 h-px bg-gray-200" />
                                  <span className="text-[10px] text-gray-400 font-medium px-2 shrink-0">{label}</span>
                                  <div className="flex-1 h-px bg-gray-200" />
                                </div>
                              );
                            }
                            acc.lastDateStr = dateStr;
                          }
                          acc.els.push(
                            <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                                msg.role === "user" ? "bg-sky-100 text-sky-700" :
                                msg.role === "admin" ? "bg-amber-100 text-amber-700" :
                                "bg-violet-100 text-violet-700"
                              }`}>
                                {msg.role === "user" ? "C" : msg.role === "admin" ? "A" : "AI"}
                              </div>
                              <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                                msg.role === "user"
                                  ? "bg-sky-600 text-white rounded-tr-sm"
                                  : msg.role === "admin"
                                  ? "bg-amber-50 border border-amber-200 text-gray-800 rounded-tl-sm"
                                  : "bg-white border border-gray-200 text-gray-800 shadow-sm rounded-tl-sm"
                              }`}>
                                {msg.role === "admin" && (
                                  <p className="text-[10px] font-semibold text-amber-600 mb-1">Admin (via WA)</p>
                                )}
                                {msg.content}
                                <p className="text-[10px] mt-1 opacity-50">
                                  {formatMsgTime(msg.createdAt)}
                                </p>
                              </div>
                            </div>
                          );
                          return acc;
                        },
                        { lastDateStr: null, els: [] },
                      ).els
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Admin Reply */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Balas ke Pelanggan (via WhatsApp)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Tulis balasan untuk pelanggan..."
                        value={adminReply}
                        onChange={(e) => setAdminReply(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleAdminReply(); } }}
                        disabled={sendingReply}
                      />
                      <Button
                        onClick={() => void handleAdminReply()}
                        disabled={sendingReply || !adminReply.trim()}
                        className="gap-2 shrink-0"
                      >
                        <Send className="h-4 w-4" />
                        {sendingReply ? "Mengirim..." : "Kirim WA"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Balasan akan dikirim via WhatsApp ke nomor pelanggan ({order?.phone ?? "—"})
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* ── Dialog: Kirim RFQ ── */}
      <Dialog open={rfqDialog} onOpenChange={setRfqDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" /> Kirim RFQ ke Vendor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm space-y-1">
              <div className="font-medium">{order.orderNumber}</div>
              <div className="text-muted-foreground">{order.shipmentType} · {order.origin} → {order.destination}</div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Pilih Vendor ({selectedVendors.length} dipilih)</Label>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {activeVendors.length === 0 && (
                  <p className="text-sm text-muted-foreground">Tidak ada vendor aktif.</p>
                )}
                {activeVendors.map((v) => (
                  <label
                    key={v.id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedVendors.includes(v.id)}
                      onCheckedChange={(checked) => {
                        setSelectedVendors((prev) =>
                          checked ? [...prev, v.id] : prev.filter((x) => x !== v.id)
                        );
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{v.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.phone ?? "No phone"} · {v.serviceType ?? "Semua tipe"}
                      </div>
                    </div>
                    {!v.phone && (
                      <Badge variant="outline" className="text-xs text-orange-600">No WA</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm">Catatan Tambahan (opsional)</Label>
              <Input
                className="mt-1"
                placeholder="Catatan untuk vendor..."
                value={rfqNotes}
                onChange={(e) => setRfqNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRfqDialog(false)}>Batal</Button>
            <Button onClick={handleSendRfq} disabled={createRfq.isPending || selectedVendors.length === 0} className="gap-2">
              <Send className="h-4 w-4" />
              {createRfq.isPending ? "Mengirim..." : `Kirim ke ${selectedVendors.length} Vendor`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Tambah Quote Manual ── */}
      <Dialog open={!!quoteDialog?.open} onOpenChange={(open) => { if (!open) setQuoteDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Tambah Penawaran Manual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm">Vendor *</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={quoteForm.vendorId}
                onChange={(e) => setQuoteForm((f) => ({ ...f, vendorId: e.target.value }))}
              >
                <option value="">Pilih vendor...</option>
                {activeVendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Harga Vendor (IDR) *</Label>
                <Input className="mt-1" placeholder="5000000" value={quoteForm.vendorPrice}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, vendorPrice: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">Estimasi Hari</Label>
                <Input className="mt-1" type="number" placeholder="3" value={quoteForm.estimatedDays}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, estimatedDays: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">ETA Pickup</Label>
                <Input className="mt-1" placeholder="Besok pagi" value={quoteForm.estimatedPickup}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, estimatedPickup: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">ETA Delivery</Label>
                <Input className="mt-1" placeholder="2-3 hari" value={quoteForm.estimatedDelivery}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, estimatedDelivery: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-sm">Markup</Label>
              <div className="flex gap-2 mt-1">
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm w-36"
                  value={quoteForm.markupType}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, markupType: e.target.value }))}
                >
                  <option value="percentage">Persentase (%)</option>
                  <option value="fixed_price">Harga Tetap</option>
                </select>
                {quoteForm.markupType === "percentage" ? (
                  <Input placeholder="15" value={quoteForm.markupPercentage}
                    onChange={(e) => setQuoteForm((f) => ({ ...f, markupPercentage: e.target.value }))} />
                ) : (
                  <Input placeholder="Harga jual (IDR)" value={quoteForm.fixedSellingPrice}
                    onChange={(e) => setQuoteForm((f) => ({ ...f, fixedSellingPrice: e.target.value }))} />
                )}
              </div>
              {quoteForm.vendorPrice && quoteForm.markupType === "percentage" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Preview harga jual: {idr(previewSellingPrice(
                    parseFloat(quoteForm.vendorPrice) || 0,
                    "percentage",
                    parseFloat(quoteForm.markupPercentage) || 0,
                    null
                  ))}
                </p>
              )}
            </div>
            <div>
              <Label className="text-sm">Catatan Vendor</Label>
              <Input className="mt-1" placeholder="Catatan..." value={quoteForm.vendorNotes}
                onChange={(e) => setQuoteForm((f) => ({ ...f, vendorNotes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteDialog(null)}>Batal</Button>
            <Button onClick={handleCreateQuote} disabled={createQuote.isPending}>
              {createQuote.isPending ? "Menyimpan..." : "Simpan Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Edit Quote ── */}
      <Dialog open={!!editDialog} onOpenChange={(open) => { if (!open) setEditDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" /> Edit Quote — {editDialog?.vendorName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Harga Vendor (IDR) *</Label>
                <Input className="mt-1" placeholder="5000000" value={editForm.vendorPrice}
                  onChange={(e) => setEditForm((f) => ({ ...f, vendorPrice: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">Estimasi Hari</Label>
                <Input className="mt-1" type="number" placeholder="3" value={editForm.estimatedDays}
                  onChange={(e) => setEditForm((f) => ({ ...f, estimatedDays: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">ETA Pickup</Label>
                <Input className="mt-1" placeholder="Besok pagi" value={editForm.estimatedPickup}
                  onChange={(e) => setEditForm((f) => ({ ...f, estimatedPickup: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">ETA Delivery</Label>
                <Input className="mt-1" placeholder="2-3 hari" value={editForm.estimatedDelivery}
                  onChange={(e) => setEditForm((f) => ({ ...f, estimatedDelivery: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-sm">Markup</Label>
              <div className="flex gap-2 mt-1">
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm w-36"
                  value={editForm.markupType}
                  onChange={(e) => setEditForm((f) => ({ ...f, markupType: e.target.value }))}
                >
                  <option value="percentage">Persentase (%)</option>
                  <option value="fixed_price">Harga Tetap</option>
                </select>
                {editForm.markupType === "percentage" ? (
                  <Input placeholder="15" value={editForm.markupPercentage}
                    onChange={(e) => setEditForm((f) => ({ ...f, markupPercentage: e.target.value }))} />
                ) : (
                  <Input placeholder="Harga jual (IDR)" value={editForm.fixedSellingPrice}
                    onChange={(e) => setEditForm((f) => ({ ...f, fixedSellingPrice: e.target.value }))} />
                )}
              </div>
              {editForm.vendorPrice && editForm.markupType === "percentage" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Preview harga jual: {idr(previewSellingPrice(
                    parseFloat(editForm.vendorPrice) || 0,
                    "percentage",
                    parseFloat(editForm.markupPercentage) || 0,
                    null
                  ))}
                </p>
              )}
            </div>
            <div>
              <Label className="text-sm">Catatan Vendor</Label>
              <Input className="mt-1" placeholder="Catatan..." value={editForm.vendorNotes}
                onChange={(e) => setEditForm((f) => ({ ...f, vendorNotes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Batal</Button>
            <Button onClick={handleUpdateQuote} disabled={updateQuote.isPending}>
              {updateQuote.isPending ? "Menyimpan..." : "Update Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Approve & Send ── */}
      <Dialog open={!!approveDialog} onOpenChange={(open) => { if (!open) setApproveDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" /> Approve & Kirim ke Customer
            </DialogTitle>
          </DialogHeader>
          {approveDialog && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Konfirmasi pilihan penawaran ini. Harga jual akan dikirim ke customer via WhatsApp.
                <strong className="text-foreground"> Harga vendor tidak akan ditampilkan ke customer.</strong>
              </p>
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="font-medium">{approveDialog.vendorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Harga Vendor (internal)</span>
                  <span className="font-mono">{idr(approveDialog.vendorPrice)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="font-medium">Harga Jual ke Customer</span>
                  <span className="font-bold text-lg text-green-700">{idr(approveDialog.sellingPrice)}</span>
                </div>
                {approveDialog.estimatedDelivery && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimasi Pengiriman</span>
                    <span>{approveDialog.estimatedDelivery}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Setelah approve, status order otomatis berubah ke "Quotation Sent" dan customer menerima WA.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>Batal</Button>
            <Button
              className="gap-2 bg-green-600 hover:bg-green-700"
              onClick={handleApproveQuote}
              disabled={approveQuote.isPending}
            >
              <CheckCircle className="h-4 w-4" />
              {approveQuote.isPending ? "Menyimpan..." : "Approve & Kirim WA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Dialog Tambah Opsi Vendor (Multi-Mode) ── */}
      <Dialog open={offerDialog} onOpenChange={setOfferDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Opsi untuk Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vendor (opsional)</label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={offerForm.vendorId}
                onChange={(e) => setOfferForm({ ...offerForm, vendorId: e.target.value })}
              >
                <option value="">— Pilih vendor (opsional) —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Harga Vendor (Rp) *</label>
                <input
                  type="number" min="0" placeholder="0"
                  className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                  value={offerForm.offerPrice}
                  onChange={(e) => setOfferForm({ ...offerForm, offerPrice: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Harga Customer (Rp)</label>
                <input
                  type="number" min="0" placeholder="Sama dgn harga vendor"
                  className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                  value={offerForm.finalCustomerPrice}
                  onChange={(e) => setOfferForm({ ...offerForm, finalCustomerPrice: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tahun Unit</label>
                <input
                  type="number" min="2000" max="2030" placeholder="contoh: 2022"
                  className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                  value={offerForm.vehicleYear}
                  onChange={(e) => setOfferForm({ ...offerForm, vehicleYear: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Transit (hari)</label>
                <input
                  type="number" min="1" placeholder="contoh: 3"
                  className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                  value={offerForm.transitDays}
                  onChange={(e) => setOfferForm({ ...offerForm, transitDays: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Catatan</label>
              <input
                type="text" placeholder="Catatan untuk customer (opsional)"
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={offerForm.notes}
                onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-2">
              ⚠️ Nama vendor <strong>tidak</strong> akan ditampilkan ke customer — hanya label "Opsi 1", "Opsi 2", dst.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialog(false)}>Batal</Button>
            <Button onClick={() => void handleCreateOffer()}>Simpan Opsi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Lihat Link Form Vendor ── */}
      <Dialog open={linkFormDialog} onOpenChange={(open) => { if (!open) { setLinkFormDialog(false); setLinkFormData(null); setResendResults({}); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link className="h-5 w-5 text-blue-500" />
              Link Form Vendor
              {linkFormData && (
                <span className="text-sm font-normal text-muted-foreground ml-1">— {linkFormData.rfqNumber}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {linkFormLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Memuat data vendor...</span>
            </div>
          ) : linkFormData ? (
            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {linkFormData.vendors.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Tidak ada vendor di RFQ ini.</p>
              ) : (
                linkFormData.vendors.map((v) => {
                  const isResending = resendingVendorIds.has(v.vendorId);
                  const result = resendResults[v.vendorId];
                  return (
                    <div
                      key={v.vendorId}
                      className={`rounded-lg border px-4 py-3 space-y-2 ${v.hasSubmitted ? "bg-green-50 border-green-200" : "bg-background"}`}
                    >
                      {/* Vendor header row */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{v.vendorName}</span>
                            {v.hasSubmitted ? (
                              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                                <CheckCircle className="h-3 w-3" /> Sudah Submit
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                                Belum Submit
                              </Badge>
                            )}
                            {!v.hasPhone && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">No WA</Badge>
                            )}
                          </div>
                          {v.phone && (
                            <p className="text-xs text-muted-foreground mt-0.5">{v.phone}</p>
                          )}
                        </div>

                        {/* Resend WA button */}
                        <Button
                          size="sm"
                          variant={result === "ok" ? "default" : result === "fail" ? "destructive" : "outline"}
                          className={`h-7 gap-1.5 text-xs shrink-0 ${result === "ok" ? "bg-green-600 hover:bg-green-700" : ""}`}
                          disabled={isResending || !v.hasPhone}
                          onClick={() => handleResendVendorWa(v.vendorId)}
                          title={!v.hasPhone ? "Vendor tidak memiliki nomor WhatsApp" : "Kirim ulang WA dengan link form"}
                        >
                          {isResending
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : result === "ok"
                            ? <CheckCircle className="h-3 w-3" />
                            : <MessageCircle className="h-3 w-3" />}
                          {isResending ? "Mengirim..." : result === "ok" ? "Terkirim!" : result === "fail" ? "Coba Lagi" : "Kirim Ulang WA"}
                        </Button>
                      </div>

                      {/* Form URL row */}
                      {v.formUrl ? (
                        <div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-1.5">
                          <span className="text-xs font-mono text-muted-foreground truncate flex-1 min-w-0">
                            {v.formUrl}
                          </span>
                          <button
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            title="Salin link"
                            onClick={() => {
                              void navigator.clipboard.writeText(v.formUrl!);
                              toast({ title: "Link disalin", description: v.vendorName });
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href={v.formUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-blue-600 transition-colors"
                            title="Buka form"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Link tidak tersedia (token RFQ belum di-set).</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
          <DialogFooter className="pt-2 shrink-0">
            <Button variant="outline" onClick={() => { setLinkFormDialog(false); setLinkFormData(null); setResendResults({}); }}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function ComparisonCard({ icon, label, quote, badge }: {
  icon: React.ReactNode;
  label: string;
  quote: LogisticQuote | null | undefined;
  badge: string;
}) {
  const idr = (n: number | null | undefined) =>
    n == null ? "—"
    : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>{label}</span>
        </div>
        {quote ? (
          <div>
            <div className="font-medium text-sm">{quote.vendorName}</div>
            <div className="text-lg font-bold mt-0.5">{idr(quote.sellingPrice)}</div>
            {quote.estimatedDays != null && (
              <div className="text-xs text-muted-foreground mt-0.5">{quote.estimatedDays} hari</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Belum ada data</div>
        )}
      </CardContent>
    </Card>
  );
}
