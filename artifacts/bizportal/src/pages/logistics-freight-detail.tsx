import { AppShell } from "@/components/layout/AppShell";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
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
  ArrowLeft, Pencil, Printer, Plus, CheckCircle, Loader2, Ship, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useGetFreightShipment,
  useCreateFreightRfq,
  useCreateFreightQuote,
  useApproveFreightQuote,
  useUpdateFreightShipment,
  getGetFreightShipmentQueryKey,
  type FreightRfqWithQuotes,
  type FreightQuote,
} from "@workspace/api-client-react";

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
  const createRfq = useCreateFreightRfq();
  const createQuote = useCreateFreightQuote();
  const approveQuote = useApproveFreightQuote();
  const updateShipment = useUpdateFreightShipment();

  const [showRfqDialog, setShowRfqDialog] = useState(false);
  const [rfqVendors, setRfqVendors] = useState("");
  const [rfqNotes, setRfqNotes] = useState("");

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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetFreightShipmentQueryKey(id) });

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

  const handleStatusChange = (status: string) => {
    if (!confirm(`Ubah status menjadi "${STATUS_LABELS[status]}"?`)) return;
    updateShipment.mutate(
      { id, data: { shipperName: shipment!.shipperName, consigneeName: shipment!.consigneeName, commodity: shipment!.commodity, origin: shipment!.origin, destination: shipment!.destination, status } },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: "Status diperbarui" });
        },
        onError: () => toast({ title: "Gagal mengubah status", variant: "destructive" }),
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
            <Button variant="outline" onClick={() => navigate(`/logistics/freight/edit/${id}`)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {shipment.status === "confirmed" && (
              <Button onClick={() => handleStatusChange("in_transit")} disabled={updateShipment.isPending}>
                Tandai Dalam Perjalanan
              </Button>
            )}
            {shipment.status === "in_transit" && (
              <Button onClick={() => handleStatusChange("completed")} disabled={updateShipment.isPending}>
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
