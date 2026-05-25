import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateLogisticOrder, useGetPortalMe } from "@workspace/api-client-react";
import { getAuthToken, getAuthHeaders } from "@/lib/auth";
import { useCart, CartItem } from "@/lib/logistic-cart";
import { formatCurrency } from "@/lib/utils";
import {
  CATEGORIES, SERVICE_ITEMS, SHIPMENT_TYPES,
  ServiceCategory, ServiceItem, ShipmentType,
} from "@/lib/services-data";
import {
  Ship, ChevronLeft, ChevronRight, ArrowLeft,
  Plane, Download, Upload, MapPin, Home,
  Package, Warehouse, Truck, FileCheck, Shield, FileText,
  Plus, Trash2, Edit2, Calculator, ShoppingCart, User, CheckCircle2,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Ship, Plane, Download, Upload, MapPin, Home,
  Package, Warehouse, Truck, FileCheck, Shield, FileText,
};

function getServiceDetailRows(
  calculatorType: string,
  inputData: Record<string, unknown>
): { label: string; value: string }[] {
  const str = (v: unknown) => (v != null && v !== "" ? String(v) : "");

  if (calculatorType === "trucking") {
    return [
      { label: "Pickup City", value: str(inputData.pickupCity) || "-" },
      { label: "Destination City", value: str(inputData.destCity) || "-" },
      { label: "Distance", value: inputData.distance ? `${inputData.distance} KM` : "-" },
      { label: "Vehicle Type", value:
          (inputData.vehicleType === "Trailer Truck" || inputData.vehicleType === "Trailer") && inputData.trailerSize
            ? `${str(inputData.vehicleType)} - ${str(inputData.trailerSize)}`
            : str(inputData.vehicleType) || "Not specified" },
    ];
  }
  if (calculatorType === "air_freight") {
    return [
      ...(inputData.originAirport ? [{ label: "Origin Airport", value: str(inputData.originAirport) }] : []),
      ...(inputData.destinationAirport ? [{ label: "Destination Airport", value: str(inputData.destinationAirport) }] : []),
      ...(inputData.grossWeight ? [{ label: "Gross Weight", value: `${inputData.grossWeight} kg` }] : []),
      ...(inputData.quantity ? [{ label: "Quantity", value: `${inputData.quantity} pcs` }] : []),
    ];
  }
  if (calculatorType === "sea_fcl") {
    return [
      ...(inputData.originPort ? [{ label: "Origin Port", value: str(inputData.originPort) }] : []),
      ...(inputData.destinationPort ? [{ label: "Destination Port", value: str(inputData.destinationPort) }] : []),
      ...(inputData.containerType ? [{ label: "Container Type", value: str(inputData.containerType) }] : []),
    ];
  }
  if (calculatorType === "sea_lcl") {
    return [
      ...(inputData.cbm ? [{ label: "CBM", value: String(inputData.cbm) }] : []),
      ...(inputData.weight ? [{ label: "Weight", value: `${inputData.weight} kg` }] : []),
    ];
  }
  if (calculatorType === "customs") {
    return [
      ...(inputData.shipmentType ? [{ label: "Shipment Type", value: str(inputData.shipmentType) }] : []),
    ];
  }
  if (calculatorType === "storage") {
    return [
      ...(inputData.days ? [{ label: "Days", value: String(inputData.days) }] : []),
      ...(inputData.quantity ? [{ label: "Quantity", value: String(inputData.quantity) }] : []),
      ...(inputData.unit ? [{ label: "Unit", value: str(inputData.unit) }] : []),
    ];
  }
  if (calculatorType === "product") {
    return [
      ...(inputData.qty ? [{ label: "Qty", value: String(inputData.qty) }] : []),
      ...(inputData.unit ? [{ label: "Unit", value: str(inputData.unit) }] : []),
    ];
  }
  const skipped = new Set(["unitPrice", "serviceFee", "adminFee", "ratePerKg", "ratePerCbm", "minimumCharge", "freightRate", "handlingFee", "truckingRate", "loadingFee", "customsFee", "documentFee", "pibPebFee", "permitFee", "notes"]);
  return Object.entries(inputData)
    .filter(([k, v]) => v && !skipped.has(k))
    .slice(0, 4)
    .map(([k, v]) => ({
      label: k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()),
      value: String(v),
    }));
}

const STEPS = [
  "Tipe Pengiriman",
  "Pilih Layanan",
  "Ringkasan",
  "Data Pemesan",
];

type Step = 0 | 1 | 2 | 3 | 4;

interface CalcState {
  [key: string]: string;
}

function calcSubtotal(calcType: string, state: CalcState): number {
  try {
    switch (calcType) {
      case "air_freight": {
        const gw = parseFloat(state.grossWeight) || 0;
        const l = parseFloat(state.length) || 0;
        const w = parseFloat(state.width) || 0;
        const h = parseFloat(state.height) || 0;
        const qty = parseFloat(state.quantity) || 1;
        const rate = parseFloat(state.ratePerKg) || 0;
        const vw = (l * w * h * qty) / 6000;
        const cw = Math.max(gw, vw);
        return cw * rate;
      }
      case "sea_fcl": {
        const fr = parseFloat(state.freightRate) || 0;
        const hf = parseFloat(state.handlingFee) || 0;
        return fr + hf;
      }
      case "sea_lcl": {
        const cbm = parseFloat(state.cbm) || 0;
        const rate = parseFloat(state.ratePerCbm) || 0;
        const min = parseFloat(state.minimumCharge) || 0;
        return Math.max(cbm * rate, min);
      }
      case "customs": {
        const cf = parseFloat(state.customsFee) || 0;
        const df = parseFloat(state.documentFee) || 0;
        const pf = parseFloat(state.pibPebFee) || 0;
        const af = parseFloat(state.permitFee) || 0;
        return cf + df + pf + af;
      }
      case "trucking": {
        const tr = parseFloat(state.truckingRate) || 0;
        const lf = parseFloat(state.loadingFee) || 0;
        return tr + lf;
      }
      case "storage": {
        const days = parseFloat(state.days) || 0;
        const qty = parseFloat(state.quantity) || 1;
        const rate = parseFloat(state.ratePerDay) || 0;
        return days * qty * rate;
      }
      case "document": {
        const qty = parseFloat(state.quantity) || 0;
        const fee = parseFloat(state.feePerDocument) || 0;
        return qty * fee;
      }
      case "additional": {
        const sf = parseFloat(state.serviceFee) || 0;
        const af = parseFloat(state.adminFee) || 0;
        return sf + af;
      }
      default: {
        const qty = parseFloat(state.quantity) || 1;
        const up = parseFloat(state.unitPrice) || 0;
        return qty * up;
      }
    }
  } catch {
    return 0;
  }
}

