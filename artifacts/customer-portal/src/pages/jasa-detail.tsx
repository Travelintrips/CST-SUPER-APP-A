import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Ship, Plane, Download, Upload, MapPin, Home,
  Package, Warehouse, Truck, FileCheck, Shield, FileText,
  Calculator, ArrowLeft, ArrowRight, ShoppingCart, CheckCircle2,
  Plus, Trash2,
} from "lucide-react";
import {
  CATEGORIES, SERVICE_ITEMS, CATEGORY_COLORS_DETAIL,
} from "@/lib/services-data";
import { useCart } from "@/lib/logistic-cart";
import { formatCurrency } from "@/lib/utils";
import { AirportCombobox } from "@/components/AirportCombobox";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Ship, Plane, Download, Upload, MapPin, Home,
  Package, Warehouse, Truck, FileCheck, Shield, FileText,
};

type CalcState = Record<string, string>;

type AirRow = {
  id: string;
  grossWeight: string;
  quantity: string;
  length: string;
  width: string;
  height: string;
};

function newAirRow(): AirRow {
  return { id: crypto.randomUUID(), grossWeight: "", quantity: "1", length: "", width: "", height: "" };
}

function rowChargeableWeight(row: AirRow): number {
  const gw = parseFloat(row.grossWeight) || 0;
  const qty = parseFloat(row.quantity) || 1;
  const vw = ((parseFloat(row.length) || 0) * (parseFloat(row.width) || 0) * (parseFloat(row.height) || 0) * qty) / 6000;
  return Math.max(gw * qty, vw);
}

function rowVolumeWeight(row: AirRow): number {
  const qty = parseFloat(row.quantity) || 1;
  return ((parseFloat(row.length) || 0) * (parseFloat(row.width) || 0) * (parseFloat(row.height) || 0) * qty) / 6000;
}

function calcSubtotal(calcType: string, state: CalcState, airRows?: AirRow[]): number {
  try {
    switch (calcType) {
      case "air_freight": {
        const rate = parseFloat(state.ratePerKg) || 0;
        const rows = airRows && airRows.length > 0 ? airRows : [];
        const totalCW = rows.reduce((sum, row) => sum + rowChargeableWeight(row), 0);
        return totalCW * rate;
      }
      case "sea_fcl": {
        return (parseFloat(state.freightRate) || 0) + (parseFloat(state.handlingFee) || 0);
      }
      case "sea_lcl": {
        const cbm = parseFloat(state.cbm) || 0;
        const rate = parseFloat(state.ratePerCbm) || 0;
        const min = parseFloat(state.minimumCharge) || 0;
        return Math.max(cbm * rate, min);
      }
      case "customs": {
        return (parseFloat(state.customsFee) || 0) + (parseFloat(state.documentFee) || 0) +
          (parseFloat(state.pibPebFee) || 0) + (parseFloat(state.permitFee) || 0);
      }
      case "trucking": {
        return (parseFloat(state.distance) || 0) * (parseFloat(state.truckingRate) || 0) + (parseFloat(state.loadingFee) || 0);
      }
      case "storage": {
        return (parseFloat(state.days) || 0) * (parseFloat(state.quantity) || 1) * (parseFloat(state.ratePerDay) || 0);
      }
      case "document": {
        return (parseFloat(state.quantity) || 0) * (parseFloat(state.feePerDocument) || 0);
      }
      case "additional": {
        return (parseFloat(state.serviceFee) || 0) + (parseFloat(state.adminFee) || 0);
      }
      default: {
        return (parseFloat(state.quantity) || 1) * (parseFloat(state.unitPrice) || 0);
      }
    }
  } catch {
    return 0;
  }
}

function calcResult(calcType: string, state: CalcState, airRows?: AirRow[]): Record<string, unknown> {
  if (calcType === "air_freight") {
    const rate = parseFloat(state.ratePerKg) || 0;
    const rows = airRows ?? [];
    const totalCW = rows.reduce((sum, row) => sum + rowChargeableWeight(row), 0);
    const totalVW = rows.reduce((sum, row) => sum + rowVolumeWeight(row), 0);
    return {
      totalVolumeWeight: totalVW.toFixed(2),
      totalChargeableWeight: totalCW.toFixed(2),
      ratePerKg: rate,
      total: (totalCW * rate).toFixed(2),
      rows: rows.length,
    };
  }
  return { total: calcSubtotal(calcType, state).toFixed(2) };
}

