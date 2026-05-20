import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, RefreshCw, Star, CheckCircle, XCircle, MessageCircle,
  Clock, Users, TrendingDown, ExternalLink, Copy, AlertCircle, Loader2,
} from "lucide-react";

const idr = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

function timeSince(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}

const STATUS_LABEL: Record<string, string> = {
  waiting_response: "Menunggu",
  accepted_basic_price: "Terima Harga",
  counter_offer: "Counter Offer",
  rejected: "Tolak",
  expired: "Kadaluarsa",
  selected: "Dipilih ✓",
  not_selected: "Tidak Dipilih",
  late_response: "Terlambat",
};

const STATUS_COLOR: Record<string, string> = {
  waiting_response: "bg-yellow-100 text-yellow-800",
  accepted_basic_price: "bg-green-100 text-green-800",
  counter_offer: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-500",
  selected: "bg-teal-100 text-teal-800 font-bold",
  not_selected: "bg-gray-100 text-gray-500",
  late_response: "bg-orange-100 text-orange-800",
};

interface VendorRow {
  linkId: number;
  vendorId: number;
  vendorName: string;
  phone: string | null;
  status: string;
  basicPrice: number | null;
  offeredPrice: number | null;
  eta: string | null;
  notes: string | null;
  attachmentUrl: string | null;
  isNewUpdate: boolean;
  openedAt: string | null;
  submittedAt: string | null;
  formUrl: string;
}

interface RankingBadge {
  label: string;
  color: string;
}

function getRankingBadges(vendor: VendorRow, allVendors: VendorRow[]): RankingBadge[] {
  const badges: RankingBadge[] = [];
  const answered = allVendors.filter(v => v.offeredPrice != null || v.basicPrice != null);
  if (answered.length < 2) return badges;

  const prices = answered.map(v => v.offeredPrice ?? v.basicPrice ?? Infinity);
  const minPrice = Math.min(...prices);
  const myPrice = vendor.offeredPrice ?? vendor.basicPrice;

  if (myPrice != null && myPrice === minPrice) {
    badges.push({ label: "💰 Best Price", color: "bg-green-100 text-green-700 border-green-200" });
  }

  const answeredWithEta = answered.filter(v => v.eta);
  if (answeredWithEta.length > 0 && vendor.eta) {
    const sortedEtas = [...answeredWithEta].sort((a, b) => (a.eta ?? "").localeCompare(b.eta ?? ""));
    if (sortedEtas[0]?.vendorId === vendor.vendorId) {
      badges.push({ label: "⚡ Tercepat", color: "bg-blue-100 text-blue-700 border-blue-200" });
    }
  }

  if (vendor.submittedAt) {
    const answeredWithTime = answered.filter(v => v.submittedAt);
    const sortedByTime = [...answeredWithTime].sort((a, b) =>
      new Date(a.submittedAt!).getTime() - new Date(b.submittedAt!).getTime()
    );
    if (sortedByTime[0]?.vendorId === vendor.vendorId) {
      badges.push({ label: "🏃 Respon Tercepat", color: "bg-purple-100 text-purple-700 border-purple-200" });
    }
  }

  return badges;
}

interface ComparisonData {
  rfqId: number;
  rfqNumber: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  serviceType: string;
  origin: string;
  destination: string;
  commodity: string | null;
  rfqStatus: string;
  stats: {
    total: number; answered: number; pending: number;
    rejected: number; counterOffer: number; expired: number; selected: number;
  };
  vendors: VendorRow[];
  activities: { id: number; actorType: string; actorName: string | null; action: string; description: string | null; createdAt: string }[];
}