function calcResult(calcType: string, state: CalcState): Record<string, unknown> {
  switch (calcType) {
    case "air_freight": {
      const gw = parseFloat(state.grossWeight) || 0;
      const l = parseFloat(state.length) || 0;
      const w = parseFloat(state.width) || 0;
      const h = parseFloat(state.height) || 0;
      const qty = parseFloat(state.quantity) || 1;
      const rate = parseFloat(state.ratePerKg) || 0;
      const vw = (l * w * h * qty) / 6000;
      const cw = Math.max(gw, vw);
      return { volumeWeight: vw.toFixed(2), chargeableWeight: cw.toFixed(2), ratePerKg: rate, total: (cw * rate).toFixed(2) };
    }
    default:
      return { total: calcSubtotal(calcType, state).toFixed(2) };
  }
}

function CalculatorForm({ item, onAdd, onBack, transportMode, truckType, origin, destination }: {
  item: ServiceItem;
  onAdd: (data: Omit<CartItem, "cartId">) => void;
  onBack: () => void;
  transportMode?: string;
  truckType?: string;
  origin?: string;
  destination?: string;
}) {
  const [state, setState] = useState<CalcState>({});
  const [autoRateFetching, setAutoRateFetching] = useState(false);
  const { toast } = useToast();

  function set(key: string, val: string) {
    setState((prev) => ({ ...prev, [key]: val }));
  }

  // Auto-calculate trucking rate from estimate-price when distance changes
  useEffect(() => {
    if (item.calculatorType !== "trucking") return;
    const dist = parseFloat(state.distance ?? "");
    if (!dist || dist <= 0) return;
    const mode = transportMode || "TRUCKING";
    const params = new URLSearchParams({ transport_mode: mode, distance_km: String(dist) });
    if (truckType || state.vehicleType) params.set("truck_type", (truckType || state.vehicleType)!);
    if (origin) params.set("origin", origin);
    if (destination) params.set("dest", destination);
    setAutoRateFetching(true);
    fetch(`/api/logistic/orders/estimate-price?${params.toString()}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: { estimated_price: number | null }) => {
        if (d.estimated_price != null && d.estimated_price > 0) {
          setState((prev) => ({ ...prev, truckingRate: String(Math.round(d.estimated_price!)) }));
        }
      })
      .catch(() => {})
      .finally(() => setAutoRateFetching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.distance, state.vehicleType, item.calculatorType]);

  const subtotal = calcSubtotal(item.calculatorType, state);

  function handleAdd() {
    if (item.calculatorType === "trucking") {
      if (!state.pickupCity || !state.destCity || !state.vehicleType) {
        toast({ title: "Isi kota asal, kota tujuan, dan tipe kendaraan", variant: "destructive" });
        return;
      }
    } else if (subtotal <= 0) {
      toast({ title: "Isi data kalkulator terlebih dahulu", variant: "destructive" });
      return;
    }
    onAdd({
      category: item.category,
      serviceName: item.name,
      calculatorType: item.calculatorType,
      inputData: { ...state },
      calculationResult: calcResult(item.calculatorType, state),
      subtotal,
    });
    toast({ title: `${item.name} ditambahkan ke pesanan` });
  }

  const ct = item.calculatorType;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <Badge variant="outline" className="text-xs mb-1">{item.category}</Badge>
          <h3 className="font-bold text-foreground text-lg">{item.name}</h3>
          <p className="text-sm text-muted-foreground">{item.description}</p>
        </div>
      </div>

      <div className="bg-muted/30 rounded-lg border border-border p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Calculator className="w-4 h-4 text-accent" /> Calculator
        </div>

        {ct === "air_freight" && <>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Origin Airport</Label><Input placeholder="CGK" value={state.originAirport||""} onChange={e => set("originAirport", e.target.value)} /></div>
            <div><Label className="text-xs">Destination Airport</Label><Input placeholder="SIN" value={state.destinationAirport||""} onChange={e => set("destinationAirport", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Gross Weight (kg)</Label><Input type="number" placeholder="0" value={state.grossWeight||""} onChange={e => set("grossWeight", e.target.value)} /></div>
            <div><Label className="text-xs">Quantity (pcs)</Label><Input type="number" placeholder="1" value={state.quantity||""} onChange={e => set("quantity", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Length (cm)</Label><Input type="number" placeholder="0" value={state.length||""} onChange={e => set("length", e.target.value)} /></div>
            <div><Label className="text-xs">Width (cm)</Label><Input type="number" placeholder="0" value={state.width||""} onChange={e => set("width", e.target.value)} /></div>
            <div><Label className="text-xs">Height (cm)</Label><Input type="number" placeholder="0" value={state.height||""} onChange={e => set("height", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Rate per Kg (IDR)</Label><Input type="number" placeholder="0" value={state.ratePerKg||""} onChange={e => set("ratePerKg", e.target.value)} /></div>
          {(parseFloat(state.grossWeight)||0) > 0 && (parseFloat(state.ratePerKg)||0) > 0 && (
            <div className="text-xs text-muted-foreground bg-background rounded p-3 space-y-1">
              <p>Volume Weight: {((parseFloat(state.length)||0)*(parseFloat(state.width)||0)*(parseFloat(state.height)||0)*(parseFloat(state.quantity)||1)/6000).toFixed(2)} kg</p>
              <p>Chargeable Weight: {Math.max(parseFloat(state.grossWeight)||0, (parseFloat(state.length)||0)*(parseFloat(state.width)||0)*(parseFloat(state.height)||0)*(parseFloat(state.quantity)||1)/6000).toFixed(2)} kg</p>
            </div>
          )}
        </>}

        {ct === "sea_fcl" && <>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Origin Port</Label><Input placeholder="IDJKT" value={state.originPort||""} onChange={e => set("originPort", e.target.value)} /></div>
            <div><Label className="text-xs">Destination Port</Label><Input placeholder="SGSIN" value={state.destinationPort||""} onChange={e => set("destinationPort", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Container Type</Label>
            <Select value={state.containerType||undefined} onValueChange={v => set("containerType", v)}>
              <SelectTrigger><SelectValue placeholder="Select container" /></SelectTrigger>
              <SelectContent>
                {["20FT", "40FT", "40HC"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Freight Rate (IDR)</Label><Input type="number" placeholder="0" value={state.freightRate||""} onChange={e => set("freightRate", e.target.value)} /></div>
            <div><Label className="text-xs">Handling Fee (IDR)</Label><Input type="number" placeholder="0" value={state.handlingFee||""} onChange={e => set("handlingFee", e.target.value)} /></div>
          </div>
        </>}

        {ct === "sea_lcl" && <>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">CBM</Label><Input type="number" placeholder="0" value={state.cbm||""} onChange={e => set("cbm", e.target.value)} /></div>
            <div><Label className="text-xs">Weight (kg)</Label><Input type="number" placeholder="0" value={state.weight||""} onChange={e => set("weight", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Rate per CBM (IDR)</Label><Input type="number" placeholder="0" value={state.ratePerCbm||""} onChange={e => set("ratePerCbm", e.target.value)} /></div>
            <div><Label className="text-xs">Minimum Charge (IDR)</Label><Input type="number" placeholder="0" value={state.minimumCharge||""} onChange={e => set("minimumCharge", e.target.value)} /></div>
          </div>
        </>}

        {ct === "customs" && <>
          <div><Label className="text-xs">Shipment Type</Label>
            <Select value={state.shipmentType||undefined} onValueChange={v => set("shipmentType", v)}>
              <SelectTrigger><SelectValue placeholder="Import / Export" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Import">Import</SelectItem>
                <SelectItem value="Export">Export</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Customs Service Fee (IDR)</Label><Input type="number" placeholder="0" value={state.customsFee||""} onChange={e => set("customsFee", e.target.value)} /></div>
            <div><Label className="text-xs">Document Fee (IDR)</Label><Input type="number" placeholder="0" value={state.documentFee||""} onChange={e => set("documentFee", e.target.value)} /></div>
            <div><Label className="text-xs">PIB/PEB Fee (IDR)</Label><Input type="number" placeholder="0" value={state.pibPebFee||""} onChange={e => set("pibPebFee", e.target.value)} /></div>
            <div><Label className="text-xs">Additional Permit Fee (IDR)</Label><Input type="number" placeholder="0" value={state.permitFee||""} onChange={e => set("permitFee", e.target.value)} /></div>
          </div>
        </>}

        {ct === "trucking" && <>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Pickup City</Label><Input placeholder="Jakarta" value={state.pickupCity||""} onChange={e => set("pickupCity", e.target.value)} /></div>
            <div><Label className="text-xs">Destination City</Label><Input placeholder="Surabaya" value={state.destCity||""} onChange={e => set("destCity", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Vehicle Type</Label>
            <Select value={state.vehicleType||undefined} onValueChange={v => set("vehicleType", v)}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {["CDE", "CDD", "Fuso", "Wingbox", "Trailer"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Distance (km)</Label><Input type="number" placeholder="0" value={state.distance||""} onChange={e => set("distance", e.target.value)} /></div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                Trucking Rate (IDR)
                {autoRateFetching && <span className="text-[10px] text-muted-foreground animate-pulse">menghitung…</span>}
                {!autoRateFetching && state.truckingRate && state.distance && <span className="text-[10px] text-emerald-600">● auto</span>}
              </Label>
              <Input type="number" placeholder="0" value={state.truckingRate||""} onChange={e => set("truckingRate", e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-0.5">
            <p className="font-semibold">Harga Akan Dikonfirmasi oleh Vendor</p>
            <p>Harga trucking akan diberikan setelah vendor menerima dan mengkonfirmasi pesanan Anda.</p>
          </div>
        </>}

        {ct === "storage" && <>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Number of Days</Label><Input type="number" placeholder="0" value={state.days||""} onChange={e => set("days", e.target.value)} /></div>
            <div><Label className="text-xs">Quantity</Label><Input type="number" placeholder="1" value={state.quantity||""} onChange={e => set("quantity", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Unit</Label>
            <Select value={state.unit||undefined} onValueChange={v => set("unit", v)}>
              <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
              <SelectContent>
                {["CBM", "Pallet", "KG"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Rate per Day (IDR)</Label><Input type="number" placeholder="0" value={state.ratePerDay||""} onChange={e => set("ratePerDay", e.target.value)} /></div>
        </>}

        {ct === "document" && <>
          <div><Label className="text-xs">Document Type</Label><Input placeholder="Bill of Lading" value={state.documentType||""} onChange={e => set("documentType", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Quantity</Label><Input type="number" placeholder="1" value={state.quantity||""} onChange={e => set("quantity", e.target.value)} /></div>
            <div><Label className="text-xs">Fee per Document (IDR)</Label><Input type="number" placeholder="0" value={state.feePerDocument||""} onChange={e => set("feePerDocument", e.target.value)} /></div>
          </div>
        </>}

        {ct === "additional" && <>
          <div><Label className="text-xs">Service Type</Label><Input placeholder="Insurance" value={state.serviceType||""} onChange={e => set("serviceType", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Service Fee (IDR)</Label><Input type="number" placeholder="0" value={state.serviceFee||""} onChange={e => set("serviceFee", e.target.value)} /></div>
            <div><Label className="text-xs">Admin Fee (IDR)</Label><Input type="number" placeholder="0" value={state.adminFee||""} onChange={e => set("adminFee", e.target.value)} /></div>
          </div>
        </>}

        {ct === "generic" && <>
          <div><Label className="text-xs">Service Name</Label><Input placeholder={item.name} value={state.serviceName||""} onChange={e => set("serviceName", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Quantity</Label><Input type="number" placeholder="1" value={state.quantity||""} onChange={e => set("quantity", e.target.value)} /></div>
            <div><Label className="text-xs">Unit Price (IDR)</Label><Input type="number" placeholder="0" value={state.unitPrice||""} onChange={e => set("unitPrice", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Notes (optional)</Label><Input placeholder="Additional details" value={state.notes||""} onChange={e => set("notes", e.target.value)} /></div>
        </>}

        <Separator />
        {item.calculatorType === "trucking" ? (
          <Button
            className="w-full"
            onClick={handleAdd}
            disabled={!state.pickupCity || !state.destCity || !state.vehicleType}
          >
            <Plus className="w-4 h-4 mr-2" /> Add to Order
          </Button>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Subtotal</span>
              <span className="text-lg font-bold text-accent">{formatCurrency(subtotal)}</span>
            </div>
            <Button className="w-full" onClick={handleAdd} disabled={subtotal <= 0}>
              <Plus className="w-4 h-4 mr-2" /> Add to Order
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function BookPage() {
  const DRAFT_META_KEY = "logistic_draft_meta";

  const [step, setStep] = useState<Step>(0);
  const [orderType, setOrderType] = useState<"product" | "service" | "shipment" | null>(null);
  const [shipmentType, setShipmentType] = useState<ShipmentType | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);
  const [selectedItem, setSelectedItem] = useState<ServiceItem | null>(null);
  const [editCartId, setEditCartId] = useState<string | null>(null);
  const { items: cartItems, addItem, removeItem, clearCart, subtotal, tax, grandTotal, taxRate } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createOrder = useCreateLogisticOrder();

  const token = getAuthToken();
  const headers = getAuthHeaders() as any;
  const { data: portalUser } = useGetPortalMe({
    query: { queryKey: ["portalMe", token], enabled: !!token },
    request: { headers },
  });

  const [fromProduct, setFromProduct] = useState<{ name: string; qty: number; price: number; unit?: string } | null>(null);

  const [customerForm, setCustomerForm] = useState({
    companyName: "", customerName: "", email: "", phone: "",
    origin: "", destination: "", shippingAddress: "", commodity: "", cargoDescription: "",
    grossWeight: "", volumeCbm: "", jumlahKoli: "", requiredDate: "", notes: "",
    quantity: "", unit: "",
    namaPenerima: "", nomorPenerima: "",
    // [MULTI-MODE] transport mode fields
    transportMode: "",
    originDistrict: "", destDistrict: "",
    pickupDate: "", pickupTime: "", truckType: "",
    originPort: "", destPort: "", weightKg: "", incoterm: "",
    etd: "", eta: "",
  });
  const [estimation, setEstimation] = useState<{ estimated_price: number | null; disclaimer: string } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [paymentType, setPaymentType] = useState<"transfer" | "gateway" | "">("");
  const [transferTerm, setTransferTerm] = useState<"full" | "termin" | "dp" | "">("");
  const [paymentTerm, setPaymentTerm] = useState<"net7" | "net14" | "net30" | "net60" | "">("");
  const [dpNext, setDpNext] = useState<"lunas-delivery" | "lunas-net30" | "lunas-net60" | "cicil" | "">("");

  // Persist orderType + shipmentType to localStorage whenever they change
  useEffect(() => {
    try {
      if (orderType) {
        localStorage.setItem(DRAFT_META_KEY, JSON.stringify({ orderType, shipmentType }));
      }
    } catch { /* ignore */ }
  }, [orderType, shipmentType]);

  function clearDraft() {
    clearCart();
    try { localStorage.removeItem(DRAFT_META_KEY); } catch { /* ignore */ }
    setStep(0);
    setShipmentType(null);
    setSelectedCategory(null);
    setSelectedItem(null);
    toast({ title: "Draft dihapus", description: "Mulai pemesanan baru dari awal." });
  }

  // Pre-fill form with logged-in user's profile data (only once, when data loads)
  useEffect(() => {
    if (!portalUser) return;
    setCustomerForm((prev) => ({
      ...prev,
      email:        prev.email        || (portalUser.email        ?? ""),
      customerName: prev.customerName || (portalUser.name         ?? ""),
      companyName:  prev.companyName  || (portalUser.company      ?? ""),
      phone:        prev.phone        || (portalUser.phone        ?? ""),
    }));
  }, [portalUser]);

  // Auto-populate origin/destination + transport mode + trucking cargo fields from cart items' inputData
  useEffect(() => {
    if (cartItems.length === 0) return;
    const deriveOrigin = cartItems
      .map((c) => String(c.inputData?.pickupCity || c.inputData?.originAirport || c.inputData?.originPort || ""))
      .find(Boolean) ?? "";
    const deriveDestination = cartItems
      .map((c) => String(c.inputData?.destCity || c.inputData?.destinationAirport || c.inputData?.destinationPort || ""))
      .find(Boolean) ?? "";
    const truckingData = cartItems.find(c => c.calculatorType === "trucking")?.inputData;
    const deriveGrossWeight  = truckingData?.gross_weight_kg  ? String(truckingData.gross_weight_kg)  : "";
    const deriveVolumeCbm    = truckingData?.total_volume_m3  ? String(truckingData.total_volume_m3)  : "";
    const deriveJumlahKoli   = truckingData?.koli_qty         ? String(truckingData.koli_qty)         : "";
    const deriveNamaPenerima  = truckingData?.receiver_name  ? String(truckingData.receiver_name)  : "";
    const deriveNomorPenerima = truckingData?.receiver_phone ? String(truckingData.receiver_phone) : "";
    // Derive transport mode from cart service types
    const hasTrucking  = cartItems.some(c => c.calculatorType === "trucking");
    const hasAir       = cartItems.some(c => c.calculatorType === "air_freight");
    const hasSea       = cartItems.some(c => c.calculatorType === "sea_fcl" || c.calculatorType === "sea_lcl");
    const deriveMode   = hasTrucking ? "TRUCKING" : hasAir ? "AIR_FREIGHT" : hasSea ? "SEA_FREIGHT" : "";
    // Derive port/airport from cart
    const airItem = cartItems.find(c => c.calculatorType === "air_freight")?.inputData;
    const seaItem = cartItems.find(c => c.calculatorType === "sea_fcl" || c.calculatorType === "sea_lcl")?.inputData;
    const deriveOriginPort = airItem?.originAirport ? String(airItem.originAirport) : seaItem?.originPort ? String(seaItem.originPort) : "";
    const deriveDestPort   = airItem?.destinationAirport ? String(airItem.destinationAirport) : seaItem?.destinationPort ? String(seaItem.destinationPort) : "";
    const deriveOriginDistrict = truckingData?.pickupCity ? String(truckingData.pickupCity) : "";
    const deriveDestDistrict   = truckingData?.destCity   ? String(truckingData.destCity)   : "";
    setCustomerForm((prev) => ({
      ...prev,
      origin:          prev.origin         || deriveOrigin,
      destination:     prev.destination    || deriveDestination,
      grossWeight:     prev.grossWeight    || deriveGrossWeight,
      volumeCbm:       prev.volumeCbm      || deriveVolumeCbm,
      jumlahKoli:      prev.jumlahKoli     || deriveJumlahKoli,
      namaPenerima:    prev.namaPenerima   || deriveNamaPenerima,
      nomorPenerima:   prev.nomorPenerima  || deriveNomorPenerima,
      transportMode:   prev.transportMode  || deriveMode,
      originPort:      prev.originPort     || deriveOriginPort,
      destPort:        prev.destPort       || deriveDestPort,
      originDistrict:  prev.originDistrict || deriveOriginDistrict,
      destDistrict:    prev.destDistrict   || deriveDestDistrict,
    }));

    // Parse payment_type from trucking cart inputData and populate payment state
    const rawPayment = truckingData?.payment_type ? String(truckingData.payment_type) : "";
    if (rawPayment && !paymentType) {
      if (rawPayment === "payment_gateway") {
        setPaymentType("gateway");
      } else if (rawPayment.startsWith("transfer")) {
        setPaymentType("transfer");
        const parts = rawPayment.split(":");
        // parts: ["transfer"] | ["transfer","full"] | ["transfer","termin","net7"] | ["transfer","dp","lunas-delivery"]
        const term = parts[1] as "full" | "termin" | "dp" | undefined;
        if (term) setTransferTerm(term);
        if (term === "termin" && parts[2]) {
          setPaymentTerm(parts[2] as "net7" | "net14" | "net30" | "net60");
        } else if (term === "dp" && parts[2]) {
          setDpNext(parts[2] as "lunas-delivery" | "lunas-net30" | "lunas-net60" | "cicil");
        }
      }
    }
  }, [cartItems]);

  // [MULTI-MODE] Auto-fetch price estimation when mode + origin + destination are filled
  useEffect(() => {
    const { transportMode, origin, destination } = customerForm;
    if (!transportMode || !origin || !destination) { setEstimation(null); return; }
    setEstimating(true);
    const params = new URLSearchParams({ transport_mode: transportMode, origin, dest: destination });
    if (customerForm.truckType) params.set("truck_type", customerForm.truckType);
    fetch(`/api/logistic/orders/estimate-price?${params.toString()}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("fetch failed")))
      .then((d: { estimated_price: number | null; disclaimer: string }) => setEstimation(d))
      .catch(() => setEstimation(null))
      .finally(() => setEstimating(false));
  }, [customerForm.transportMode, customerForm.origin, customerForm.destination, customerForm.truckType]);

  const itemsByCategory = useMemo(() =>
    (cat: ServiceCategory) => SERVICE_ITEMS.filter((i) => i.category === cat),
    []
  );

  // Read URL params on mount: ?commodity=&productId=&qty=&productPrice=&unit=&service=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const commodity = params.get("commodity");
    const qty = parseInt(params.get("qty") ?? "1", 10) || 1;
    const productPrice = parseFloat(params.get("productPrice") ?? "0") || 0;
    const unit = params.get("unit") ?? undefined;

    if (commodity) {
      setFromProduct({ name: commodity, qty, price: productPrice, unit });
      setCustomerForm((prev) => ({
        ...prev,
        commodity,
        quantity: String(qty),
        unit: unit ?? prev.unit,
      }));
      // Auto-add product as cart item (always, even without a fixed price)
      const alreadyInCart = cartItems.some(
        (c) => c.calculatorType === "product" && c.serviceName === commodity
      );
      if (!alreadyInCart) {
        addItem({
          category: "Produk",
          serviceName: commodity,
          calculatorType: "product",
          inputData: { qty, price: productPrice, unit: unit ?? "" },
          calculationResult: { total: (productPrice * qty).toFixed(2) },
          subtotal: productPrice * qty,
        });
      }
    }

    const serviceId = params.get("service");
    if (serviceId) {
      const found = SERVICE_ITEMS.find((i) => i.id === serviceId);
      if (found) {
        setSelectedItem(found);
        setSelectedCategory(found.category);
        setStep(1);
      } else if (commodity) {
        // service not found but product present → go to service selection
        setStep(1);
      }
    } else if (commodity) {
      // From product page without specific service
      if (params.get("step") === "2") {
        setStep(2);
      } else {
        setStep(1);
      }
    } else if (params.get("step") === "3" && cartItems.length > 0) {
      // Direct to Data Pemesan from CartDrawer checkout button
      try {
        const meta = localStorage.getItem(DRAFT_META_KEY);
        if (meta) {
          const parsed = JSON.parse(meta) as { orderType?: string; shipmentType?: ShipmentType };
          if (parsed.orderType) setOrderType(parsed.orderType as any);
          if (parsed.shipmentType) setShipmentType(parsed.shipmentType);
        }
      } catch { /* ignore */ }
      // Auto-detect orderType from cart items if not saved
      const allProduct = cartItems.every(c => c.calculatorType === "product");
      if (allProduct) setOrderType("product");
      setStep(3);
    } else if (cartItems.length > 0) {
      // Restore draft: jump to Ringkasan and restore orderType+shipmentType if saved
      try {
        const meta = localStorage.getItem(DRAFT_META_KEY);
        if (meta) {
          const parsed = JSON.parse(meta) as { orderType?: string; shipmentType?: ShipmentType };
          if (parsed.orderType) setOrderType(parsed.orderType as any);
          if (parsed.shipmentType) setShipmentType(parsed.shipmentType);
        }
      } catch { /* ignore */ }
      setStep(2);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleShipmentSelect(type: ShipmentType) {
    setOrderType("shipment");
    setShipmentType(type);
    setStep(1);
  }

  function handleCategorySelect(cat: ServiceCategory) {
    setSelectedCategory(cat);
    setSelectedItem(null);
  }

  function handleItemSelect(item: ServiceItem) {
    setSelectedItem(item);
  }

  function handleAddToCart(data: Omit<CartItem, "cartId">) {
    addItem(data);
    setSelectedItem(null);
  }

  function handleSubmit() {
    const { companyName, customerName, email, phone, origin, destination, shippingAddress } = customerForm;
    if (!customerName || !email) {
      toast({ title: "Lengkapi nama PIC dan email", variant: "destructive" });
      return;
    }
    if (cartItems.length === 0) {
      toast({ title: "Tambahkan minimal 1 item ke pesanan", variant: "destructive" });
      return;
    }
    const truckingItem = cartItems.find(c => c.calculatorType === "trucking");
    const truckingInputData = (truckingItem?.inputData ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (v ? String(v) : "");
    const effectiveOrigin = (orderType === "product" || orderType === "service") ? (origin || "") : origin;
    const effectiveDestination = orderType === "product"
      ? (shippingAddress || destination || "")
      : (orderType === "service" ? (destination || "") : destination);
    createOrder.mutate({ data: {
      companyName,
      customerName,
      email,
      phone,
      orderType: orderType ?? undefined,
      shipmentType: shipmentType ?? "",
      origin: effectiveOrigin,
      destination: effectiveDestination,
      commodity: customerForm.commodity || str(truckingInputData.cargo_category) || null,
      cargoDescription: customerForm.cargoDescription || null,
      grossWeight: parseFloat(customerForm.grossWeight) || null,
      volumeCbm: parseFloat(customerForm.volumeCbm) || null,
      jumlahKoli: parseInt(customerForm.jumlahKoli, 10) || null,
      requiredDate: customerForm.requiredDate || null,
      notes: [
        customerForm.quantity ? `Qty: ${customerForm.quantity}${customerForm.unit ? ` ${customerForm.unit}` : ""}` : "",
        str(truckingInputData.notes),
        customerForm.notes,
      ].filter(Boolean).join(" | ") || null,
      namaPenerima: customerForm.namaPenerima || null,
      nomorPenerima: customerForm.nomorPenerima || null,
      jamOrder: str(truckingInputData.pickupTime) || null,
      // [MULTI-MODE] transport mode fields
      transportMode: (customerForm.transportMode || undefined) as "sea" | "air" | "land" | "multimodal" | undefined,
      originDistrict: customerForm.originDistrict || undefined,
      destDistrict: customerForm.destDistrict || undefined,
      pickupDate: customerForm.pickupDate || str(truckingInputData.pickupDate) || undefined,
      pickupTime: customerForm.pickupTime || str(truckingInputData.pickupTime) || undefined,
      truckType: customerForm.truckType || str(truckingInputData.vehicleType) || undefined,
      originPort: customerForm.originPort || undefined,
      destPort: customerForm.destPort || undefined,
      weightKg: customerForm.weightKg ? parseFloat(customerForm.weightKg) : undefined,
      incoterm: customerForm.incoterm || undefined,
      etd: customerForm.etd || undefined,
      eta: customerForm.eta || undefined,
      paymentMethod: paymentType === "gateway"
        ? "payment_gateway"
        : paymentType === "transfer"
        ? "transfer"
        : null,
      paymentType: paymentType === "gateway"
        ? "payment_gateway"
        : paymentType === "transfer"
        ? transferTerm === "full"
          ? "transfer:full"
          : transferTerm === "termin" && paymentTerm
          ? `transfer:termin:${paymentTerm}`
          : transferTerm === "dp" && dpNext
          ? `transfer:dp:${dpNext}`
          : "transfer"
        : null,
      subtotal,
      tax,
      grandTotal,
      items: cartItems.map((c) => ({
        category: c.category,
        serviceName: c.serviceName,
        calculatorType: c.calculatorType,
        inputData: c.inputData,
        calculationResult: c.calculationResult,
        subtotal: c.subtotal,
      })),
    }}, {
      onSuccess: (data: unknown) => {
        localStorage.setItem("last_order", JSON.stringify(data));
        localStorage.removeItem("logistic_cart");
        try { localStorage.removeItem(DRAFT_META_KEY); } catch { /* ignore */ }
        setLocation("/logistic-order-success");
      },
      onError: () => {
        toast({ title: "Gagal menyimpan pesanan", variant: "destructive" });
      },
    });
  }

  const stepContent = () => {
    // Step 0: Order Type Selection
    if (step === 0) {
      const ORDER_TYPES = [
        {
          type: "product" as const,
          icon: Package,
          title: "Produk",
          desc: "Pesan produk dari katalog. Shipment opsional, bisa pickup sendiri.",
          badge: "Tanpa logistik",
          color: "border-emerald-500 bg-emerald-50",
          iconColor: "text-emerald-600",
          badgeColor: "bg-emerald-100 text-emerald-700",
        },
        {
          type: "service" as const,
          icon: FileCheck,
          title: "Layanan Jasa",
          desc: "Customs, handling, storage, konsultasi, maintenance, dan lainnya.",
          badge: "Non-shipment",
          color: "border-violet-500 bg-violet-50",
          iconColor: "text-violet-600",
          badgeColor: "bg-violet-100 text-violet-700",
        },
        {
          type: "shipment" as const,
          icon: Ship,
          title: "Pengiriman Logistik",
          desc: "Trucking, air freight, sea freight, export/import.",
          badge: "Butuh detail rute",
          color: "border-blue-500 bg-blue-50",
          iconColor: "text-blue-600",
          badgeColor: "bg-blue-100 text-blue-700",
        },
      ];
      return (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">Jenis Pesanan</h2>
            <p className="text-sm text-muted-foreground">Pilih jenis pesanan untuk melanjutkan</p>
          </div>
          <div className="space-y-3">
            {ORDER_TYPES.map(({ type, icon: Icon, title, desc, badge, color, iconColor, badgeColor }) => (
              <button
                key={type}
                onClick={() => {
                  setOrderType(type);
                  if (type === "product") {
                    setShipmentType(null);
                    setStep(cartItems.length > 0 ? 3 : 2);
                  } else if (type === "service") {
                    setShipmentType(null);
                    setStep(1);
                  }
                  // For shipment: stay here, show sub-selector below
                }}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                  orderType === type ? color : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${orderType === type ? "bg-white/70" : "bg-muted"}`}>
                    <Icon className={`w-5 h-5 ${orderType === type ? iconColor : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-foreground text-sm">{title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badgeColor}`}>{badge}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {/* Sub-selector: Shipment Type — tampil saat orderType = shipment */}
          {orderType === "shipment" && (
            <div className="space-y-3 pt-2">
              <p className="text-sm font-semibold text-foreground">Pilih Tipe Pengiriman:</p>
              <div className="grid grid-cols-2 gap-3">
                {SHIPMENT_TYPES.map(({ type, description, icon }) => {
                  const Icon = ICON_MAP[icon] || Package;
                  return (
                    <button
                      key={type}
                      onClick={() => handleShipmentSelect(type)}
                      className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                        shipmentType === type
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      <Icon className="w-7 h-7 text-accent mb-2" />
                      <p className="font-bold text-foreground text-xs mb-0.5">{type}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Step 1: Category & Item selection
    if (step === 1) return (
      <div className="space-y-4">
        {!selectedItem ? (
          <>
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">
                {!selectedCategory ? "Pilih Kategori Layanan" : selectedCategory}
              </h2>
              <p className="text-sm text-muted-foreground">
                {!selectedCategory
                  ? "Klik kategori untuk lihat layanan tersedia"
                  : "Pilih item layanan untuk kalkulasi estimasi biaya"}
              </p>
            </div>

            {!selectedCategory ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATEGORIES.map((cat) => {
                  const Icon = ICON_MAP[cat.icon] || Package;
                  const count = itemsByCategory(cat.name).length;
                  return (
                    <button
                      key={cat.name}
                      onClick={() => handleCategorySelect(cat.name)}
                      className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-foreground text-sm">{cat.name}</p>
                            <Badge variant="secondary" className="text-xs">{count} items</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{cat.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
                >
                  <ChevronLeft className="w-4 h-4" /> Semua Kategori
                </button>
                <div className="space-y-2">
                  {itemsByCategory(selectedCategory).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleItemSelect(item)}
                      className="w-full text-left p-4 rounded-lg border border-border bg-card hover:border-primary/50 hover:shadow-sm transition-all flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-foreground text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <Calculator className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <CalculatorForm
            item={selectedItem}
            onAdd={(data) => { handleAddToCart(data); setStep(2); }}
            onBack={() => setSelectedItem(null)}
            transportMode={customerForm.transportMode}
            truckType={customerForm.truckType}
            origin={customerForm.origin}
            destination={customerForm.destination}
          />
        )}
      </div>
    );

    // Step 2: Cart
    if (step === 2) return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">Ringkasan Pesanan</h2>
            <p className="text-sm text-muted-foreground">{cartItems.length} layanan dipilih</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDraft}
              className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Hapus Draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              <Plus className="w-3 h-3 mr-1" /> Tambah Layanan
            </Button>
          </div>
        </div>


        {cartItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Keranjang kosong</p>
            <p className="text-sm mt-1">Tambahkan layanan dari step sebelumnya</p>
            <Button className="mt-4" onClick={() => setStep(1)}>Pilih Layanan</Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 border-b border-primary/20">
                <Package className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wide">1 Pesanan</span>
                <span className="text-xs text-primary/70">— semua layanan di bawah diproses dalam satu paket</span>
              </div>
              <div className="p-3 space-y-2">
                {cartItems.map((item, idx) => (
                  <div key={item.cartId}>
                    {idx > 0 && (
                      <div className="flex items-center gap-2 py-1">
                        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0 ml-2">
                          <span className="text-[10px] font-bold text-muted-foreground">+</span>
                        </div>
                        <div className="flex-1 border-t border-dashed border-border" />
                      </div>
                    )}
                    <div className="bg-card border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <Badge variant="outline" className="text-xs mb-1">{item.category}</Badge>
                          <p className="font-semibold text-foreground text-sm">{item.serviceName}</p>
                          <dl className="mt-2 space-y-1">
                            {getServiceDetailRows(item.calculatorType, item.inputData).map(({ label, value }) => (
                              <div key={label} className="flex gap-2 text-xs leading-relaxed">
                                <dt className="font-medium text-foreground shrink-0 w-28">{label}</dt>
                                <dd className="text-muted-foreground">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {item.calculatorType === "trucking"
                            ? <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">Harga menyusul</span>
                            : item.subtotal > 0
                              ? <span className="font-bold text-accent text-sm">{formatCurrency(item.subtotal)}</span>
                              : <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Harga nego</span>
                          }
                          <button
                            onClick={() => removeItem(item.cartId)}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg border border-border p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Rincian Pesanan</p>
              {cartItems.map((item) => (
                <div key={item.cartId} className="flex justify-between text-sm gap-2">
                  <span className="text-foreground font-medium min-w-0 truncate">{item.serviceName}</span>
                  <span className="font-medium shrink-0">
                    {item.calculatorType === "trucking"
                      ? <span className="text-blue-600 text-xs font-semibold">Harga menyusul</span>
                      : item.subtotal > 0 ? formatCurrency(item.subtotal) : <span className="text-amber-600 text-xs">Harga nego</span>}
                  </span>
                </div>
              ))}
              {grandTotal > 0 ? (
                <>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PPN {taxRate === 0.011 ? "1,1%" : "11%"}</span>
                    <span className="font-medium">{formatCurrency(tax)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-bold text-foreground">Total Estimasi</span>
                    <span className="font-bold text-accent text-lg">{formatCurrency(grandTotal)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Ini adalah estimasi harga. Penawaran final akan dikonfirmasi oleh tim kami.
                  </p>
                </>
              ) : (
                <>
                  <Separator />
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-0.5">
                    <p className="font-semibold">Harga Akan Diberikan oleh Vendor</p>
                    <p>Setelah pesanan diterima, vendor akan membalas dengan penawaran harga untuk Anda.</p>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );

    // Step 3: Customer Form
    if (step === 3) {
      const f = customerForm;
      const set = (k: string, v: string) => setCustomerForm((p) => ({ ...p, [k]: v }));
      const isProductOrder = orderType === "product";
      const isServiceOrder = orderType === "service";
      const hasLogisticService = !isProductOrder && cartItems.some(c =>
        ["trucking","air_freight","sea_fcl","sea_lcl"].includes(c.calculatorType)
      );
      const hasOriginDest = !isProductOrder && !isServiceOrder && cartItems.some(c =>
        c.inputData?.pickupCity || c.inputData?.originAirport || c.inputData?.originPort ||
        c.inputData?.destCity   || c.inputData?.destinationAirport || c.inputData?.destinationPort
      );
      return (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">Data Pemesan</h2>
            <p className="text-sm text-muted-foreground">Lengkapi data untuk konfirmasi pesanan</p>
          </div>

          {/* ── Group 1: Data Perusahaan ─────────────────────────── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-accent" /> Data Perusahaan
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-xs">Nama Perusahaan</Label>
                <Input placeholder="PT. ..." value={f.companyName} onChange={e => set("companyName", e.target.value)} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-xs">Nama PIC <span className="text-destructive">*</span></Label>
                <Input placeholder="Nama lengkap" value={f.customerName} onChange={e => set("customerName", e.target.value)} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                <Input type="email" placeholder="email@perusahaan.com" value={f.email} onChange={e => set("email", e.target.value)} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label className="text-xs">Telepon / WhatsApp</Label>
                <Input placeholder="+62..." value={f.phone} onChange={e => set("phone", e.target.value)} />
              </div>

              {/* ── Mode Pengiriman — hanya tampil jika ada layanan logistik ─── */}
              {hasLogisticService && (
                <div className="col-span-2">
                  <Label className="text-xs">Mode Pengiriman</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={f.transportMode}
                    onChange={e => set("transportMode", e.target.value)}
                  >
                    <option value="">-- Pilih Mode (opsional) --</option>
                    <option value="TRUCKING">🚛 Trucking / Darat</option>
                    <option value="AIR_FREIGHT">✈️ Air Freight / Udara</option>
                    <option value="SEA_FREIGHT">🚢 Sea Freight / Laut</option>
                    <option value="FOB">📦 FOB (Free On Board)</option>
                  </select>
                </div>
              )}

              {/* ── Trucking-specific fields ─── */}
              {hasLogisticService && f.transportMode === "TRUCKING" && (<>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Kota Asal (Kecamatan)</Label>
                  <Input placeholder="Cakung, Jakarta Timur" value={f.originDistrict} onChange={e => set("originDistrict", e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Kota Tujuan (Kecamatan)</Label>
                  <Input placeholder="Rungkut, Surabaya" value={f.destDistrict} onChange={e => set("destDistrict", e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Tanggal Pickup</Label>
                  <Input type="date" value={f.pickupDate} onChange={e => set("pickupDate", e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Jam Pickup</Label>
                  <Input type="time" value={f.pickupTime} onChange={e => set("pickupTime", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Tipe Unit / Armada</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={f.truckType}
                    onChange={e => set("truckType", e.target.value)}
                  >
                    <option value="">-- Pilih Tipe --</option>
                    <option value="CDD">CDD</option>
                    <option value="CDD Long">CDD Long</option>
                    <option value="CDE">CDE</option>
                    <option value="Fuso">Fuso</option>
                    <option value="Tronton">Tronton</option>
                    <option value="Trailer 20ft">Trailer 20ft</option>
                    <option value="Trailer 40ft">Trailer 40ft</option>
                    <option value="Pickup Box">Pickup Box</option>
                  </select>
                </div>
              </>)}

              {/* ── Air/Sea-specific fields ─── */}
              {hasLogisticService && (f.transportMode === "AIR_FREIGHT" || f.transportMode === "SEA_FREIGHT") && (<>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">{f.transportMode === "AIR_FREIGHT" ? "Bandara" : "Pelabuhan"} Asal</Label>
                  <Input placeholder={f.transportMode === "AIR_FREIGHT" ? "CGK / Soekarno-Hatta" : "Tanjung Priok"} value={f.originPort} onChange={e => set("originPort", e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">{f.transportMode === "AIR_FREIGHT" ? "Bandara" : "Pelabuhan"} Tujuan</Label>
                  <Input placeholder={f.transportMode === "AIR_FREIGHT" ? "SUB / Juanda" : "Tanjung Perak"} value={f.destPort} onChange={e => set("destPort", e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Berat Kargo (kg)</Label>
                  <Input type="number" placeholder="500" value={f.weightKg} onChange={e => set("weightKg", e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Incoterm</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={f.incoterm}
                    onChange={e => set("incoterm", e.target.value)}
                  >
                    <option value="">-- Pilih --</option>
                    <option value="EXW">EXW</option>
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="DAP">DAP</option>
                    <option value="DDP">DDP</option>
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">ETD (Keberangkatan)</Label>
                  <Input type="date" value={f.etd} onChange={e => set("etd", e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">ETA (Tiba Tujuan)</Label>
                  <Input type="date" value={f.eta} onChange={e => set("eta", e.target.value)} />
                </div>
              </>)}

              {/* ── Alamat Pengiriman — hanya untuk product order ─── */}
              {isProductOrder && (
                <div className="col-span-2">
                  <Label className="text-xs">Alamat Pengiriman (opsional)</Label>
                  <Input placeholder="Jl. ..., Kota, Provinsi (kosongkan jika pickup)" value={f.shippingAddress} onChange={e => set("shippingAddress", e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-1">Kosongkan jika akan pickup sendiri</p>
                </div>
              )}

              {/* ── Asal & Tujuan Pengiriman — hanya tampil jika ada data dari layanan ─── */}
              {hasOriginDest && (<>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Asal Pengiriman</Label>
                  <Input placeholder="Jakarta" value={f.origin} onChange={e => set("origin", e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs">Tujuan Pengiriman</Label>
                  <Input placeholder="Surabaya" value={f.destination} onChange={e => set("destination", e.target.value)} />
                </div>
              </>)}

              <div className="col-span-2 sm:col-span-1">
                <Label className="text-xs">Jumlah Koli <span className="text-muted-foreground font-normal">(pcs/koli)</span></Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Contoh: 10"
                  value={f.jumlahKoli}
                  onChange={e => set("jumlahKoli", e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground mt-1">Total jumlah koli / kotak / karton</p>
              </div>

              <div className="col-span-2">
                <Label className="text-xs">Catatan Tambahan</Label>
                <Textarea placeholder="Informasi tambahan untuk tim kami..." value={f.notes} onChange={e => set("notes", e.target.value)} rows={3} />
              </div>

              {/* ── Estimasi Harga ─── */}
              {f.transportMode && (
                <div className="col-span-2">
                  {estimating && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 flex items-center gap-2">
                      <span className="animate-spin">⏳</span> Menghitung estimasi harga...
                    </div>
                  )}
                  {!estimating && estimation && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1">
                      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Estimasi Harga</p>
                      {estimation.estimated_price != null ? (
                        <p className="text-lg font-bold text-emerald-800">
                          Rp {Math.round(estimation.estimated_price).toLocaleString("id-ID")}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-500">Estimasi tidak tersedia — harga akan dikonfirmasi admin</p>
                      )}
                      <p className="text-[11px] text-slate-400">{estimation.disclaimer}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* ── Detail Pemesanan ────────────────────────── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-accent" /> Detail Pemesanan
            </h3>
            <div className="space-y-2">
              {cartItems.map((item) => (
                <div key={item.cartId} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Badge variant="outline" className="text-[10px] mb-1">{item.category}</Badge>
                      <p className="font-semibold text-foreground text-sm">{item.serviceName}</p>
                      <dl className="mt-1.5 space-y-0.5">
                        {getServiceDetailRows(item.calculatorType, item.inputData).map(({ label, value }) => (
                          <div key={label} className="flex gap-2 text-xs">
                            <dt className="text-muted-foreground shrink-0 w-24">{label}</dt>
                            <dd className="font-medium text-foreground">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <div className="text-right shrink-0">
                      {item.subtotal > 0
                        ? <span className="font-bold text-accent text-sm">{formatCurrency(item.subtotal)}</span>
                        : <span className="text-amber-600 text-xs font-medium">Harga nego</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 flex justify-between items-center">
              <span className="font-semibold text-sm text-foreground">Total Estimasi</span>
              <span className="font-bold text-accent text-base">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const canProceed = () => {
    if (step === 0) return !!orderType && (orderType !== "shipment" || !!shipmentType);
    if (step === 1) return false;
    if (step === 2) return cartItems.length > 0;
    if (step === 3) return !!(customerForm.customerName && customerForm.email);
    return false;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Booking
          </button>
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{cartItems.length}</span>
          </div>
        </div>
      </nav>

      {/* Stepper */}
      <div className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1">
            {STEPS.map((label, idx) => (
              <div key={idx} className="flex items-center">
                <div className={`flex items-center gap-1.5 ${idx <= step ? "opacity-100" : "opacity-40"}`}>
                  <div className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                    idx < step ? "bg-accent text-accent-foreground" :
                    idx === step ? "bg-primary text-primary-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {idx < step ? <CheckCircle2 className="w-3 h-3" /> : idx + 1}
                  </div>
                  <span className={`text-xs hidden sm:block ${idx === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-border mx-1" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Product banner — only show for commodity-only (no price) context */}
      {fromProduct && fromProduct.price <= 0 && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <Package className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide">Produk yang dipesan</p>
              <p className="font-semibold text-amber-900 truncate">{fromProduct.name}</p>
              {fromProduct.unit && (
                <span className="inline-block text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium mt-0.5">{fromProduct.unit}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {stepContent()}

        {/* Navigation buttons — step 0 navigates via card clicks */}
        {step !== 1 && step !== 0 && (
          <div className="flex justify-between mt-8 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
              disabled={(step as number) === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Kembali
            </Button>
            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => (s + 1) as Step)}
                disabled={!canProceed()}
              >
                Lanjutkan <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={createOrder.isPending || !canProceed()}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
              >
                {createOrder.isPending ? "Menyimpan..." : "Submit Pesanan"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
