import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Truck,
  MapPin,
  Package,
  Calendar,
  ClipboardList,
  Send,
  AlertCircle,
  Loader2,
  ThumbsUp,
  Clock,
} from "lucide-react";

interface RfqFormData {
  rfqNumber: string;
  rfqStatus: string;
  rfqNotes: string | null;
  orderNumber: string;
  shipmentType: string;
  origin: string;
  destination: string;
  commodity: string | null;
  cargoDescription: string | null;
  grossWeight: string | null;
  volumeCbm: string | null;
  requiredDate: string | null;
  requestedPickup: string | null;
  requestedDelivery: string | null;
  createdAt: string;
  vendorId: number;
  vendorName: string;
  alreadySubmitted: boolean;
  existingQuote: {
    vendorPrice: number;
    estimatedPickup: string | null;
    estimatedDelivery: string | null;
    estimatedDays: number | null;
    vendorNotes: string | null;
    quoteStatus: string;
  } | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function getParams(): { rfq: string; v: string } {
  const p = new URLSearchParams(window.location.search);
  return { rfq: p.get("rfq") ?? "", v: p.get("v") ?? "" };
}

function isTruckingType(shipmentType: string) {
  return shipmentType.toLowerCase().includes("trucking");
}

export default function LogisticsVendorQuotePage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RfqFormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [vendorPrice, setVendorPrice] = useState("");
  const [estimatedPickup, setEstimatedPickup] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [estimatedDays, setEstimatedDays] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  const { rfq, v } = getParams();

