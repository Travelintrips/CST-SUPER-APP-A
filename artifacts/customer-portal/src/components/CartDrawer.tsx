import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  X, Trash2, Plus, ShoppingCart, ArrowRight,
  Package, Truck, Ship, Plane, FileCheck, Warehouse, FileText, Zap,
  ChevronLeft, MapPin, Calculator, Calendar, Clock, Shield, Loader2,
} from "lucide-react";

import { useCart, CartItem } from "@/lib/logistic-cart";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export const OPEN_CART_EVENT = "open-cart-drawer";

// ── Type meta for cart items ──────────────────────────────────────────────────

const TYPE_META: Record<string, {
  label: string; color: string; iconBg: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  product:     { label: "Produk",      color: "bg-emerald-100 text-emerald-700 border-emerald-200", iconBg: "bg-emerald-100", icon: Package },
  trucking:    { label: "Trucking",    color: "bg-amber-100 text-amber-700 border-amber-200",       iconBg: "bg-amber-100",   icon: Truck },
  air_freight: { label: "Air Freight", color: "bg-sky-100 text-sky-700 border-sky-200",             iconBg: "bg-sky-100",     icon: Plane },
  sea_fcl:     { label: "Sea FCL",     color: "bg-blue-100 text-blue-700 border-blue-200",          iconBg: "bg-blue-100",    icon: Ship },
  sea_lcl:     { label: "Sea LCL",     color: "bg-blue-100 text-blue-700 border-blue-200",          iconBg: "bg-blue-100",    icon: Ship },
  customs:     { label: "Pabean",      color: "bg-violet-100 text-violet-700 border-violet-200",    iconBg: "bg-violet-100",  icon: FileCheck },
  storage:     { label: "Storage",     color: "bg-orange-100 text-orange-700 border-orange-200",    iconBg: "bg-orange-100",  icon: Warehouse },
  document:    { label: "Document",    color: "bg-slate-100 text-slate-600 border-slate-200",       iconBg: "bg-slate-100",   icon: FileText },
  additional:  { label: "Additional",  color: "bg-rose-100 text-rose-700 border-rose-200",          iconBg: "bg-rose-100",    icon: Zap },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, color: "bg-slate-100 text-slate-600 border-slate-200", iconBg: "bg-slate-100", icon: Package };
}

// ── Service catalog cards ─────────────────────────────────────────────────────

const DRAWER_SERVICES = [
  { id: "trucking",   name: "Trucking",          icon: <Truck     className="w-5 h-5" />, desc: "Pengiriman darat, kota ke kota",          color: "bg-orange-50 border-orange-200 text-orange-700",  isTrucking: true  },
  { id: "sea",        name: "Kargo Laut",         icon: <Ship      className="w-5 h-5" />, desc: "FCL / LCL, impor & ekspor",               color: "bg-blue-50 border-blue-200 text-blue-700",        isTrucking: false },
  { id: "air",        name: "Kargo Udara",        icon: <Plane     className="w-5 h-5" />, desc: "Pengiriman cepat via udara",               color: "bg-sky-50 border-sky-200 text-sky-700",           isTrucking: false },
  { id: "storage",    name: "Pergudangan",        icon: <Warehouse className="w-5 h-5" />, desc: "Penyimpanan & manajemen stok",             color: "bg-emerald-50 border-emerald-200 text-emerald-700", isTrucking: false },
  { id: "customs",    name: "Custom Clearance",   icon: <FileCheck className="w-5 h-5" />, desc: "Pengurusan bea cukai & dokumen",           color: "bg-slate-50 border-slate-200 text-slate-700",     isTrucking: false },
  { id: "additional", name: "Asuransi & Lainnya", icon: <Shield    className="w-5 h-5" />, desc: "Asuransi, survei, permit & compliance",    color: "bg-purple-50 border-purple-200 text-purple-700",  isTrucking: false },
];

const GOODS_TYPES = ["General Cargo","Kopi / Hasil Bumi","Elektronik","Perishable","Kimia / B3","Furniture","Mesin & Spare-part","Lainnya"];
const INCOTERMS   = ["EXW","FCA","FOB","CIF","DAP","DDP","CPT","CIP"];

