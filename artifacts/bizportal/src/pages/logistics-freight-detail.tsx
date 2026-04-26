import { AppShell } from "@/components/layout/AppShell";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ArrowLeft, Pencil, Printer, Plus, CheckCircle, Loader2, Ship, FileText, FileDown, Paperclip,
  TrendingDown, TrendingUp, Receipt, ExternalLink,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FreightAttachmentsPanel } from "@/components/freight/FreightAttachmentsPanel";
import { useToast } from "@/hooks/use-toast";
import {
  useGetFreightShipment,
  useGetSalesDocument,
  useCreateFreightRfq,
  useCreateFreightQuote,
  useApproveFreightQuote,
  useUpdateFreightShipment,
  useUpsertShipmentStage,
  useListExpenses,
  getGetFreightShipmentQueryKey,
  type FreightRfqWithQuotes,
  type FreightQuote,
  type ShipmentStage,
} from "@workspace/api-client-react";
import { Link } from "wouter";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  rfq_sent: "RFQ Dikirim",
  confirmed: "Dikonfirmasi",
  in_transit: "Dalam Perjalanan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  rfq_sent: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  confirmed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  in_transit: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  approved: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

function fmt(n: string | null | undefined) {
  if (!n) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n));
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-40 shrink-0 text-sm">{label}</span>
      <span className="text-sm font-medium">{value ?? "—"}</span>
    </div>
  );
}

