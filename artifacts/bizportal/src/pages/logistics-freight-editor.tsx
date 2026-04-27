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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, Loader2, ScanLine, ChevronsUpDown, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FreightScanDialog, type FreightFormFields } from "@/components/freight/FreightScanDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  useCreateFreightShipment,
  useGetFreightShipment,
  useUpdateFreightShipment,
  useListSalesDocuments,
  useListPurchaseDocuments,
  getListFreightShipmentsQueryKey,
  getGetFreightShipmentQueryKey,
  getListSalesDocumentsQueryKey,
  getListPurchaseDocumentsQueryKey,
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

  const { data: salesOrders = [] } = useListSalesDocuments({ kind: "order" }, { query: { queryKey: getListSalesDocumentsQueryKey({ kind: "order" }), enabled: !isEdit } });
  const { data: purchaseOrders = [] } = useListPurchaseDocuments({ kind: "order" }, { query: { queryKey: getListPurchaseDocumentsQueryKey({ kind: "order" }) } });
  const [soPickerOpen, setSoPickerOpen] = useState(false);
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [salesDocId, setSalesDocId] = useState<number | null>(null);
  const [purchaseDocId, setPurchaseDocId] = useState<number | null>(null);
  const [shipperNameAutoFilled, setShipperNameAutoFilled] = useState(false);
  const [consigneeNameAutoFilled, setConsigneeNameAutoFilled] = useState(false);
  const [consigneeAddressAutoFilled, setConsigneeAddressAutoFilled] = useState(false);
  const [originAutoFilled, setOriginAutoFilled] = useState(false);
  const [destinationAutoFilled, setDestinationAutoFilled] = useState(false);
  const [transportModeAutoFilled, setTransportModeAutoFilled] = useState(false);
  const [form, setForm] = useState({
    shipperName: "",
    shipperAddress: "",
    consigneeName: "",
    consigneeAddress: "",
    notifyParty: "",
    commodity: "",
    hsCode: "",
    grossWeight: "",
    netWeight: "",
    quantity: "",
    packingType: "",
    dimensions: "",
    marksAndNumbers: "",
    measurement: "",
    origin: "",
    destination: "",
    portOfLoading: "",
    portOfDischarge: "",
    vessel: "",
    voyage: "",
    notes: "",
    transportMode: "",
    cargoType: "",
    containerNo: "",
  });

  useEffect(() => {
    if (!isEdit) {
      const sp = new URLSearchParams(window.location.search);
      const sid = sp.get("salesDocId");
      if (sid) setSalesDocId(Number(sid));
      setForm((f) => ({
        ...f,
        origin: sp.get("origin") ?? f.origin,
        destination: sp.get("destination") ?? f.destination,
        consigneeName: sp.get("consigneeName") ?? f.consigneeName,
        transportMode: sp.get("transportMode") ?? f.transportMode,
      }));
    }
  }, [isEdit]);

  useEffect(() => {
    if (existing) {
      if ((existing as any).salesDocId) setSalesDocId((existing as any).salesDocId);
      if ((existing as any).purchaseDocId != null) setPurchaseDocId((existing as any).purchaseDocId);
      setForm({
        shipperName: existing.shipperName ?? "",
        shipperAddress: existing.shipperAddress ?? "",
        consigneeName: existing.consigneeName ?? "",
        consigneeAddress: existing.consigneeAddress ?? "",
        notifyParty: existing.notifyParty ?? "",
        commodity: existing.commodity ?? "",
        hsCode: existing.hsCode ?? "",
        grossWeight: existing.grossWeight ?? "",
        netWeight: existing.netWeight ?? "",
        quantity: existing.quantity != null ? String(existing.quantity) : "",
        packingType: existing.packingType ?? "",
        dimensions: existing.dimensions ?? "",
        marksAndNumbers: existing.marksAndNumbers ?? "",
        measurement: existing.measurement ?? "",
        origin: existing.origin ?? "",
        destination: existing.destination ?? "",
        portOfLoading: existing.portOfLoading ?? "",
        portOfDischarge: existing.portOfDischarge ?? "",
        vessel: existing.vessel ?? "",
        voyage: existing.voyage ?? "",
        notes: existing.notes ?? "",
        transportMode: (existing as any).transportMode ?? "",
        cargoType: (existing as any).cargoType ?? "",
        containerNo: (existing as any).containerNo ?? "",
      });
    }
  }, [existing]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (k === "shipperName") setShipperNameAutoFilled(false);
    if (k === "consigneeName") setConsigneeNameAutoFilled(false);
    if (k === "consigneeAddress") setConsigneeAddressAutoFilled(false);
    if (k === "origin") setOriginAutoFilled(false);
    if (k === "destination") setDestinationAutoFilled(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const handleSelectSo = (docId: number) => {
    const doc = salesOrders.find((d) => d.id === docId);
    setSalesDocId(docId);
    setSoPickerOpen(false);
    if (doc) {
      setForm((f) => {
        const willFillConsignee = !f.consigneeName && !!doc.customerName;
        const willFillConsigneeAddress = !f.consigneeAddress && !!(doc.customerAddress ?? "");
        const willFillOrigin = !f.origin && !!(doc.origin ?? "");
        const willFillDestination = !f.destination && !!(doc.destination ?? "");
        const willFillTransportMode = !f.transportMode && !!(doc.transportMode ?? "");
        if (willFillConsignee) setConsigneeNameAutoFilled(true);
        if (willFillConsigneeAddress) setConsigneeAddressAutoFilled(true);
        if (willFillOrigin) setOriginAutoFilled(true);
        if (willFillDestination) setDestinationAutoFilled(true);
        if (willFillTransportMode) setTransportModeAutoFilled(true);
        return {
          ...f,
          consigneeName: doc.customerName || f.consigneeName,
          consigneeAddress: f.consigneeAddress || (doc.customerAddress ?? ""),
          origin: (doc.origin ?? "") || f.origin,
          destination: (doc.destination ?? "") || f.destination,
          transportMode: (doc.transportMode ?? "") || f.transportMode,
        };
      });
    }
  };

  const handleSelectPo = (docId: number) => {
    const doc = purchaseOrders.find((d) => d.id === docId);
    setPurchaseDocId(docId);
    setPoPickerOpen(false);
    if (doc) {
      const shouldAutoFill = !form.shipperName && !!doc.supplierName;
      if (shouldAutoFill) setShipperNameAutoFilled(true);
      setForm((f) => ({
        ...f,
        shipperName: f.shipperName || (doc.supplierName ?? ""),
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !salesDocId) {
      toast({ title: "Sales Order wajib dipilih sebelum membuat shipment.", variant: "destructive" });
      return;
    }
    if (!form.shipperName || !form.consigneeName || !form.commodity || !form.origin || !form.destination) {
      toast({ title: "Harap isi semua field wajib", variant: "destructive" });
      return;
    }
    const payload = {
      shipperName: form.shipperName,
      shipperAddress: form.shipperAddress || undefined,
      consigneeName: form.consigneeName,
      consigneeAddress: form.consigneeAddress || undefined,
      notifyParty: form.notifyParty || undefined,
      commodity: form.commodity,
      hsCode: form.hsCode || undefined,
      grossWeight: form.grossWeight || undefined,
      netWeight: form.netWeight || undefined,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      packingType: form.packingType || undefined,
      dimensions: form.dimensions || undefined,
      marksAndNumbers: form.marksAndNumbers || undefined,
      measurement: form.measurement || undefined,
      origin: form.origin,
      destination: form.destination,
      portOfLoading: form.portOfLoading || undefined,
      portOfDischarge: form.portOfDischarge || undefined,
      vessel: form.vessel || undefined,
      voyage: form.voyage || undefined,
      notes: form.notes || undefined,
      transportMode: (form.transportMode || undefined) as any,
      cargoType: (form.cargoType || undefined) as any,
      containerNo: form.containerNo || undefined,
      salesDocId: salesDocId ?? undefined,
      purchaseDocId: isEdit ? purchaseDocId : (purchaseDocId ?? undefined),
    } as any;

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

  const [showScanDialog, setShowScanDialog] = useState(false);

  const applyScannedFields = (fields: FreightFormFields) => {
    if (fields.shipperName !== undefined && fields.shipperName !== null) {
      setShipperNameAutoFilled(false);
    }
    if (fields.consigneeName !== undefined && fields.consigneeName !== null) {
      setConsigneeNameAutoFilled(false);
    }
    if (fields.consigneeAddress !== undefined && fields.consigneeAddress !== null) {
      setConsigneeAddressAutoFilled(false);
    }
    if (fields.origin !== undefined && fields.origin !== null) {
      setOriginAutoFilled(false);
    }
    if (fields.destination !== undefined && fields.destination !== null) {
      setDestinationAutoFilled(false);
    }
    if ((fields as any).transportMode !== undefined && (fields as any).transportMode !== null) {
      setTransportModeAutoFilled(false);
    }
    setForm((f) => ({ ...f, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null)) }));
    toast({ title: "Data berhasil diisi dari scan" });
  };

  return (
    <AppShell>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/logistics/freight")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold flex-1">
            {isEdit ? "Edit Freight Shipment" : "Buat Freight Shipment Baru"}
          </h1>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowScanDialog(true)}
            className="gap-2"
          >
            <ScanLine className="h-4 w-4" />
            Scan Dokumen
          </Button>
        </div>

        {isEdit && loadingExisting ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">Memuat...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Sales Order picker — required for new shipments */}
            {!isEdit && (
              <Card className={!salesDocId ? "border-destructive/50 bg-destructive/5" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Sales Order
                    <span className="text-destructive text-sm font-normal">* wajib</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Pilih Sales Order yang terkait dengan shipment ini. Data konsignee dan rute akan diisi otomatis.</p>
                </CardHeader>
                <CardContent>
                  {salesDocId ? (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 p-3 rounded-lg border bg-muted/20">
                        {(() => {
                          const doc = salesOrders.find((d) => d.id === salesDocId);
                          return doc ? (
                            <div className="flex items-center gap-4">
                              <span className="font-mono font-semibold text-sm">{doc.docNumber}</span>
                              <span className="text-sm text-muted-foreground">{doc.customerName}</span>
                            </div>
                          ) : (
                            <span className="text-sm font-mono">SO #{salesDocId}</span>
                          );
                        })()}
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        setForm((f) => ({
                          ...f,
                          consigneeName: consigneeNameAutoFilled ? "" : f.consigneeName,
                          consigneeAddress: consigneeAddressAutoFilled ? "" : f.consigneeAddress,
                          origin: originAutoFilled ? "" : f.origin,
                          destination: destinationAutoFilled ? "" : f.destination,
                          transportMode: transportModeAutoFilled ? "" : f.transportMode,
                        }));
                        setConsigneeNameAutoFilled(false);
                        setConsigneeAddressAutoFilled(false);
                        setOriginAutoFilled(false);
                        setDestinationAutoFilled(false);
                        setTransportModeAutoFilled(false);
                        setSalesDocId(null);
                      }}>
                        Ganti
                      </Button>
                    </div>
                  ) : (
                    <Popover open={soPickerOpen} onOpenChange={setSoPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={soPickerOpen}
                          className="w-full justify-between"
                        >
                          Pilih Sales Order...
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Cari nomor SO atau nama pelanggan..." />
                          <CommandList>
                            <CommandEmpty>Tidak ada Sales Order yang cocok.</CommandEmpty>
                            <CommandGroup>
                              {salesOrders.map((doc) => (
                                <CommandItem
                                  key={doc.id}
                                  value={`${doc.docNumber} ${doc.customerName}`}
                                  onSelect={() => handleSelectSo(doc.id)}
                                >
                                  <Check className={`mr-2 h-4 w-4 ${salesDocId === doc.id ? "opacity-100" : "opacity-0"}`} />
                                  <span className="font-mono mr-2">{doc.docNumber}</span>
                                  <span className="text-muted-foreground text-sm truncate">{doc.customerName}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Purchase Order picker — optional, available for both create and edit */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Purchase Order
                  <span className="text-muted-foreground text-sm font-normal">(opsional)</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">Tautkan ke Purchase Order yang terkait dengan shipment ini. Nama supplier akan diisi otomatis ke kolom Shipper jika belum terisi.</p>
              </CardHeader>
              <CardContent>
                {purchaseDocId ? (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 p-3 rounded-lg border bg-muted/20">
                      {(() => {
                        const doc = purchaseOrders.find((d) => d.id === purchaseDocId);
                        return doc ? (
                          <div className="flex items-center gap-4">
                            <span className="font-mono font-semibold text-sm">{doc.docNumber}</span>
                            <span className="text-sm text-muted-foreground">{doc.supplierName}</span>
                          </div>
                        ) : (
                          <span className="text-sm font-mono">PO #{purchaseDocId}</span>
                        );
                      })()}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      if (shipperNameAutoFilled) {
                        setForm((f) => ({ ...f, shipperName: "" }));
                        setShipperNameAutoFilled(false);
                      }
                      setPurchaseDocId(null);
                    }}>
                      Ganti
                    </Button>
                  </div>
                ) : (
                  <Popover open={poPickerOpen} onOpenChange={setPoPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={poPickerOpen}
                        className="w-full justify-between"
                        data-testid="po-picker-trigger"
                      >
                        Pilih Purchase Order...
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cari nomor PO atau nama supplier..." />
                        <CommandList>
                          <CommandEmpty>Tidak ada Purchase Order yang cocok.</CommandEmpty>
                          <CommandGroup>
                            {purchaseOrders.map((doc) => (
                              <CommandItem
                                key={doc.id}
                                value={`${doc.docNumber} ${doc.supplierName}`}
                                onSelect={() => handleSelectPo(doc.id)}
                              >
                                <Check className={`mr-2 h-4 w-4 ${purchaseDocId === doc.id ? "opacity-100" : "opacity-0"}`} />
                                <span className="font-mono mr-2">{doc.docNumber}</span>
                                <span className="text-muted-foreground text-sm truncate">{doc.supplierName}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Informasi Shipper</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shipperName">Nama Shipper <span className="text-destructive">*</span></Label>
                  <Input id="shipperName" value={form.shipperName} onChange={set("shipperName")} placeholder="PT. Contoh Shipper" required />
                  {shipperNameAutoFilled && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-medium">Dari PO</span>
                      Diisi otomatis dari Purchase Order. Edit untuk mengubah.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipperAddress">Alamat Shipper</Label>
                  <Input id="shipperAddress" value={form.shipperAddress} onChange={set("shipperAddress")} placeholder="Jl. ..." />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Informasi Consignee</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="consigneeName">Nama Consignee <span className="text-destructive">*</span></Label>
                    <Input id="consigneeName" value={form.consigneeName} onChange={set("consigneeName")} placeholder="PT. Contoh Consignee" required />
                    {consigneeNameAutoFilled && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-medium">Dari SO</span>
                        Diisi otomatis dari Sales Order. Edit untuk mengubah.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="consigneeAddress">Alamat Consignee</Label>
                    <Input id="consigneeAddress" value={form.consigneeAddress} onChange={set("consigneeAddress")} placeholder="Jl. ..." />
                    {consigneeAddressAutoFilled && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-medium">Dari SO</span>
                        Diisi otomatis dari Sales Order. Edit untuk mengubah.
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notifyParty">Notify Party</Label>
                  <Input id="notifyParty" value={form.notifyParty} onChange={set("notifyParty")} placeholder="Nama / alamat pihak yang diberitahu (jika berbeda dengan consignee)" />
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
              <CardHeader><CardTitle>Rute &amp; Moda Pengiriman</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="origin">Asal <span className="text-destructive">*</span></Label>
                    <Input id="origin" value={form.origin} onChange={set("origin")} placeholder="Jakarta, Indonesia" required />
                    {originAutoFilled && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-medium">Dari SO</span>
                        Diisi otomatis dari Sales Order. Edit untuk mengubah.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destination">Tujuan <span className="text-destructive">*</span></Label>
                    <Input id="destination" value={form.destination} onChange={set("destination")} placeholder="Singapore" required />
                    {destinationAutoFilled && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-medium">Dari SO</span>
                        Diisi otomatis dari Sales Order. Edit untuk mengubah.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Moda Transportasi</Label>
                    <Select value={form.transportMode || "__none"} onValueChange={(v) => { setTransportModeAutoFilled(false); setForm((f) => ({ ...f, transportMode: v === "__none" ? "" : v })); }}>
                      <SelectTrigger><SelectValue placeholder="Pilih moda..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— Belum ditentukan —</SelectItem>
                        <SelectItem value="sea">Laut (Sea)</SelectItem>
                        <SelectItem value="air">Udara (Air)</SelectItem>
                        <SelectItem value="land">Darat (Land)</SelectItem>
                        <SelectItem value="multimodal">Multimodal</SelectItem>
                      </SelectContent>
                    </Select>
                    {transportModeAutoFilled && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-medium">Dari SO</span>
                        Diisi otomatis dari Sales Order. Edit untuk mengubah.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Jenis Kargo</Label>
                    <Select value={form.cargoType || "__none"} onValueChange={(v) => setForm((f) => ({ ...f, cargoType: v === "__none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Pilih jenis..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— Belum ditentukan —</SelectItem>
                        <SelectItem value="FCL">FCL (Full Container Load)</SelectItem>
                        <SelectItem value="LCL">LCL (Less than Container Load)</SelectItem>
                        <SelectItem value="Air">Air Cargo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="containerNo">Nomor Kontainer</Label>
                  <Input id="containerNo" value={form.containerNo} onChange={set("containerNo")} placeholder="MSCU1234567" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Informasi Bill of Lading</CardTitle>
                <p className="text-sm text-muted-foreground">Data pengiriman laut untuk dokumen Bill of Lading</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="portOfLoading">Port of Loading</Label>
                    <Input id="portOfLoading" value={form.portOfLoading} onChange={set("portOfLoading")} placeholder="Tanjung Priok, Jakarta" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="portOfDischarge">Port of Discharge</Label>
                    <Input id="portOfDischarge" value={form.portOfDischarge} onChange={set("portOfDischarge")} placeholder="Port of Singapore" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vessel">Vessel / Nama Kapal</Label>
                    <Input id="vessel" value={form.vessel} onChange={set("vessel")} placeholder="MV. Contoh Kapal" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voyage">Voyage No.</Label>
                    <Input id="voyage" value={form.voyage} onChange={set("voyage")} placeholder="VY-001" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marksAndNumbers">Marks & Numbers</Label>
                  <Textarea
                    id="marksAndNumbers"
                    value={form.marksAndNumbers}
                    onChange={set("marksAndNumbers")}
                    placeholder="Tanda / nomor pada kemasan..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="measurement">Measurement (CBM)</Label>
                  <Input id="measurement" value={form.measurement} onChange={set("measurement")} placeholder="cth: 12.5 CBM" />
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

      <FreightScanDialog
        open={showScanDialog}
        onOpenChange={setShowScanDialog}
        onApply={applyScannedFields}
      />
    </AppShell>
  );
}
