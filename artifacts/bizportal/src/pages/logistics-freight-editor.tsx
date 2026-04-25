import { AppShell } from "@/components/layout/AppShell";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateFreightShipment,
  useGetFreightShipment,
  useUpdateFreightShipment,
  getListFreightShipmentsQueryKey,
  getGetFreightShipmentQueryKey,
} from "@workspace/api-client-react";

export default function LogisticsFreightEditorPage() {
  const params = useParams<{ id?: string }>();
  const isEdit = Boolean(params.id);
  const id = params.id ? Number(params.id) : undefined;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: existing, isLoading: loadingExisting } = useGetFreightShipment(id ?? 0, {
    query: { enabled: isEdit, queryKey: getGetFreightShipmentQueryKey(id ?? 0) },
  });

  const create = useCreateFreightShipment();
  const update = useUpdateFreightShipment();

  const [form, setForm] = useState({
    shipperName: "",
    shipperAddress: "",
    consigneeName: "",
    consigneeAddress: "",
    commodity: "",
    hsCode: "",
    grossWeight: "",
    netWeight: "",
    quantity: "",
    packingType: "",
    dimensions: "",
    origin: "",
    destination: "",
    notes: "",
  });

  useEffect(() => {
    if (existing) {
      setForm({
        shipperName: existing.shipperName ?? "",
        shipperAddress: existing.shipperAddress ?? "",
        consigneeName: existing.consigneeName ?? "",
        consigneeAddress: existing.consigneeAddress ?? "",
        commodity: existing.commodity ?? "",
        hsCode: existing.hsCode ?? "",
        grossWeight: existing.grossWeight ?? "",
        netWeight: existing.netWeight ?? "",
        quantity: existing.quantity != null ? String(existing.quantity) : "",
        packingType: existing.packingType ?? "",
        dimensions: existing.dimensions ?? "",
        origin: existing.origin ?? "",
        destination: existing.destination ?? "",
        notes: existing.notes ?? "",
      });
    }
  }, [existing]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shipperName || !form.consigneeName || !form.commodity || !form.origin || !form.destination) {
      toast({ title: "Harap isi semua field wajib", variant: "destructive" });
      return;
    }
    const payload = {
      shipperName: form.shipperName,
      shipperAddress: form.shipperAddress || undefined,
      consigneeName: form.consigneeName,
      consigneeAddress: form.consigneeAddress || undefined,
      commodity: form.commodity,
      hsCode: form.hsCode || undefined,
      grossWeight: form.grossWeight || undefined,
      netWeight: form.netWeight || undefined,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      packingType: form.packingType || undefined,
      dimensions: form.dimensions || undefined,
      origin: form.origin,
      destination: form.destination,
      notes: form.notes || undefined,
    };

    if (isEdit && id) {
      update.mutate(
        { id, data: payload },
        {
          onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: getListFreightShipmentsQueryKey() });
            toast({ title: "Shipment berhasil diperbarui" });
            navigate(`/logistics/freight/${res.id}`);
          },
          onError: () => toast({ title: "Gagal memperbarui", variant: "destructive" }),
        }
      );
    } else {
      create.mutate(
        { data: payload },
        {
          onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: getListFreightShipmentsQueryKey() });
            toast({ title: `Shipment ${res.shipmentNumber} berhasil dibuat` });
            navigate(`/logistics/freight/${res.id}`);
          },
          onError: () => toast({ title: "Gagal membuat shipment", variant: "destructive" }),
        }
      );
    }
  };

  const isBusy = create.isPending || update.isPending;

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/logistics/freight")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">
            {isEdit ? "Edit Freight Shipment" : "Buat Freight Shipment Baru"}
          </h1>
        </div>

        {isEdit && loadingExisting ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">Memuat...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Informasi Shipper</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shipperName">Nama Shipper <span className="text-destructive">*</span></Label>
                  <Input id="shipperName" value={form.shipperName} onChange={set("shipperName")} placeholder="PT. Contoh Shipper" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipperAddress">Alamat Shipper</Label>
                  <Input id="shipperAddress" value={form.shipperAddress} onChange={set("shipperAddress")} placeholder="Jl. ..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Informasi Consignee</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="consigneeName">Nama Consignee <span className="text-destructive">*</span></Label>
                  <Input id="consigneeName" value={form.consigneeName} onChange={set("consigneeName")} placeholder="PT. Contoh Consignee" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="consigneeAddress">Alamat Consignee</Label>
                  <Input id="consigneeAddress" value={form.consigneeAddress} onChange={set("consigneeAddress")} placeholder="Jl. ..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Detail Kargo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="commodity">Komoditi <span className="text-destructive">*</span></Label>
                    <Input id="commodity" value={form.commodity} onChange={set("commodity")} placeholder="Elektronik, Tekstil, dll." required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hsCode">HS Code</Label>
                    <Input id="hsCode" value={form.hsCode} onChange={set("hsCode")} placeholder="8471.30.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="grossWeight">Berat Bruto (kg)</Label>
                    <Input id="grossWeight" type="number" step="0.01" value={form.grossWeight} onChange={set("grossWeight")} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="netWeight">Berat Neto (kg)</Label>
                    <Input id="netWeight" type="number" step="0.01" value={form.netWeight} onChange={set("netWeight")} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Jumlah</Label>
                    <Input id="quantity" type="number" value={form.quantity} onChange={set("quantity")} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="packingType">Jenis Packing</Label>
                    <Input id="packingType" value={form.packingType} onChange={set("packingType")} placeholder="Karton, Pallet, dll." />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dimensions">Dimensi</Label>
                  <Input id="dimensions" value={form.dimensions} onChange={set("dimensions")} placeholder="P x L x T cm" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Rute Pengiriman</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="origin">Asal <span className="text-destructive">*</span></Label>
                  <Input id="origin" value={form.origin} onChange={set("origin")} placeholder="Jakarta, Indonesia" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destination">Tujuan <span className="text-destructive">*</span></Label>
                  <Input id="destination" value={form.destination} onChange={set("destination")} placeholder="Singapore" required />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Catatan</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={form.notes}
                  onChange={set("notes")}
                  placeholder="Catatan tambahan..."
                  rows={3}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => navigate("/logistics/freight")}>
                Batal
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {isEdit ? "Simpan Perubahan" : "Buat Shipment"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