export default function LogisticsRfqComparisonPage() {
  const { rfqId: rfqIdStr } = useParams<{ rfqId: string }>();
  const rfqId = parseInt(rfqIdStr ?? "", 10);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectDialog, setSelectDialog] = useState<{ linkId: number; vendorName: string; price: number | null } | null>(null);
  const [sellingPrice, setSellingPrice] = useState("");
  const [revisionDialog, setRevisionDialog] = useState<{ linkId: number; vendorName: string } | null>(null);
  const [revisionMsg, setRevisionMsg] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data, isLoading, refetch } = useQuery<ComparisonData>({
    queryKey: ["rfq-comparison", rfqId],
    queryFn: async () => {
      const res = await fetch(`/api/logistic/rfq/${rfqId}/comparison`);
      if (!res.ok) throw new Error("Gagal memuat data");
      return res.json();
    },
    enabled: !isNaN(rfqId),
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const selectMut = useMutation({
    mutationFn: async (payload: { linkId: number; sellingPrice?: number }) => {
      const res = await fetch(`/api/logistic/rfq/${rfqId}/select-vendor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.message); }
      return res.json();
    },
    onSuccess: (d) => {
      toast({ title: "Vendor Dipilih", description: `${d.selectedVendorName} berhasil dipilih` });
      setSelectDialog(null);
      qc.invalidateQueries({ queryKey: ["rfq-comparison", rfqId] });
    },
    onError: (e) => toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" }),
  });

  const actionMut = useMutation({
    mutationFn: async ({ linkId, action, message }: { linkId: number; action: string; message?: string }) => {
      const res = await fetch(`/api/logistic/rfq/${rfqId}/vendor-link/${linkId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, message }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.message); }
      return res.json();
    },
    onSuccess: (_, vars) => {
      if (vars.action === "mark_read") {
        qc.invalidateQueries({ queryKey: ["rfq-comparison", rfqId] });
        return;
      }
      const label = vars.action === "request_revision" ? "Permintaan revisi terkirim" : "Vendor ditolak";
      toast({ title: "Berhasil", description: label });
      setRevisionDialog(null);
      qc.invalidateQueries({ queryKey: ["rfq-comparison", rfqId] });
    },
    onError: (e) => toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" }),
  });

  const copyLink = useCallback((url: string) => {
    navigator.clipboard.writeText(url).then(() => toast({ title: "Link disalin" }));
  }, [toast]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="p-6 text-center text-gray-500">Data tidak ditemukan atau RFQ tidak valid.</div>
      </AppShell>
    );
  }

  const hasSelected = data.stats.selected > 0;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/logistics/portal-orders/${data.orderId}`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{data.rfqNumber}</h1>
              <p className="text-sm text-gray-500">
                {data.serviceType} · {data.origin} → {data.destination}
                {data.customerName ? ` · ${data.customerName}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setAutoRefresh(p => !p); }}
              className={autoRefresh ? "text-green-600 border-green-300" : ""}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${autoRefresh ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
              {autoRefresh ? "Auto" : "Manual"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard label="Total Vendor" value={data.stats.total} icon={<Users className="w-5 h-5 text-gray-500" />} />
          <StatCard label="Sudah Jawab" value={data.stats.answered} icon={<CheckCircle className="w-5 h-5 text-green-500" />} color="green" />
          <StatCard label="Menunggu" value={data.stats.pending} icon={<Clock className="w-5 h-5 text-yellow-500" />} color="yellow" />
          <StatCard label="Counter Offer" value={data.stats.counterOffer} icon={<TrendingDown className="w-5 h-5 text-blue-500" />} color="blue" />
          <StatCard label="Tolak" value={data.stats.rejected} icon={<XCircle className="w-5 h-5 text-red-500" />} color="red" />
          <StatCard label="Dipilih" value={data.stats.selected} icon={<Star className="w-5 h-5 text-teal-500" />} color="teal" />
        </div>

        {hasSelected && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-teal-800 text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              Vendor sudah dipilih. Kirim penawaran ke customer atau kelola eksekusi order.
            </div>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
              onClick={() => navigate(`/logistics/orders/${data.orderId}`)}
            >
              📤 Kelola Order &amp; Kirim Penawaran
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vendor comparison table */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="font-semibold text-gray-800">Perbandingan Vendor</h2>
            {data.vendors.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  Belum ada vendor yang di-blast. Kembali ke detail order dan pilih vendor.
                </CardContent>
              </Card>
            ) : (
              data.vendors.map((v, idx) => (
                <VendorCard
                  key={v.linkId}
                  vendor={v}
                  rank={idx + 1}
                  rankingBadges={getRankingBadges(v, data.vendors)}
                  hasSelected={hasSelected}
                  onSelect={() => {
                    setSelectDialog({ linkId: v.linkId, vendorName: v.vendorName, price: v.offeredPrice ?? v.basicPrice });
                    setSellingPrice(v.offeredPrice ? String(Math.round(v.offeredPrice * 1.2)) : "");
                  }}
                  onRevision={() => { setRevisionDialog({ linkId: v.linkId, vendorName: v.vendorName }); setRevisionMsg(""); }}
                  onReject={() => actionMut.mutate({ linkId: v.linkId, action: "reject" })}
                  onMarkRead={() => actionMut.mutate({ linkId: v.linkId, action: "mark_read" })}
                  onCopyLink={() => copyLink(window.location.origin + v.formUrl.replace(/^https?:\/\/[^/]+/, ""))}
                />
              ))
            )}
          </div>

          {/* Activity log */}
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-800">Aktivitas</h2>
            <Card>
              <CardContent className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {data.activities.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Belum ada aktivitas</p>
                ) : (
                  data.activities.map((a) => (
                    <div key={a.id} className="flex gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-gray-700">{a.description ?? a.action}</p>
                        <p className="text-xs text-gray-400">{timeSince(a.createdAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Select vendor dialog */}
      <Dialog open={!!selectDialog} onOpenChange={(o) => !o && setSelectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pilih Vendor</DialogTitle>
          </DialogHeader>
          {selectDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">
                Anda akan memilih <strong>{selectDialog.vendorName}</strong> sebagai vendor untuk RFQ ini.
                Harga vendor: <strong>{idr(selectDialog.price)}</strong>
              </p>
              <div>
                <Label>Harga Jual ke Customer (opsional)</Label>
                <Input
                  type="number"
                  placeholder="Kosongkan jika belum ditentukan"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectDialog(null)}>Batal</Button>
            <Button
              onClick={() => selectMut.mutate({
                linkId: selectDialog!.linkId,
                sellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
              })}
              disabled={selectMut.isPending}
            >
              {selectMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Star className="w-4 h-4 mr-1" />}
              Pilih Vendor Ini
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revision dialog */}
      <Dialog open={!!revisionDialog} onOpenChange={(o) => !o && setRevisionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Minta Revisi</DialogTitle>
          </DialogHeader>
          {revisionDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">Kirim pesan revisi ke <strong>{revisionDialog.vendorName}</strong> via WhatsApp.</p>
              <div>
                <Label>Catatan untuk Vendor</Label>
                <Textarea
                  placeholder="Contoh: Mohon review ulang harga, ada perubahan rute..."
                  value={revisionMsg}
                  onChange={(e) => setRevisionMsg(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionDialog(null)}>Batal</Button>
            <Button
              onClick={() => actionMut.mutate({ linkId: revisionDialog!.linkId, action: "request_revision", message: revisionMsg })}
              disabled={actionMut.isPending}
            >
              <MessageCircle className="w-4 h-4 mr-1" /> Kirim via WA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode;
  color?: "green" | "yellow" | "blue" | "red" | "teal";
}) {
  const bg = color ? {
    green: "bg-green-50", yellow: "bg-yellow-50", blue: "bg-blue-50",
    red: "bg-red-50", teal: "bg-teal-50",
  }[color] : "bg-gray-50";
  return (
    <Card className={`${bg} border-0`}>
      <CardContent className="p-3 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          {icon}
          <span className="text-2xl font-bold text-gray-800">{value}</span>
        </div>
        <p className="text-xs text-gray-500">{label}</p>
      </CardContent>
    </Card>
  );
}

function VendorCard({
  vendor, rank, rankingBadges, hasSelected, onSelect, onRevision, onReject, onMarkRead, onCopyLink,
}: {
  vendor: VendorRow; rank: number; rankingBadges?: RankingBadge[]; hasSelected: boolean;
  onSelect: () => void; onRevision: () => void;
  onReject: () => void; onMarkRead: () => void; onCopyLink: () => void;
}) {
  const isSelected = vendor.status === "selected";
  const canAct = !hasSelected && !["rejected", "expired", "not_selected"].includes(vendor.status);
  const hasAnswer = !!vendor.submittedAt;
  const price = vendor.offeredPrice ?? vendor.basicPrice;

  return (
    <Card className={`transition-all ${isSelected ? "ring-2 ring-teal-400 bg-teal-50/50" : ""} ${vendor.isNewUpdate ? "ring-2 ring-blue-300" : ""}`}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">{rank}</span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-800">{vendor.vendorName}</span>
                {vendor.isNewUpdate && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs animate-pulse">NEW</Badge>
                )}
                {isSelected && <Badge className="bg-teal-100 text-teal-700 text-xs">★ Dipilih</Badge>}
                {rankingBadges?.map((b, i) => (
                  <span key={i} className={`text-xs px-1.5 py-0.5 rounded border font-medium ${b.color}`}>{b.label}</span>
                ))}
              </div>
              {vendor.phone && <p className="text-xs text-gray-400">{vendor.phone}</p>}
            </div>
          </div>
          <Badge className={STATUS_COLOR[vendor.status] ?? "bg-gray-100 text-gray-500"}>
            {STATUS_LABEL[vendor.status] ?? vendor.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
          <InfoItem label="Harga Penawaran" value={idr(price)} highlight={!!hasAnswer} />
          <InfoItem label="ETA" value={vendor.eta ?? "—"} />
          <InfoItem label="Dibuka" value={vendor.openedAt ? timeSince(vendor.openedAt) : "Belum dibuka"} />
          <InfoItem label="Submit" value={vendor.submittedAt ? timeSince(vendor.submittedAt) : "Belum"} />
        </div>

        {vendor.notes && (
          <div className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-2 mb-3 text-gray-600">
            📝 {vendor.notes}
          </div>
        )}
        {vendor.attachmentUrl && (
          <a href={vendor.attachmentUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 underline flex items-center gap-1 mb-3">
            <ExternalLink className="w-3 h-3" /> Lihat Lampiran
          </a>
        )}

        <div className="flex flex-wrap gap-2 mt-2">
          {vendor.isNewUpdate && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onMarkRead}>
              Tandai Sudah Baca
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onCopyLink}>
            <Copy className="w-3 h-3 mr-1" /> Salin Link
          </Button>
          {canAct && hasAnswer && (
            <>
              <Button size="sm" className="text-xs h-7 bg-teal-600 hover:bg-teal-700 text-white" onClick={onSelect}>
                <Star className="w-3 h-3 mr-1" /> Pilih
              </Button>
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={onRevision}>
                <MessageCircle className="w-3 h-3 mr-1" /> Revisi
              </Button>
            </>
          )}
          {canAct && !hasAnswer && (
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={onRevision}>
              <MessageCircle className="w-3 h-3 mr-1" /> Ping
            </Button>
          )}
          {canAct && ["accepted_basic_price", "counter_offer"].includes(vendor.status) && (
            <Button variant="ghost" size="sm" className="text-xs h-7 text-red-600 hover:text-red-700" onClick={onReject}>
              <XCircle className="w-3 h-3 mr-1" /> Tolak
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`font-medium ${highlight ? "text-blue-700" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}
