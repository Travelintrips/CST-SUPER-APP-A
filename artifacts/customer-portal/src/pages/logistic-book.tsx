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

function CalculatorForm({ item, onAdd, onBack }: { item: ServiceItem; onAdd: (data: Omit<CartItem, "cartId">) => void; onBack: () => void }) {
  const [state, setState] = useState<CalcState>({});
  const { toast } = useToast();

  function set(key: string, val: string) {
    setState((prev) => ({ ...prev, [key]: val }));
  }

  const subtotal = calcSubtotal(item.calculatorType, state);

  function handleAdd() {
    if (subtotal <= 0) {
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
            <Select value={state.containerType||""} onValueChange={v => set("containerType", v)}>
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
            <Select value={state.shipmentType||""} onValueChange={v => set("shipmentType", v)}>
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
            <Select value={state.vehicleType||""} onValueChange={v => set("vehicleType", v)}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {["CDE", "CDD", "Fuso", "Wingbox", "Trailer"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Distance (km)</Label><Input type="number" placeholder="0" value={state.distance||""} onChange={e => set("distance", e.target.value)} /></div>
            <div><Label className="text-xs">Trucking Rate (IDR)</Label><Input type="number" placeholder="0" value={state.truckingRate||""} onChange={e => set("truckingRate", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Loading Fee (IDR)</Label><Input type="number" placeholder="0" value={state.loadingFee||""} onChange={e => set("loadingFee", e.target.value)} /></div>
        </>}

        {ct === "storage" && <>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Number of Days</Label><Input type="number" placeholder="0" value={state.days||""} onChange={e => set("days", e.target.value)} /></div>
            <div><Label className="text-xs">Quantity</Label><Input type="number" placeholder="1" value={state.quantity||""} onChange={e => set("quantity", e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Unit</Label>
            <Select value={state.unit||""} onValueChange={v => set("unit", v)}>
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
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Subtotal</span>
          <span className="text-lg font-bold text-accent">{formatCurrency(subtotal)}</span>
        </div>
        <Button className="w-full" onClick={handleAdd} disabled={subtotal <= 0}>
          <Plus className="w-4 h-4 mr-2" /> Add to Order
        </Button>
      </div>
    </div>
  );
}

export default function BookPage() {
  const DRAFT_META_KEY = "logistic_draft_meta";

  const [step, setStep] = useState<Step>(0);
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
    origin: "", destination: "", commodity: "", cargoDescription: "",
    grossWeight: "", volumeCbm: "", requiredDate: "", notes: "",
    quantity: "", unit: "",
  });
  const [paymentType, setPaymentType] = useState<"transfer" | "gateway" | "">("");
  const [transferTerm, setTransferTerm] = useState<"full" | "termin" | "dp" | "">("");
  const [paymentTerm, setPaymentTerm] = useState<"net7" | "net14" | "net30" | "net60" | "">("");
  const [dpNext, setDpNext] = useState<"lunas-delivery" | "lunas-net30" | "lunas-net60" | "cicil" | "">("");

  // Persist shipmentType to localStorage whenever it changes
  useEffect(() => {
    try {
      if (shipmentType) {
        localStorage.setItem(DRAFT_META_KEY, JSON.stringify({ shipmentType }));
      }
    } catch { /* ignore */ }
  }, [shipmentType]);

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
      // From product page without specific service → skip Tipe Pengiriman, go to Pilih Layanan
      setStep(1);
    } else if (cartItems.length > 0) {
      // Restore draft: jump to Ringkasan and restore shipmentType if saved
      try {
        const meta = localStorage.getItem(DRAFT_META_KEY);
        if (meta) {
          const { shipmentType: saved } = JSON.parse(meta) as { shipmentType: ShipmentType };
          if (saved) setShipmentType(saved);
        }
      } catch { /* ignore */ }
      setStep(2);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleShipmentSelect(type: ShipmentType) {
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
    const { companyName, customerName, email, phone } = customerForm;
    if (!companyName || !customerName || !email || !phone) {
      toast({ title: "Lengkapi data perusahaan", variant: "destructive" });
      return;
    }
    if (cartItems.length === 0) {
      toast({ title: "Tambahkan minimal 1 layanan ke pesanan", variant: "destructive" });
      return;
    }
    createOrder.mutate({ data: {
      companyName,
      customerName,
      email,
      phone,
      shipmentType: shipmentType || customerForm.destination,
      origin,
      destination,
      commodity: customerForm.commodity || null,
      cargoDescription: customerForm.cargoDescription || null,
      grossWeight: parseFloat(customerForm.grossWeight) || null,
      volumeCbm: parseFloat(customerForm.volumeCbm) || null,
      requiredDate: customerForm.requiredDate || null,
      notes: [
        customerForm.quantity ? `Qty: ${customerForm.quantity}${customerForm.unit ? ` ${customerForm.unit}` : ""}` : "",
        customerForm.notes,
      ].filter(Boolean).join(" | ") || null,
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
      onSuccess: (data) => {
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
    // Step 0: Shipment Type
    if (step === 0) return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-foreground mb-1">Pilih Tipe Pengiriman</h2>
          <p className="text-sm text-muted-foreground">Pilih jenis layanan logistik yang dibutuhkan</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {SHIPMENT_TYPES.map(({ type, description, icon }) => {
            const Icon = ICON_MAP[icon] || Package;
            return (
              <button
                key={type}
                onClick={() => handleShipmentSelect(type)}
                className={`text-left p-5 rounded-xl border-2 transition-all hover:shadow-md ${
                  shipmentType === type
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <Icon className="w-8 h-8 text-accent mb-3" />
                <p className="font-bold text-foreground text-sm mb-1">{type}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </button>
            );
          })}
        </div>
      </div>
    );

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

        {/* Product summary in cart */}
        {fromProduct && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
            <Package className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide">Barang / Komoditi</p>
              <p className="font-semibold text-amber-900">{fromProduct.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {fromProduct.qty > 1 && (
                  <p className="text-xs text-amber-700">Qty: {fromProduct.qty}</p>
                )}
                {fromProduct.unit && (
                  <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-medium">{fromProduct.unit}</span>
                )}
              </div>
            </div>
            {fromProduct.price > 0 && (
              <p className="font-bold text-amber-900 shrink-0">
                {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(fromProduct.price * fromProduct.qty)}
              </p>
            )}
          </div>
        )}

        {cartItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Keranjang kosong</p>
            <p className="text-sm mt-1">Tambahkan layanan dari step sebelumnya</p>
            <Button className="mt-4" onClick={() => setStep(1)}>Pilih Layanan</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {cartItems.map((item) => (
                <div key={item.cartId} className="bg-card border border-border rounded-lg p-4">
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
                      <span className="font-bold text-accent text-sm">{formatCurrency(item.subtotal)}</span>
                      <button
                        onClick={() => removeItem(item.cartId)}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-muted/40 rounded-lg border border-border p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Rincian Pesanan</p>
              {cartItems.map((item) => (
                <div key={item.cartId} className="flex justify-between text-sm gap-2">
                  <span className="text-foreground font-medium min-w-0 truncate">{item.serviceName}</span>
                  <span className="font-medium shrink-0">
                    {item.subtotal > 0 ? formatCurrency(item.subtotal) : <span className="text-amber-600 text-xs">Harga nego</span>}
                  </span>
                </div>
              ))}
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
            </div>
          </>
        )}
      </div>
    );

    // Step 3: Customer Form
    if (step === 3) {
      const f = customerForm;
      const set = (k: string, v: string) => setCustomerForm((p) => ({ ...p, [k]: v }));
      return (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">Data Pemesan</h2>
            <p className="text-sm text-muted-foreground">Lengkapi data untuk konfirmasi pesanan</p>
          </div>

          {/* ── Group 1: Data Perusahaan ─────────────────────────── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-accent" /> Data Perusahaan
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Nama Perusahaan *</Label><Input placeholder="PT. ..." value={f.companyName} onChange={e => set("companyName", e.target.value)} /></div>
              <div><Label className="text-xs">Nama PIC *</Label><Input placeholder="Nama lengkap" value={f.customerName} onChange={e => set("customerName", e.target.value)} /></div>
              <div><Label className="text-xs">Email *</Label><Input type="email" placeholder="email@perusahaan.com" value={f.email} onChange={e => set("email", e.target.value)} /></div>
              <div><Label className="text-xs">Telepon / WhatsApp *</Label><Input placeholder="+62..." value={f.phone} onChange={e => set("phone", e.target.value)} /></div>
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
    if (step === 0) return !!shipmentType;
    if (step === 1) return false;
    if (step === 2) return cartItems.length > 0;
    if (step === 3) return !!(customerForm.companyName && customerForm.customerName && customerForm.email && customerForm.phone);
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

      {/* Product banner — shown when coming from products page */}
      {fromProduct && (
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
            {fromProduct.price > 0 && (
              <div className="text-right shrink-0">
                <p className="text-xs text-amber-700">Qty {fromProduct.qty} ×</p>
                <p className="font-bold text-amber-900 text-sm">
                  {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(fromProduct.price)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {stepContent()}

        {/* Navigation buttons */}
        {step !== 1 && (
          <div className="flex justify-between mt-8 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
              disabled={step === 0}
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