export default function JasaDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { addItem } = useCart();
  const [state, setState] = useState<CalcState>({});
  const [airRows, setAirRows] = useState<AirRow[]>([newAirRow()]);
  const [added, setAdded] = useState(false);

  const item = SERVICE_ITEMS.find((i) => i.id === params.id);
  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Package className="h-16 w-16 text-muted-foreground opacity-30" />
        <h2 className="text-2xl font-bold">Layanan tidak ditemukan</h2>
        <Link href="/jasa">
          <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Kembali ke Katalog</Button>
        </Link>
      </div>
    );
  }

  const cat = CATEGORIES.find((c) => c.name === item.category);
  const IconComp = cat ? (ICON_MAP[cat.icon] ?? Package) : Package;
  const colors = CATEGORY_COLORS_DETAIL[item.category] ?? {
    bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700",
    header: "from-blue-900 to-blue-700",
  };

  function set(key: string, val: string) {
    setState((prev) => ({ ...prev, [key]: val }));
  }

  const subtotal = calcSubtotal(item.calculatorType, state, airRows);
  const ct = item.calculatorType;

  function setAirRow(id: string, field: keyof Omit<AirRow, "id">, val: string) {
    setAirRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }
  function addAirRow() { setAirRows((prev) => [...prev, newAirRow()]); }
  function removeAirRow(id: string) { setAirRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== id) : prev); }

  function handleAddToCart() {
    if (!item) return;
    if (subtotal <= 0) {
      toast({ title: "Isi data kalkulator terlebih dahulu", variant: "destructive" });
      return;
    }
    addItem({
      category: item.category,
      serviceName: item.name,
      calculatorType: item.calculatorType,
      inputData: { ...state, ...(item.calculatorType === "air_freight" ? { airRows: JSON.stringify(airRows) } : {}) },
      calculationResult: calcResult(item.calculatorType, state, airRows),
      subtotal,
    });
    setAdded(true);
    toast({ title: `${item.name} ditambahkan ke keranjang pesanan!` });
  }

  function handleProceed() {
    setLocation("/book");
  }

  const otherServices = SERVICE_ITEMS.filter(
    (s) => s.category === item.category && s.id !== item.id
  ).slice(0, 3);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Dark header matching jasa.tsx style */}
      <div className={`bg-primary text-primary-foreground py-12 md:py-20`}>
        <div className="container px-4 md:px-6">
          <Link href="/jasa" className="inline-flex items-center gap-1.5 text-primary-foreground/60 hover:text-primary-foreground text-sm mb-6 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Katalog Jasa
          </Link>
          <div className="flex items-start gap-6">
            <div className={`${colors.bg} rounded-2xl p-5 flex-shrink-0`}>
              <IconComp className={`h-12 w-12 ${colors.text}`} />
            </div>
            <div>
              <Badge className={`${colors.badge} border-0 font-medium mb-3`}>{item.category}</Badge>
              <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">{item.name}</h1>
              <p className="text-primary-foreground/80 text-lg max-w-2xl">{item.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container px-4 md:px-6 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calculator section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="border-b border-border px-6 py-4 flex items-center gap-2">
                <Calculator className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-bold">Kalkulator Estimasi Biaya</h2>
                <span className="text-sm text-muted-foreground ml-1">— isi data untuk mendapatkan estimasi</span>
              </div>

              <div className="p-6 space-y-4">
                {ct === "air_freight" && <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Origin Airport</Label>
                      <AirportCombobox
                        value={state.originAirport || ""}
                        onChange={(v) => set("originAirport", v)}
                        placeholder="CGK — Jakarta"
                      />
                    </div>
                    <div>
                      <Label>Destination Airport</Label>
                      <AirportCombobox
                        value={state.destinationAirport || ""}
                        onChange={(v) => set("destinationAirport", v)}
                        placeholder="SIN — Singapore"
                      />
                    </div>
                  </div>

                  {/* Multi-row quantity list */}
                  <div className="space-y-3">
                    {airRows.map((row, idx) => {
                      const vw = rowVolumeWeight(row);
                      const cw = rowChargeableWeight(row);
                      const hasData = (parseFloat(row.grossWeight) || 0) > 0;
                      return (
                        <div key={row.id} className="border border-border rounded-xl p-4 space-y-3 bg-gray-50/50 relative">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-foreground">Quantity #{idx + 1}</p>
                            {airRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeAirRow(row.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Gross Weight (kg)</Label>
                              <Input type="number" placeholder="0" className="mt-1 h-9" value={row.grossWeight} onChange={e => setAirRow(row.id, "grossWeight", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Quantity (pcs)</Label>
                              <Input type="number" placeholder="1" className="mt-1 h-9" value={row.quantity} onChange={e => setAirRow(row.id, "quantity", e.target.value)} />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs">Length (cm)</Label>
                              <Input type="number" placeholder="0" className="mt-1 h-9" value={row.length} onChange={e => setAirRow(row.id, "length", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Width (cm)</Label>
                              <Input type="number" placeholder="0" className="mt-1 h-9" value={row.width} onChange={e => setAirRow(row.id, "width", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Height (cm)</Label>
                              <Input type="number" placeholder="0" className="mt-1 h-9" value={row.height} onChange={e => setAirRow(row.id, "height", e.target.value)} />
                            </div>
                          </div>
                          {hasData && (
                            <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t border-border">
                              <span>Vol. Weight: <span className="font-semibold text-foreground">{vw.toFixed(2)} kg</span></span>
                              <span>Chargeable: <span className="font-semibold text-blue-700">{cw.toFixed(2)} kg</span></span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 w-full border-dashed"
                    onClick={addAirRow}
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Quantity Lain
                  </Button>

                  <div><Label>Rate per Kg (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.ratePerKg || ""} onChange={e => set("ratePerKg", e.target.value)} /></div>

                  {subtotal > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm space-y-1.5">
                      <p className="text-blue-700 font-medium">Ringkasan Kalkulasi ({airRows.length} jenis quantity):</p>
                      <p className="text-muted-foreground">Total Vol. Weight: <span className="font-semibold text-foreground">{airRows.reduce((s, r) => s + rowVolumeWeight(r), 0).toFixed(2)} kg</span></p>
                      <p className="text-muted-foreground">Total Chargeable Weight: <span className="font-semibold text-foreground">{airRows.reduce((s, r) => s + rowChargeableWeight(r), 0).toFixed(2)} kg</span></p>
                    </div>
                  )}
                </>}

                {ct === "sea_fcl" && <>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Origin Port</Label><Input placeholder="IDJKT" className="mt-1" value={state.originPort || ""} onChange={e => set("originPort", e.target.value)} /></div>
                    <div><Label>Destination Port</Label><Input placeholder="SGSIN" className="mt-1" value={state.destinationPort || ""} onChange={e => set("destinationPort", e.target.value)} /></div>
                  </div>
                  <div><Label>Container Type</Label>
                    <Select value={state.containerType || ""} onValueChange={v => set("containerType", v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih container" /></SelectTrigger>
                      <SelectContent>{["20 ft", "40 ft", "40 ft (High Cube)", "20 ft Suspensi", "40 ft Suspensi"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Freight Rate (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.freightRate || ""} onChange={e => set("freightRate", e.target.value)} /></div>
                    <div><Label>Handling Fee (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.handlingFee || ""} onChange={e => set("handlingFee", e.target.value)} /></div>
                  </div>
                </>}

                {ct === "sea_lcl" && <>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>CBM</Label><Input type="number" placeholder="0" className="mt-1" value={state.cbm || ""} onChange={e => set("cbm", e.target.value)} /></div>
                    <div><Label>Weight (kg)</Label><Input type="number" placeholder="0" className="mt-1" value={state.weight || ""} onChange={e => set("weight", e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Rate per CBM (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.ratePerCbm || ""} onChange={e => set("ratePerCbm", e.target.value)} /></div>
                    <div><Label>Minimum Charge (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.minimumCharge || ""} onChange={e => set("minimumCharge", e.target.value)} /></div>
                  </div>
                </>}

                {ct === "customs" && <>
                  <div><Label>Shipment Type</Label>
                    <Select value={state.shipmentType || ""} onValueChange={v => set("shipmentType", v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Import / Export" /></SelectTrigger>
                      <SelectContent><SelectItem value="Import">Import</SelectItem><SelectItem value="Export">Export</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Customs Service Fee (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.customsFee || ""} onChange={e => set("customsFee", e.target.value)} /></div>
                    <div><Label>Document Fee (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.documentFee || ""} onChange={e => set("documentFee", e.target.value)} /></div>
                    <div><Label>PIB/PEB Fee (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.pibPebFee || ""} onChange={e => set("pibPebFee", e.target.value)} /></div>
                    <div><Label>Additional Permit Fee (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.permitFee || ""} onChange={e => set("permitFee", e.target.value)} /></div>
                  </div>
                </>}

                {ct === "trucking" && <>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Pickup City</Label><Input placeholder="Jakarta" className="mt-1" value={state.pickupCity || ""} onChange={e => set("pickupCity", e.target.value)} /></div>
                    <div><Label>Destination City</Label><Input placeholder="Surabaya" className="mt-1" value={state.destCity || ""} onChange={e => set("destCity", e.target.value)} /></div>
                  </div>
                  <div><Label>Vehicle Type</Label>
                    <Select value={state.vehicleType || ""} onValueChange={v => set("vehicleType", v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih kendaraan" /></SelectTrigger>
                      <SelectContent>{["20 ft", "40 ft", "40 ft (High Cube)", "20 ft Suspensi", "40 ft Suspensi"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Distance (km)</Label><Input type="number" placeholder="0" className="mt-1" value={state.distance || ""} onChange={e => set("distance", e.target.value)} /></div>
                    <div><Label>Trucking Rate (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.truckingRate || ""} onChange={e => set("truckingRate", e.target.value)} /></div>
                  </div>
                  <div><Label>Loading Fee (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.loadingFee || ""} onChange={e => set("loadingFee", e.target.value)} /></div>
                  {(parseFloat(state.distance) || 0) > 0 && (parseFloat(state.truckingRate) || 0) > 0 && (
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 text-sm space-y-1.5">
                      <p className="text-orange-700 font-medium">Rincian Kalkulasi:</p>
                      <p className="text-muted-foreground">
                        Jarak × Rate: <span className="font-semibold text-foreground">{parseFloat(state.distance) || 0} km × {formatCurrency(parseFloat(state.truckingRate) || 0)}/km = {formatCurrency((parseFloat(state.distance) || 0) * (parseFloat(state.truckingRate) || 0))}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Loading Fee: <span className="font-semibold text-foreground">{formatCurrency(parseFloat(state.loadingFee) || 0)}</span>
                      </p>
                    </div>
                  )}
                </>}

                {ct === "storage" && <>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Number of Days</Label><Input type="number" placeholder="0" className="mt-1" value={state.days || ""} onChange={e => set("days", e.target.value)} /></div>
                    <div><Label>Quantity</Label><Input type="number" placeholder="1" className="mt-1" value={state.quantity || ""} onChange={e => set("quantity", e.target.value)} /></div>
                  </div>
                  <div><Label>Unit</Label>
                    <Select value={state.unit || ""} onValueChange={v => set("unit", v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih unit" /></SelectTrigger>
                      <SelectContent>{["CBM", "Pallet", "KG"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Rate per Day (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.ratePerDay || ""} onChange={e => set("ratePerDay", e.target.value)} /></div>
                </>}

                {ct === "document" && <>
                  <div><Label>Document Type</Label><Input placeholder="Bill of Lading" className="mt-1" value={state.documentType || ""} onChange={e => set("documentType", e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Quantity</Label><Input type="number" placeholder="1" className="mt-1" value={state.quantity || ""} onChange={e => set("quantity", e.target.value)} /></div>
                    <div><Label>Fee per Document (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.feePerDocument || ""} onChange={e => set("feePerDocument", e.target.value)} /></div>
                  </div>
                </>}

                {ct === "additional" && <>
                  <div><Label>Service Type</Label><Input placeholder="Insurance / Survey..." className="mt-1" value={state.serviceType || ""} onChange={e => set("serviceType", e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Service Fee (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.serviceFee || ""} onChange={e => set("serviceFee", e.target.value)} /></div>
                    <div><Label>Admin Fee (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.adminFee || ""} onChange={e => set("adminFee", e.target.value)} /></div>
                  </div>
                </>}

                {ct === "generic" && <>
                  <div><Label>Service Name</Label><Input placeholder={item.name} className="mt-1" value={state.serviceName || ""} onChange={e => set("serviceName", e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Quantity</Label><Input type="number" placeholder="1" className="mt-1" value={state.quantity || ""} onChange={e => set("quantity", e.target.value)} /></div>
                    <div><Label>Unit Price (IDR)</Label><Input type="number" placeholder="0" className="mt-1" value={state.unitPrice || ""} onChange={e => set("unitPrice", e.target.value)} /></div>
                  </div>
                  <div><Label>Notes (optional)</Label><Input placeholder="Detail tambahan..." className="mt-1" value={state.notes || ""} onChange={e => set("notes", e.target.value)} /></div>
                </>}

                <Separator />

                <div className={`rounded-xl p-4 flex items-center justify-between ${subtotal > 0 ? `${colors.bg} border ${colors.text.replace("text", "border").replace("700", "200")}` : "bg-muted"}`}>
                  <div>
                    <p className="text-sm text-muted-foreground">Estimasi Subtotal</p>
                    <p className={`text-2xl font-bold ${subtotal > 0 ? colors.text : "text-foreground"}`}>
                      {subtotal > 0 ? formatCurrency(subtotal) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 italic">Harga estimasi, final dikonfirmasi tim kami</p>
                  </div>
                  {subtotal > 0 && <CheckCircle2 className={`h-8 w-8 ${colors.text} opacity-60`} />}
                </div>

                {!added ? (
                  <Button
                    size="lg"
                    className="w-full gap-2 h-12 text-base"
                    onClick={handleAddToCart}
                    disabled={subtotal <= 0}
                  >
                    <ShoppingCart className="h-5 w-5" />
                    Tambahkan ke Pesanan
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      {item.name} berhasil ditambahkan ke pesanan
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => { setAdded(false); setState({}); setAirRows([newAirRow()]); }} className="gap-1.5">
                        <Calculator className="h-4 w-4" /> Hitung Ulang
                      </Button>
                      <Button onClick={handleProceed} className="gap-1.5">
                        <ArrowRight className="h-4 w-4" /> Lanjut Pesan
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Info card */}
            <div className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-4">
              <h3 className="font-bold text-foreground">Informasi Layanan</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kategori</span>
                  <Badge className={`${colors.badge} border-0`}>{item.category}</Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Harga</span>
                  <span className="font-semibold text-amber-600">Negosiasi / Quotation</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimasi</span>
                  <span className="font-semibold">{subtotal > 0 ? formatCurrency(subtotal) : "—"}</span>
                </div>
              </div>
              <Link href="/book">
                <Button variant="outline" className="w-full gap-2 mt-2">
                  <ShoppingCart className="h-4 w-4" />
                  Lihat Keranjang Pesanan
                </Button>
              </Link>
            </div>

            {/* Related services */}
            {otherServices.length > 0 && (
              <div className="bg-white rounded-2xl border border-border shadow-sm p-6 space-y-3">
                <h3 className="font-bold text-foreground">Layanan {item.category} Lainnya</h3>
                <div className="space-y-2">
                  {otherServices.map((s) => (
                    <Link key={s.id} href={`/jasa/${s.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                        <div>
                          <p className="text-sm font-medium group-hover:text-accent transition-colors">{s.name}</p>
                          <p className="text-xs text-muted-foreground leading-tight">{s.description}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back to catalog */}
            <Link href="/jasa">
              <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
                <ArrowLeft className="h-4 w-4" />
                Lihat Semua Layanan
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