export default function LogisticsFreightDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: shipment, isLoading } = useGetFreightShipment(id);
  const salesDocId = (shipment as any)?.salesDocId as number | null | undefined;
  const { data: linkedSalesDoc } = useGetSalesDocument(salesDocId ?? 0, { query: { enabled: !!salesDocId } });
  const { data: expenses = [], isLoading: expensesLoading } = useListExpenses({ shipmentId: id });
  const idr = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  const createRfq = useCreateFreightRfq();
  const createQuote = useCreateFreightQuote();
  const approveQuote = useApproveFreightQuote();
  const updateShipment = useUpdateFreightShipment();

  const [showRfqDialog, setShowRfqDialog] = useState(false);
  const [rfqVendors, setRfqVendors] = useState("");
  const [rfqNotes, setRfqNotes] = useState("");

  const [showInTransitDialog, setShowInTransitDialog] = useState(false);
  const [inTransitForm, setInTransitForm] = useState({ departureDate: "", trackingNumber: "", awbNumber: "" });

  const [showCompletedDialog, setShowCompletedDialog] = useState(false);
  const [completedForm, setCompletedForm] = useState({ arrivalDate: "", actualCost: "" });

  const [showEditAktualDialog, setShowEditAktualDialog] = useState(false);
  const [editAktualForm, setEditAktualForm] = useState({
    departureDate: "",
    arrivalDate: "",
    trackingNumber: "",
    awbNumber: "",
    actualCost: "",
  });

  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [quoteRfqId, setQuoteRfqId] = useState<number | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    vendorName: "",
    truckingCost: "",
    handlingCost: "",
    freightCost: "",
    otherCost: "",
    estimatedDays: "",
    notes: "",
  });

  const upsertStage = useUpsertShipmentStage();
  type StageType = "booking" | "trucking" | "handling" | "customs";
  const STAGE_DEFS: { type: StageType; label: string }[] = [
    { type: "booking", label: "Booking" },
    { type: "trucking", label: "Trucking" },
    { type: "handling", label: "Handling" },
    { type: "customs", label: "Customs Clearance" },
  ];
  const [stageForms, setStageForms] = useState<Record<StageType, { vendorName: string; date: string; status: string; notes: string }>>({
    booking:  { vendorName: "", date: "", status: "pending", notes: "" },
    trucking: { vendorName: "", date: "", status: "pending", notes: "" },
    handling: { vendorName: "", date: "", status: "pending", notes: "" },
    customs:  { vendorName: "", date: "", status: "pending", notes: "" },
  });
  const [stagesInitialized, setStagesInitialized] = useState(false);

  useEffect(() => {
    if (shipment && (shipment as any).stages && !stagesInitialized) {
      const stages: ShipmentStage[] = (shipment as any).stages ?? [];
      setStageForms((prev) => {
        const next = { ...prev };
        for (const s of stages) {
          const t = s.stageType as StageType;
          if (t in next) {
            next[t] = {
              vendorName: s.vendorName ?? "",
              date: s.date ? String(s.date).slice(0, 10) : "",
              status: s.status ?? "pending",
              notes: s.notes ?? "",
            };
          }
        }
        return next;
      });
      setStagesInitialized(true);
    }
  }, [shipment, stagesInitialized]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetFreightShipmentQueryKey(id) });

  const handleSaveStage = (stageType: StageType) => {
    const f = stageForms[stageType];
    upsertStage.mutate(
      { shipmentId: id, data: { stageType, vendorName: f.vendorName || null, date: f.date || null, status: f.status as any, notes: f.notes || null } },
      {
        onSuccess: () => { invalidate(); toast({ title: `Tahap ${stageType} disimpan` }); },
        onError: () => toast({ title: "Gagal menyimpan tahap", variant: "destructive" }),
      }
    );
  };

  const handleCreateRfq = () => {
    createRfq.mutate(
      { shipmentId: id, data: { vendorNames: rfqVendors.split(",").map((v) => v.trim()).filter(Boolean), notes: rfqNotes || undefined } },
      {
        onSuccess: () => {
          invalidate();
          setShowRfqDialog(false);
          setRfqVendors("");
          setRfqNotes("");
          toast({ title: "RFQ berhasil dibuat" });
        },
        onError: () => toast({ title: "Gagal membuat RFQ", variant: "destructive" }),
      }
    );
  };

  const openQuoteDialog = (rfqId: number) => {
    setQuoteRfqId(rfqId);
    setQuoteForm({ vendorName: "", truckingCost: "", handlingCost: "", freightCost: "", otherCost: "", estimatedDays: "", notes: "" });
    setShowQuoteDialog(true);
  };

  const handleCreateQuote = () => {
    if (!quoteRfqId || !quoteForm.vendorName) {
      toast({ title: "Nama vendor wajib diisi", variant: "destructive" });
      return;
    }
    createQuote.mutate(
      {
        rfqId: quoteRfqId,
        data: {
          vendorName: quoteForm.vendorName,
          truckingCost: quoteForm.truckingCost ? Number(quoteForm.truckingCost) : undefined,
          handlingCost: quoteForm.handlingCost ? Number(quoteForm.handlingCost) : undefined,
          freightCost: quoteForm.freightCost ? Number(quoteForm.freightCost) : undefined,
          otherCost: quoteForm.otherCost ? Number(quoteForm.otherCost) : undefined,
          estimatedDays: quoteForm.estimatedDays ? Number(quoteForm.estimatedDays) : undefined,
          notes: quoteForm.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setShowQuoteDialog(false);
          toast({ title: "Quote berhasil ditambahkan" });
        },
        onError: () => toast({ title: "Gagal menambah quote", variant: "destructive" }),
      }
    );
  };

  const handleApprove = (quoteId: number) => {
    if (!confirm("Setujui quote ini? Quote lain akan otomatis ditolak dan status shipment menjadi Dikonfirmasi.")) return;
    approveQuote.mutate(
      { id: quoteId },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Quote disetujui" });
        },
        onError: () => toast({ title: "Gagal menyetujui", variant: "destructive" }),
      }
    );
  };

  const handleMarkInTransit = () => {
    if (!inTransitForm.departureDate) {
      toast({ title: "Tanggal keberangkatan wajib diisi", variant: "destructive" });
      return;
    }
    updateShipment.mutate(
      {
        id,
        data: {
          shipperName: shipment!.shipperName,
          consigneeName: shipment!.consigneeName,
          commodity: shipment!.commodity,
          origin: shipment!.origin,
          destination: shipment!.destination,
          status: "in_transit",
          departureDate: inTransitForm.departureDate,
          trackingNumber: inTransitForm.trackingNumber || undefined,
          awbNumber: inTransitForm.awbNumber || undefined,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setShowInTransitDialog(false);
          setInTransitForm({ departureDate: "", trackingNumber: "", awbNumber: "" });
          toast({ title: "Status diperbarui: Dalam Perjalanan" });
        },
        onError: () => toast({ title: "Gagal mengubah status", variant: "destructive" }),
      }
    );
  };

  const handleMarkCompleted = () => {
    if (!completedForm.arrivalDate) {
      toast({ title: "Tanggal tiba wajib diisi", variant: "destructive" });
      return;
    }
    updateShipment.mutate(
      {
        id,
        data: {
          shipperName: shipment!.shipperName,
          consigneeName: shipment!.consigneeName,
          commodity: shipment!.commodity,
          origin: shipment!.origin,
          destination: shipment!.destination,
          status: "completed",
          arrivalDate: completedForm.arrivalDate,
          actualCost: completedForm.actualCost ? Number(completedForm.actualCost) : undefined,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setShowCompletedDialog(false);
          setCompletedForm({ arrivalDate: "", actualCost: "" });
          toast({ title: "Status diperbarui: Selesai" });
        },
        onError: () => toast({ title: "Gagal mengubah status", variant: "destructive" }),
      }
    );
  };

  const openEditAktual = () => {
    setEditAktualForm({
      departureDate: shipment!.departureDate ? shipment!.departureDate.substring(0, 10) : "",
      arrivalDate: shipment!.arrivalDate ? shipment!.arrivalDate.substring(0, 10) : "",
      trackingNumber: shipment!.trackingNumber ?? "",
      awbNumber: shipment!.awbNumber ?? "",
      actualCost: shipment!.actualCost ? String(shipment!.actualCost) : "",
    });
    setShowEditAktualDialog(true);
  };

  const handleSaveAktual = () => {
    updateShipment.mutate(
      {
        id,
        data: {
          shipperName: shipment!.shipperName,
          consigneeName: shipment!.consigneeName,
          commodity: shipment!.commodity,
          origin: shipment!.origin,
          destination: shipment!.destination,
          departureDate: editAktualForm.departureDate || null,
          arrivalDate: editAktualForm.arrivalDate || null,
          trackingNumber: editAktualForm.trackingNumber || null,
          awbNumber: editAktualForm.awbNumber || null,
          actualCost: editAktualForm.actualCost ? Number(editAktualForm.actualCost) : null,
        },
      },
      {
        onSuccess: () => {
          invalidate();
          setShowEditAktualDialog(false);
          toast({ title: "Info aktual berhasil disimpan" });
        },
        onError: () => toast({ title: "Gagal menyimpan info aktual", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!shipment) {
    return (
      <AppShell>
        <div className="p-6 text-center text-muted-foreground">Shipment tidak ditemukan.</div>
      </AppShell>
    );
  }

  const rfqs: FreightRfqWithQuotes[] = shipment.rfqs ?? [];
  const printDate = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  const allApprovedQuotes = rfqs.flatMap((r) => r.quotes ?? []).filter((q) => q.status === "approved");
  const approvedQuote = allApprovedQuotes.length > 0
    ? allApprovedQuotes.reduce((latest, q) => q.id > latest.id ? q : latest)
    : undefined;
  const quotedCost = approvedQuote?.totalCost ? Number(approvedQuote.totalCost) : null;
  const actualCost = shipment.actualCost ? Number(shipment.actualCost) : null;
  const hasCostComparison = quotedCost !== null && actualCost !== null;
  const variance = hasCostComparison ? actualCost - quotedCost : null;
  const variancePct = hasCostComparison && quotedCost !== 0 ? ((actualCost - quotedCost) / quotedCost) * 100 : null;
  const isOverBudget = variance !== null && variance > 0;

  return (
    <AppShell>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/logistics/freight")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Ship className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold font-mono">{shipment.shipmentNumber}</h1>
                <Badge variant="outline" className={STATUS_COLORS[shipment.status] ?? ""}>
                  {STATUS_LABELS[shipment.status] ?? shipment.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Dibuat {new Date(shipment.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Cetak Packing List
            </Button>
            {["confirmed", "in_transit", "completed"].includes(shipment.status) && (
              <Button variant="outline" onClick={() => navigate(`/logistics/freight/${id}/bl`)}>
                <FileDown className="h-4 w-4 mr-2" />
                Cetak Bill of Lading
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate(`/logistics/freight/edit/${id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {shipment.status === "confirmed" && (
              <Button onClick={() => setShowInTransitDialog(true)} disabled={updateShipment.isPending}>
                Tandai Dalam Perjalanan
              </Button>
            )}
            {shipment.status === "in_transit" && (
              <Button onClick={() => setShowCompletedDialog(true)} disabled={updateShipment.isPending}>
                Tandai Selesai
              </Button>
            )}
          </div>
        </div>

        {/* Packing List — print only */}
        <div className="hidden print:block">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold uppercase tracking-widest">Packing List</h2>
            <p className="text-lg font-semibold mt-1">{shipment.shipmentNumber}</p>
            <p className="text-sm mt-1">Tanggal: {printDate}</p>
          </div>
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div>
              <p className="font-bold text-sm uppercase mb-1">Shipper</p>
              <p className="font-semibold">{shipment.shipperName}</p>
              {shipment.shipperAddress && <p className="text-sm">{shipment.shipperAddress}</p>}
            </div>
            <div>
              <p className="font-bold text-sm uppercase mb-1">Consignee</p>
              <p className="font-semibold">{shipment.consigneeName}</p>
              {shipment.consigneeAddress && <p className="text-sm">{shipment.consigneeAddress}</p>}
            </div>
          </div>
          <table className="w-full border border-gray-300 text-sm mb-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">Komoditi</th>
                <th className="border border-gray-300 p-2 text-left">HS Code</th>
                <th className="border border-gray-300 p-2 text-right">Qty</th>
                <th className="border border-gray-300 p-2 text-left">Jenis Packing</th>
                <th className="border border-gray-300 p-2 text-right">Berat Bruto</th>
                <th className="border border-gray-300 p-2 text-right">Berat Neto</th>
                <th className="border border-gray-300 p-2 text-left">Dimensi</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2">{shipment.commodity}</td>
                <td className="border border-gray-300 p-2">{shipment.hsCode ?? "—"}</td>
                <td className="border border-gray-300 p-2 text-right">{shipment.quantity ?? "—"}</td>
                <td className="border border-gray-300 p-2">{shipment.packingType ?? "—"}</td>
                <td className="border border-gray-300 p-2 text-right">{shipment.grossWeight ? `${shipment.grossWeight} kg` : "—"}</td>
                <td className="border border-gray-300 p-2 text-right">{shipment.netWeight ? `${shipment.netWeight} kg` : "—"}</td>
                <td className="border border-gray-300 p-2">{shipment.dimensions ?? "—"}</td>
              </tr>
            </tbody>
          </table>
          <div className="flex gap-8 text-sm mb-4">
            <div><span className="font-bold">Asal: </span>{shipment.origin}</div>
            <div><span className="font-bold">Tujuan: </span>{shipment.destination}</div>
          </div>
          {shipment.notes && (
            <p className="text-sm mb-6"><span className="font-bold">Catatan: </span>{shipment.notes}</p>
          )}
          <div className="grid grid-cols-2 gap-8 mt-12">
            <div className="text-center">
              <p className="text-sm mb-16">Dibuat oleh,</p>
              <div className="border-t border-gray-400 pt-2 text-sm">Shipper / Pengirim</div>
            </div>
            <div className="text-center">
              <p className="text-sm mb-16">Mengetahui,</p>
              <div className="border-t border-gray-400 pt-2 text-sm">Freight Forwarder</div>
            </div>
          </div>
        </div>

        {/* Shipment Details Card — screen only */}
        <Card className="print:hidden">
          <CardHeader><CardTitle>Detail Shipment</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Shipper</p>
                <InfoRow label="Nama" value={shipment.shipperName} />
                <InfoRow label="Alamat" value={shipment.shipperAddress} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Consignee</p>
                <InfoRow label="Nama" value={shipment.consigneeName} />
                <InfoRow label="Alamat" value={shipment.consigneeAddress} />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Kargo</p>
                <InfoRow label="Komoditi" value={shipment.commodity} />
                <InfoRow label="HS Code" value={shipment.hsCode} />
                <InfoRow label="Berat Bruto" value={shipment.grossWeight ? `${shipment.grossWeight} kg` : null} />
                <InfoRow label="Berat Neto" value={shipment.netWeight ? `${shipment.netWeight} kg` : null} />
                <InfoRow label="Jumlah" value={shipment.quantity} />
                <InfoRow label="Jenis Packing" value={shipment.packingType} />
                <InfoRow label="Dimensi" value={shipment.dimensions} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Rute</p>
                <InfoRow label="Asal" value={shipment.origin} />
                <InfoRow label="Tujuan" value={shipment.destination} />
                {(shipment.departureDate || shipment.arrivalDate || shipment.trackingNumber || shipment.awbNumber || shipment.actualCost) && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pengiriman Aktual</p>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 print:hidden"
                        onClick={openEditAktual}
                        aria-label="Edit info aktual"
                        data-testid="button-edit-aktual"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {shipment.departureDate && (
                      <InfoRow label="Tgl Berangkat" value={new Date(shipment.departureDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} />
                    )}
                    {shipment.arrivalDate && (
                      <InfoRow label="Tgl Tiba" value={new Date(shipment.arrivalDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} />
                    )}
                    {shipment.trackingNumber && <InfoRow label="No. Tracking" value={shipment.trackingNumber} />}
                    {shipment.awbNumber && <InfoRow label="No. AWB / BL" value={shipment.awbNumber} />}
                    {shipment.actualCost && <InfoRow label="Biaya Aktual" value={fmt(shipment.actualCost)} />}
                  </>
                )}
                {shipment.notes && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Catatan</p>
                    <p className="text-sm">{shipment.notes}</p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cost Comparison Card — shown when approved quote + actual cost both exist */}
        {hasCostComparison && (
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {isOverBudget
                  ? <TrendingUp className="h-4 w-4 text-destructive" />
                  : <TrendingDown className="h-4 w-4 text-emerald-500" />}
                Perbandingan Biaya
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Biaya Penawaran</p>
                  <p className="text-lg font-semibold">{fmt(String(quotedCost))}</p>
                  <p className="text-xs text-muted-foreground">dari quote disetujui</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Biaya Aktual</p>
                  <p className="text-lg font-semibold">{fmt(String(actualCost))}</p>
                  <p className="text-xs text-muted-foreground">realisasi pengiriman</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Selisih</p>
                  <p className={`text-lg font-semibold ${isOverBudget ? "text-destructive" : "text-emerald-500"}`}>
                    {variance! > 0 ? "+" : ""}{fmt(String(variance))}
                  </p>
                  {variancePct !== null && (
                    <p className={`text-xs font-medium ${isOverBudget ? "text-destructive" : "text-emerald-500"}`}>
                      {variance! > 0 ? "+" : ""}{variancePct.toFixed(1)}%
                      {isOverBudget ? " melebihi anggaran" : " di bawah anggaran"}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bill of Lading Section — screen only */}
        {(shipment.vessel || shipment.voyage || shipment.portOfLoading || shipment.portOfDischarge || shipment.notifyParty || shipment.marksAndNumbers || shipment.measurement) && (
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ship className="h-4 w-4 text-primary" />
                Detail Bill of Lading
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <InfoRow label="Kapal (Vessel)" value={shipment.vessel} />
                  <InfoRow label="Voyage" value={shipment.voyage} />
                  <InfoRow label="Port of Loading" value={shipment.portOfLoading} />
                  <InfoRow label="Port of Discharge" value={shipment.portOfDischarge} />
                </div>
                <div className="space-y-2">
                  <InfoRow label="Notify Party" value={shipment.notifyParty} />
                  <InfoRow label="Marks & Numbers" value={shipment.marksAndNumbers} />
                  <InfoRow label="Measurement" value={shipment.measurement} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Operational Stages Section */}
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Tahapan Operasional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {STAGE_DEFS.map(({ type, label }) => {
                const f = stageForms[type];
                const existingStage = ((shipment as any).stages ?? []).find((s: ShipmentStage) => s.stageType === type);
                const statusColor: Record<string, string> = {
                  pending: "bg-muted text-muted-foreground",
                  in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/20",
                  done: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
                };
                return (
                  <div key={type} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm">{label}</p>
                      <Badge variant="outline" className={`text-xs ${statusColor[f.status] ?? ""}`}>
                        {{ pending: "Menunggu", in_progress: "Proses", done: "Selesai", cancelled: "Batal" }[f.status] ?? f.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs">Vendor</Label>
                        <Input
                          className="h-7 text-xs"
                          value={f.vendorName}
                          onChange={(e) => setStageForms((prev) => ({ ...prev, [type]: { ...prev[type], vendorName: e.target.value } }))}
                          placeholder="Nama vendor..."
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tanggal</Label>
                        <Input
                          className="h-7 text-xs"
                          type="date"
                          value={f.date}
                          onChange={(e) => setStageForms((prev) => ({ ...prev, [type]: { ...prev[type], date: e.target.value } }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Status</Label>
                        <Select value={f.status} onValueChange={(v) => setStageForms((prev) => ({ ...prev, [type]: { ...prev[type], status: v } }))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Menunggu</SelectItem>
                            <SelectItem value="in_progress">Proses</SelectItem>
                            <SelectItem value="done">Selesai</SelectItem>
                            <SelectItem value="cancelled">Batal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs">Catatan</Label>
                        <Input
                          className="h-7 text-xs"
                          value={f.notes}
                          onChange={(e) => setStageForms((prev) => ({ ...prev, [type]: { ...prev[type], notes: e.target.value } }))}
                          placeholder="Catatan..."
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={existingStage ? "outline" : "default"}
                      className="w-full h-7 text-xs"
                      onClick={() => handleSaveStage(type)}
                      disabled={upsertStage.isPending}
                    >
                      {upsertStage.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      {existingStage ? "Perbarui" : "Simpan"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Sales Order & Invoice Section */}
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Sales Order &amp; Invoice
            </CardTitle>
          </CardHeader>
          <CardContent>
            {salesDocId && linkedSalesDoc ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-4 p-3 border rounded-lg bg-muted/10">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">No. Sales Order</p>
                    <p className="font-mono font-semibold text-sm">{linkedSalesDoc.docNumber}</p>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Pelanggan</p>
                    <p className="text-sm font-medium truncate">{linkedSalesDoc.customerName}</p>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Grand Total</p>
                    <p className="text-sm font-semibold">{idr(Number(linkedSalesDoc.grandTotal))}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Status Invoice</p>
                    <Badge
                      variant="outline"
                      className={
                        linkedSalesDoc.invoiceStatus === "invoiced"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : linkedSalesDoc.invoiceStatus === "to_invoice"
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {linkedSalesDoc.invoiceStatus === "invoiced"
                        ? "Sudah Diinvoice"
                        : linkedSalesDoc.invoiceStatus === "to_invoice"
                        ? "Perlu Diinvoice"
                        : "Belum Ada Invoice"}
                    </Badge>
                  </div>
                  <Link href={`/sales/${salesDocId}`}>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Lihat Sales Order
                    </Button>
                  </Link>
                </div>
                {linkedSalesDoc.invoiceStatus === "to_invoice" && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Receipt className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-600">Sales Order ini sudah dikonfirmasi dan siap diinvoice. Buka Sales Order untuk menyelesaikan invoicing.</p>
                    <Link href={`/sales/${salesDocId}`} className="ml-auto">
                      <Button size="sm" variant="outline" className="h-7 text-xs border-amber-500/40 text-amber-600 hover:bg-amber-500/10">
                        Invoice Sekarang
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            ) : salesDocId ? (
              <div className="flex items-center gap-3 text-muted-foreground text-sm py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat data Sales Order...
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Shipment ini belum terhubung ke Sales Order. Buat Sales Order untuk membuat invoice kepada pelanggan.</p>
                <Link href="/sales/new">
                  <Button variant="outline" size="sm">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Buat Sales Order Baru
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RFQ Section — screen only */}
        <div className="print:hidden space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Request for Quotation
            </h2>
            {["draft", "rfq_sent"].includes(shipment.status) && (
              <Button onClick={() => setShowRfqDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Buat RFQ
              </Button>
            )}
          </div>

          {rfqs.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Belum ada RFQ. Buat RFQ untuk mulai mengumpulkan penawaran vendor.
              </CardContent>
            </Card>
          ) : (
            rfqs.map((rfq: FreightRfqWithQuotes) => (
              <Card key={rfq.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-mono">{rfq.rfqNumber}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Vendor: {rfq.vendorNames?.join(", ") || "—"} · {new Date(rfq.createdAt).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{rfq.status === "open" ? "Terbuka" : "Tertutup"}</Badge>
                      {rfq.status === "open" && (
                        <Button size="sm" onClick={() => openQuoteDialog(rfq.id)}>
                          <Plus className="h-3 w-3 mr-1" />
                          Tambah Quote
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {rfq.quotes?.length > 0 && (
                  <CardContent>
                    <div className="space-y-3">
                      {rfq.quotes.map((q: FreightQuote) => (
                        <div
                          key={q.id}
                          className={`border rounded-lg p-4 space-y-2 ${q.status === "approved" ? "border-emerald-500/30 bg-emerald-500/5" : q.status === "rejected" ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{q.vendorName}</p>
                              <Badge variant="outline" className={QUOTE_STATUS_COLORS[q.status] ?? ""}>
                                {q.status === "pending" ? "Menunggu" : q.status === "approved" ? "Disetujui" : "Ditolak"}
                              </Badge>
                            </div>
                            {q.status === "pending" && ["rfq_sent", "draft"].includes(shipment.status) && (
                              <Button size="sm" onClick={() => handleApprove(q.id)} disabled={approveQuote.isPending}>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Setujui
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">Trucking</p>
                              <p className="font-medium">{fmt(q.truckingCost)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Handling</p>
                              <p className="font-medium">{fmt(q.handlingCost)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Freight</p>
                              <p className="font-medium">{fmt(q.freightCost)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Lainnya</p>
                              <p className="font-medium">{fmt(q.otherCost)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Total</p>
                              <p className="font-semibold text-primary">{fmt(q.totalCost)}</p>
                            </div>
                          </div>
                          {q.estimatedDays != null && (
                            <p className="text-xs text-muted-foreground">Estimasi: {q.estimatedDays} hari</p>
                          )}
                          {q.notes && <p className="text-xs text-muted-foreground">{q.notes}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>

        {/* Biaya / Expenses Section */}
        <Card className="print:hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4" />
                Biaya Operasional
              </CardTitle>
              <Link href={`/expense/new?shipmentId=${id}`}>
                <Button size="sm" variant="outline" className="gap-1">
                  <Plus className="h-3.5 w-3.5" /> Tambah Biaya
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {expensesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Belum ada biaya terkait pengiriman ini.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Biaya</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Vendor / Pegawai</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell className="font-mono text-xs">{exp.expenseNumber}</TableCell>
                      <TableCell className="text-xs">{exp.date}</TableCell>
                      <TableCell className="text-xs">{exp.vendorEmployee ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{exp.description ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{exp.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">{idr(exp.total)}</TableCell>
                      <TableCell>
                        <Link href={`/expense/${exp.id}`}>
                          <Button size="icon" variant="ghost" className="h-6 w-6">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {expenses.length > 0 && (
              <div className="flex justify-end mt-3 pt-3 border-t border-slate-700/50 text-sm font-semibold">
                <span className="text-muted-foreground mr-4">Total Biaya</span>
                <span>{idr(expenses.reduce((s, e) => s + e.total, 0))}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attachments Section */}
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="h-4 w-4" />
              Foto, Dokumen &amp; Scan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FreightAttachmentsPanel
              shipmentId={id}
              onBarcodeScanned={(value) => {
                toast({
                  title: "Barcode / QR berhasil discan",
                  description: value,
                });
              }}
            />
          </CardContent>
        </Card>
      </div>

      {/* RFQ Dialog */}
      <Dialog open={showRfqDialog} onOpenChange={setShowRfqDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buat RFQ Baru</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama Vendor (pisah dengan koma)</Label>
              <Input
                value={rfqVendors}
                onChange={(e) => setRfqVendors(e.target.value)}
                placeholder="PT. Vendor A, PT. Vendor B"
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Textarea value={rfqNotes} onChange={(e) => setRfqNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRfqDialog(false)}>Batal</Button>
            <Button onClick={handleCreateRfq} disabled={createRfq.isPending}>
              {createRfq.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Buat RFQ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* In Transit Dialog */}
      <Dialog open={showInTransitDialog} onOpenChange={setShowInTransitDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tandai Dalam Perjalanan</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tanggal Keberangkatan <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={inTransitForm.departureDate}
                onChange={(e) => setInTransitForm((f) => ({ ...f, departureDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>No. Tracking</Label>
              <Input
                value={inTransitForm.trackingNumber}
                onChange={(e) => setInTransitForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                placeholder="Nomor tracking pengiriman"
              />
            </div>
            <div className="space-y-2">
              <Label>No. AWB / BL</Label>
              <Input
                value={inTransitForm.awbNumber}
                onChange={(e) => setInTransitForm((f) => ({ ...f, awbNumber: e.target.value }))}
                placeholder="Air Waybill atau Bill of Lading"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInTransitDialog(false)}>Batal</Button>
            <Button onClick={handleMarkInTransit} disabled={updateShipment.isPending}>
              {updateShipment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completed Dialog */}
      <Dialog open={showCompletedDialog} onOpenChange={setShowCompletedDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tandai Selesai</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tanggal Tiba <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={completedForm.arrivalDate}
                onChange={(e) => setCompletedForm((f) => ({ ...f, arrivalDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Biaya Aktual (IDR)</Label>
              <Input
                type="number"
                value={completedForm.actualCost}
                onChange={(e) => setCompletedForm((f) => ({ ...f, actualCost: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompletedDialog(false)}>Batal</Button>
            <Button onClick={handleMarkCompleted} disabled={updateShipment.isPending}>
              {updateShipment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Aktual Dialog */}
      <Dialog open={showEditAktualDialog} onOpenChange={setShowEditAktualDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-edit-aktual">
          <DialogHeader><DialogTitle>Edit Info Aktual</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="aktual-departure">Tgl Berangkat</Label>
                <Input
                  id="aktual-departure"
                  type="date"
                  value={editAktualForm.departureDate}
                  onChange={(e) => setEditAktualForm((f) => ({ ...f, departureDate: e.target.value }))}
                  data-testid="input-aktual-departure"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aktual-arrival">Tgl Tiba</Label>
                <Input
                  id="aktual-arrival"
                  type="date"
                  value={editAktualForm.arrivalDate}
                  onChange={(e) => setEditAktualForm((f) => ({ ...f, arrivalDate: e.target.value }))}
                  data-testid="input-aktual-arrival"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aktual-tracking">No. Tracking</Label>
              <Input
                id="aktual-tracking"
                value={editAktualForm.trackingNumber}
                onChange={(e) => setEditAktualForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                placeholder="Nomor tracking pengiriman"
                data-testid="input-aktual-tracking"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aktual-awb">No. AWB / BL</Label>
              <Input
                id="aktual-awb"
                value={editAktualForm.awbNumber}
                onChange={(e) => setEditAktualForm((f) => ({ ...f, awbNumber: e.target.value }))}
                placeholder="Air Waybill atau Bill of Lading"
                data-testid="input-aktual-awb"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="aktual-cost">Biaya Aktual (IDR)</Label>
              <Input
                id="aktual-cost"
                type="number"
                value={editAktualForm.actualCost}
                onChange={(e) => setEditAktualForm((f) => ({ ...f, actualCost: e.target.value }))}
                placeholder="0"
                data-testid="input-aktual-cost"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditAktualDialog(false)}>Batal</Button>
            <Button onClick={handleSaveAktual} disabled={updateShipment.isPending} data-testid="button-save-aktual">
              {updateShipment.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quote Dialog */}
      <Dialog open={showQuoteDialog} onOpenChange={setShowQuoteDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tambah Penawaran Vendor</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nama Vendor <span className="text-destructive">*</span></Label>
              <Input
                value={quoteForm.vendorName}
                onChange={(e) => setQuoteForm((f) => ({ ...f, vendorName: e.target.value }))}
                placeholder="PT. Contoh Freight"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["truckingCost", "handlingCost", "freightCost", "otherCost"] as const).map((k) => (
                <div key={k} className="space-y-2">
                  <Label>
                    {{ truckingCost: "Trucking", handlingCost: "Handling", freightCost: "Freight", otherCost: "Lainnya" }[k]}
                  </Label>
                  <Input
                    type="number"
                    value={quoteForm[k]}
                    onChange={(e) => setQuoteForm((f) => ({ ...f, [k]: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Estimasi Hari</Label>
              <Input
                type="number"
                value={quoteForm.estimatedDays}
                onChange={(e) => setQuoteForm((f) => ({ ...f, estimatedDays: e.target.value }))}
                placeholder="7"
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Textarea
                value={quoteForm.notes}
                onChange={(e) => setQuoteForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuoteDialog(false)}>Batal</Button>
            <Button onClick={handleCreateQuote} disabled={createQuote.isPending}>
              {createQuote.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Simpan Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
