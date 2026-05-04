import { useState, useCallback, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Ship, Plane, Download, Upload, MapPin, Home,
  Package, Warehouse, Truck, FileCheck, Shield, FileText,
  Calculator, ArrowLeft, ArrowRight, ShoppingCart, CheckCircle2,
  Plus, Trash2,
} from "lucide-react";
import {
  CATEGORIES, CATEGORY_COLORS_DETAIL,
  type ServiceCategory, type CalculatorType,
} from "@/lib/services-data";
import { useListPortalServices } from "@workspace/api-client-react";
import { useCart } from "@/lib/logistic-cart";
import { useCart as useProductCart } from "@/lib/cart";
import { formatCurrency } from "@/lib/utils";
import { isAuthenticated } from "@/lib/auth";
import { AirportCombobox } from "@/components/AirportCombobox";
import { LocationCombobox, type GeoLocation } from "@/components/LocationCombobox";

const stripJasa = (name: string) => name.replace(/^Jasa\s+/i, "");

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Ship, Plane, Download, Upload, MapPin, Home,
  Package, Warehouse, Truck, FileCheck, Shield, FileText,
};

const CAT_TO_CALC: Record<string, CalculatorType> = {
  "Udara": "air_freight",
  "Laut": "sea_lcl",
  "Container": "sea_fcl",
  "Trucking": "trucking",
  "Pabean": "customs",
  "Handling": "generic",
  "Storage": "storage",
  "Document": "document",
  "Additional": "additional",
  "Freight Forwarding": "generic",
  "Lainnya": "generic",
};

