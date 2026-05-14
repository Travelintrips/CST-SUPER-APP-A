import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders, isAuthenticated } from "@/lib/auth";
import { useGetPortalMe, useCreateLogisticOrder } from "@workspace/api-client-react";
import { useEditMode } from "@/contexts/EditModeContext";
import { resolveImageUrl } from "@/lib/utils";
import {
  FileCheck, ArrowLeft, ChevronRight, Upload, FileText,
  AlertTriangle, Check, Loader2, Trash2, Calculator,
  Scale, Package, BookOpen, Users, ImagePlus, X,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────── */
type ServiceType = "pib_peb" | "handling" | "konsultasi" | "undername";
type Direction = "Impor" | "Ekspor";
type HandlingJalur = "Hijau" | "Merah";
type KonsultasiRegulasi = "Perijinan Pabean" | "Regulasi Pabean";

interface UploadedDoc {
  label: string;
  name: string;
  objectPath: string;
  uploading: boolean;
  error?: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────── */
const fmtIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

function calcHandlingFee(chargeableKg: number, jalur: HandlingJalur): number {
  if (chargeableKg <= 0) return 0;
  if (jalur === "Hijau") {
    if (chargeableKg <= 100) return 500_000;
    if (chargeableKg <= 500) return chargeableKg * 1_800;
    return chargeableKg * 1_500;
  } else {
    const base = chargeableKg <= 100 ? 650_000 : chargeableKg <= 500 ? chargeableKg * 1_900 : chargeableKg * 1_600;
    return base + 600_000; // Bahandel/Inspeksi fee
  }
}

/* ─── DocUploader ─────────────────────────────────────────────────── */
function DocUploader({
  label, required, value, onChange,
}: {
  label: string;
  required?: boolean;
  value: UploadedDoc | null;
  onChange: (doc: UploadedDoc | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    onChange({ label, name: file.name, objectPath: "", uploading: true });
    try {
      const tokenRes = await fetch("/api/portal/order-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ contentType: file.type || "application/pdf" }),
      });
      if (!tokenRes.ok) throw new Error("Gagal mendapatkan URL upload");
      const { uploadURL, objectPath } = await tokenRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, {
        method: "PUT", body: file,
        headers: { "Content-Type": file.type || "application/pdf" },
      });
      if (!putRes.ok) throw new Error("Upload gagal");
      onChange({ label, name: file.name, objectPath, uploading: false });
    } catch (err) {
      onChange({ label, name: file.name, objectPath: "", uploading: false, error: String(err) });
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-semibold">{label}</Label>
        {required && <span className="text-red-500 text-xs">*</span>}
      </div>
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
          accept="application/pdf,image/*,.doc,.docx"
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

/* ─── Service Options ─────────────────────────────────────────────── */
const SERVICE_OPTIONS: { key: ServiceType; icon: React.ReactNode; title: string; desc: string; color: string }[] = [
  {
    key: "pib_peb",
    icon: <FileText className="h-6 w-6" />,
    title: "Pembuatan Dok. PIB/PEB",
    desc: "Pengurusan dokumen PIB (Pemberitahuan Impor Barang) atau PEB (Pemberitahuan Ekspor Barang) per shipment",
    color: "border-orange-300 bg-orange-50 text-orange-800",
  },
  {
    key: "handling",
    icon: <Scale className="h-6 w-6" />,
    title: "Handling Clearance",
    desc: "Pengurusan barang di bea cukai — Jalur Hijau (SPPB) atau Jalur Merah (SPJM) dengan kalkulasi biaya otomatis",
    color: "border-red-300 bg-red-50 text-red-800",
  },
  {
    key: "konsultasi",
    icon: <BookOpen className="h-6 w-6" />,
    title: "Konsultasi Pabean",
    desc: "Konsultasi regulasi perijinan dan regulasi kepabeanan impor/ekspor bersama tim ahli PPJK kami",
    color: "border-blue-300 bg-blue-50 text-blue-800",
  },
  {
    key: "undername",
    icon: <Users className="h-6 w-6" />,
    title: "Undername Impor/Ekspor",
    desc: "Layanan undername menggunakan entitas kami sebagai importer/eksporter of record. Biaya dikonfirmasi setelah pengecekan dokumen.",
    color: "border-violet-300 bg-violet-50 text-violet-800",
  },
];

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function Pabean() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // --- edit mode ---
  const { editMode, content, updateField, uploadImage } = useEditMode();
  const [uploadingLogo, setUploadingLogo] = useState<string | null>(null);
  const logoFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleServiceLogoUpload(key: string, file: File) {
    setUploadingLogo(key);
    try {
      const path = await uploadImage(file);
      updateField(`pabean_logo_${key}`, path);
    } catch {
      toast({ title: "Gagal upload logo", variant: "destructive" });
    } finally {
      setUploadingLogo(null);
    }
  }

  // --- global state ---
  const search = useSearch();
  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const detailSectionRef = useRef<HTMLDivElement>(null);

  function toggleService(key: ServiceType) {
    setSelectedServices((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  }

  // ── Read ?service= param from jasa page shortcut ─────────────────
  useEffect(() => {
    const params = new URLSearchParams(search);
    const svc = params.get("service") as ServiceType | null;
    if (svc && (["pib_peb", "handling", "konsultasi", "undername"] as string[]).includes(svc)) {
      setSelectedServices([svc]);
      setTimeout(() => {
        detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }, []);

  // --- customer info ---
  const [customerName, setCustomerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");

  // --- PIB/PEB state ---
  const [pibShipmentType, setPibShipmentType] = useState<"AWB" | "BL">("AWB");

  // --- Handling state ---
  const [jalur, setJalur] = useState<HandlingJalur | null>(null);
  const [kolli, setKolli] = useState("");
  const [grossWeight, setGrossWeight] = useState("");
  const [dimL, setDimL] = useState("");
  const [dimW, setDimW] = useState("");
  const [dimH, setDimH] = useState("");

  // --- Konsultasi state ---
  const [regulasi, setRegulasi] = useState<KonsultasiRegulasi | null>(null);
  const [konsultasiDetail, setKonsultasiDetail] = useState("");

  // --- Docs ---
  const [docNIB, setDocNIB] = useState<UploadedDoc | null>(null);
  const [docNPWP, setDocNPWP] = useState<UploadedDoc | null>(null);
  const [docAWBBL, setDocAWBBL] = useState<UploadedDoc | null>(null);
  const [docInvoice, setDocInvoice] = useState<UploadedDoc | null>(null);
  const [docPackingList, setDocPackingList] = useState<UploadedDoc | null>(null);
  const [docCOO, setDocCOO] = useState<UploadedDoc | null>(null);
  const [docPerijinan, setDocPerijinan] = useState<UploadedDoc | null>(null);
  const [docLainnya, setDocLainnya] = useState<UploadedDoc | null>(null);

  // --- Portal user auto-fill ---
  const { data: portalUser } = useGetPortalMe({
    query: { queryKey: ["portalMe"], enabled: isAuthenticated() },
  });
  const createOrder = useCreateLogisticOrder();

  useEffect(() => {
    if (portalUser) {
      if (portalUser.name) setCustomerName(portalUser.name);
      if (portalUser.email) setCustomerEmail(portalUser.email);
      if (portalUser.company) setCompanyName(portalUser.company);
      if (portalUser.phone) setCustomerPhone(portalUser.phone);
    }
  }, [portalUser]);

  /* ── Handling Clearance calculations ─────────────────────────── */
  const gw = parseFloat(grossWeight) || 0;
  const l = parseFloat(dimL) || 0;
  const w = parseFloat(dimW) || 0;
  const h = parseFloat(dimH) || 0;
  const volumetricKg = l && w && h ? (l * w * h) / 6000 : 0;
  const chargeableKg = Math.max(gw, volumetricKg);
  const handlingFee = jalur ? calcHandlingFee(chargeableKg, jalur) : 0;

  /* ── PIB/PEB fees ─────────────────────────────────────────────── */
  const pibFee = 250_000 + 200_000 + 200_000; // PIB + Dok + Adm

  /* ── Estimated total (combined) ───────────────────────────────── */
  function estimatedTotal(): number {
    let total = 0;
    if (selectedServices.includes("pib_peb")) total += pibFee;
    if (selectedServices.includes("handling")) total += handlingFee;
    if (selectedServices.includes("konsultasi")) total += 250_000;
    // undername: dikonfirmasi
    return total;
  }

  /* ── Validation ───────────────────────────────────────────────── */
  function missingFields(): string[] {
    const m: string[] = [];
    if (selectedServices.length === 0) { m.push("Jenis layanan"); return m; }
    const needsDirection = selectedServices.some((s) => s !== "handling");
    if (needsDirection && !direction) m.push("Arah (Impor/Ekspor)");
    if (selectedServices.includes("handling")) {
      if (!jalur) m.push("Jalur (Hijau/Merah)");
      if (!kolli) m.push("Jumlah Kolli");
      if (!grossWeight) m.push("Berat Bruto");
    }
    if (selectedServices.includes("konsultasi")) {
      if (!regulasi) m.push("Jenis Regulasi");
      if (!konsultasiDetail.trim()) m.push("Detail konsultasi");
    }
    if (!customerName) m.push("Nama PIC");
    if (!customerEmail) m.push("Email");
    if (!customerPhone) m.push("Telepon / WhatsApp");
    return m;
  }

  /* ── Submit ───────────────────────────────────────────────────── */
  async function handleSubmit() {
    const missing = missingFields();
    if (missing.length > 0) {
      toast({ title: `Lengkapi: ${missing.join(", ")}`, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    {
      const svcLabels = selectedServices
        .map((s) => SERVICE_OPTIONS.find((o) => o.key === s)?.title ?? s)
        .join(" + ");

      const docs = [docNIB, docNPWP, docAWBBL, docInvoice, docPackingList, docCOO, docPerijinan, docLainnya]
        .filter(Boolean)
        .map((d) => `${d!.label}: ${d!.objectPath}`)
        .join("\n");

      const detailParts: string[] = [];
      if (selectedServices.includes("pib_peb")) {
        detailParts.push(`[PIB/PEB]\n${JSON.stringify({
          arah: direction, shipmentType: pibShipmentType,
          pibFee: fmtIDR(250_000), dokFee: fmtIDR(200_000), admFee: fmtIDR(200_000),
          totalEstimasi: fmtIDR(pibFee),
        })}`);
      }
      if (selectedServices.includes("handling")) {
        detailParts.push(`[Handling Clearance]\n${JSON.stringify({
          jalur: `Jalur ${jalur}`, kolli, beratBruto: `${gw} kg`,
          dimensi: `${l}×${w}×${h} cm`,
          beratVolumetrik: `${volumetricKg.toFixed(1)} kg`,
          chargeableWeight: `${chargeableKg.toFixed(1)} kg`,
          handlingFee: fmtIDR(handlingFee),
          ...(jalur === "Merah" ? { bahandelFee: fmtIDR(600_000) } : {}),
        })}`);
      }
      if (selectedServices.includes("konsultasi")) {
        detailParts.push(`[Konsultasi Pabean]\n${JSON.stringify({
          arah: direction, regulasi, detail: konsultasiDetail,
          tarifKonsultasi: fmtIDR(250_000),
        })}`);
      }
      if (selectedServices.includes("undername")) {
        detailParts.push(`[Undername]\n${JSON.stringify({
          arah: direction,
          catatan: "Biaya undername akan diinfokan setelah pengecekan dokumen oleh tim PPJK.",
        })}`);
      }

      const contactLines = [
        `PIC: ${customerName}`,
        companyName ? `Perusahaan: ${companyName}` : null,
        `Email: ${customerEmail}`,
        `Telepon: ${customerPhone}`,
      ].filter(Boolean).join("\n");

      const fullNotes = [
        notes || null,
        `[KONTAK PEMESAN]\n${contactLines}`,
        ...detailParts,
        docs ? `[DOKUMEN]\n${docs}` : null,
      ].filter(Boolean).join("\n\n");

      const orderItems = selectedServices.map((s) => {
        const opt = SERVICE_OPTIONS.find((o) => o.key === s);
        const price = s === "pib_peb" ? pibFee : s === "handling" ? handlingFee : s === "konsultasi" ? 250_000 : 0;
        return {
          name: `PPJK — ${opt?.title ?? s}${direction ? ` (${direction})` : ""}`,
          quantity: 1,
          unitPrice: price,
        };
      });

      const finalItems = orderItems.length > 0 ? orderItems : [{
        name: `Pengurusan Pabean PPJK — ${svcLabels}`,
        quantity: 1,
        unitPrice: estimatedTotal(),
      }];
      const tot = estimatedTotal();

      createOrder.mutate({ data: {
        companyName: companyName || "—",
        customerName,
        email: customerEmail,
        phone: customerPhone,
        shipmentType: "Pengurusan Pabean / PPJK",
        origin: direction || "—",
        destination: "—",
        notes: fullNotes || null,
        subtotal: tot,
        tax: 0,
        grandTotal: tot,
        items: finalItems.map((it) => ({
          category: "Pabean & PPJK",
          serviceName: it.name,
          calculatorType: "manual",
          inputData: {},
          calculationResult: { unitPrice: it.unitPrice, quantity: it.quantity },
          subtotal: it.unitPrice * it.quantity,
        })),
      }}, {
        onSuccess: (data) => {
          localStorage.setItem("last_order", JSON.stringify(data));
          toast({ title: "Permohonan PPJK berhasil dikirim! Tim kami akan segera menghubungi Anda." });
          setLocation("/logistic-order-success");
        },
        onError: (err) => {
          toast({ title: "Gagal mengirim permohonan", description: String(err), variant: "destructive" });
        },
        onSettled: () => setSubmitting(false),
      });
    }
  }

  const fmtIDR = (v: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

  /* ── SECTION: Header ──────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg,#F7F9FC 0%,#F0F4F9 100%)" }}>
      {/* Top bar — premium */}
      <div
        className="sticky top-0 z-50"
        style={{
          background: "linear-gradient(135deg, #0A2444 0%, #0B3D6B 45%, #0D5FA0 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 2px 20px rgba(10,36,68,0.28), 0 1px 4px rgba(10,36,68,0.18)",
        }}
      >
        {/* Top accent line */}
        <div className="h-[2.5px] w-full" style={{ background: "linear-gradient(90deg, #F59E0B 0%, #FBBF24 40%, rgba(251,191,36,0.3) 80%, transparent 100%)" }} />
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={() => setLocation("/jasa")}
            className="flex items-center gap-1.5 text-sm font-medium transition-all duration-150 rounded-lg px-2.5 py-1.5"
            style={{
              color: "rgba(255,255,255,0.72)",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.96)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.72)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
          >
            <ArrowLeft className="h-4 w-4" /> Kembali
          </button>
          <div className="w-px h-5" style={{ background: "rgba(255,255,255,0.18)" }} />
          <div className="flex items-center gap-2.5 flex-1">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
              style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.28) 0%, rgba(245,158,11,0.12) 100%)", border: "1px solid rgba(245,158,11,0.40)" }}
            >
              <FileCheck className="h-4.5 w-4.5" style={{ color: "#FBBF24" }} />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight" style={{ color: "rgba(255,255,255,0.97)" }}>Pengurusan Pabean / PPJK</p>
              <p className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.48)", letterSpacing: "0.05em" }}>CST Logistics · Layanan Kepabeanan</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 pb-24">

        {/* ── Step 1: Pilih Layanan ────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-white p-5 space-y-4">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">1</div>
            Pilih Jenis Layanan PPJK
          </h2>
          <p className="text-xs text-muted-foreground -mt-1">Pilih satu atau lebih layanan yang dibutuhkan</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {SERVICE_OPTIONS.map((opt) => {
              const isSelected = selectedServices.includes(opt.key);
              const logoKey = `pabean_logo_${opt.key}`;
              const rawLogo = content[logoKey];
              const logoSrc = rawLogo
                ? (rawLogo.startsWith("/") ? (resolveImageUrl(rawLogo) ?? rawLogo) : rawLogo)
                : null;
              const isUploading = uploadingLogo === opt.key;
              return (
                <div key={opt.key} className="relative">
                  <button
                    onClick={() => {
                      toggleService(opt.key);
                      if (!selectedServices.includes(opt.key)) {
                        setTimeout(() => {
                          detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 50);
                      }
                    }}
                    className={`w-full rounded-xl border-2 p-4 text-left transition-all flex flex-col gap-2 relative ${
                      isSelected
                        ? opt.color + " ring-2 ring-offset-1 ring-orange-400"
                        : "border-border hover:border-orange-200 bg-white"
                    }`}
                  >
                    {/* Checkbox top-right */}
                    <div className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-orange-500 border-orange-500"
                        : "bg-white border-gray-300"
                    }`}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex items-center gap-2 pr-7">
                      {/* Icon / Logo */}
                      <div className="relative shrink-0">
                        {logoSrc ? (
                          <img src={logoSrc} alt={opt.title} className="h-6 w-6 object-contain rounded" />
                        ) : isUploading ? (
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        ) : (
                          <span className={isSelected ? "" : "text-muted-foreground"}>{opt.icon}</span>
                        )}
                        {/* Edit mode overlay on icon */}
                        {editMode && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); logoFileRefs.current[opt.key]?.click(); }}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                            title="Upload logo"
                          >
                            <ImagePlus className="h-3.5 w-3.5 text-white" />
                          </button>
                        )}
                      </div>
                      <span className="font-semibold text-sm leading-tight">{opt.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
                  </button>

                  {/* Hidden file input */}
                  <input
                    ref={(el) => { logoFileRefs.current[opt.key] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleServiceLogoUpload(opt.key, f);
                      e.target.value = "";
                    }}
                  />

                  {/* Edit mode: remove logo button */}
                  {editMode && logoSrc && (
                    <button
                      type="button"
                      onClick={() => updateField(logoKey, "")}
                      className="absolute top-1 left-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors z-10"
                      title="Hapus logo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}

                  {/* Edit mode badge */}
                  {editMode && (
                    <div className="absolute bottom-2 left-2 bg-primary/90 text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded pointer-events-none">
                      Hover icon → upload logo
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {selectedServices.length > 1 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground">Terpilih:</span>
              {selectedServices.map((s) => (
                <span key={s} className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-medium">
                  {SERVICE_OPTIONS.find((o) => o.key === s)?.title}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Step 2: Detail Layanan ───────────────────────────────── */}
        {selectedServices.length > 0 && (
          <div ref={detailSectionRef} className="rounded-2xl border border-border bg-white p-5 space-y-6">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">2</div>
              Detail Layanan Terpilih
            </h2>

            {/* ─ PIB/PEB ─────────────────────────────────────── */}
            {selectedServices.includes("pib_peb") && (
              <div className="space-y-5 rounded-xl border border-orange-200 bg-orange-50/30 p-4">
                <div className="flex items-center gap-2 pb-1 border-b border-orange-200">
                  <FileText className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-semibold text-orange-800">Pembuatan Dok. PIB/PEB</span>
                </div>
                {/* Direction */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Arah Pengiriman *</Label>
                  <div className="flex gap-3">
                    {(["Impor", "Ekspor"] as Direction[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDirection(d)}
                        className={`flex-1 rounded-xl border-2 p-3 text-center text-sm font-medium transition-all ${
                          direction === d
                            ? "border-orange-400 bg-orange-50 text-orange-800"
                            : "border-border hover:border-orange-200"
                        }`}
                      >
                        {d === "Impor" ? "📥" : "📤"} {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shipment type */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Jenis Dokumen Pengiriman</Label>
                  <div className="flex gap-3">
                    {(["AWB", "BL"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setPibShipmentType(t)}
                        className={`flex-1 rounded-xl border-2 p-3 text-center text-sm font-medium transition-all ${
                          pibShipmentType === t
                            ? "border-orange-400 bg-orange-50 text-orange-800"
                            : "border-border hover:border-orange-200"
                        }`}
                      >
                        {t === "AWB" ? "✈️ AWB (Udara)" : "🚢 B/L (Laut)"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fee breakdown */}
                <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 space-y-2">
                  <p className="text-xs font-semibold text-orange-800 mb-3 flex items-center gap-2">
                    <Calculator className="h-3.5 w-3.5" /> Rincian Biaya per Shipment
                  </p>
                  {[
                    ["PIB Fee", "Rp 250.000"],
                    ["Dokumen Fee", "Rp 200.000"],
                    ["Administrasi Fee", "Rp 200.000"],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{val}</span>
                    </div>
                  ))}
                  <div className="border-t border-orange-300 pt-2 flex justify-between text-sm font-bold text-orange-800">
                    <span>Total Estimasi</span>
                    <span>{fmtIDR(pibFee)}</span>
                  </div>
                </div>

                {/* Documents */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Upload Dokumen</p>
                  {!isAuthenticated() && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Login terlebih dahulu untuk mengupload dokumen
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <DocUploader label="NIB" value={docNIB} onChange={setDocNIB} />
                    <DocUploader label="NPWP" value={docNPWP} onChange={setDocNPWP} />
                    <DocUploader label="AWB / B/L" value={docAWBBL} onChange={setDocAWBBL} />
                    <DocUploader label="Invoice" value={docInvoice} onChange={setDocInvoice} />
                    <DocUploader label="Packing List" value={docPackingList} onChange={setDocPackingList} />
                    <DocUploader label="COO (Certificate of Origin)" value={docCOO} onChange={setDocCOO} />
                  </div>
                  <DocUploader
                    label="Dok. Perijinan (PI / PE / LS / DI / lainnya)"
                    value={docPerijinan}
                    onChange={setDocPerijinan}
                  />
                </div>
              </div>
            )}

            {/* ─ Handling Clearance ──────────────────────────────── */}
            {selectedServices.includes("handling") && (
              <div className="space-y-5 rounded-xl border border-red-200 bg-red-50/30 p-4">
                <div className="flex items-center gap-2 pb-1 border-b border-red-200">
                  <Scale className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-800">Handling Clearance</span>
                </div>
                {/* Jalur */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Jalur Pemeriksaan *</Label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {(["Hijau", "Merah"] as HandlingJalur[]).map((j) => (
                      <button
                        key={j}
                        onClick={() => setJalur(j)}
                        className={`rounded-xl border-2 p-4 text-left transition-all ${
                          jalur === j
                            ? j === "Hijau"
                              ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                              : "border-red-400 bg-red-50 text-red-800"
                            : "border-border hover:border-orange-200"
                        }`}
                      >
                        <p className="font-semibold text-sm mb-1">
                          {j === "Hijau" ? "🟢" : "🔴"} Jalur {j} (SPPB{j === "Merah" ? "/SPJM" : ""})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {j === "Hijau"
                            ? "≤100kg: Rp 500rb flat · 101-500kg: Rp 1.800/kg · >500kg: Rp 1.500/kg"
                            : "≤100kg: Rp 650rb flat · 101-500kg: Rp 1.900/kg · >500kg: Rp 1.600/kg · + Bahandel Rp 600rb"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cargo details */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold">Data Kargo</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Jumlah Kolli *</Label>
                      <Input
                        type="number" min="1"
                        value={kolli}
                        onChange={(e) => setKolli(e.target.value)}
                        placeholder="mis. 10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Berat Bruto (kg) *</Label>
                      <Input
                        type="number" min="0" step="0.1"
                        value={grossWeight}
                        onChange={(e) => setGrossWeight(e.target.value)}
                        placeholder="mis. 250"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Dimensi per Kolli (cm) — untuk perhitungan berat volumetrik</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" min="0" step="0.1" value={dimL} onChange={(e) => setDimL(e.target.value)} placeholder="Panjang" />
                      <Input type="number" min="0" step="0.1" value={dimW} onChange={(e) => setDimW(e.target.value)} placeholder="Lebar" />
                      <Input type="number" min="0" step="0.1" value={dimH} onChange={(e) => setDimH(e.target.value)} placeholder="Tinggi" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Berat volumetrik = P × L × T / 6.000</p>
                  </div>
                </div>

                {/* Calculation result */}
                {jalur && (gw > 0 || volumetricKg > 0) && (
                  <div className={`rounded-xl border p-4 space-y-2 ${jalur === "Hijau" ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <p className={`text-xs font-semibold mb-3 flex items-center gap-2 ${jalur === "Hijau" ? "text-emerald-800" : "text-red-800"}`}>
                      <Calculator className="h-3.5 w-3.5" /> Kalkulasi Biaya Handling
                    </p>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Berat Bruto</span>
                        <span>{gw.toFixed(1)} kg</span>
                      </div>
                      {volumetricKg > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Berat Volumetrik</span>
                          <span>{volumetricKg.toFixed(1)} kg</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium">
                        <span className="text-muted-foreground">Chargeable Weight</span>
                        <span>{chargeableKg.toFixed(1)} kg <span className="text-[10px] text-muted-foreground">(yang terbesar)</span></span>
                      </div>
                      {jalur === "Merah" && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bahandel/Inspeksi Fee</span>
                          <span>{fmtIDR(600_000)}</span>
                        </div>
                      )}
                    </div>
                    <div className={`border-t pt-2 flex justify-between text-sm font-bold ${jalur === "Hijau" ? "border-emerald-300 text-emerald-800" : "border-red-300 text-red-800"}`}>
                      <span>Total Estimasi Handling</span>
                      <span>{fmtIDR(handlingFee)}</span>
                    </div>
                  </div>
                )}

                {/* Documents */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Upload Dokumen (Opsional)</p>
                  {!isAuthenticated() && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Login terlebih dahulu untuk mengupload dokumen
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <DocUploader label="AWB / B/L" value={docAWBBL} onChange={setDocAWBBL} />
                    <DocUploader label="Invoice" value={docInvoice} onChange={setDocInvoice} />
                    <DocUploader label="Packing List" value={docPackingList} onChange={setDocPackingList} />
                    <DocUploader label="Dokumen Lainnya" value={docLainnya} onChange={setDocLainnya} />
                  </div>
                </div>
              </div>
            )}

            {/* ─ Konsultasi Pabean ────────────────────────────────── */}
            {selectedServices.includes("konsultasi") && (
              <div className="space-y-5 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
                <div className="flex items-center gap-2 pb-1 border-b border-blue-200">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">Konsultasi Pabean</span>
                </div>
                {/* Direction */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Arah *</Label>
                  <div className="flex gap-3">
                    {(["Impor", "Ekspor"] as Direction[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDirection(d)}
                        className={`flex-1 rounded-xl border-2 p-3 text-center text-sm font-medium transition-all ${
                          direction === d
                            ? "border-orange-400 bg-orange-50 text-orange-800"
                            : "border-border hover:border-orange-200"
                        }`}
                      >
                        {d === "Impor" ? "📥" : "📤"} {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Regulasi type */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Jenis Regulasi *</Label>
                  <div className="flex gap-3">
                    {(["Perijinan Pabean", "Regulasi Pabean"] as KonsultasiRegulasi[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRegulasi(r)}
                        className={`flex-1 rounded-xl border-2 p-3 text-center text-xs font-medium transition-all ${
                          regulasi === r
                            ? "border-blue-400 bg-blue-50 text-blue-800"
                            : "border-border hover:border-blue-200"
                        }`}
                      >
                        {r === "Perijinan Pabean" ? "📋 Perijinan Pabean" : "📖 Regulasi Pabean"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Detail */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Hal yang ingin dikonsultasikan *</Label>
                  <Textarea
                    value={konsultasiDetail}
                    onChange={(e) => setKonsultasiDetail(e.target.value)}
                    rows={4}
                    placeholder="Jelaskan secara singkat permasalahan atau pertanyaan mengenai regulasi kepabeanan yang ingin Anda konsultasikan. Tim kami akan menghubungi Anda setelah menerima permohonan."
                  />
                </div>

                {/* Fee info */}
                <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Tarif Konsultasi</p>
                    <p className="text-xs text-blue-700 mt-0.5">Rp 250.000 / Shipment / Hari — Tim akan menghubungi Anda segera setelah pengajuan.</p>
                  </div>
                </div>

                {/* Documents */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Upload Dokumen (Opsional)</p>
                  {!isAuthenticated() && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Login terlebih dahulu untuk mengupload dokumen
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <DocUploader label="NIB" value={docNIB} onChange={setDocNIB} />
                    <DocUploader label="NPWP" value={docNPWP} onChange={setDocNPWP} />
                    <DocUploader label="AWB / B/L" value={docAWBBL} onChange={setDocAWBBL} />
                    <DocUploader label="Invoice" value={docInvoice} onChange={setDocInvoice} />
                    <DocUploader label="Packing List" value={docPackingList} onChange={setDocPackingList} />
                    <DocUploader label="COO" value={docCOO} onChange={setDocCOO} />
                  </div>
                </div>
              </div>
            )}

            {/* ─ Undername ────────────────────────────────────────── */}
            {selectedServices.includes("undername") && (
              <div className="space-y-5 rounded-xl border border-violet-200 bg-violet-50/30 p-4">
                <div className="flex items-center gap-2 pb-1 border-b border-violet-200">
                  <Users className="h-4 w-4 text-violet-600" />
                  <span className="text-sm font-semibold text-violet-800">Undername Impor/Ekspor</span>
                </div>
                {/* Direction */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Arah *</Label>
                  <div className="flex gap-3">
                    {(["Impor", "Ekspor"] as Direction[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDirection(d)}
                        className={`flex-1 rounded-xl border-2 p-3 text-center text-sm font-medium transition-all ${
                          direction === d
                            ? "border-violet-400 bg-violet-50 text-violet-800"
                            : "border-border hover:border-violet-200"
                        }`}
                      >
                        {d === "Impor" ? "📥" : "📤"} {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info */}
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 flex items-start gap-3">
                  <Users className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-violet-800">Biaya Undername</p>
                    <p className="text-xs text-violet-700 leading-relaxed">
                      Biaya undername impor/ekspor akan diinformasikan setelah pengecekan dokumen oleh tim PPJK kami. Upload dokumen Anda di bawah agar proses pengecekan dapat segera dimulai.
                    </p>
                  </div>
                </div>

                {/* Documents */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Upload Dokumen</p>
                  {!isAuthenticated() && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Login terlebih dahulu untuk mengupload dokumen
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <DocUploader label="NIB" value={docNIB} onChange={setDocNIB} />
                    <DocUploader label="NPWP" value={docNPWP} onChange={setDocNPWP} />
                    <DocUploader label="AWB / B/L" value={docAWBBL} onChange={setDocAWBBL} />
                    <DocUploader label="Invoice" value={docInvoice} onChange={setDocInvoice} />
                    <DocUploader label="Packing List" value={docPackingList} onChange={setDocPackingList} />
                    <DocUploader label="COO" value={docCOO} onChange={setDocCOO} />
                  </div>
                  <DocUploader label="Dokumen Lainnya" value={docLainnya} onChange={setDocLainnya} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Data Pemesan ─────────────────────────────────── */}
        {selectedServices.length > 0 && (
          <div className="rounded-2xl border border-border bg-white p-5 space-y-4">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">3</div>
              Data Pemesan
            </h2>
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
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+62 8xx xxxx xxxx"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Catatan Tambahan</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Informasi tambahan untuk tim kami (opsional)"
                rows={2}
              />
            </div>
          </div>
        )}

        {/* ── Summary & Submit ─────────────────────────────────────── */}
        {selectedServices.length > 0 && (
          <div className="rounded-2xl border border-border bg-white p-5 space-y-4">
            <h2 className="font-semibold text-base flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold">4</div>
              Ringkasan & Kirim
            </h2>

            {/* Summary row */}
            <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between items-start gap-4">
                <span className="text-muted-foreground shrink-0">Layanan</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {selectedServices.map((s) => (
                    <Badge key={s} variant="secondary">
                      {SERVICE_OPTIONS.find((o) => o.key === s)?.title}
                    </Badge>
                  ))}
                </div>
              </div>
              {direction && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Arah</span>
                  <Badge variant="secondary">{direction}</Badge>
                </div>
              )}
              {selectedServices.includes("handling") && jalur && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jalur</span>
                  <Badge className={jalur === "Hijau" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                    Jalur {jalur}
                  </Badge>
                </div>
              )}
              {estimatedTotal() > 0 ? (
                <div className="flex justify-between font-bold text-primary border-t pt-2">
                  <span>Estimasi Biaya</span>
                  <span>{fmtIDR(estimatedTotal())}</span>
                </div>
              ) : (
                <div className="flex justify-between border-t pt-2 text-muted-foreground text-xs">
                  <span>Estimasi Biaya</span>
                  <span>Dikonfirmasi setelah pengecekan dokumen</span>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Estimasi biaya bersifat indikatif. Biaya final akan dikonfirmasi oleh tim PPJK kami setelah verifikasi dokumen.
                Tim kami akan menghubungi Anda dalam 1×24 jam kerja.
              </span>
            </div>

            <Button
              className="w-full gap-2"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim...</>
              ) : (
                <><ChevronRight className="h-4 w-4" /> Kirim Permohonan PPJK</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
