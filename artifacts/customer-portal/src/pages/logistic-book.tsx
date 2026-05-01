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
  const [step, setStep] = useState<Step>(0);
  const [shipmentType, setShipmentType] = useState<ShipmentType | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);
  const [selectedItem, setSelectedItem] = useState<ServiceItem | null>(null);
  const [editCartId, setEditCartId] = useState<string | null>(null);
  const { items: cartItems, addItem, removeItem, subtotal, tax, grandTotal, taxRate } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createOrder = useCreateLogisticOrder();

  const token = getAuthToken();
  const headers = getAuthHeaders() as any;
  const { data: portalUser } = useGetPortalMe({
    query: { queryKey: ["portalMe", token], enabled: !!token },
    request: { headers },
  });

  const [customerForm, setCustomerForm] = useState({
    companyName: "", customerName: "", email: "", phone: "",
    origin: "", destination: "", commodity: "", cargoDescription: "",
    grossWeight: "", volumeCbm: "", requiredDate: "", notes: "",
  });
  const [paymentType, setPaymentType] = useState<"cash" | "termin" | "dp" | "">("");
  const [paymentTerm, setPaymentTerm] = useState<"net7" | "net14" | "net30" | "net60" | "">("");
  const [dpNext, setDpNext] = useState<"lunas-delivery" | "lunas-net30" | "lunas-net60" | "cicil" | "">("");

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

  // Jump directly to cart/order summary if cart already has items (coming from jasa-detail)
  // or jump to calculator if ?service=<id> is in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const serviceId = params.get("service");
    if (serviceId) {
      const found = SERVICE_ITEMS.find((i) => i.id === serviceId);
      if (found) {
        setSelectedItem(found);
        setSelectedCategory(found.category);
        setStep(1);
      }
    } else if (cartItems.length > 0) {
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
    const { companyName, customerName, email, phone, origin, destination } = customerForm;
    if (!companyName || !customerName || !email || !phone || !origin || !destination) {
      toast({ title: "Lengkapi data perusahaan dan pengiriman", variant: "destructive" });
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
      notes: customerForm.notes || null,
      paymentType: paymentType
        ? paymentType === "termin" && paymentTerm
          ? `termin:${paymentTerm}`
          : paymentType === "dp" && dpNext
          ? `dp:${dpNext}`
          : paymentType
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
          <Button variant="outline" size="sm" onClick={() => setStep(1)}>
            <Plus className="w-3 h-3 mr-1" /> Tambah Layanan
          </Button>
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
            <div className="space-y-3">
              {cartItems.map((item) => (
                <div key={item.cartId} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Badge variant="outline" className="text-xs mb-1">{item.category}</Badge>
                      <p className="font-semibold text-foreground text-sm">{item.serviceName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {Object.entries(item.inputData)
                          .filter(([, v]) => v)
                          .slice(0, 3)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </p>
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
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
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
            <h2 className="text-xl font-bold text-foreground mb-1">Data Perusahaan & Pengiriman</h2>
            <p className="text-sm text-muted-foreground">Lengkapi data untuk konfirmasi pesanan</p>
          </div>

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

            <Separator />
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Ship className="w-4 h-4 text-accent" /> Data Pengiriman
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Origin *</Label><Input placeholder="Jakarta / IDJKT" value={f.origin} onChange={e => set("origin", e.target.value)} /></div>
              <div><Label className="text-xs">Destination *</Label><Input placeholder="Singapore / SGSIN" value={f.destination} onChange={e => set("destination", e.target.value)} /></div>
              <div><Label className="text-xs">Commodity</Label><Input placeholder="Elektronik, Tekstil..." value={f.commodity} onChange={e => set("commodity", e.target.value)} /></div>
              <div><Label className="text-xs">Required Date</Label><Input type="date" value={f.requiredDate} onChange={e => set("requiredDate", e.target.value)} /></div>
              <div><Label className="text-xs">Gross Weight (kg)</Label><Input type="number" placeholder="0" value={f.grossWeight} onChange={e => set("grossWeight", e.target.value)} /></div>
              <div><Label className="text-xs">Volume / CBM</Label><Input type="number" placeholder="0" value={f.volumeCbm} onChange={e => set("volumeCbm", e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">Cargo Description</Label><Textarea placeholder="Deskripsi kargo..." value={f.cargoDescription} onChange={e => set("cargoDescription", e.target.value)} rows={2} /></div>
            <div><Label className="text-xs">Notes</Label><Textarea placeholder="Catatan tambahan..." value={f.notes} onChange={e => set("notes", e.target.value)} rows={2} /></div>

            <div className="space-y-3">
              <Label className="text-xs block">Jenis Pembayaran <span className="text-muted-foreground font-normal">(opsional)</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {(["cash", "termin", "dp"] as const).map((type) => {
                  const labels: Record<string, { title: string; desc: string }> = {
                    cash: { title: "Cash", desc: "Bayar lunas" },
                    termin: { title: "Termin", desc: "Cicil berkala" },
                    dp: { title: "DP / Advance", desc: "Uang muka" },
                  };
                  const selected = paymentType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setPaymentType(selected ? "" : type);
                        setPaymentTerm("");
                        setDpNext("");
                      }}
                      className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-3 text-center transition-all ${
                        selected
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-background text-foreground hover:border-accent/50"
                      }`}
                    >
                      <span className="font-semibold text-xs leading-tight">{labels[type].title}</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">{labels[type].desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Termin sub-options */}
              {paymentType === "termin" && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2">
                  <p className="text-xs font-medium text-accent">Pilih Jangka Waktu Termin</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["net7", "net14", "net30", "net60"] as const).map((term) => {
                      const termLabels: Record<string, string> = {
                        net7: "Net 7 Hari", net14: "Net 14 Hari",
                        net30: "Net 30 Hari", net60: "Net 60 Hari",
                      };
                      return (
                        <button
                          key={term}
                          type="button"
                          onClick={() => setPaymentTerm(paymentTerm === term ? "" : term)}
                          className={`rounded-lg border-2 py-2 text-[11px] font-semibold transition-all text-center ${
                            paymentTerm === term
                              ? "border-accent bg-accent text-white"
                              : "border-border bg-white text-foreground hover:border-accent/50"
                          }`}
                        >
                          {termLabels[term]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* DP sub-options */}
              {paymentType === "dp" && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2">
                  <p className="text-xs font-medium text-accent">Pembayaran Selanjutnya Setelah DP</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["lunas-delivery", "lunas-net30", "lunas-net60", "cicil"] as const).map((opt) => {
                      const dpLabels: Record<string, { title: string; desc: string }> = {
                        "lunas-delivery": { title: "Pelunasan Setelah Pengiriman", desc: "Sisa dibayar saat barang tiba" },
                        "lunas-net30":    { title: "Pelunasan Net 30 Hari", desc: "Sisa lunas maks. 30 hari" },
                        "lunas-net60":    { title: "Pelunasan Net 60 Hari", desc: "Sisa lunas maks. 60 hari" },
                        "cicil":          { title: "Cicilan Bertahap", desc: "Sisa dibayar secara cicil" },
                      };
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setDpNext(dpNext === opt ? "" : opt)}
                          className={`flex flex-col gap-0.5 rounded-lg border-2 px-3 py-2.5 text-left transition-all ${
                            dpNext === opt
                              ? "border-accent bg-accent text-white"
                              : "border-border bg-white text-foreground hover:border-accent/50"
                          }`}
                        >
                          <span className="font-semibold text-[11px] leading-tight">{dpLabels[opt].title}</span>
                          <span className={`text-[10px] leading-tight ${dpNext === opt ? "text-white/80" : "text-muted-foreground"}`}>{dpLabels[opt].desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
    if (step === 3) return !!(customerForm.companyName && customerForm.customerName && customerForm.email && customerForm.phone && customerForm.origin && customerForm.destination);
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