  useEffect(() => {
    if (!rfq || !v) {
      setError("Link tidak valid. Parameter RFQ atau vendor tidak ditemukan.");
      setLoading(false);
      return;
    }

    fetch(`/api/logistic/orders/vendor-form?rfq=${encodeURIComponent(rfq)}&v=${encodeURIComponent(v)}`)
      .then((res) => res.json())
      .then((json: RfqFormData & { message?: string }) => {
        if (json.message) {
          setError(json.message);
        } else {
          setData(json);
          if (json.alreadySubmitted && json.existingQuote) {
            setVendorPrice(String(json.existingQuote.vendorPrice));
            setEstimatedPickup(json.existingQuote.estimatedPickup ?? "");
            setEstimatedDelivery(json.existingQuote.estimatedDelivery ?? "");
            setEstimatedDays(json.existingQuote.estimatedDays != null ? String(json.existingQuote.estimatedDays) : "");
            setNotes(json.existingQuote.vendorNotes ?? "");
          }
        }
      })
      .catch(() => setError("Gagal memuat data RFQ. Coba lagi atau hubungi CST Logistics."))
      .finally(() => setLoading(false));
  }, [rfq, v]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(vendorPrice.replace(/\./g, "").replace(",", "."));
    if (!price || price <= 0) {
      toast({ title: "Harga penawaran wajib diisi", variant: "destructive" });
      return;
    }

    const isTrucking = data ? isTruckingType(data.shipmentType) : false;

    setSending(true);
    try {
      const res = await fetch(`/api/logistic/orders/vendor-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfqNumber: rfq,
          vendorId: Number(v),
          vendorPrice: price,
          estimatedPickup: isTrucking
            ? (data?.requestedPickup ?? null)
            : (estimatedPickup.trim() || null),
          estimatedDelivery: isTrucking
            ? (data?.requestedDelivery ?? null)
            : (estimatedDelivery.trim() || null),
          estimatedDays: isTrucking ? null : (estimatedDays ? Number(estimatedDays) : null),
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json() as { success?: boolean; message?: string };
      if (json.success) {
        setSubmitted(true);
      } else {
        toast({ title: "Gagal mengirim", description: json.message ?? "Terjadi kesalahan.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Tidak dapat terhubung ke server.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
          <p className="text-slate-500 text-sm">Memuat data RFQ...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-sm w-full text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-semibold text-slate-800">Link Tidak Valid</h2>
          <p className="text-sm text-slate-500">{error}</p>
          <p className="text-xs text-slate-400">
            Hubungi CST Logistics untuk mendapatkan link yang baru.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    const isTrucking = data ? isTruckingType(data.shipmentType) : false;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">
            {isTrucking ? "Konfirmasi Diterima!" : "Penawaran Terkirim!"}
          </h2>
          <p className="text-sm text-slate-500">
            {isTrucking
              ? "Terima kasih. Anda telah menyetujui untuk memenuhi jadwal pengiriman ini. Tim CST Logistics akan segera menghubungi Anda."
              : "Terima kasih. Tim CST Logistics akan menghubungi Anda apabila penawaran Anda dipilih."}
          </p>
          {data && (
            <div className="bg-slate-50 rounded-xl p-4 text-left text-sm space-y-1.5 mt-2">
              <div className="flex justify-between">
                <span className="text-slate-500">No. RFQ</span>
                <span className="font-mono font-semibold text-slate-800">{data.rfqNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Rute</span>
                <span className="font-medium text-slate-800">{data.origin} → {data.destination}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Harga</span>
                <span className="font-bold text-green-700">{fmt(parseFloat(vendorPrice.replace(/\./g, "").replace(",", ".")))}</span>
              </div>
              {isTrucking && data.requestedPickup && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Pickup</span>
                  <span className="font-medium text-slate-800">{data.requestedPickup}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isTrucking = isTruckingType(data.shipmentType);
  const isAlreadySubmitted = data.alreadySubmitted;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className={`text-white ${isTrucking ? "bg-orange-600" : "bg-blue-700"}`}>
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-1">
            <Truck className="w-5 h-5 opacity-80" />
            <span className="text-sm font-medium opacity-80">CST Logistics</span>
          </div>
          <h1 className="text-xl font-bold">Form Penawaran Vendor</h1>
          <p className={`text-sm mt-1 ${isTrucking ? "text-orange-200" : "text-blue-200"}`}>
            Kepada: <span className="text-white font-semibold">{data.vendorName}</span>
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {isAlreadySubmitted && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800">
                {isTrucking ? "Sudah Dikonfirmasi" : "Penawaran Sudah Dikirim"}
              </p>
              <p className="text-amber-600 mt-0.5">
                {isTrucking
                  ? "Anda sudah mengkonfirmasi order ini sebelumnya. Data di bawah adalah konfirmasi sebelumnya."
                  : "Anda sudah mengajukan penawaran untuk RFQ ini. Data di bawah adalah penawaran sebelumnya."}
              </p>
            </div>
          </div>
        )}

        {/* Detail Order */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-slate-700">Detail Order</span>
            </div>
            <Badge variant="outline" className="text-xs font-mono">{data.rfqNumber}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-y-2.5 text-sm">
            <span className="text-slate-500">No. Order</span>
            <span className="font-medium text-slate-800 text-right font-mono">{data.orderNumber}</span>
            <span className="text-slate-500">Jenis Layanan</span>
            <span className="font-medium text-slate-800 text-right">{data.shipmentType}</span>
            <span className="text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> Rute</span>
            <span className="font-semibold text-blue-700 text-right">{data.origin} → {data.destination}</span>
            {data.commodity && (
              <>
                <span className="text-slate-500 flex items-center gap-1"><Package className="w-3 h-3" /> Komoditi</span>
                <span className="font-medium text-slate-800 text-right">{data.commodity}</span>
              </>
            )}
            {data.cargoDescription && (
              <>
                <span className="text-slate-500">Deskripsi</span>
                <span className="font-medium text-slate-800 text-right">{data.cargoDescription}</span>
              </>
            )}
            {data.grossWeight && (
              <>
                <span className="text-slate-500">Berat</span>
                <span className="font-medium text-slate-800 text-right">{data.grossWeight} kg</span>
              </>
            )}
            {data.volumeCbm && (
              <>
                <span className="text-slate-500">Volume</span>
                <span className="font-medium text-slate-800 text-right">{data.volumeCbm} CBM</span>
              </>
            )}
            {data.requiredDate && (
              <>
                <span className="text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Tgl Butuh</span>
                <span className="font-medium text-slate-800 text-right">{data.requiredDate}</span>
              </>
            )}
            {data.rfqNotes && (
              <>
                <span className="text-slate-500">Catatan Order</span>
                <span className="font-medium text-slate-800 text-right">{data.rfqNotes}</span>
              </>
            )}
          </div>
        </div>

        {/* Jadwal Permintaan Customer — khusus Trucking */}
        {isTrucking && (data.requestedPickup || data.requestedDelivery) && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-semibold text-orange-800">Jadwal Permintaan Customer</span>
            </div>
            <p className="text-xs text-orange-600">
              Dengan menekan tombol Setuju, Anda menyatakan sanggup memenuhi jadwal berikut:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {data.requestedPickup && (
                <div className="bg-white rounded-xl border border-orange-200 p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">ETA Pickup</p>
                  <p className="text-sm font-bold text-orange-700">{data.requestedPickup}</p>
                </div>
              )}
              {data.requestedDelivery && (
                <div className="bg-white rounded-xl border border-orange-200 p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">ETA Delivery</p>
                  <p className="text-sm font-bold text-orange-700">{data.requestedDelivery}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Send className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-slate-700">
              {isAlreadySubmitted
                ? (isTrucking ? "Perbarui Konfirmasi" : "Ubah Penawaran")
                : (isTrucking ? "Konfirmasi Kesanggupan" : "Isi Penawaran Anda")}
            </span>
          </div>

          {/* Harga — selalu ada */}
          <div className="space-y-1.5">
            <Label htmlFor="vendorPrice" className="text-sm font-semibold text-slate-700">
              Harga Penawaran (Rp) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="vendorPrice"
              type="number"
              inputMode="numeric"
              placeholder="Contoh: 5000000"
              value={vendorPrice}
              onChange={(e) => setVendorPrice(e.target.value)}
              className="text-lg font-semibold h-12 border-slate-300 focus:border-blue-500"
              required
            />
            {vendorPrice && parseFloat(vendorPrice) > 0 && (
              <p className="text-sm text-green-700 font-medium">
                {fmt(parseFloat(vendorPrice))}
              </p>
            )}
          </div>

          {/* ETA fields — hanya untuk non-Trucking */}
          {!isTrucking && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="etaPickup" className="text-sm text-slate-600">
                    ETA Pickup
                  </Label>
                  <Input
                    id="etaPickup"
                    placeholder="Besok / 13 Mei"
                    value={estimatedPickup}
                    onChange={(e) => setEstimatedPickup(e.target.value)}
                    className="border-slate-300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="etaDelivery" className="text-sm text-slate-600">
                    ETA Delivery
                  </Label>
                  <Input
                    id="etaDelivery"
                    placeholder="3-5 hari / 16 Mei"
                    value={estimatedDelivery}
                    onChange={(e) => setEstimatedDelivery(e.target.value)}
                    className="border-slate-300"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="estDays" className="text-sm text-slate-600">
                  Estimasi Hari (angka)
                </Label>
                <Input
                  id="estDays"
                  type="number"
                  inputMode="numeric"
                  placeholder="Contoh: 3"
                  value={estimatedDays}
                  onChange={(e) => setEstimatedDays(e.target.value)}
                  className="border-slate-300"
                />
              </div>
            </>
          )}

          {/* Catatan — selalu ada */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm text-slate-600">
              {isTrucking ? "Catatan Tambahan (opsional)" : "Catatan / Syarat Tambahan"}
            </Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder={
                isTrucking
                  ? "Misal: Armada siap, butuh koordinasi H-1, dll."
                  : "Misal: Sudah termasuk asuransi, pembayaran 14 hari, dll."
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="border-slate-300 resize-none"
            />
          </div>

          <Button
            type="submit"
            disabled={sending}
            className={`w-full h-12 text-white text-base font-semibold rounded-xl ${
              isTrucking
                ? "bg-orange-500 hover:bg-orange-600"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Mengirim...
              </>
            ) : isTrucking ? (
              <>
                <ThumbsUp className="w-4 h-4 mr-2" />
                {isAlreadySubmitted ? "Perbarui Konfirmasi" : "Setuju — Saya Sanggup Memenuhi Jadwal"}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {isAlreadySubmitted ? "Perbarui Penawaran" : "Kirim Penawaran"}
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-slate-400 pb-6">
          © CST Logistics — Form ini hanya untuk vendor yang menerima RFQ.
        </p>
      </div>
    </div>
  );
}
