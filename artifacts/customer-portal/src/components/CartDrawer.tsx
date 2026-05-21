import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  X, Trash2, Plus, ShoppingCart, ArrowRight,
  Package, Truck, Ship, Plane, FileCheck, Warehouse, FileText, Zap,
} from "lucide-react";

import { useCart, CartItem } from "@/lib/logistic-cart";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const OPEN_CART_EVENT = "open-cart-drawer";

const TYPE_META: Record<string, {
  label: string;
  color: string;
  iconBg: string;
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
  return TYPE_META[type] ?? {
    label: type,
    color: "bg-slate-100 text-slate-600 border-slate-200",
    iconBg: "bg-slate-100",
    icon: Package,
  };
}

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
      const gw  = parseFloat(str(d.grossWeight)) || 0;
      const l   = parseFloat(str(d.length))      || 0;
      const w   = parseFloat(str(d.width))       || 0;
      const h   = parseFloat(str(d.height))      || 0;
      const qty = parseFloat(str(d.quantity))    || 1;
      const vw  = (l * w * h * qty) / 6000;
      if (gw > 0) details.push(`Berat Kotor: ${gw} kg`);
      if (gw > 0 || vw > 0) details.push(`Chargeable: ${Math.max(gw, vw).toFixed(2)} kg`);
      if (d.quantity) details.push(`Koli: ${str(d.quantity)} pcs`);
      break;
    }

    case "sea_fcl":
      if (d.originPort && d.destinationPort)
        details.push(`${str(d.originPort)} → ${str(d.destinationPort)}`);
      if (d.containerType) details.push(`Container: ${str(d.containerType)}`);
      break;

    case "sea_lcl":
      if (d.originPort && d.destinationPort)
        details.push(`${str(d.originPort)} → ${str(d.destinationPort)}`);
      if (d.cbm)    details.push(`Volume: ${str(d.cbm)} CBM`);
      if (d.weight) details.push(`Berat: ${str(d.weight)} kg`);
      break;

    case "customs":
      if (d.shipmentType) details.push(str(d.shipmentType));
      break;

    case "storage":
      if (d.days)     details.push(`${str(d.days)} hari`);
      if (d.quantity) details.push(`${str(d.quantity)} ${str(d.unit) || "unit"}`);
      break;

    default: {
      const skip = new Set(["unitPrice", "serviceFee", "adminFee", "notes", "ratePerKg", "ratePerCbm"]);
      Object.entries(d)
        .filter(([k, v]) => v && !skip.has(k))
        .slice(0, 2)
        .forEach(([, v]) => details.push(str(v)));
    }
  }

  return details;
}

const CATEGORY_ORDER = [
  "product", "trucking", "air_freight", "sea_fcl", "sea_lcl",
  "customs", "storage", "document", "additional",
];

function groupItems(items: CartItem[]): [string, CartItem[]][] {
  const map = new Map<string, CartItem[]>();
  for (const item of items) {
    const key = item.calculatorType;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const ordered = CATEGORY_ORDER.filter((k) => map.has(k)).map((k) => [k, map.get(k)!] as [string, CartItem[]]);
  const rest = [...map.entries()].filter(([k]) => !CATEGORY_ORDER.includes(k));
  return [...ordered, ...rest];
}

function CartItemCard({ item, onRemove }: { item: CartItem; onRemove: (id: string) => void }) {
  const meta    = getTypeMeta(item.calculatorType);
  const Icon    = meta.icon;
  const details = getItemDetails(item);
  const isTrucking = item.calculatorType === "trucking";
  const hasPrice   = item.subtotal > 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${meta.iconBg}`}>
              <Icon className="w-3 h-3 text-slate-600" />
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${meta.color}`}>
              {meta.label}
            </span>
          </div>

          <p className="text-sm font-semibold text-slate-800 leading-snug">{item.serviceName}</p>

          {details.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {details.map((d, i) => (
                <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {isTrucking ? (
            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2 py-0.5 whitespace-nowrap">
              Harga menyusul
            </span>
          ) : hasPrice ? (
            <span className="text-sm font-bold text-sky-700 whitespace-nowrap">
              {formatCurrency(item.subtotal)}
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 whitespace-nowrap">
              Harga nego
            </span>
          )}

          <button
            onClick={() => onRemove(item.cartId)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Hapus item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CartDrawer() {
  const [open, setOpen]  = useState(false);
  const [, setLocation]  = useLocation();
  const { items, removeItem, clearCart, subtotal, tax, grandTotal, taxRate } = useCart();

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_CART_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_CART_EVENT, handleOpen);
  }, []);

  function close() { setOpen(false); }

  function handleCheckout() {
    close();
    setLocation("/book?step=3");
  }

  function handleAddService() {
    close();
    setLocation("/book");
  }

  const grouped = groupItems(items);
  const hasNegotiable = grandTotal === 0 && items.length > 0;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
      />

      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[440px] bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Keranjang Pesanan</h2>
              <p className="text-xs text-slate-400">
                {items.length === 0
                  ? "Belum ada item"
                  : `${items.length} item · 1 pesanan`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Hapus Semua
              </button>
            )}
            <button
              onClick={close}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-8 text-center py-16">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <ShoppingCart className="w-10 h-10 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-600 mt-2">Keranjang kosong</p>
              <p className="text-xs text-slate-400 mt-1 mb-6 leading-relaxed">
                Tambahkan produk atau pilih layanan logistik — trucking, air freight, atau sea freight.
              </p>
              <Button onClick={handleAddService} size="sm" className="gap-2">
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
                      {typeItems.map((item) => (
                        <CartItemCard key={item.cartId} item={item} onRemove={removeItem} />
                      ))}
                    </div>
                  </div>
                );
              })}

              <button
                onClick={handleAddService}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50/60 transition-colors"
              >
                <Plus className="w-4 h-4" /> Tambah Layanan / Produk
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-slate-200 px-5 py-4 space-y-3 bg-white shrink-0">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-700">
                  {subtotal > 0
                    ? formatCurrency(subtotal)
                    : <span className="text-slate-400 text-xs italic">Ditentukan vendor</span>}
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
                <span className="text-lg font-bold text-sky-700">
                  {grandTotal > 0 ? formatCurrency(grandTotal) : "—"}
                </span>
              </div>
              {hasNegotiable && (
                <p className="text-[11px] text-slate-400 leading-snug">
                  Harga akhir dikonfirmasi vendor setelah pesanan diterima.
                </p>
              )}
            </div>

            <Button className="w-full gap-2 h-11 text-sm font-semibold" onClick={handleCheckout}>
              Lanjutkan ke Checkout <ArrowRight className="w-4 h-4" />
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="gap-1.5 text-sm h-10"
                onClick={handleAddService}
              >
                <Truck className="w-3.5 h-3.5" />
                Pilih Layanan
              </Button>
              <Button
                variant="outline"
                className="gap-1.5 text-sm h-10"
                onClick={() => { close(); setLocation("/products"); }}
              >
                <Package className="w-3.5 h-3.5" />
                Pilih Produk
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
