import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders, getAuthToken, isAuthenticated } from "@/lib/auth";
import { useGetPortalMe } from "@workspace/api-client-react";
import {
  Ship, Plane, ArrowLeft, Plus, Trash2, ChevronRight, ChevronLeft,
  Upload, FileText, AlertTriangle, Check, Loader2, Package,
  MapPin, User, Weight, LayoutGrid,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────── */
type Direction = "Impor" | "Ekspor" | "Domestic";
type Mode = "Sea" | "Air";
type SeaType = "LCL" | "FCL";
type Variant = "D2D" | "D2P" | "P2D" | "P2P";
type GoodsCategory = "Non DG" | "DG";

interface CargoItem {
  id: string;
  grossWeight: string;
  kolli: string;
  length: string;
  width: string;
  height: string;
}

interface UploadedDoc {
  name: string;
  objectPath: string;
  uploading: boolean;
  error?: string;
}

/* ─── Constants ──────────────────────────────────────────────────── */
const VARIANT_LABELS: Record<Variant, string> = {
  D2D: "Door to Door",
  D2P: "Door to Port",
  P2D: "Port to Door",
  P2P: "Port to Port",
};

const VARIANT_DESCS: Record<Variant, string> = {
  D2D: "Pengiriman dari pintu pengirim ke pintu penerima",
  D2P: "Pengiriman dari pintu pengirim ke pelabuhan/bandara tujuan",
  P2D: "Pengiriman dari pelabuhan/bandara asal ke pintu penerima",
  P2P: "Pengiriman antar pelabuhan/bandara",
};

function newItem(): CargoItem {
  return { id: crypto.randomUUID(), grossWeight: "", kolli: "", length: "", width: "", height: "" };
}

/* ─── DocUploader ────────────────────────────────────────────────── */
function DocUploader({
  label, required, hint, accept, value, onChange,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  accept?: string;
  value: UploadedDoc | null;
  onChange: (doc: UploadedDoc | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    onChange({ name: file.name, objectPath: "", uploading: true });
    try {
      const tokenRes = await fetch("/api/portal/order-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ contentType: file.type || "application/pdf" }),
      });
      if (!tokenRes.ok) throw new Error("Gagal mendapatkan URL upload");
      const { uploadURL, objectPath } = await tokenRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/pdf" },
      });
      if (!putRes.ok) throw new Error("Upload gagal");
      onChange({ name: file.name, objectPath, uploading: false });
    } catch (err) {
      onChange({ name: file.name, objectPath: "", uploading: false, error: String(err) });
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-semibold">{label}</Label>
        {required && <span className="text-red-500 text-xs">*</span>}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <div
        onClick={() => ref.current?.click()}
        className={`relative cursor-pointer border-2 border-dashed rounded-xl px-4 py-3 flex items-center gap-3 transition-all ${
          value?.objectPath
            ? "border-emerald-400 bg-emerald-50"
            : value?.error
            ? "border-red-300 bg-red-50"
            : "border-border hover:border-primary/50 bg-muted/30"
        }`}
      >
        <input
          ref={ref}
          type="file"
          className="hidden"
          accept={accept ?? "application/pdf,image/*,.doc,.docx"}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
        />
        {value?.uploading ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : value?.objectPath ? (
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : (
          <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          {value?.name ? (
            <p className={`text-xs font-medium truncate ${value.objectPath ? "text-emerald-700" : value.error ? "text-red-600" : "text-foreground"}`}>
              {value.name}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Klik untuk upload file</p>
          )}
          {value?.error && <p className="text-[10px] text-red-500">{value.error}</p>}
        </div>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="text-muted-foreground hover:text-destructive ml-1 shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function FreightForwarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Navigation state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [seaType, setSeaType] = useState<SeaType | null>(null);
  const [variant, setVariant] = useState<Variant | null>(null);

  // Form state
  const [senderName, setSenderName] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  const [commodity, setCommodity] = useState("");
  const [goodsCategory, setGoodsCategory] = useState<GoodsCategory>("Non DG");
  const [freightPrice, setFreightPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<CargoItem[]>([newItem()]);

  // Customer info (pre-filled if logged in)
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [companyName, setCompanyName] = useState("");

  // Documents
  const [docInvoice, setDocInvoice] = useState<UploadedDoc | null>(null);
  const [docPackingList, setDocPackingList] = useState<UploadedDoc | null>(null);
  const [docMsds, setDocMsds] = useState<UploadedDoc | null>(null);
  const [docCoa, setDocCoa] = useState<UploadedDoc | null>(null);
  const [docOther, setDocOther] = useState<UploadedDoc | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // ── Load profile → pre-fill read-only fields ──────────────────────
  const token = getAuthToken();
  const headers = getAuthHeaders();
  const { data: portalUser } = useGetPortalMe({
    query: { queryKey: ["portalMe", token], enabled: !!token },
    request: { headers },
  });

  useEffect(() => {
    if (!portalUser) return;
    setCustomerName((prev) => prev || (portalUser.name ?? ""));
    setCustomerEmail((prev) => prev || (portalUser.email ?? ""));
    setCompanyName((prev) => prev || (portalUser.company ?? ""));
    setCustomerPhone((prev) => prev || (portalUser.phone ?? ""));
  }, [portalUser]);

  const isDG = goodsCategory === "DG";

  // ── Cargo calculations ────────────────────────────────────────────
  const totalGrossWeight = items.reduce((sum, it) => {
    const w = parseFloat(it.grossWeight) || 0;
    return sum + w;
  }, 0);

  const totalVolumeCBM = items.reduce((sum, it) => {
    const l = parseFloat(it.length) || 0;
    const w = parseFloat(it.width) || 0;
    const h = parseFloat(it.height) || 0;
    const k = parseFloat(it.kolli) || 1;
    return sum + (l * w * h * k) / 1_000_000;
  }, 0);

  // Air freight standard: 1 CBM = 167 kg volumetric weight
  const volumetricWeight = totalVolumeCBM * 167;
  const chargeableWeight = Math.max(totalGrossWeight, volumetricWeight);
  const freightPriceNum = parseFloat(freightPrice) || 0;
  // For Air: price per kg × chargeable weight; For Sea: price per CBM × volume
  const estimasiTotal = mode === "Air"
    ? freightPriceNum * chargeableWeight
    : freightPriceNum * totalVolumeCBM;

  function fmtIDR(n: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  function fmtNum(n: number, dec = 3) {
    return n.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: dec });
  }

  // Available variants per direction
  function availableVariants(): Variant[] {
    if (direction === "Domestic") return ["D2P", "P2P"];
    return ["D2D", "D2P", "P2D", "P2P"];
  }

  function modeLabel(m: Mode) {
    return m === "Sea" ? "Sea Freight" : "Air Freight";
  }

  function freightLabel() {
    return mode === "Sea" ? "Harga Sea Freight" : "Harga Air Freight";
  }

  // Stepper display
  const STEP_LABELS = ["Arah", "Mode", "Layanan", "Form & Dokumen"];

  // Item helpers
  function updateItem(id: string, field: keyof CargoItem, val: string) {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, [field]: val } : it));
  }
  function addItem() { setItems((prev) => [...prev, newItem()]); }
  function removeItem(id: string) { setItems((prev) => prev.filter((it) => it.id !== id)); }

  // Validation per step
  function missingFields(): string[] {
    const missing: string[] = [];
    if (!senderName) missing.push("Nama Pengirim");
    if (!senderAddress) missing.push("Alamat Pengirim");
    if (!receiverName) missing.push("Nama Penerima");
    if (!receiverAddress) missing.push("Alamat Penerima");
    if (!commodity) missing.push("Nama Barang / Komoditi");
    if (!docInvoice?.objectPath) missing.push("Dokumen Invoice");
    if (!docPackingList?.objectPath) missing.push("Dokumen Packing List");
    if (isDG && !docMsds?.objectPath) missing.push("Dokumen MSDS/SDS");
    if (isDG && !docCoa?.objectPath) missing.push("Dokumen COA");
    if (!customerName) missing.push("Nama PIC");
    if (!customerEmail) missing.push("Email");
    if (!customerPhone) missing.push("Telepon / WhatsApp");
    if (items.some((it) => !it.grossWeight || !it.kolli)) missing.push("Berat & Kolli semua item kargo");
    return missing;
  }

  function canProceed() {
    if (step === 1) return !!direction;
    if (step === 2) return !!mode;
    if (step === 3) return !!variant && (mode !== "Sea" || !!seaType);
    return missingFields().length === 0;
  }

  async function handleSubmit() {
    if (!canProceed()) {
      toast({ title: "Lengkapi semua data yang wajib diisi", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const seaTypeLabel = mode === "Sea" && seaType ? ` (${seaType})` : "";
      const serviceLabel = `Freight Forwarding — ${direction} ${modeLabel(mode!)}${seaTypeLabel} ${VARIANT_LABELS[variant!]}`;
      const docsList = [
        docInvoice ? `Invoice: ${docInvoice.objectPath}` : null,
        docPackingList ? `Packing List: ${docPackingList.objectPath}` : null,
        docMsds ? `MSDS/SDS: ${docMsds.objectPath}` : null,
        docCoa ? `COA: ${docCoa.objectPath}` : null,
        docOther ? `Lainnya: ${docOther.objectPath}` : null,
      ].filter(Boolean).join("\n");

      const ffData = JSON.stringify({
        direction, mode: modeLabel(mode!), ...(mode === "Sea" && seaType ? { seaType } : {}), variant: VARIANT_LABELS[variant!],
        sender: { name: senderName, address: senderAddress },
        receiver: { name: receiverName, address: receiverAddress },
        commodity, goodsCategory,
        cargoItems: items.map((it) => ({
          grossWeight: it.grossWeight, kolli: it.kolli,
          dimensions: `${it.length}x${it.width}x${it.height} cm`,
        })),
        totalGrossWeight: `${fmtNum(totalGrossWeight, 1)} kg`,
        totalVolumeCBM: `${fmtNum(totalVolumeCBM)} CBM`,
        ...(mode === "Air" ? {
          volumetricWeight: `${fmtNum(volumetricWeight, 1)} kg`,
          chargeableWeight: `${fmtNum(chargeableWeight, 1)} kg`,
          estimasiTotal: fmtIDR(estimasiTotal),
        } : {
          estimasiTotal: fmtIDR(estimasiTotal),
        }),
        freightPrice: `${freightPrice} IDR/${mode === "Air" ? "kg" : "CBM"}`,
        documents: { invoice: docInvoice?.objectPath, packingList: docPackingList?.objectPath, msds: docMsds?.objectPath, coa: docCoa?.objectPath, other: docOther?.objectPath },
      });

      const contactLines = [
        `PIC: ${customerName}`,
        companyName ? `Perusahaan: ${companyName}` : null,
        `Email: ${customerEmail}`,
        `Telepon: ${customerPhone}`,
      ].filter(Boolean).join("\n");

      const fullNotes = [
        notes || null,
        `[KONTAK PEMESAN]\n${contactLines}`,
        `[FF DATA]\n${ffData}`,
        docsList ? `[DOKUMEN]\n${docsList}` : null,
      ].filter(Boolean).join("\n\n");

      const body = {
        notes: fullNotes,
        items: [
          {
            name: serviceLabel,
            quantity: 1,
            unitPrice: estimasiTotal > 0 ? estimasiTotal : (parseFloat(freightPrice) || 0),
          },
        ],
      };

      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? "Terjadi kesalahan");
      }

      toast({ title: "Pesanan freight forwarding berhasil dikirim!" });
      setLocation("/logistic-order-success");
    } catch (err) {
      toast({ title: "Gagal mengirim pesanan", description: String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  /* ── STEP 1: Direction ─────────────────────────────────────────── */
  const DIRECTIONS: { label: Direction; icon: string; desc: string; color: string }[] = [
    { label: "Impor", icon: "📥", desc: "Barang masuk ke Indonesia dari luar negeri", color: "border-blue-300 bg-blue-50 text-blue-800" },
    { label: "Ekspor", icon: "📤", desc: "Barang keluar dari Indonesia ke luar negeri", color: "border-emerald-300 bg-emerald-50 text-emerald-800" },
    { label: "Domestic", icon: "🗺️", desc: "Pengiriman kargo antar kota dalam Indonesia", color: "border-amber-300 bg-amber-50 text-amber-800" },
  ];

  /* ── STEP 2: Mode ─────────────────────────────────────────────── */
  const MODES: { label: Mode; icon: React.ReactNode; desc: string; detail: string }[] = [
    {
      label: "Sea",
      icon: <Ship className="h-8 w-8 text-blue-600" />,
      desc: "Sea Freight",
      detail: "Pengiriman via kapal laut. Kapasitas besar, biaya lebih ekonomis.",
    },
    {
      label: "Air",
      icon: <Plane className="h-8 w-8 text-sky-500" />,
      desc: "Air Freight",
      detail: "Pengiriman via pesawat. Lebih cepat, ideal untuk barang sensitif waktu.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => { if (step === 1) setLocation("/jasa"); else setStep((s) => (s - 1) as typeof step); }}
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 1 ? "Kembali ke Layanan" : "Kembali"}
          </button>
          <div className="flex-1" />
          <Badge variant="outline" className="text-xs gap-1">
            <Package className="h-3 w-3" /> Freight Forwarding
          </Badge>
        </div>
      </nav>

      {/* Stepper */}
      <div className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((label, idx) => {
              const s = idx + 1;
              const done = step > s;
              const active = step === s;
              return (
                <div key={idx} className="flex items-center">
                  <div className={`flex items-center gap-1.5 ${active || done ? "opacity-100" : "opacity-35"}`}>
                    <div className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                      done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}>
                      {done ? <Check className="w-3 h-3" /> : s}
                    </div>
                    <span className={`text-xs hidden sm:block ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
                  </div>
                  {idx < STEP_LABELS.length - 1 && <ChevronRight className="w-3 h-3 text-border mx-1 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* ── Step 1: Direction ─────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Pilih Arah Pengiriman</h2>
              <p className="text-sm text-muted-foreground mt-1">Tentukan jenis pengiriman yang Anda butuhkan</p>
            </div>
            <div className="grid gap-4">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setDirection(d.label)}
                  className={`w-full rounded-2xl border-2 p-5 text-left transition-all ${
                    direction === d.label
                      ? `${d.color} border-opacity-100 shadow-md scale-[1.01]`
                      : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{d.icon}</span>
                    <div>
                      <p className="font-bold text-base">{d.label}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{d.desc}</p>
                    </div>
                    {direction === d.label && <Check className="h-5 w-5 ml-auto shrink-0 text-current" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Mode ─────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">{direction}</Badge>
              </div>
              <h2 className="text-xl font-bold text-foreground">Pilih Moda Pengiriman</h2>
              <p className="text-sm text-muted-foreground mt-1">Pilih moda transportasi yang sesuai</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {MODES.map((m) => (
                <button
                  key={m.label}
                  onClick={() => { setMode(m.label); if (m.label !== "Sea") setSeaType(null); }}
                  className={`rounded-2xl border-2 p-6 text-left transition-all ${
                    mode === m.label
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
                  }`}
                >
                  <div className="flex flex-col items-center gap-3 text-center">
                    {m.icon}
                    <div>
                      <p className="font-bold text-base">{m.desc}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{m.detail}</p>
                    </div>
                    {mode === m.label && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Variant ──────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary">{direction}</Badge>
                <Badge variant="outline">{modeLabel(mode!)}</Badge>
              </div>
              <h2 className="text-xl font-bold text-foreground">Pilih Jenis Layanan</h2>
              <p className="text-sm text-muted-foreground mt-1">Tentukan rute pengiriman dari titik asal ke tujuan</p>
            </div>

            {/* ── LCL / FCL selector (Sea Freight only) ─────────── */}
            {mode === "Sea" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Tipe Kontainer</p>
                <div className="flex gap-2">
                  {(["LCL", "FCL"] as SeaType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSeaType(t)}
                      className={`px-5 py-2 rounded-full text-sm font-bold border-2 transition-all ${
                        seaType === t
                          ? t === "LCL"
                            ? "bg-amber-400 border-amber-400 text-black shadow-sm"
                            : "bg-gray-900 border-gray-900 text-white shadow-sm"
                          : "bg-card border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {seaType && (
                  <p className="text-xs text-muted-foreground">
                    {seaType === "LCL"
                      ? "Less than Container Load — barang digabung bersama kargo lain dalam satu kontainer (cocok untuk muatan kecil)"
                      : "Full Container Load — satu kontainer penuh untuk kargo Anda (cocok untuk muatan besar, lebih efisien)"}
                  </p>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              {availableVariants().map((v) => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`rounded-2xl border-2 p-5 text-left transition-all ${
                    variant === v
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${variant === v ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                      {v}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{VARIANT_LABELS[v]}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{VARIANT_DESCS[v]}</p>
                    </div>
                    {variant === v && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 4: Form ─────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                <Badge variant="secondary">{direction}</Badge>
                <Badge variant="outline">{modeLabel(mode!)}</Badge>
                {mode === "Sea" && seaType && (
                  <Badge className={seaType === "LCL" ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100" : "bg-gray-900 text-white border-gray-900 hover:bg-gray-900"}>
                    {seaType}
                  </Badge>
                )}
                <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">{VARIANT_LABELS[variant!]}</Badge>
              </div>
              <h2 className="text-xl font-bold text-foreground">Data Pengiriman & Dokumen</h2>
              <p className="text-sm text-muted-foreground mt-1">Lengkapi detail pengiriman dan upload dokumen yang diperlukan</p>
            </div>

            {/* ── Pengirim ──────────────────── */}
            <div className="rounded-2xl border border-border p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                  <MapPin className="h-3.5 w-3.5" />
                </div>
                Data Pengirim
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Nama Pengirim <span className="text-red-500">*</span></Label>
                  <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Nama perusahaan / perorangan" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Alamat Lengkap Pengirim <span className="text-red-500">*</span></Label>
                  <Textarea value={senderAddress} onChange={(e) => setSenderAddress(e.target.value)} placeholder="Jl. ..., Kota, Negara, Kode Pos" rows={2} />
                </div>
              </div>
            </div>

            {/* ── Penerima ──────────────────── */}
            <div className="rounded-2xl border border-border p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <MapPin className="h-3.5 w-3.5" />
                </div>
                Data Penerima
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Nama Penerima <span className="text-red-500">*</span></Label>
                  <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="Nama perusahaan / perorangan" />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Alamat Lengkap Penerima <span className="text-red-500">*</span></Label>
                  <Textarea value={receiverAddress} onChange={(e) => setReceiverAddress(e.target.value)} placeholder="Jl. ..., Kota, Negara, Kode Pos" rows={2} />
                </div>
              </div>
            </div>

            {/* ── Barang ──────────────────────── */}
            <div className="rounded-2xl border border-border p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Package className="h-3.5 w-3.5" />
                </div>
                Data Barang
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Nama Barang / Komoditi <span className="text-red-500">*</span></Label>
                  <Input value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="Elektronik, Kimia, Tekstil, dll." />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Kategori Barang <span className="text-red-500">*</span></Label>
                  <div className="flex gap-2">
                    {(["Non DG", "DG"] as GoodsCategory[]).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setGoodsCategory(cat)}
                        className={`flex-1 rounded-xl border-2 py-3 text-sm font-semibold transition-all ${
                          goodsCategory === cat
                            ? cat === "DG"
                              ? "border-orange-400 bg-orange-50 text-orange-700"
                              : "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {cat === "DG" ? "⚠️ DG (Dangerous Goods)" : "✅ Non DG (Aman)"}
                      </button>
                    ))}
                  </div>
                  {isDG && (
                    <div className="mt-2 flex items-start gap-2 text-xs text-orange-700 bg-orange-50 rounded-xl px-3 py-2.5 border border-orange-200">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Barang DG wajib melampirkan dokumen <strong>MSDS/SDS</strong> dan <strong>COA</strong>.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Items table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Weight className="h-3.5 w-3.5" /> Detail Item Kargo <span className="text-red-500">*</span>
                  </Label>
                  <Button size="sm" variant="outline" onClick={addItem} className="h-7 text-xs gap-1 px-2">
                    <Plus className="h-3.5 w-3.5" /> Tambah Item
                  </Button>
                </div>
                <div className="space-y-3">
                  {items.map((it, idx) => (
                    <div key={it.id} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Item {idx + 1}</span>
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(it.id)} className="text-destructive hover:text-destructive/80">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Berat Kotor (kg) <span className="text-red-500">*</span></Label>
                          <Input
                            type="number" min="0" placeholder="0"
                            value={it.grossWeight}
                            onChange={(e) => updateItem(it.id, "grossWeight", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Jumlah Kolli <span className="text-red-500">*</span></Label>
                          <Input
                            type="number" min="1" placeholder="1"
                            value={it.kolli}
                            onChange={(e) => updateItem(it.id, "kolli", e.target.value)}
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1 space-y-1">
                          <Label className="text-[11px] flex items-center gap-1"><LayoutGrid className="h-3 w-3" /> Dimensi (cm)</Label>
                          <div className="flex gap-1">
                            <Input type="number" min="0" placeholder="P" value={it.length} onChange={(e) => updateItem(it.id, "length", e.target.value)} className="text-center" />
                            <Input type="number" min="0" placeholder="L" value={it.width} onChange={(e) => updateItem(it.id, "width", e.target.value)} className="text-center" />
                            <Input type="number" min="0" placeholder="T" value={it.height} onChange={(e) => updateItem(it.id, "height", e.target.value)} className="text-center" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cargo summary */}
              {(totalGrossWeight > 0 || totalVolumeCBM > 0) && (
                <div className="rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide">Jumlah Volume</p>
                    <p className="text-sm font-bold text-sky-900">{fmtNum(totalVolumeCBM)} CBM</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide">Total Berat Kotor</p>
                    <p className="text-sm font-bold text-sky-900">{fmtNum(totalGrossWeight, 1)} kg</p>
                  </div>
                  {mode === "Air" && (
                    <>
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-wide">Berat Volumetrik</p>
                        <p className="text-sm font-bold text-sky-900">{fmtNum(volumetricWeight, 1)} kg</p>
                        <p className="text-[10px] text-sky-500">CBM × 167</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Chargeable Weight</p>
                        <p className="text-sm font-bold text-emerald-800">{fmtNum(chargeableWeight, 1)} kg</p>
                        <p className="text-[10px] text-emerald-500">maks(kotor, vol.)</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Freight price */}
              <div className="space-y-1">
                <Label className="text-xs">
                  {freightLabel()} (IDR/{mode === "Air" ? "kg" : "CBM"})
                  {" "}<span className="text-muted-foreground font-normal">— kosongkan jika belum ada</span>
                </Label>
                <Input
                  type="number" min="0" placeholder="0"
                  value={freightPrice}
                  onChange={(e) => setFreightPrice(e.target.value)}
                />
              </div>

              {/* Estimasi total */}
              {freightPriceNum > 0 && (totalGrossWeight > 0 || totalVolumeCBM > 0) && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">
                      Estimasi Total {mode === "Air" ? "Air Freight" : "Sea Freight"}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">
                      {mode === "Air"
                        ? `${fmtNum(freightPriceNum, 0)} IDR/kg × ${fmtNum(chargeableWeight, 1)} kg chargeable`
                        : `${fmtNum(freightPriceNum, 0)} IDR/CBM × ${fmtNum(totalVolumeCBM)} CBM`}
                    </p>
                  </div>
                  <p className="text-lg font-extrabold text-emerald-800 shrink-0">{fmtIDR(estimasiTotal)}</p>
                </div>
              )}
            </div>

            {/* ── Dokumen ─────────────────────── */}
            <div className="rounded-2xl border border-border p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                Upload Dokumen
              </h3>
              {!isAuthenticated() && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Login terlebih dahulu untuk mengupload dokumen
                </div>
              )}
              <DocUploader
                label="Invoice" required
                hint="Dokumen invoice / commercial invoice"
                value={docInvoice}
                onChange={setDocInvoice}
              />
              <DocUploader
                label="Packing List" required
                hint="Dokumen packing list"
                value={docPackingList}
                onChange={setDocPackingList}
              />
              {isDG && (
                <>
                  <DocUploader
                    label="MSDS / SDS" required
                    hint="Material Safety Data Sheet / Safety Data Sheet — wajib untuk barang DG"
                    value={docMsds}
                    onChange={setDocMsds}
                  />
                  <DocUploader
                    label="COA (Certificate of Analysis)" required
                    hint="Wajib untuk barang DG / kimia"
                    value={docCoa}
                    onChange={setDocCoa}
                  />
                </>
              )}
              <DocUploader
                label="Dokumen Lainnya"
                hint="Dokumen pendukung tambahan (opsional)"
                value={docOther}
                onChange={setDocOther}
              />
            </div>

            {/* ── Data Pemesan ─────────────────── */}
            <div className="rounded-2xl border border-border p-5 space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center">
                  <User className="h-3.5 w-3.5" />
                </div>
                Data Pemesan
              </h3>
              {portalUser && (
                <div className="flex items-start gap-2 text-xs text-sky-700 bg-sky-50 rounded-xl px-3 py-2.5 border border-sky-200">
                  <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-500" />
                  <span>Data diambil dari profil akun Anda. Hanya nomor telepon yang dapat diubah.</span>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nama PIC <span className="text-red-500">*</span></Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nama lengkap"
                    readOnly={!!portalUser?.name}
                    className={portalUser?.name ? "bg-muted/50 text-muted-foreground cursor-default" : ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nama Perusahaan</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="PT. ..."
                    readOnly={!!portalUser?.company}
                    className={portalUser?.company ? "bg-muted/50 text-muted-foreground cursor-default" : ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email <span className="text-red-500">*</span></Label>
                  <Input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="email@perusahaan.com"
                    readOnly={!!portalUser?.email}
                    className={portalUser?.email ? "bg-muted/50 text-muted-foreground cursor-default" : ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telepon / WhatsApp <span className="text-red-500">*</span></Label>
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+62..." />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Catatan Tambahan</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instruksi khusus, informasi tambahan, dll." rows={2} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Validation summary (step 4 only) ──────────────────── */}
        {step === 4 && missingFields().length > 0 && (
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Lengkapi field berikut sebelum mengirim pesanan:
            </p>
            <ul className="space-y-0.5 pl-5 list-disc">
              {missingFields().map((f) => (
                <li key={f} className="text-xs text-orange-700">{f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Navigation ───────────────────────────────────────── */}
        <div className={`flex pt-4 border-t border-border ${step === 1 ? "justify-end" : "justify-between"}`}>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as typeof step)}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Kembali
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={() => setStep((s) => (s + 1) as typeof step)} disabled={!canProceed()}>
              Lanjutkan <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={() => void handleSubmit()}
              disabled={submitting || !canProceed()}
              className="bg-primary hover:bg-primary/90 font-semibold gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Kirim Pesanan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