// ── Cart item detail lines ────────────────────────────────────────────────────

function getItemDetails(item: CartItem): string[] {
  const d = item.inputData;
  const str = (v: unknown) => (v != null && v !== "" ? String(v) : "");
  const details: string[] = [];
  switch (item.calculatorType) {
    case "product":
      if (d.qty) details.push(`Qty: ${str(d.qty)}${d.unit ? ` ${str(d.unit)}` : ""}`);
      break;
    case "trucking":
      if (d.pickupCity && d.destCity) details.push(`${str(d.pickupCity)} → ${str(d.destCity)}`);
      else if (d.pickupCity) details.push(`Asal: ${str(d.pickupCity)}`);
      if (d.vehicleType) {
        const v = str(d.vehicleType);
        details.push(`Armada: ${d.trailerSize ? `${v} – ${str(d.trailerSize)}` : v}`);
      }
      if (d.gross_weight_kg) details.push(`Berat: ${str(d.gross_weight_kg)} kg`);
      break;
    case "air_freight": {
      if (d.originAirport && d.destinationAirport)
        details.push(`${str(d.originAirport)} → ${str(d.destinationAirport)}`);
      const gw = parseFloat(str(d.grossWeight)) || 0;
      const l  = parseFloat(str(d.length))      || 0;
      const w  = parseFloat(str(d.width))       || 0;
      const h  = parseFloat(str(d.height))      || 0;
      const qty = parseFloat(str(d.quantity))   || 1;
      const vw = (l * w * h * qty) / 6000;
      if (gw > 0) details.push(`Berat Kotor: ${gw} kg`);
      if (gw > 0 || vw > 0) details.push(`Chargeable: ${Math.max(gw, vw).toFixed(2)} kg`);
      if (d.quantity) details.push(`Koli: ${str(d.quantity)} pcs`);
      break;
    }
    case "sea_fcl":
      if (d.originPort && d.destinationPort) details.push(`${str(d.originPort)} → ${str(d.destinationPort)}`);
      if (d.containerType) details.push(`Container: ${str(d.containerType)}`);
      break;
    case "sea_lcl":
      if (d.cbm)    details.push(`CBM: ${str(d.cbm)}`);
      if (d.weight) details.push(`Berat: ${str(d.weight)} kg`);
      break;
    case "storage":
      if (d.days)     details.push(`Durasi: ${str(d.days)} hari`);
      if (d.quantity) details.push(`Qty: ${str(d.quantity)} ${str(d.unit)}`);
      break;
    default:
      if (d.quantity) details.push(`Qty: ${str(d.quantity)}`);
  }
  return details;
}

