import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/lib/logistic-cart";
import {
  ArrowLeft, Building2, Truck, Plane, Ship, Package,
  FileText, MapPin, Clock, Tag, CheckCircle2, ShoppingCart,
  Calculator, ChevronRight, Info,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CatalogDetail {
  id: number;
  vendorId: number;
  vendorName: string | null;
  templateKind: string | null;
  categoryKey: string | null;
  serviceType: string | null;
  name: string;
  description: string | null;
  kategori: string | null;
  subcategory: string | null;
  specValues: unknown;
  templateSnapshot: unknown;
  priceSell: number | null;
  currency: string;
  unit: string | null;
  moq: number | null;
  stockStatus: string | null;
  leadTime: string | null;
  location: string | null;
  origin: string | null;
  documents: unknown;
  publishedAt: string | null;
  resolvedCategory?: string | null;
  resolvedCategoryLabel?: string | null;
  media?: Array<{
    id: number;
    mediaType: string;
    fileUrl: string | null;
    externalUrl: string | null;
    thumbnailUrl: string | null;
    isPrimary: boolean;
    title: string | null;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(v: number, currency = "IDR") {
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(v);
  }
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
}

function resolveServiceType(item: CatalogDetail): string {
  const raw = item.resolvedCategory ?? item.serviceType ?? item.kategori ?? item.categoryKey ?? "";
  const n = raw.toLowerCase().trim().replace(/\s+/g, "_");
  const MAP: Record<string, string> = {
    trucking: "trucking", truck: "trucking", land_freight: "trucking", darat: "trucking",
    sea_freight: "sea_freight", sea_fcl: "sea_freight", sea_lcl: "sea_freight", fcl: "sea_freight", lcl: "sea_freight", laut: "sea_freight",
    air_freight: "air_freight", udara: "air_freight",
    ppjk: "ppjk", customs: "ppjk", pabean: "ppjk",
    handling: "handling", warehouse: "handling", gudang: "handling",
    document: "document", dokumen: "document",
  };
  return MAP[n] ?? MAP[n.replace(/_/g, " ")] ?? "general";
}

const CATEGORY_LABELS: Record<string, string> = {
  trucking: "Trucking",
  sea_freight: "Sea Freight",
  air_freight: "Air Freight",
  ppjk: "PPJK / Customs",
  handling: "Handling",
  document: "Document",
  general: "Layanan",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  trucking:   <Truck className="h-5 w-5 text-white" />,
  sea_freight:<Ship className="h-5 w-5 text-white" />,
  air_freight:<Plane className="h-5 w-5 text-white" />,
  ppjk:       <FileText className="h-5 w-5 text-white" />,
  handling:   <Package className="h-5 w-5 text-white" />,
  document:   <FileText className="h-5 w-5 text-white" />,
  general:    <Truck className="h-5 w-5 text-white" />,
};

// ── SpecGrid ───────────────────────────────────────────────────────────────────

function SpecGrid({ specValues, templateSnapshot }: { specValues: unknown; templateSnapshot: unknown }) {
  const specs = specValues && typeof specValues === "object" ? specValues as Record<string, unknown> : {};
  const snapshot = templateSnapshot && typeof templateSnapshot === "object" ? templateSnapshot as Record<string, unknown> : {};

  const fields: Array<{ key: string; label: string; type?: string; section?: string }> = [];
  if (Array.isArray(snapshot["customFields"])) {
    fields.push(...(snapshot["customFields"] as typeof fields));
  } else if (Array.isArray(snapshot["fields"])) {
    (snapshot["fields"] as typeof fields)
      .filter((f) => f.section === "quotation" || f.section === "both" || !f.section)
      .forEach((f) => fields.push(f));
  }

  const filled = fields.filter(
    (f) => f.type !== "textarea" && specs[f.key] !== undefined && specs[f.key] !== null && String(specs[f.key]).trim() !== "",
  );
  if (filled.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Spesifikasi Layanan</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {filled.map((f) => (
          <div key={f.key} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
            <div className="text-[10px] text-slate-400 font-semibold mb-0.5">{f.label}</div>
            <div className="text-[13px] font-bold text-slate-800">{String(specs[f.key])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Calculators ────────────────────────────────────────────────────────────────

interface CalcResult {
  inputs: Record<string, unknown>;
  chargeableQty: number;
  chargeableUnit: string;
  subtotal: number;
}

// Trucking
function TruckingCalc({ item, onChange }: { item: CatalogDetail; onChange: (r: CalcResult | null) => void }) {
  const [pickupCity, setPickupCity] = useState("");
  const [destCity, setDestCity] = useState("");
  const [truckType, setTruckType] = useState("");
  const [qty, setQty] = useState(1);
  const [extraFee, setExtraFee] = useState(0);

  const snap = item.templateSnapshot && typeof item.templateSnapshot === "object" ? item.templateSnapshot as Record<string, unknown> : {};
  const truckOptions: string[] = Array.isArray(snap["truckTypes"]) ? snap["truckTypes"] as string[] : [];

  function recalc(p: { pickupCity?: string; destCity?: string; truckType?: string; qty?: number; extraFee?: number }) {
    const q = p.qty ?? qty;
    const ef = p.extraFee ?? extraFee;
    if (!item.priceSell) { onChange(null); return; }
    const subtotal = item.priceSell * q + ef;
    onChange({
      inputs: { pickupCity: p.pickupCity ?? pickupCity, destCity: p.destCity ?? destCity, truckType: p.truckType ?? truckType, qty: q, extraFee: ef },
      chargeableQty: q,
      chargeableUnit: item.unit ?? "trip",
      subtotal,
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Kota Asal <span className="text-red-400">*</span></Label>
          <Input value={pickupCity} onChange={(e) => { setPickupCity(e.target.value); recalc({ pickupCity: e.target.value }); }}
            placeholder="Jakarta" className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Kota Tujuan <span className="text-red-400">*</span></Label>
          <Input value={destCity} onChange={(e) => { setDestCity(e.target.value); recalc({ destCity: e.target.value }); }}
            placeholder="Surabaya" className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
      </div>
      {truckOptions.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Jenis Truk</Label>
          <select value={truckType} onChange={(e) => { setTruckType(e.target.value); recalc({ truckType: e.target.value }); }}
            className="w-full h-9 rounded-xl border border-slate-200 text-[13px] px-3 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400">
            <option value="">Pilih jenis truk…</option>
            {truckOptions.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Jumlah Trip</Label>
          <Input type="number" min={1} value={qty}
            onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setQty(v); recalc({ qty: v }); }}
            className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Biaya Bongkar/Muat (opsional)</Label>
          <Input type="number" min={0} value={extraFee || ""}
            placeholder="0"
            onChange={(e) => { const v = Number(e.target.value) || 0; setExtraFee(v); recalc({ extraFee: v }); }}
            className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
      </div>
    </div>
  );
}

// Sea Freight
function SeaFreightCalc({ item, onChange }: { item: CatalogDetail; onChange: (r: CalcResult | null) => void }) {
  const [originPort, setOriginPort] = useState("");
  const [destPort, setDestPort] = useState("");
  const [containerType, setContainerType] = useState("20ft");
  const [qty, setQty] = useState(1);
  const [cbm, setCbm] = useState<number | "">(0);

  const isLCL = (item.serviceType ?? item.kategori ?? "").toLowerCase().includes("lcl");

  function recalc(p: { originPort?: string; destPort?: string; containerType?: string; qty?: number; cbm?: number | "" }) {
    const q = p.qty ?? qty;
    const v = p.cbm ?? cbm;
    const chargeableQty = isLCL ? (Number(v) || 0) : q;
    if (!item.priceSell) { onChange(null); return; }
    onChange({
      inputs: { originPort: p.originPort ?? originPort, destPort: p.destPort ?? destPort, containerType: p.containerType ?? containerType, qty: q, cbm: v },
      chargeableQty,
      chargeableUnit: isLCL ? "CBM" : (p.containerType ?? containerType),
      subtotal: item.priceSell * chargeableQty,
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Pelabuhan Asal <span className="text-red-400">*</span></Label>
          <Input value={originPort} onChange={(e) => { setOriginPort(e.target.value); recalc({ originPort: e.target.value }); }}
            placeholder="Tanjung Priok" className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Pelabuhan Tujuan <span className="text-red-400">*</span></Label>
          <Input value={destPort} onChange={(e) => { setDestPort(e.target.value); recalc({ destPort: e.target.value }); }}
            placeholder="Tanjung Perak" className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
      </div>
      {!isLCL && (
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Tipe Kontainer</Label>
          <select value={containerType} onChange={(e) => { setContainerType(e.target.value); recalc({ containerType: e.target.value }); }}
            className="w-full h-9 rounded-xl border border-slate-200 text-[13px] px-3 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400">
            {["20ft", "40ft", "40HC", "45ft"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      {isLCL ? (
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Volume (CBM) <span className="text-red-400">*</span></Label>
          <Input type="number" min={0.1} step={0.1} value={cbm}
            placeholder="0.0"
            onChange={(e) => { const v = e.target.value === "" ? "" : Number(e.target.value); setCbm(v); recalc({ cbm: v }); }}
            className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Jumlah Kontainer</Label>
          <Input type="number" min={1} value={qty}
            onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setQty(v); recalc({ qty: v }); }}
            className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
      )}
    </div>
  );
}

// Air Freight
function AirFreightCalc({ item, onChange }: { item: CatalogDetail; onChange: (r: CalcResult | null) => void }) {
  const [originAirport, setOriginAirport] = useState("");
  const [destAirport, setDestAirport] = useState("");
  const [grossWeight, setGrossWeight] = useState<number | "">(0);
  const [length, setLength] = useState<number | "">(0);
  const [width, setWidth] = useState<number | "">(0);
  const [height, setHeight] = useState<number | "">(0);

  function computeVolumeWeight(l: number | "", w: number | "", h: number | "") {
    const lv = Number(l) || 0;
    const wv = Number(w) || 0;
    const hv = Number(h) || 0;
    return (lv * wv * hv) / 6000;
  }

  function recalc(p: { originAirport?: string; destAirport?: string; grossWeight?: number | ""; length?: number | ""; width?: number | ""; height?: number | "" }) {
    const gw = Number(p.grossWeight ?? grossWeight) || 0;
    const vw = computeVolumeWeight(p.length ?? length, p.width ?? width, p.height ?? height);
    const chargeable = Math.max(gw, vw);
    if (!item.priceSell || chargeable <= 0) { onChange(null); return; }
    onChange({
      inputs: { originAirport: p.originAirport ?? originAirport, destAirport: p.destAirport ?? destAirport, grossWeight: gw, volumeWeight: Math.round(vw * 100) / 100, chargeableWeight: Math.round(chargeable * 100) / 100 },
      chargeableQty: Math.round(chargeable * 100) / 100,
      chargeableUnit: "kg",
      subtotal: item.priceSell * chargeable,
    });
  }

  const vw = computeVolumeWeight(length, width, height);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Bandara Asal <span className="text-red-400">*</span></Label>
          <Input value={originAirport} onChange={(e) => { setOriginAirport(e.target.value); recalc({ originAirport: e.target.value }); }}
            placeholder="CGK" className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-600">Bandara Tujuan <span className="text-red-400">*</span></Label>
          <Input value={destAirport} onChange={(e) => { setDestAirport(e.target.value); recalc({ destAirport: e.target.value }); }}
            placeholder="SUB" className="h-9 text-[13px] rounded-xl border-slate-200" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] font-semibold text-slate-600">Berat Kotor (kg) <span className="text-red-400">*</span></Label>
        <Input type="number" min={0.1} step={0.1} value={grossWeight} placeholder="0.0"
          onChange={(e) => { const v = e.target.value === "" ? "" : Number(e.target.value); setGrossWeight(v); recalc({ grossWeight: v }); }}
          className="h-9 text-[13px] rounded-xl border-slate-200" />
      </div>
      <div>
        <Label className="text-[11px] font-semibold text-slate-600 mb-1.5 block">Dimensi untuk Volume Weight (cm, opsional)</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "P", val: length, set: setLength, key: "length" as const },
            { label: "L", val: width, set: setWidth, key: "width" as const },
            { label: "T", val: height, set: setHeight, key: "height" as const },
          ].map(({ label, val, set, key }) => (
            <div key={key} className="space-y-1">
              <Label className="text-[10px] text-slate-400">{label} (cm)</Label>
              <Input type="number" min={0} step={1} value={val} placeholder="0"
                onChange={(e) => {
                  const v = e.target.value === "" ? "" : Number(e.target.value);
                  set(v);
                  recalc({ [key]: v });
                }}
                className="h-8 text-[12px] rounded-xl border-slate-200" />
            </div>
          ))}
        </div>
        {vw > 0 && (
          <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Volume weight: {vw.toFixed(2)} kg
          </p>
        )}
      </div>
    </div>
  );
}

// PPJK / Customs
function PpjkCalc({ item, onChange }: { item: CatalogDetail; onChange: (r: CalcResult | null) => void }) {
  const [shipmentType, setShipmentType] = useState("import");
  const [docCount, setDocCount] = useState(1);
  const [hasPib, setHasPib] = useState(false);

  function recalc(p: { shipmentType?: string; docCount?: number; hasPib?: boolean }) {
    const d = p.docCount ?? docCount;
    if (!item.priceSell) { onChange(null); return; }
    onChange({
      inputs: { shipmentType: p.shipmentType ?? shipmentType, docCount: d, hasPib: p.hasPib ?? hasPib },
      chargeableQty: d,
      chargeableUnit: "dokumen",
      subtotal: item.priceSell * d,
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-[11px] font-semibold text-slate-600">Jenis Shipment</Label>
        <select value={shipmentType} onChange={(e) => { setShipmentType(e.target.value); recalc({ shipmentType: e.target.value }); }}
          className="w-full h-9 rounded-xl border border-slate-200 text-[13px] px-3 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400">
          <option value="import">Import</option>
          <option value="export">Export</option>
          <option value="lokal">Lokal</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] font-semibold text-slate-600">Jumlah Dokumen</Label>
        <Input type="number" min={1} value={docCount}
          onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setDocCount(v); recalc({ docCount: v }); }}
          className="h-9 text-[13px] rounded-xl border-slate-200" />
      </div>
      <div className="flex items-center justify-between py-1">
        <Label className="text-[12px] font-semibold text-slate-600">Termasuk PIB / PEB</Label>
        <Switch checked={hasPib} onCheckedChange={(v) => { setHasPib(v); recalc({ hasPib: v }); }} />
      </div>
    </div>
  );
}

// Handling
function HandlingCalc({ item, onChange }: { item: CatalogDetail; onChange: (r: CalcResult | null) => void }) {
  const [qty, setQty] = useState(1);

  function recalc(q: number) {
    if (!item.priceSell) { onChange(null); return; }
    onChange({ inputs: { qty: q }, chargeableQty: q, chargeableUnit: item.unit ?? "unit", subtotal: item.priceSell * q });
  }

  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-slate-600">Kuantitas ({item.unit ?? "unit"})</Label>
      <Input type="number" min={1} value={qty}
        onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setQty(v); recalc(v); }}
        className="h-9 text-[13px] rounded-xl border-slate-200" />
    </div>
  );
}

// General / Fallback
function GeneralCalc({ item, onChange }: { item: CatalogDetail; onChange: (r: CalcResult | null) => void }) {
  const [qty, setQty] = useState(1);

  function recalc(q: number) {
    if (!item.priceSell) { onChange(null); return; }
    onChange({ inputs: { qty: q }, chargeableQty: q, chargeableUnit: item.unit ?? "unit", subtotal: item.priceSell * q });
  }

  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-slate-600">Kuantitas ({item.unit ?? "unit"})</Label>
      <Input type="number" min={1} value={qty}
        onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); setQty(v); recalc(v); }}
        className="h-9 text-[13px] rounded-xl border-slate-200" />
    </div>
  );
}

// ── Summary row ────────────────────────────────────────────────────────────────

function SummaryRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${muted ? "text-slate-400" : ""}`}>
      <span className={`text-[12px] ${bold ? "font-bold text-slate-800" : "text-slate-600"}`}>{label}</span>
      <span className={`text-[12px] tabular-nums ${bold ? "font-bold text-slate-800" : "font-semibold text-slate-700"}`}>{value}</span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function JasaVendorDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { addItem } = useCart();

  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [withTax, setWithTax] = useState(false);
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  const qc = useQueryClient();
  const queryKey = ["jasa-vendor-detail", id];

  const { data: item, isLoading, isError } = useQuery<CatalogDetail>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(`/api/portal/marketplace/${id}`);
      if (!r.ok) throw new Error("not_found");
      return r.json();
    },
    enabled: !!id && !isNaN(Number(id)),
    retry: false,
  });

  // Realtime: watch vendor_catalog_items untuk item ini (dan semua item vendor yg sama)
  const handleCatalogChange = useCallback((payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
    const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
    if (row["template_kind"] !== "service" && row["templateKind"] !== "service") return;
    if (import.meta.env.DEV) {
      console.log("[Realtime] vendor_catalog_items service changed, refetch marketplace", payload.eventType, row["id"]);
    }
    qc.invalidateQueries({ queryKey });
  }, [qc, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!supabase || !id) return;
    const channel = supabase
      .channel(`jasa-vendor-detail-catalog-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vendor_catalog_items" },
        handleCatalogChange,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "vendor_catalog_items" },
        handleCatalogChange,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "vendor_catalog_items" },
        handleCatalogChange,
      )
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [id, handleCatalogChange]);

  const serviceType = useMemo(() => item ? resolveServiceType(item) : "general", [item]);
  const categoryLabel = CATEGORY_LABELS[serviceType] ?? "Layanan";
  const categoryIcon = CATEGORY_ICONS[serviceType] ?? <Truck className="h-5 w-5 text-white" />;

  const taxRate = 0.11;
  const tax = calcResult ? Math.round(calcResult.subtotal * taxRate) : 0;
  const total = calcResult ? calcResult.subtotal + (withTax ? tax : 0) : 0;

  function handleAddToCart() {
    if (!item || !calcResult) return;
    addItem({
      category: categoryLabel,
      serviceName: item.name,
      calculatorType: serviceType,
      inputData: {
        itemSource: "vendor_catalog_item",
        vendorCatalogItemId: item.id,
        serviceType: item.serviceType ?? serviceType,
        vendorId: item.vendorId,
        name: item.name,
        priceSell: item.priceSell,
        currency: item.currency,
        unit: item.unit,
        calculationInput: calcResult.inputs,
      },
      calculationResult: {
        chargeableQty: calcResult.chargeableQty,
        chargeableUnit: calcResult.chargeableUnit,
        subtotal: calcResult.subtotal,
        tax: withTax ? tax : 0,
        total,
      },
      subtotal: total,
    });
    setAdded(true);
    toast({
      title: "Ditambahkan ke pesanan",
      description: `${item.name} (${calcResult.chargeableQty} ${calcResult.chargeableUnit})`,
    });
    setTimeout(() => setAdded(false), 3000);
  }

  function handleBack() {
    window.history.length > 1 ? window.history.back() : setLocation("/marketplace?kind=service");
  }

  // ── Loading / Error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
          <p className="text-[13px] text-slate-400 font-semibold">Memuat detail layanan…</p>
        </div>
      </div>
    );
  }

  if (isError || !item || item.templateKind !== "service") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-slate-50 px-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Truck className="h-8 w-8 text-slate-300" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Layanan tidak ditemukan</h2>
          <p className="text-[13px] text-slate-500">Item ini tidak tersedia atau belum dipublikasikan.</p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => setLocation("/marketplace?kind=service")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Kembali ke Marketplace
        </Button>
      </div>
    );
  }

  const allMedia = item.media ?? [];
  const primaryImage = activeImage ?? (allMedia.find((m) => m.isPrimary && m.mediaType === "image")?.fileUrl ?? allMedia.find((m) => m.mediaType === "image")?.fileUrl ?? null);
  const thumbs = allMedia.filter((m) => m.mediaType === "image" && m.fileUrl);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 pb-24">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #0B3D6B 0%, #0D6EBF 55%, #1E9FE8 100%)", paddingTop: "clamp(20px,3vw,32px)", paddingBottom: "clamp(16px,2.5vw,24px)", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="max-w-5xl mx-auto px-4 md:px-8 relative">
          <button onClick={handleBack}
            className="inline-flex items-center gap-1.5 mb-4 text-[12px] font-semibold rounded-lg px-3 py-1.5"
            style={{ color: "rgba(255,255,255,0.85)", background: "rgba(255,255,255,0.10)", border: "1.5px solid rgba(255,255,255,0.20)" }}>
            <ArrowLeft className="h-3.5 w-3.5" />Kembali
          </button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.25)" }}>
              {categoryIcon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.90)" }}>
                  {categoryLabel}
                </span>
                {item.stockStatus === "available" && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(34,197,94,0.20)", color: "rgba(255,255,255,0.95)", border: "1px solid rgba(34,197,94,0.35)" }}>
                    Tersedia
                  </span>
                )}
              </div>
              <h1 className="text-white font-extrabold leading-tight" style={{ fontSize: "clamp(18px,2.5vw,28px)", textShadow: "0 2px 12px rgba(0,0,0,0.20)" }}>
                {item.name}
              </h1>
              {item.vendorName && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Building2 className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.65)" }} />
                  <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.80)" }}>{item.vendorName}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: detail ────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Image gallery */}
            {primaryImage && (
              <div className="rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-sm" style={{ height: 260 }}>
                <img src={primaryImage} alt={item.name} className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none"; }} />
              </div>
            )}
            {thumbs.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {thumbs.map((m) => (
                  <button key={m.id} onClick={() => setActiveImage(m.fileUrl)}
                    className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${activeImage === m.fileUrl || (!activeImage && m.isPrimary) ? "border-sky-500 shadow-md" : "border-transparent"}`}>
                    <img src={m.fileUrl!} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Price card */}
            {item.priceSell != null && (
              <div className="rounded-2xl px-5 py-4 border" style={{ background: "linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 100%)", borderColor: "rgba(59,130,246,0.25)" }}>
                <p className="text-[11px] font-semibold text-sky-600 uppercase tracking-wider mb-0.5">Harga Jual</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[26px] font-extrabold text-sky-700 leading-none">
                    {formatCurrency(item.priceSell, item.currency)}
                  </span>
                  {item.unit && <span className="text-[14px] text-sky-500 font-medium">/ {item.unit}</span>}
                </div>
                {item.moq != null && item.moq > 1 && (
                  <p className="text-[12px] text-sky-600 mt-1">Min. order: {item.moq} {item.unit ?? "unit"}</p>
                )}
              </div>
            )}

            {/* Description */}
            {item.description && (
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Deskripsi</p>
                <p className="text-[13.5px] text-slate-700 leading-relaxed whitespace-pre-line">{item.description}</p>
              </div>
            )}

            {/* Spec grid */}
            {(item.specValues || item.templateSnapshot) && (
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
                <SpecGrid specValues={item.specValues} templateSnapshot={item.templateSnapshot} />
              </div>
            )}

            {/* Meta info */}
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Informasi Layanan</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: <Tag className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />, label: "Tipe Layanan", val: item.resolvedCategoryLabel ?? categoryLabel },
                  item.serviceType ? { icon: <Tag className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />, label: "Service Type", val: item.serviceType } : null,
                  item.location ? { icon: <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />, label: "Lokasi", val: item.location } : null,
                  item.origin ? { icon: <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />, label: "Asal", val: item.origin } : null,
                  item.leadTime ? { icon: <Clock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />, label: "Lead Time", val: item.leadTime } : null,
                  item.moq != null ? { icon: <Tag className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />, label: "Min. Order", val: `${item.moq} ${item.unit ?? "unit"}` } : null,
                  item.subcategory ? { icon: <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />, label: "Sub-kategori", val: item.subcategory } : null,
                  item.currency !== "IDR" ? { icon: <Tag className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />, label: "Mata Uang", val: item.currency } : null,
                ].filter(Boolean).map((row, i) => (
                  <div key={i} className="flex items-start gap-2">
                    {row!.icon}
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold">{row!.label}</p>
                      <p className="text-[13px] text-slate-700 font-medium">{row!.val}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: calculator + cart ─────────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-5 sticky top-4 space-y-4">

              {/* Calculator header */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
                  <Calculator className="h-4 w-4 text-sky-600" />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-slate-800 leading-tight">Kalkulator Estimasi</p>
                  <p className="text-[11px] text-slate-400">Isi detail pengiriman untuk estimasi biaya</p>
                </div>
              </div>

              <Separator />

              {/* Calculator form by type */}
              {item.priceSell == null && (
                <div className="text-center py-4">
                  <p className="text-[12px] text-slate-400">Harga belum tersedia.<br />Hubungi vendor untuk penawaran.</p>
                </div>
              )}

              {item.priceSell != null && (
                <>
                  {serviceType === "trucking" && <TruckingCalc item={item} onChange={setCalcResult} />}
                  {serviceType === "sea_freight" && <SeaFreightCalc item={item} onChange={setCalcResult} />}
                  {serviceType === "air_freight" && <AirFreightCalc item={item} onChange={setCalcResult} />}
                  {serviceType === "ppjk" && <PpjkCalc item={item} onChange={setCalcResult} />}
                  {serviceType === "handling" && <HandlingCalc item={item} onChange={setCalcResult} />}
                  {(serviceType === "document" || serviceType === "general") && <GeneralCalc item={item} onChange={setCalcResult} />}
                </>
              )}

              {/* Summary */}
              {calcResult && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Ringkasan Estimasi</p>
                    <div className="space-y-0.5">
                      <SummaryRow label="Harga Satuan" value={formatCurrency(item.priceSell ?? 0, item.currency)} />
                      <SummaryRow label={`× ${calcResult.chargeableQty} ${calcResult.chargeableUnit}`} value={formatCurrency(calcResult.subtotal, item.currency)} />
                      <div className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <Switch checked={withTax} onCheckedChange={setWithTax} />
                          <span className="text-[12px] text-slate-600">PPN 11%</span>
                        </div>
                        <span className="text-[12px] font-semibold text-slate-700 tabular-nums">
                          {withTax ? formatCurrency(tax, item.currency) : "—"}
                        </span>
                      </div>
                      <Separator />
                      <SummaryRow label="Total Estimasi" value={formatCurrency(total, item.currency)} bold />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                      * Estimasi awal. Harga final dikonfirmasi vendor.
                    </p>
                  </div>

                  <Button
                    className={`w-full h-11 rounded-xl font-semibold text-[13px] transition-all ${added ? "bg-emerald-600 hover:bg-emerald-700" : "bg-sky-600 hover:bg-sky-700"} text-white`}
                    onClick={handleAddToCart}
                  >
                    {added ? (
                      <><CheckCircle2 className="h-4 w-4 mr-2" />Ditambahkan!</>
                    ) : (
                      <><ShoppingCart className="h-4 w-4 mr-2" />Tambahkan ke Pesanan</>
                    )}
                  </Button>
                </>
              )}

              {/* WA fallback */}
              {item.priceSell == null && (
                <a href={`https://wa.me/?text=${encodeURIComponent(`Halo, saya tertarik dengan layanan: ${item.name}`)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[13px] transition-colors">
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Tanya via WhatsApp
                </a>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