const CAT_TO_SERVICE_CAT: Record<string, ServiceCategory> = {
  "Udara": "Freight",
  "Laut": "Freight",
  "Container": "Freight",
  "Trucking": "Trucking",
  "Pabean": "Customs",
  "Handling": "Handling",
  "Storage": "Storage",
  "Document": "Document",
  "Additional": "Additional",
  "Freight Forwarding": "Freight",
  "Lainnya": "Additional",
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

const VEHICLE_LIST = [
  { key: "CDE",                      label: "CDE",                      rateKey: "CDE"     },
  { key: "CDD",                      label: "CDD",                      rateKey: "CDD"     },
  { key: "Fuso",                     label: "Fuso",                     rateKey: "Fuso"    },
  { key: "Tronton",                  label: "Tronton",                  rateKey: "Wingbox" },
  { key: "Trailer Truck / Kontainer",label: "Trailer Truck / Kontainer",rateKey: "Trailer" },
] as const;

const VEHICLE_SUBTYPES: Record<string, string[]> = {
  "CDE":                       ["CDE Bak", "CDE Box"],
  "CDD":                       ["CDD Bak", "CDD Box"],
  "Fuso":                      ["Fuso Box (8 Tons)", "Fuso Box (10 Tons)", "Fuso Pickup (8 Tons)", "Fuso Pickup (10 Tons)"],
  "Tronton":                   ["Tronton Wing Box (18 Tons)", "Tronton Wing Box (22 Tons)", "Tronton Wing Box (25 Tons)", "Tronton Pickup (18 Tons)", "Tronton Pickup (22 Tons)", "Tronton Pickup (25 Tons)"],
  "Trailer Truck / Kontainer": ["Trailer 20 ft", "Trailer 40 ft", "Trailer Flatbed"],
};

const VEHICLE_CAPACITY: Record<string, string> = {
  "CDE":                       "Maks. kapasitas 2 Ton",
  "CDD":                       "Maks. kapasitas 5 Ton",
  "Fuso":                      "Maks. kapasitas 10 Ton",
  "Tronton":                   "Maks. kapasitas 25 Ton",
  "Trailer Truck / Kontainer": "Maks. kapasitas 40 ft",
};

type SubtypeSpec = {
  dims: string;
  volume: string;
  weight: string;
  note?: string;
  warning?: string;
};

const SUBTYPE_SPECS: Record<string, SubtypeSpec> = {
  "CDE Bak":                      { dims: "320 × 170 × 180 cm", volume: "9,8 m³", weight: "2,6 Ton", note: "Dimensi rata-rata, bisa sedikit berbeda." },
  "CDE Box":                      { dims: "320 × 170 × 170 cm", volume: "9,2 m³", weight: "2,2 Ton", note: "Dimensi rata-rata, bisa sedikit berbeda." },
  "CDD Bak":                      { dims: "440 × 200 × 200 cm", volume: "17,6 m³", weight: "5 Ton",  warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "CDD Box":                      { dims: "440 × 200 × 190 cm", volume: "16,7 m³", weight: "5 Ton",  warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Fuso Box (8 Tons)":            { dims: "620 × 235 × 235 cm", volume: "34,2 m³", weight: "8 Ton",  warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Fuso Box (10 Tons)":           { dims: "620 × 235 × 235 cm", volume: "34,2 m³", weight: "10 Ton", warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Fuso Pickup (8 Tons)":         { dims: "660 × 235 × 245 cm", volume: "38 m³",   weight: "8 Ton",  warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Fuso Pickup (10 Tons)":        { dims: "660 × 235 × 245 cm", volume: "38 m³",   weight: "10 Ton", warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Tronton Wing Box (18 Tons)":   { dims: "950 × 245 × 250 cm", volume: "58,2 m³", weight: "18 Ton", warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Tronton Wing Box (22 Tons)":   { dims: "950 × 245 × 250 cm", volume: "58,2 m³", weight: "22 Ton", warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Tronton Wing Box (25 Tons)":   { dims: "950 × 245 × 250 cm", volume: "58,2 m³", weight: "25 Ton", warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Tronton Pickup (18 Tons)":     { dims: "950 × 245 × 260 cm", volume: "60,5 m³", weight: "18 Ton", warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Tronton Pickup (22 Tons)":     { dims: "950 × 245 × 260 cm", volume: "60,5 m³", weight: "22 Ton", warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Tronton Pickup (25 Tons)":     { dims: "950 × 245 × 260 cm", volume: "60,5 m³", weight: "25 Ton", warning: "⚠ Akses jalan terbatas (Jakarta 06:00–22:00)" },
  "Trailer 20 ft":                { dims: "—", volume: "—", weight: "Maks. 25 Ton (termasuk container)", note: "Container tidak termasuk. Harus disiapkan sendiri." },
  "Trailer 40 ft":                { dims: "—", volume: "—", weight: "Maks. 30 Ton (termasuk container)", note: "Container tidak termasuk. Harus disiapkan sendiri." },
  "Trailer Flatbed":              { dims: "1200 × 240 × 240 cm", volume: "69 m³",  weight: "30 Ton", note: "Container tidak termasuk. Harus disiapkan sendiri." },
};

export default function JasaDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { addItem } = useCart();
  const { openCheckout } = useProductCart();
  const [state, setState] = useState<CalcState>({});
  const [airRows, setAirRows] = useState<AirRow[]>([newAirRow()]);
  const [added, setAdded] = useState(false);
  const [pickupGeo, setPickupGeo] = useState<GeoLocation | undefined>();
  const [destGeo, setDestGeo] = useState<GeoLocation | undefined>();
  const [calcDist, setCalcDist] = useState(false);
  const [truckingStep, setTruckingStep] = useState(1);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [truckingStops, setTruckingStops] = useState<Array<{ id: string; city: string }>>([]);

  const [pendingOrder, setPendingOrder] = useState<{ serviceId: number; productName: string } | null>(null);
  const [truckingRates, setTruckingRates] = useState<Record<string, { ratePerKm: number; loadingFee: number }>>({});

  useEffect(() => {
    fetch("/api/portal/trucking-rates")
      .then(r => r.ok ? r.json() as Promise<Record<string, { ratePerKm: number; loadingFee: number }>> : Promise.reject())
      .then(setTruckingRates)
      .catch(() => {/* fallback: empty, user can input manually */});
  }, []);

  // Trucking always uses Schedule
  useEffect(() => {
    setState(prev => ({ ...prev, serviceType: "Schedule" }));
  }, [params.id]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pendingJasaReview");
      if (raw) {
        const parsed = JSON.parse(raw) as { serviceId: number; productId: number; productName: string; qty?: number };
        if (String(parsed.serviceId) === params.id) {
          setPendingOrder({ serviceId: parsed.serviceId, productName: parsed.productName });
          // Prefill quantity into calculator form
          if (parsed.qty && parsed.qty >= 1) {
            const qtyStr = String(parsed.qty);
            // For air freight: set quantity in the first airRow
            setAirRows(prev => prev.map((r, i) => i === 0 ? { ...r, quantity: qtyStr } : r));
            // For other calculators (generic, storage, document): set state.quantity
            setState(prev => ({ ...prev, quantity: qtyStr }));
          }
        }
      }
    } catch { /* ignore */ }
  }, [params.id]);

  function confirmJasaAndCheckout() {
    sessionStorage.removeItem("pendingJasaReview");
    setPendingOrder(null);
    openCheckout();
  }

  const { data: servicesRaw, isLoading: servicesLoading } = useListPortalServices({
    query: { queryKey: ["listPortalServicesDetail"] },
  });
  const allServices = Array.isArray(servicesRaw) ? servicesRaw : [];

  const dbService = allServices.find((s) => String(s.id) === params.id);
  const primaryCat = (dbService?.categories ?? [])[0] ?? "";
  const serviceCategory: ServiceCategory = CAT_TO_SERVICE_CAT[primaryCat] ?? "Freight";
  const calculatorType: CalculatorType = CAT_TO_CALC[primaryCat] ?? "generic";

  const item = dbService
    ? {
        id: String(dbService.id),
        name: stripJasa(dbService.name),
        description: dbService.description ?? `Layanan ${stripJasa(dbService.name)} profesional`,
        category: serviceCategory,
        calculatorType,
      }
    : null;

  function set(key: string, val: string) {
    setState((prev) => ({ ...prev, [key]: val }));
  }

  const fetchDistance = useCallback(async (from: GeoLocation, to: GeoLocation) => {
    setCalcDist(true);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
      const res = await fetch(url);
      const data = await res.json() as { routes?: Array<{ distance: number }> };
      if (data.routes && data.routes.length > 0) {
        const km = Math.round(data.routes[0].distance / 1000);
        set("distance", String(km));
        toast({ title: `Jarak otomatis: ${km} km`, description: `${from.label.split(",")[0]} → ${to.label.split(",")[0]}` });
      }
    } catch {
      toast({ title: "Gagal menghitung jarak", description: "Isi jarak secara manual", variant: "destructive" });
    } finally {
      setCalcDist(false);
    }
  }, [toast]);

  const cat = CATEGORIES.find((c) => c.name === serviceCategory);
  const IconComp = cat ? (ICON_MAP[cat.icon] ?? Package) : Package;
  const colors = CATEGORY_COLORS_DETAIL[serviceCategory] ?? {
    bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700",
    header: "from-blue-900 to-blue-700",
  };

  if (servicesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Package className="h-12 w-12 text-muted-foreground animate-pulse" />
      </div>
    );
  }

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

  const subtotal = calcSubtotal(item.calculatorType, state, airRows);
  const ct = item.calculatorType;

  function setAirRow(id: string, field: keyof Omit<AirRow, "id">, val: string) {
    setAirRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: val } : r));
  }
  function addAirRow() { setAirRows((prev) => [...prev, newAirRow()]); }
  function removeAirRow(id: string) { setAirRows((prev) => prev.length > 1 ? prev.filter((r) => r.id !== id) : prev); }

  function addTruckingStop() {
    setTruckingStops(prev => [...prev, { id: crypto.randomUUID(), city: "" }]);
  }
  function removeTruckingStop(id: string) {
    setTruckingStops(prev => prev.filter(s => s.id !== id));
  }
  function updateTruckingStop(id: string, city: string) {
    setTruckingStops(prev => prev.map(s => s.id === id ? { ...s, city } : s));
  }

  function handlePickupChange(label: string, geo?: GeoLocation) {
    set("pickupCity", label);
    setPickupGeo(geo);
    if (geo && destGeo) fetchDistance(geo, destGeo);
  }

  function handleDestChange(label: string, geo?: GeoLocation) {
    set("destCity", label);
    setDestGeo(geo);
    if (geo && pickupGeo) fetchDistance(pickupGeo, geo);
  }

  function handleNextStep() {
    if (truckingStep === 1) {
      if (!state.vehicleType) {
        toast({ title: "Pilih kendaraan terlebih dahulu", variant: "destructive" });
        return;
      }
      if (!state.vehicleSubtype) {
        toast({ title: "Pilih tipe kendaraan", variant: "destructive" });
        return;
      }
      if (!state.pickupCity) {
        toast({ title: "Isi kota asal", variant: "destructive" });
        return;
      }
      if (!state.destCity) {
        toast({ title: "Isi kota tujuan", variant: "destructive" });
        return;
      }
      setVehicleOpen(false);
      setTruckingStep(2);
    } else if (truckingStep === 2) {
      const svc = state.serviceType || "Quick";
      if (svc !== "Quick") {
        if (!state.pickupDate) {
          toast({ title: "Pilih tanggal penjemputan", variant: "destructive" });
          return;
        }
        const today = new Date().toISOString().split("T")[0];
        if (state.pickupDate < today) {
          toast({ title: "Tanggal penjemputan tidak boleh sebelum hari ini", variant: "destructive" });
          return;
        }
        if (!state.pickupTime) {
          toast({ title: "Pilih jam penjemputan", variant: "destructive" });
          return;
        }
      }
      setTruckingStep(3);
    }
  }

  function handleAddToCart() {
    if (!item) return;
    if (subtotal <= 0) {
      toast({ title: "Isi data kalkulator terlebih dahulu", variant: "destructive" });
      return;
    }
    if (item.calculatorType === "trucking") {
      if (!state.vehicleType) {
        toast({ title: "Pilih Vehicle Type terlebih dahulu", variant: "destructive" });
        return;
      }
      if (!state.vehicleSubtype) {
        toast({ title: "Pilih tipe kendaraan", variant: "destructive" });
        return;
      }
      if ((state.serviceType || "Quick") !== "Quick") {
        if (!state.pickupDate) {
          toast({ title: "Tanggal penjemputan wajib diisi", variant: "destructive" });
          return;
        }
        const today = new Date().toISOString().split("T")[0];
        if (state.pickupDate < today) {
          toast({ title: "Tanggal penjemputan tidak boleh sebelum hari ini", variant: "destructive" });
          return;
        }
        if (!state.pickupTime) {
          toast({ title: "Jam penjemputan wajib diisi", variant: "destructive" });
          return;
        }
      }
    }
    addItem({
      category: item.category,
      serviceName: item.name,
      calculatorType: item.calculatorType,
      inputData: { ...state, ...(item.calculatorType === "air_freight" ? { airRows: JSON.stringify(airRows) } : {}), ...(item.calculatorType === "trucking" && truckingStops.length > 0 ? { stops: truckingStops.map(s => s.city).join(" → ") } : {}) },
      calculationResult: calcResult(item.calculatorType, state, airRows),
      subtotal,
    });
    setAdded(true);
    toast({ title: `${item.name} ditambahkan ke keranjang pesanan!` });
  }

  function requireAuthThenBook() {
    if (!isAuthenticated()) {
      setLocation("/register?returnTo=/book");
    } else {
      setLocation("/book");
    }
  }

  function handleProceed() {
    requireAuthThenBook();
  }

  const otherServices = allServices
    .filter((s) => {
      const sCat = (s.categories ?? [])[0] ?? "";
      return sCat === primaryCat && s.id !== dbService?.id;
    })
    .slice(0, 3)
    .map((s) => ({
      id: String(s.id),
      name: stripJasa(s.name),
      description: s.description ?? "",
      category: (CAT_TO_SERVICE_CAT[(s.categories ?? [])[0] ?? ""] ?? "Freight") as ServiceCategory,
      calculatorType: (CAT_TO_CALC[(s.categories ?? [])[0] ?? ""] ?? "generic") as CalculatorType,
    }));

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
            <div className={ct === "trucking" ? "" : "bg-white rounded-2xl border border-border shadow-sm overflow-hidden"}>
              {ct !== "trucking" && (
                <div className="border-b border-border px-6 py-4 flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-accent" />
                  <h2 className="text-lg font-bold">Kalkulator Estimasi Biaya</h2>
                  <span className="text-sm text-muted-foreground ml-1">— isi data untuk mendapatkan estimasi</span>
                </div>
              )}

              <div className={ct === "trucking" ? "flex justify-center" : "p-6 space-y-4"}>
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

                {ct === "trucking" && (
                  <div className="w-full max-w-[390px]">
                    <div className="bg-[#16A34A] rounded-2xl overflow-hidden shadow-xl">
                      {/* ── Stepper ── */}
                      <div className="flex items-center px-4 pt-4 pb-3">
                        {([{n:1,l:"Route"},{n:2,l:"Services"},{n:3,l:"Summary"}]).map((s, i, arr) => (
                          <div key={s.n} className="flex items-center flex-1 min-w-0">
                            <div className={`flex items-center gap-1.5 ${truckingStep >= s.n ? "text-white" : "text-green-300"}`}>
                              <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold flex-shrink-0 ${truckingStep >= s.n ? "bg-white text-[#16A34A]" : "border border-green-300 text-green-300"}`}>
                                {truckingStep > s.n ? "✓" : s.n}
                              </span>
                              <span className="text-xs font-medium whitespace-nowrap">{s.l}</span>
                            </div>
                            {i < arr.length - 1 && <div className={`flex-1 h-px mx-2 ${truckingStep > s.n ? "bg-white/60" : "bg-green-400/40"}`} />}
                          </div>
                        ))}
                      </div>

                      {/* ── Step 1: Route ── */}
                      {truckingStep === 1 && (
                        <div className="px-3 pb-5 space-y-2.5">
                          {/* Vehicle Dropdown */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setVehicleOpen(v => !v)}
                              className="w-full bg-white rounded-xl px-4 py-3 flex items-center gap-3 text-left shadow-sm"
                            >
                              <svg viewBox="0 0 64 22" className="w-10 h-5 flex-shrink-0" fill="#16A34A">
                                <rect x="0" y="6" width="13" height="11" rx="2"/>
                                <rect x="13" y="2" width="49" height="15" rx="2" opacity="0.8"/>
                                <circle cx="8" cy="20" r="2.5"/>
                                <circle cx="38" cy="20" r="2.5"/>
                                <circle cx="55" cy="20" r="2.5"/>
                              </svg>
                              <span className={`flex-1 text-sm font-medium ${state.vehicleType ? "text-gray-900" : "text-gray-400"}`}>
                                {state.vehicleType || "Pilih Kendaraan"}
                              </span>
                              <svg className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ${vehicleOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                            </button>
                            {vehicleOpen && (
                              <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white rounded-xl shadow-2xl z-30 overflow-hidden border border-gray-100">
                                {VEHICLE_LIST.map(v => {
                                  const isSel = state.vehicleType === v.key;
                                  const r = truckingRates[v.rateKey];
                                  return (
                                    <button
                                      key={v.key}
                                      type="button"
                                      onClick={() => {
                                        setState(prev => ({...prev, vehicleType: v.key, vehicleSubtype: "", trailerSize: "", ...(r ? {truckingRate: String(r.ratePerKm), loadingFee: String(r.loadingFee)} : {})}));
                                        setVehicleOpen(false);
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 text-left border-b border-gray-100 last:border-0 transition-colors"
                                    >
                                      <svg viewBox="0 0 44 22" className="w-8 h-4 flex-shrink-0" fill={isSel ? "#16A34A" : "#9CA3AF"}>
                                        <rect x="0" y="6" width="13" height="11" rx="2"/>
                                        <rect x="13" y="2" width="29" height="15" rx="2" opacity="0.8"/>
                                        <circle cx="8" cy="20" r="2.5"/><circle cx="32" cy="20" r="2.5"/><circle cx="40" cy="20" r="2.5"/>
                                      </svg>
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium ${isSel ? "text-[#16A34A]" : "text-gray-800"}`}>{v.label}</p>
                                        <p className={`text-[11px] ${isSel ? "text-[#16A34A]/70" : "text-gray-400"}`}>{VEHICLE_CAPACITY[v.key]}</p>
                                      </div>
                                      {isSel && <CheckCircle2 className="h-4 w-4 text-[#16A34A] flex-shrink-0"/>}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Vehicle Subtype grid */}
                          {state.vehicleType && VEHICLE_SUBTYPES[state.vehicleType] && (
                            <div className="grid grid-cols-2 gap-2">
                              {VEHICLE_SUBTYPES[state.vehicleType].map((sub, i) => {
                                const subtypes = VEHICLE_SUBTYPES[state.vehicleType!];
                                const isOdd = subtypes.length % 2 !== 0;
                                const isLast = i === subtypes.length - 1;
                                const isSelected = state.vehicleSubtype === sub;
                                return (
                                  <button
                                    key={sub}
                                    type="button"
                                    onClick={() => {
                                      const trailerMap: Record<string, string> = {
                                        "Trailer 20 ft": "20 ft",
                                        "Trailer 40 ft": "40 ft",
                                        "Trailer Flatbed": "Flatbed",
                                      };
                                      setState(prev => ({
                                        ...prev,
                                        vehicleSubtype: sub,
                                        trailerSize: trailerMap[sub] ?? "",
                                      }));
                                    }}
                                    className={`${isOdd && isLast ? "col-span-2" : ""} py-2.5 px-3 rounded-xl text-xs font-semibold border-2 transition-all flex items-center justify-between gap-1 ${
                                      isSelected
                                        ? "bg-white text-[#16A34A] border-white"
                                        : "bg-transparent text-white border-white/40 hover:border-white/70"
                                    }`}
                                  >
                                    <span className="flex-1 text-center leading-snug">{sub}</span>
                                    {isSelected && <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0"/>}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Subtype spec card */}
                          {state.vehicleSubtype && SUBTYPE_SPECS[state.vehicleSubtype] && (() => {
                            const sp = SUBTYPE_SPECS[state.vehicleSubtype!];
                            const isTrailer = state.vehicleSubtype.startsWith("Trailer");
                            return (
                              <div className="bg-white rounded-xl px-4 py-3 shadow-sm space-y-1.5">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-base">📦</span>
                                  <p className="text-xs font-semibold text-gray-700">Spesifikasi Kendaraan</p>
                                </div>
                                {sp.warning && (
                                  <p className="text-[11px] text-amber-600 font-medium bg-amber-50 rounded-lg px-2 py-1">{sp.warning}</p>
                                )}
                                {!isTrailer && sp.dims !== "—" && (
                                  <div className="flex items-baseline justify-between text-[11px]">
                                    <span className="text-gray-400">Dimensi (P×L×T)</span>
                                    <span className="font-medium text-gray-700">{sp.dims}</span>
                                  </div>
                                )}
                                {!isTrailer && sp.volume !== "—" && (
                                  <div className="flex items-baseline justify-between text-[11px]">
                                    <span className="text-gray-400">Volume</span>
                                    <span className="font-medium text-gray-700">{sp.volume}</span>
                                  </div>
                                )}
                                <div className="flex items-baseline justify-between text-[11px]">
                                  <span className="text-gray-400">Kapasitas</span>
                                  <span className="font-semibold text-[#16A34A]">{sp.weight}</span>
                                </div>
                                {sp.note && (
                                  <p className="text-[10px] text-gray-400 italic pt-0.5">{sp.note}</p>
                                )}
                              </div>
                            );
                          })()}

                          {/* Service type — Schedule with inline date/time */}
                          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-3">
                              <svg className="w-5 h-5 text-[#16A34A] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-gray-900">Schedule</p>
                                {state.pickupDate && state.pickupTime
                                  ? <p className="text-[11px] text-[#16A34A] font-medium">{state.pickupDate} · {state.pickupTime}</p>
                                  : <p className="text-[11px] text-gray-400">Pilih tanggal &amp; jam penjemputan</p>
                                }
                              </div>
                              {state.pickupDate && state.pickupTime && <CheckCircle2 className="h-4 w-4 text-[#16A34A] flex-shrink-0"/>}
                            </div>
                            <div className="border-t border-gray-100 px-4 pb-4 pt-3 grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1.5">Tanggal</label>
                                <Input
                                  type="date"
                                  min={new Date().toISOString().split("T")[0]}
                                  value={state.pickupDate || ""}
                                  onChange={e => set("pickupDate", e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1.5">Jam</label>
                                <Input
                                  type="time"
                                  value={state.pickupTime || ""}
                                  onChange={e => set("pickupTime", e.target.value)}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Route Card */}
                          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                            <div className="flex items-stretch">
                              {/* Connector line column */}
                              <div className="flex flex-col items-center pt-4 pb-4 pl-4 pr-2 flex-shrink-0">
                                <div className="w-3 h-3 rounded-full bg-[#16A34A] ring-2 ring-[#16A34A]/20 flex-shrink-0"/>
                                <div className="flex-1 w-0.5 bg-gray-200 my-1"/>
                                {truckingStops.map((_s, i) => (
                                  <div key={i} className="flex flex-col items-center w-full">
                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-400 ring-2 ring-blue-100 flex-shrink-0"/>
                                    <div className="flex-1 w-0.5 bg-gray-200 my-1"/>
                                  </div>
                                ))}
                                <div className="w-3 h-3 rounded-full bg-amber-400 ring-2 ring-amber-200 flex-shrink-0"/>
                              </div>
                              {/* Inputs column */}
                              <div className="flex-1 min-w-0 divide-y divide-gray-100">
                                <div className="py-2 pr-3">
                                  <LocationCombobox value={state.pickupCity || ""} onChange={handlePickupChange} placeholder="Kota asal..." countryCode="id"/>
                                </div>
                                {truckingStops.map((stop, i) => (
                                  <div key={stop.id} className="py-2 pr-3 flex items-center gap-1">
                                    <div className="flex-1 min-w-0">
                                      <LocationCombobox
                                        value={stop.city}
                                        onChange={city => updateTruckingStop(stop.id, city)}
                                        placeholder={`Kota stop ${i + 1}...`}
                                        countryCode="id"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeTruckingStop(stop.id)}
                                      className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-400 flex items-center justify-center transition-colors"
                                      aria-label="Hapus stop"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                  </div>
                                ))}
                                <div className="py-2 pr-3">
                                  <LocationCombobox value={state.destCity || ""} onChange={handleDestChange} placeholder="Kota tujuan..." countryCode="id"/>
                                </div>
                              </div>
                            </div>
                            <div className="border-t border-gray-100 px-4 py-2.5">
                              <button
                                type="button"
                                onClick={addTruckingStop}
                                className="flex items-center gap-1.5 text-[#16A34A] text-sm font-semibold hover:text-[#15803d] transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5"/>
                                Add Stop
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Step 2: Services ── */}
                      {truckingStep === 2 && (
                        <div className="px-3 pb-5 space-y-2.5">
                          <div className="bg-white rounded-xl p-4 space-y-3 shadow-sm">
                            <p className="text-sm font-semibold text-gray-700">
                              Jadwal Penjemputan
                              {(state.serviceType || "Quick") === "Quick" && <span className="text-xs text-gray-400 font-normal ml-2">opsional</span>}
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1">Tanggal</label>
                                <Input type="date" min={new Date().toISOString().split("T")[0]} value={state.pickupDate || ""} onChange={e => set("pickupDate", e.target.value)}/>
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1">Jam</label>
                                <Input type="time" value={state.pickupTime || ""} onChange={e => set("pickupTime", e.target.value)}/>
                              </div>
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-semibold text-gray-700">Jarak (km)</p>
                              {calcDist && <span className="text-xs text-[#16A34A] flex items-center gap-1"><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Menghitung...</span>}
                              {!calcDist && pickupGeo && destGeo && state.distance && <span className="text-xs text-[#16A34A]">✓ Otomatis</span>}
                            </div>
                            <Input type="number" placeholder="0" value={state.distance || ""} onChange={e => set("distance", e.target.value)} disabled={calcDist}/>
                          </div>
                          <div className="bg-white rounded-xl p-4 space-y-3 shadow-sm">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-500 font-medium">Trucking Rate (IDR/km)</label>
                                {state.vehicleType && truckingRates[state.vehicleType === "Trailer Truck" ? "Trailer" : state.vehicleType] && <span className="text-xs text-[#16A34A]">✓ dari admin</span>}
                              </div>
                              <Input type="number" placeholder="0" value={state.truckingRate || ""} onChange={e => set("truckingRate", e.target.value)}/>
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-500 font-medium">Loading Fee (IDR)</label>
                                {state.vehicleType && truckingRates[state.vehicleType === "Trailer Truck" ? "Trailer" : state.vehicleType] && <span className="text-xs text-[#16A34A]">✓ dari admin</span>}
                              </div>
                              <Input type="number" placeholder="0" value={state.loadingFee || ""} onChange={e => set("loadingFee", e.target.value)}/>
                            </div>
                          </div>
                          {(parseFloat(state.distance)||0) > 0 && (parseFloat(state.truckingRate)||0) > 0 && (
                            <div className="bg-white/15 rounded-xl px-3 py-2.5 text-white text-xs space-y-0.5">
                              <p className="font-semibold text-sm mb-1">Estimasi Biaya:</p>
                              <p>{parseFloat(state.distance)||0} km × {formatCurrency(parseFloat(state.truckingRate)||0)}/km = {formatCurrency((parseFloat(state.distance)||0)*(parseFloat(state.truckingRate)||0))}</p>
                              {(parseFloat(state.loadingFee)||0) > 0 && <p>Loading Fee: +{formatCurrency(parseFloat(state.loadingFee)||0)}</p>}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Step 3: Summary ── */}
                      {truckingStep === 3 && (
                        <div className="px-3 pb-5 space-y-2.5">
                          <div className="bg-white rounded-xl p-4 shadow-sm">
                            <p className="font-semibold text-gray-900 text-sm mb-2">Ringkasan Pesanan</p>
                            <div className="divide-y divide-gray-100 text-sm">
                              <div className="flex justify-between py-2 gap-2">
                                <span className="text-gray-500 flex-shrink-0">Kendaraan</span>
                                <span className="font-medium text-right text-xs leading-snug">{state.vehicleSubtype || state.vehicleType || "-"}</span>
                              </div>
                              <div className="flex justify-between py-2">
                                <span className="text-gray-500">Layanan</span>
                                <span className="font-medium">{state.serviceType || "Quick"}</span>
                              </div>
                              <div className="flex items-start justify-between py-2 gap-2">
                                <span className="text-gray-500 flex-shrink-0">Rute</span>
                                <span className="font-medium text-right text-xs leading-snug">{(state.pickupCity||"").split(",")[0]} → {(state.destCity||"").split(",")[0]}</span>
                              </div>
                              {state.pickupDate && (
                                <div className="flex justify-between py-2">
                                  <span className="text-gray-500">Penjemputan</span>
                                  <span className="font-medium text-xs">{state.pickupDate} {state.pickupTime}</span>
                                </div>
                              )}
                              <div className="flex justify-between py-2">
                                <span className="text-gray-500">Jarak</span>
                                <span className="font-medium">{state.distance || 0} km</span>
                              </div>
                            </div>
                          </div>
                          {subtotal > 0 ? (
                            <div className="bg-white rounded-xl p-4 shadow-sm space-y-1.5 text-sm">
                              <p className="font-semibold text-gray-900">Rincian Biaya</p>
                              <div className="flex justify-between text-gray-500">
                                <span>{parseFloat(state.distance)||0} km × {formatCurrency(parseFloat(state.truckingRate)||0)}/km</span>
                                <span>{formatCurrency((parseFloat(state.distance)||0)*(parseFloat(state.truckingRate)||0))}</span>
                              </div>
                              {(parseFloat(state.loadingFee)||0) > 0 && (
                                <div className="flex justify-between text-gray-500">
                                  <span>Loading Fee</span>
                                  <span>{formatCurrency(parseFloat(state.loadingFee)||0)}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-100 pt-2">
                                <span>Total Estimasi</span>
                                <span className="text-[#16A34A] text-base">{formatCurrency(subtotal)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white/15 rounded-xl p-3 text-white text-sm text-center space-y-2">
                              <p>Isi jarak dan rate untuk melihat estimasi biaya.</p>
                              <button type="button" onClick={() => setTruckingStep(2)} className="text-xs underline">← Kembali ke Services</button>
                            </div>
                          )}
                          {added && (
                            <div className="bg-white rounded-xl p-3.5 flex items-center gap-2 shadow-sm">
                              <CheckCircle2 className="h-5 w-5 text-[#16A34A] flex-shrink-0"/>
                              <p className="text-sm font-medium text-gray-800">{item.name} berhasil ditambahkan ke pesanan!</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

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

                {ct !== "trucking" && (
                  <>
                    <Separator />

                    <div className={`rounded-xl p-4 flex items-center justify-between ${subtotal > 0 ? `${colors.bg} border ${colors.text.replace("text", "border").replace("700", "200")}` : "bg-muted"}`}>
                      <div>
                        <p className="text-sm text-muted-foreground">Estimasi Subtotal</p>
                        <p className={`text-2xl font-bold ${subtotal > 0 ? colors.text : "text-foreground"}`}>
                          {subtotal > 0 ? formatCurrency(subtotal) : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 italic">
                          Harga estimasi, final dikonfirmasi tim kami
                        </p>
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
                  </>
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
                  {ct === "trucking"
                    ? <span className="font-semibold text-green-700">Sesuai Kalkulasi Jarak</span>
                    : <span className="font-semibold text-amber-600">Negosiasi / Quotation</span>
                  }
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimasi</span>
                  <span className="font-semibold">{subtotal > 0 ? formatCurrency(subtotal) : "—"}</span>
                </div>
              </div>
              <Button variant="outline" className="w-full gap-2 mt-2" onClick={requireAuthThenBook}>
                <ShoppingCart className="h-4 w-4" />
                Lihat Keranjang Pesanan
              </Button>
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

      {/* Sticky Next / Add-to-Cart button for trucking */}
      {ct === "trucking" && !pendingOrder && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#166534] px-4 pt-3 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
          <div className="max-w-[390px] mx-auto">
            {!added ? (
              truckingStep < 3 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full bg-white text-[#166534] py-4 rounded-xl font-bold text-base shadow-md hover:bg-gray-50 transition-colors"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={subtotal <= 0}
                  className="w-full bg-white text-[#166534] py-4 rounded-xl font-bold text-base shadow-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="h-5 w-5" />
                  Tambahkan ke Pesanan
                </button>
              )
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setAdded(false); setState({}); setTruckingStep(1); setVehicleOpen(false); setTruckingStops([]); }}
                  className="py-3.5 rounded-xl border-2 border-white/50 text-white font-semibold text-sm hover:bg-white/10 transition-colors"
                >
                  Hitung Ulang
                </button>
                <button
                  type="button"
                  onClick={handleProceed}
                  className="py-3.5 rounded-xl bg-white text-[#166534] font-bold text-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  Lanjut Pesan <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending-order confirm banner */}
      {pendingOrder && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-primary/20 shadow-[0_-4px_24px_rgba(0,0,0,0.10)]">
          <div className="container max-w-4xl px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Layanan ini dipilih sebagai pengiriman</p>
              <p className="text-xs text-muted-foreground truncate">
                Pesanan: <span className="font-medium text-foreground">{pendingOrder.productName}</span>
                {" · "}Pastikan layanan ini sesuai sebelum melanjutkan.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  sessionStorage.removeItem("pendingJasaReview");
                  setPendingOrder(null);
                }}
              >
                Batal
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={confirmJasaAndCheckout}
              >
                <CheckCircle2 className="h-4 w-4" />
                Konfirmasi &amp; Lanjutkan Pesanan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