function groupItems(items: CartItem[]): [string, CartItem[]][] {
  const map = new Map<string, CartItem[]>();
  for (const item of items) {
    const k = item.calculatorType;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return [...map.entries()];
}

// ── CartItemCard ──────────────────────────────────────────────────────────────

function CartItemCard({ item, onRemove }: { item: CartItem; onRemove: (id: string) => void }) {
  const meta   = getTypeMeta(item.calculatorType);
  const Icon   = meta.icon;
  const details = getItemDetails(item);
  const isTrucking = item.calculatorType === "trucking";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg ${meta.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className="w-4 h-4 text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${meta.color} mb-0.5`}>
                {meta.label}
              </span>
              <p className="text-xs font-semibold text-slate-800 leading-snug">{item.serviceName}</p>
            </div>
            <button onClick={() => onRemove(item.cartId)} className="text-slate-300 hover:text-red-400 transition-colors mt-0.5 shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {details.map((d, i) => (
              <p key={i} className="text-[11px] text-slate-400 leading-snug">{d}</p>
            ))}
          </div>
          {item.subtotal > 0 ? (
            <p className="text-xs font-bold text-sky-700 mt-1.5">{formatCurrency(item.subtotal)}</p>
          ) : isTrucking ? (
            <span className="inline-block mt-1.5 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">Harga menyusul</span>
          ) : (
            <span className="inline-block mt-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Harga nego</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main CartDrawer ───────────────────────────────────────────────────────────

type DrawerView = "cart" | "service-catalog" | "trucking";

const DEFAULT_PICKUP = "Jl. Logistik No. 1, Jakarta";

export function CartDrawer() {
  const [open, setOpen]        = useState(false);
  const [view, setView]        = useState<DrawerView>("cart");
  const [truckMode, setTruckMode] = useState<"detail" | "calculator">("detail");
  const [truckData, setTruckData] = useState<Record<string, string>>({});
  const [truckEstimate, setTruckEstimate] = useState<number | null>(null);
  const [truckEstimating, setTruckEstimating] = useState(false);
  const [companyPickup, setCompanyPickup] = useState<{ name: string; address: string } | null>(null);
  const [, setLocation]        = useLocation();
  const { toast }              = useToast();

  const { items, addItem, removeItem, clearCart, subtotal, tax, grandTotal, taxRate } = useCart();

  useEffect(() => {
    const handleOpen = () => { setOpen(true); setView("cart"); };
    window.addEventListener(OPEN_CART_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_CART_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (view !== "trucking" || companyPickup) return;
    fetch("/api/settings/company-pickup-address")
      .then(r => r.ok ? r.json() : null)
      .then((d: { companyName: string; companyAddress: string } | null) => {
        if (d?.companyAddress) {
          setCompanyPickup({ name: d.companyName, address: d.companyAddress });
        } else {
          setCompanyPickup({ name: "CST Logistics", address: DEFAULT_PICKUP });
        }
      })
      .catch(() => setCompanyPickup({ name: "CST Logistics", address: DEFAULT_PICKUP }));
  }, [view, companyPickup]);

  function close() { setOpen(false); }

  function openServiceCatalog() {
    setView("service-catalog");
    setTruckData({});
    setTruckEstimate(null);
    setTruckMode("detail");
  }

  function handleCheckout() {
    close();
    setLocation("/book?step=3");
  }

  function handleAddTruckingItem() {
    const name = truckMode === "detail" ? "Trucking — Pickup & Delivery" : "Trucking — Kargo";
    const pickupAddr = companyPickup?.address ?? DEFAULT_PICKUP;
    addItem({
      category: "Trucking",
      serviceName: name,
      calculatorType: "trucking",
      inputData: truckMode === "detail"
        ? { pickupCity: pickupAddr, destCity: truckData.deliveryAddress,
            vehicleType: "CDD", pickupDate: truckData.pickupDate, pickupTime: truckData.pickupTime,
            receiver_name: truckData.contactName, receiver_phone: truckData.contactPhone }
        : { ...truckData },
      calculationResult: truckEstimate ? { estimated_price: truckEstimate } : {},
      subtotal: 0,
    });
    toast({ title: `${name} ditambahkan ke keranjang` });
    setTruckData({});
    setTruckEstimate(null);
    setView("cart");
  }

  function handleNonTruckingService(id: string) {
    close();
    const catMap: Record<string, string> = {
      sea: "Freight", air: "Freight", storage: "Storage",
      customs: "Customs", additional: "Additional",
    };
    const cat = catMap[id];
    setLocation(cat ? `/book?cat=${cat}` : "/book");
  }

  function handleEstimate() {
    setTruckEstimating(true);
    const params = new URLSearchParams({ transport_mode: "TRUCKING" });
    if (truckData.vehicleType) params.set("truck_type", truckData.vehicleType);
    if (truckData.pickupCity)  params.set("origin", truckData.pickupCity);
    if (truckData.destCity)    params.set("dest", truckData.destCity);
    fetch(`/api/logistic/orders/estimate-price?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { estimated_price: number | null }) => {
        if (d.estimated_price && d.estimated_price > 0) {
          setTruckEstimate(d.estimated_price);
        } else fallbackEstimate();
      })
      .catch(fallbackEstimate)
      .finally(() => setTruckEstimating(false));
  }

  function fallbackEstimate() {
    const w  = parseFloat(truckData.weight) || 0;
    const l  = parseFloat(truckData.length) || 0;
    const wi = parseFloat(truckData.width)  || 0;
    const h  = parseFloat(truckData.height) || 0;
    const volW = (l && wi && h) ? (l * wi * h) / 4000 : 0;
    setTruckEstimate(Math.max(150_000, Math.round(Math.max(w, volW) * 2_500)));
  }

  const grouped      = groupItems(items);
  const hasNegotiable = grandTotal === 0 && items.length > 0;

  // ── Header title / back button ──────────────────────────────────────────────
  const headerTitle = view === "service-catalog" ? "Pilih Layanan" : view === "trucking" ? "Layanan Trucking" : "Keranjang Pesanan";
  const headerSub   = view === "service-catalog" ? "Pilih layanan logistik Anda" : view === "trucking" ? "Isi detail atau hitung estimasi" : items.length === 0 ? "Belum ada item" : `${items.length} item · 1 pesanan`;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={close}
      />

      {/* Drawer Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[440px] bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            {view !== "cart" && (
              <button
                onClick={() => view === "trucking" ? setView("service-catalog") : setView("cart")}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${view === "trucking" ? "bg-orange-100" : "bg-sky-100"}`}>
              {view === "trucking" ? <Truck className="w-5 h-5 text-orange-600" /> : <ShoppingCart className="w-5 h-5 text-sky-600" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{headerTitle}</h2>
              <p className="text-xs text-slate-400">{headerSub}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {view === "cart" && items.length > 0 && (
              <button onClick={clearCart} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                <Trash2 className="w-3 h-3" /> Hapus Semua
              </button>
            )}
            <button onClick={close} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60">

          {/* ── View: Cart ── */}
          {view === "cart" && (
            items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-8 text-center py-16">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <ShoppingCart className="w-10 h-10 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-600 mt-2">Keranjang kosong</p>
                <p className="text-xs text-slate-400 mt-1 mb-6 leading-relaxed">
                  Tambahkan produk atau pilih layanan logistik — trucking, air freight, atau sea freight.
                </p>
                <Button onClick={openServiceCatalog} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" /> Pilih Layanan
                </Button>
              </div>
            ) : (
              <div className="p-4 space-y-5">
                {grouped.map(([type, typeItems]) => {
                  const meta = getTypeMeta(type);
                  const Icon = meta.icon;
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Icon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          {meta.label} ({typeItems.length})
                        </span>
                      </div>
                      <div className="space-y-2">
                        {typeItems.map(item => <CartItemCard key={item.cartId} item={item} onRemove={removeItem} />)}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={openServiceCatalog}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50/60 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Tambah Layanan / Produk
                </button>
              </div>
            )
          )}

          {/* ── View: Service Catalog ── */}
          {view === "service-catalog" && (
            <div className="p-4 space-y-3">
              <button
                onClick={() => { close(); setLocation("/order-produk"); }}
                className="w-full border-2 border-dashed border-slate-200 rounded-xl p-3.5 text-sm text-slate-400 hover:border-primary/40 hover:text-slate-600 transition-colors text-center"
              >
                + Tambah Produk dari Katalog
              </button>

              <Separator />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Layanan Logistik</p>

              <div className="grid grid-cols-2 gap-2.5">
                {DRAWER_SERVICES.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => {
                      if (svc.isTrucking) {
                        setView("trucking");
                        setTruckMode("detail");
                        setTruckData({});
                        setTruckEstimate(null);
                      } else {
                        handleNonTruckingService(svc.id);
                      }
                    }}
                    className={`border-2 rounded-xl p-3.5 text-left transition-all hover:shadow-md ${svc.color}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">{svc.icon}</div>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{svc.name}</p>
                        <p className="text-[11px] opacity-70 mt-0.5 leading-snug">{svc.desc}</p>
                        {svc.isTrucking && (
                          <span className="inline-block mt-1.5 text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">
                            Kalkulator tersedia
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── View: Trucking Form ── */}
          {view === "trucking" && (
            <div className="p-4 space-y-3">
              {/* Mode Tabs */}
              <div className="flex gap-1.5 p-1 bg-slate-100 rounded-lg">
                {(["detail", "calculator"] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => { setTruckMode(mode); setTruckEstimate(null); }}
                    className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1 ${truckMode === mode ? "bg-white shadow text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
                  >
                    {mode === "detail" ? <><MapPin className="w-3 h-3" /> Pickup &amp; Delivery</> : <><Calculator className="w-3 h-3" /> Kalkulator Estimasi</>}
                  </button>
                ))}
              </div>

              {/* Detail Form */}
              {truckMode === "detail" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <Label className="text-[11px] flex items-center gap-1 mb-1"><Calendar className="w-3 h-3" /> Tanggal Pickup</Label>
                      <Input type="date" className="h-8 text-xs" value={truckData.pickupDate||""} onChange={e => setTruckData(p => ({ ...p, pickupDate: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[11px] flex items-center gap-1 mb-1"><Clock className="w-3 h-3" /> Jam Pickup</Label>
                      <Input type="time" className="h-8 text-xs" value={truckData.pickupTime||""} onChange={e => setTruckData(p => ({ ...p, pickupTime: e.target.value }))} />
                    </div>
                  </div>

                  {/* Alamat Pickup — otomatis dari gudang CST Logistics, tidak bisa diubah customer */}
                  <div>
                    <Label className="text-[11px] mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-orange-500" />
                      Alamat Pickup
                      <span className="ml-auto text-[10px] font-semibold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">Otomatis</span>
                    </Label>
                    <div className="rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-orange-700 leading-snug">
                        🏭 {companyPickup?.name ?? "CST Logistics"}
                      </p>
                      <p className="text-[11px] text-orange-600 mt-0.5 leading-snug">
                        {companyPickup?.address ?? DEFAULT_PICKUP}
                      </p>
                      <p className="text-[10px] text-orange-400 mt-1">
                        Tim kami yang akan menentukan lokasi pengambilan barang
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px] mb-1 block">
                      Alamat Pengiriman <span className="text-destructive">*</span>
                    </Label>
                    <Textarea rows={2} placeholder="Jl. ..., Kota, Provinsi — alamat tujuan pengiriman" className="text-xs resize-none" value={truckData.deliveryAddress||""} onChange={e => setTruckData(p => ({ ...p, deliveryAddress: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <Label className="text-[11px] mb-1 block">Nama Kontak</Label>
                      <Input className="h-8 text-xs" placeholder="Nama PIC" value={truckData.contactName||""} onChange={e => setTruckData(p => ({ ...p, contactName: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[11px] mb-1 block">No. Telepon</Label>
                      <Input type="tel" className="h-8 text-xs" placeholder="08xxxxxxxxxx" value={truckData.contactPhone||""} onChange={e => setTruckData(p => ({ ...p, contactPhone: e.target.value }))} />
                    </div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-[11px] text-orange-700">
                    💡 Estimasi biaya dikonfirmasi tim setelah pesanan masuk.
                  </div>
                </div>
              )}

              {/* Calculator Form */}
              {truckMode === "calculator" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <Label className="text-[11px] mb-1 block flex items-center gap-1"><MapPin className="w-3 h-3" /> Kota Asal *</Label>
                      <Input className="h-8 text-xs" placeholder="Jakarta" value={truckData.pickupCity||""} onChange={e => setTruckData(p => ({ ...p, pickupCity: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[11px] mb-1 block flex items-center gap-1"><MapPin className="w-3 h-3" /> Kota Tujuan *</Label>
                      <Input className="h-8 text-xs" placeholder="Surabaya" value={truckData.destCity||""} onChange={e => setTruckData(p => ({ ...p, destCity: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[11px] mb-1 block">Berat (kg) *</Label>
                      <Input type="number" min={0} className="h-8 text-xs" placeholder="100" value={truckData.weight||""} onChange={e => setTruckData(p => ({ ...p, weight: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[11px] mb-1 block">Jenis Kendaraan</Label>
                      <Select value={truckData.vehicleType||undefined} onValueChange={v => setTruckData(p => ({ ...p, vehicleType: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pilih" /></SelectTrigger>
                        <SelectContent>{["CDE","CDD","Fuso","Wingbox","Trailer"].map(v => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[11px] mb-1 block">Dimensi (cm) — P × L × T</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <Input type="number" min={0} className="h-8 text-xs" placeholder="Panjang" value={truckData.length||""} onChange={e => setTruckData(p => ({ ...p, length: e.target.value }))} />
                      <Input type="number" min={0} className="h-8 text-xs" placeholder="Lebar"   value={truckData.width||""}  onChange={e => setTruckData(p => ({ ...p, width:  e.target.value }))} />
                      <Input type="number" min={0} className="h-8 text-xs" placeholder="Tinggi"  value={truckData.height||""} onChange={e => setTruckData(p => ({ ...p, height: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <Label className="text-[11px] mb-1 block">Jenis Barang</Label>
                      <Select value={truckData.goodsType||undefined} onValueChange={v => setTruckData(p => ({ ...p, goodsType: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pilih" /></SelectTrigger>
                        <SelectContent>{GOODS_TYPES.map(g => <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[11px] mb-1 block">Incoterms</Label>
                      <Select value={truckData.incoterms||"FOB"} onValueChange={v => setTruckData(p => ({ ...p, incoterms: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{INCOTERMS.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    variant="outline" size="sm"
                    className="w-full border-orange-400 text-orange-600 hover:bg-orange-50 gap-2"
                    disabled={!truckData.pickupCity || !truckData.destCity || !truckData.weight || truckEstimating}
                    onClick={handleEstimate}
                  >
                    {truckEstimating
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menghitung...</>
                      : <><Calculator className="w-3.5 h-3.5" /> Hitung Estimasi</>}
                  </Button>

                  {truckEstimate !== null && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-0.5">
                      <p className="text-[11px] text-emerald-600 font-medium">Estimasi Biaya Trucking</p>
                      <p className="text-xl font-bold text-emerald-700">{formatCurrency(truckEstimate)}</p>
                      <p className="text-[11px] text-emerald-500">{truckData.pickupCity} → {truckData.destCity} · {truckData.weight} kg</p>
                      <p className="text-[10px] text-slate-400 mt-1">*Estimasi indikatif. Biaya final dikonfirmasi tim logistik.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}

        {/* Cart footer */}
        {view === "cart" && items.length > 0 && (
          <div className="border-t border-slate-200 px-5 py-4 space-y-3 bg-white shrink-0">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-700">
                  {subtotal > 0 ? formatCurrency(subtotal) : <span className="text-slate-400 text-xs italic">Ditentukan vendor</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PPN {taxRate === 0.011 ? "1,1%" : "11%"}</span>
                <span className="font-medium text-slate-700">
                  {tax > 0 ? formatCurrency(tax) : <span className="text-slate-400 text-xs">—</span>}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between items-center pt-0.5">
                <span className="font-bold text-slate-800">Total Estimasi</span>
                <span className="text-lg font-bold text-sky-700">{grandTotal > 0 ? formatCurrency(grandTotal) : "—"}</span>
              </div>
              {hasNegotiable && (
                <p className="text-[11px] text-slate-400 leading-snug">Harga akhir dikonfirmasi vendor setelah pesanan diterima.</p>
              )}
            </div>
            <Button className="w-full gap-2 h-11 text-sm font-semibold" onClick={handleCheckout}>
              Lanjutkan ke Checkout <ArrowRight className="w-4 h-4" />
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-1.5 text-sm h-10" onClick={openServiceCatalog}>
                <Truck className="w-3.5 h-3.5" /> Pilih Layanan
              </Button>
              <Button variant="outline" className="gap-1.5 text-sm h-10" onClick={() => { close(); setLocation("/products"); }}>
                <Package className="w-3.5 h-3.5" /> Pilih Produk
              </Button>
            </div>
          </div>
        )}

        {/* Trucking footer */}
        {view === "trucking" && (
          <div className="border-t border-slate-200 px-4 py-3 bg-white shrink-0">
            <Button
              className="w-full bg-orange-600 hover:bg-orange-700 gap-2"
              disabled={
                truckMode === "detail"
                  ? !truckData.pickupAddress?.trim() || !truckData.deliveryAddress?.trim()
                  : !truckData.pickupCity || !truckData.destCity || !truckData.weight
              }
              onClick={handleAddTruckingItem}
            >
              {truckEstimate || truckMode === "detail" ? "Tambahkan ke Pesanan" : "Tambahkan (Harga Menyusul)"}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
