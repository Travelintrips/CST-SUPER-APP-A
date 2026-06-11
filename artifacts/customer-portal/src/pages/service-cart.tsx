import { useState, useCallback, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders, getAuthToken } from "@/lib/auth";
import {
  Plane, Ship, Truck, Package, Warehouse, ShieldCheck,
  Search, FileText, Layers, ArrowLeft, Plus, Trash2,
  ChevronRight, ChevronDown, ChevronUp, Globe, Edit3,
  CheckCircle2, Loader2, Send, RotateCcw, AlertCircle,
  ClipboardList, ArrowRight, BoxSelect,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

// ─── Types ────────────────────────────────────────────────────────────────────

type TradeType = "EXPORT" | "IMPORT" | "DOMESTIC";

type ServiceType =
  | "air_freight"
  | "ocean_freight"
  | "ppjk"
  | "trucking"
  | "warehousing"
  | "handling"
  | "insurance"
  | "survey"
  | "project_cargo";

interface ServiceItem {
  id?: number;
  tempId: string;
  itemType: ServiceType;
  title: string;
  description?: string;
  formData: Record<string, string | number | boolean>;
  sequenceNo?: number;
  status?: string;
}

interface CustomerInfo {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCompany: string;
  notes: string;
}

interface CartRequest {
  id: number;
  requestNumber: string;
  status: string;
  tradeType: TradeType;
  items: ServiceItem[];
}

type Step = "trade_type" | "add_items" | "review" | "success";

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_CATALOG: {
  type: ServiceType;
  title: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  requiredDocs: string[];
}[] = [
  {
    type: "air_freight",
    title: "Air Freight",
    desc: "Pengiriman kargo via udara — domestik & internasional",
    icon: Plane,
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
    requiredDocs: ["Packing List", "Commercial Invoice", "AWB Draft"],
  },
  {
    type: "ocean_freight",
    title: "Ocean Freight",
    desc: "Kargo laut FCL / LCL untuk volume besar",
    icon: Ship,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50 border-cyan-200",
    requiredDocs: ["Packing List", "Commercial Invoice", "B/L Draft"],
  },
  {
    type: "ppjk",
    title: "PPJK / Customs",
    desc: "Kepabeanan, pengurusan dokumen PIB/PEB, clearance",
    icon: ClipboardList,
    color: "text-purple-600",
    bgColor: "bg-purple-50 border-purple-200",
    requiredDocs: ["PIB/PEB", "Invoice", "Packing List", "Surat Kuasa"],
  },
  {
    type: "trucking",
    title: "Trucking",
    desc: "Pengiriman darat — antar kota & last-mile delivery",
    icon: Truck,
    color: "text-orange-600",
    bgColor: "bg-orange-50 border-orange-200",
    requiredDocs: ["Surat Jalan", "DO"],
  },
  {
    type: "warehousing",
    title: "Warehousing",
    desc: "Penyimpanan barang jangka pendek & panjang",
    icon: Warehouse,
    color: "text-green-600",
    bgColor: "bg-green-50 border-green-200",
    requiredDocs: ["Inbound Receipt", "Stock List"],
  },
  {
    type: "handling",
    title: "Handling",
    desc: "Bongkar muat, stuffing, stripping, dan inspeksi fisik",
    icon: Package,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50 border-yellow-200",
    requiredDocs: ["DO", "Packing List"],
  },
  {
    type: "insurance",
    title: "Insurance",
    desc: "Asuransi kargo all-risk untuk pengiriman aman",
    icon: ShieldCheck,
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-200",
    requiredDocs: ["Invoice", "Packing List"],
  },
  {
    type: "survey",
    title: "Survey / Inspection",
    desc: "Pemeriksaan kargo, pre-shipment, dan laporan kondisi",
    icon: Search,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50 border-indigo-200",
    requiredDocs: ["Surat Penugasan Survey"],
  },
  {
    type: "project_cargo",
    title: "Project Cargo",
    desc: "Pengiriman muatan proyek — oversize, OOG, heavy lift",
    icon: Layers,
    color: "text-pink-600",
    bgColor: "bg-pink-50 border-pink-200",
    requiredDocs: ["Teknikal Spesifikasi", "Dimensi & Berat", "MSDS (jika B3)"],
  },
];

// ─── Service-specific forms ───────────────────────────────────────────────────

function ServiceForm({
  type,
  data,
  tradeType,
  onChange,
}: {
  type: ServiceType;
  data: Record<string, string | number | boolean>;
  tradeType: TradeType;
  onChange: (key: string, val: string | number | boolean) => void;
}) {
  const field = (
    key: string,
    label: string,
    placeholder = "",
    opts?: { type?: string; required?: boolean },
  ) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-slate-600">
        {label}{opts?.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        type={opts?.type ?? "text"}
        placeholder={placeholder}
        value={String(data[key] ?? "")}
        onChange={(e) => onChange(key, e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );

  const sel = (
    key: string,
    label: string,
    options: { v: string; l: string }[],
    opts?: { required?: boolean },
  ) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-slate-600">
        {label}{opts?.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Select value={String(data[key] ?? "")} onValueChange={(v) => onChange(key, v)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Pilih..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const textarea = (key: string, label: string, placeholder = "") => (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      <Textarea
        placeholder={placeholder}
        value={String(data[key] ?? "")}
        onChange={(e) => onChange(key, e.target.value)}
        rows={2}
        className="text-sm resize-none"
      />
    </div>
  );

  const tradeOpts = [
    { v: "EXPORT", l: "Export" },
    { v: "IMPORT", l: "Import" },
    { v: "DOMESTIC", l: "Domestic" },
  ];

  if (type === "air_freight") return (
    <div className="grid grid-cols-2 gap-3">
      {field("origin_airport", "Bandara Asal", "e.g. CGK", { required: true })}
      {field("dest_airport", "Bandara Tujuan", "e.g. SIN", { required: true })}
      {sel("service_mode", "Mode Layanan", [
        { v: "airport_to_airport", l: "Airport to Airport" },
        { v: "door_to_door", l: "Door to Door" },
        { v: "door_to_airport", l: "Door to Airport" },
        { v: "airport_to_door", l: "Airport to Door" },
      ], { required: true })}
      {sel("service_level", "Service Level", [
        { v: "standard", l: "Standard" }, { v: "express", l: "Express" }, { v: "economy", l: "Economy" },
      ])}
      {field("gross_weight_kg", "Berat Kotor (kg)", "0", { type: "number" })}
      {field("volume_cbm", "Volume (CBM)", "0", { type: "number" })}
      {field("koli", "Jumlah Koli", "1", { type: "number" })}
      {field("commodity", "Komoditi", "e.g. Electronics")}
      {textarea("notes", "Catatan Tambahan", "Instruksi khusus...")}
    </div>
  );

  if (type === "ocean_freight") return (
    <div className="grid grid-cols-2 gap-3">
      {field("origin_port", "Pelabuhan Asal", "e.g. IDJKT", { required: true })}
      {field("dest_port", "Pelabuhan Tujuan", "e.g. SGSIN", { required: true })}
      {sel("load_type", "Jenis Muatan", [
        { v: "FCL", l: "FCL — Full Container Load" },
        { v: "LCL", l: "LCL — Less than Container Load" },
      ], { required: true })}
      {sel("container_type", "Tipe Container", [
        { v: "20GP", l: "20' GP" }, { v: "40GP", l: "40' GP" },
        { v: "40HC", l: "40' HC" }, { v: "20RF", l: "20' Reefer" },
        { v: "LCL", l: "LCL / Per CBM" },
      ])}
      {field("gross_weight_kg", "Berat Kotor (kg)", "0", { type: "number" })}
      {field("volume_cbm", "Volume (CBM)", "0", { type: "number" })}
      {field("commodity", "Komoditi", "e.g. Furniture")}
      {field("hs_code", "HS Code", "e.g. 9403")}
      {textarea("notes", "Catatan", "")}
    </div>
  );

  if (type === "ppjk") return (
    <div className="grid grid-cols-2 gap-3">
      {sel("doc_type", "Jenis Dokumen", [
        { v: "PIB", l: "PIB — Pemberitahuan Impor Barang" },
        { v: "PEB", l: "PEB — Pemberitahuan Ekspor Barang" },
        { v: "BC23", l: "BC 2.3 — Kawasan Bebas" },
        { v: "SPPB", l: "SPPB — Surat Persetujuan Pengeluaran Barang" },
        { v: "undername", l: "Undername Service" },
      ], { required: true })}
      {field("hs_code", "HS Code", "e.g. 8471", { required: true })}
      {field("goods_description", "Deskripsi Barang", "e.g. Laptop Computer", { required: true })}
      {field("cif_value", "Nilai CIF (IDR)", "0", { type: "number" })}
      {field("gross_weight_kg", "Berat Kotor (kg)", "0", { type: "number" })}
      {field("origin_country", "Negara Asal", "e.g. China")}
      {sel("jalur", "Jalur Pabean", [
        { v: "hijau", l: "Jalur Hijau" },
        { v: "kuning", l: "Jalur Kuning" },
        { v: "merah", l: "Jalur Merah" },
        { v: "unknown", l: "Belum Diketahui" },
      ])}
      {textarea("notes", "Catatan Kepabeanan", "")}
    </div>
  );

  if (type === "trucking") return (
    <div className="grid grid-cols-2 gap-3">
      {field("pickup_address", "Alamat Pickup", "Jl. ..., Kota", { required: true })}
      {field("delivery_address", "Alamat Tujuan", "Jl. ..., Kota", { required: true })}
      {sel("vehicle_type", "Jenis Kendaraan", [
        { v: "motor", l: "Motor" }, { v: "mobil", l: "Mobil / Van" },
        { v: "pickup", l: "Pickup" }, { v: "engkel", l: "Engkel" },
        { v: "cdd", l: "CDD" }, { v: "cde", l: "CDE" },
        { v: "fuso", l: "Fuso" }, { v: "tronton", l: "Tronton" },
        { v: "trailer", l: "Trailer" },
      ], { required: true })}
      {field("gross_weight_kg", "Berat (kg)", "0", { type: "number" })}
      {field("volume_cbm", "Volume (CBM)", "0", { type: "number" })}
      {field("koli", "Jumlah Koli", "1", { type: "number" })}
      {field("commodity", "Jenis Barang", "e.g. Elektronik")}
      {textarea("notes", "Catatan / Instruksi Khusus", "")}
    </div>
  );

  if (type === "warehousing") return (
    <div className="grid grid-cols-2 gap-3">
      {field("location", "Lokasi Gudang Preferensi", "e.g. Cikarang, Cikupa")}
      {sel("duration", "Estimasi Durasi", [
        { v: "1_bulan", l: "1 Bulan" }, { v: "3_bulan", l: "3 Bulan" },
        { v: "6_bulan", l: "6 Bulan" }, { v: "1_tahun", l: "1 Tahun" },
        { v: "ongoing", l: "Ongoing / TBD" },
      ])}
      {field("area_sqm", "Luas Area (m²)", "0", { type: "number" })}
      {field("stack_height_m", "Tinggi Tumpukan Maks (m)", "4", { type: "number" })}
      {sel("storage_type", "Tipe Penyimpanan", [
        { v: "dry", l: "Dry Warehouse" },
        { v: "cold", l: "Cold Storage" },
        { v: "bonded", l: "Bonded Warehouse" },
      ])}
      {field("commodity", "Jenis Barang", "e.g. FMCG, elektronik")}
      {textarea("notes", "Catatan", "")}
    </div>
  );

  if (type === "handling") return (
    <div className="grid grid-cols-2 gap-3">
      {sel("handling_type", "Jenis Handling", [
        { v: "loading", l: "Loading (Muat)" },
        { v: "unloading", l: "Unloading (Bongkar)" },
        { v: "stuffing", l: "Stuffing Container" },
        { v: "stripping", l: "Stripping Container" },
        { v: "sorting", l: "Sorting & Labeling" },
        { v: "repacking", l: "Repacking" },
      ], { required: true })}
      {field("location", "Lokasi", "e.g. Tanjung Priok", { required: true })}
      {field("quantity", "Jumlah Unit / Koli", "0", { type: "number" })}
      {field("gross_weight_kg", "Total Berat (kg)", "0", { type: "number" })}
      {field("commodity", "Jenis Barang", "")}
      {textarea("notes", "Instruksi Khusus", "")}
    </div>
  );

  if (type === "insurance") return (
    <div className="grid grid-cols-2 gap-3">
      {sel("coverage_type", "Tipe Coverage", [
        { v: "all_risk", l: "All Risk" },
        { v: "total_loss", l: "Total Loss Only (TLO)" },
        { v: "war_srcc", l: "War & SRCC" },
      ], { required: true })}
      {field("cargo_value_idr", "Nilai Kargo (IDR)", "0", { type: "number", required: true })}
      {field("origin", "Asal Pengiriman", "")}
      {field("destination", "Tujuan Pengiriman", "")}
      {field("commodity", "Jenis Kargo", "e.g. Elektronik")}
      {sel("transport_mode", "Moda Transportasi", [
        { v: "air", l: "Air Freight" },
        { v: "sea", l: "Ocean Freight" },
        { v: "truck", l: "Trucking / Darat" },
        { v: "multi", l: "Multimodal" },
      ])}
      {textarea("notes", "Catatan", "")}
    </div>
  );

  if (type === "survey") return (
    <div className="grid grid-cols-2 gap-3">
      {sel("survey_type", "Jenis Survey", [
        { v: "pre_shipment", l: "Pre-Shipment Inspection" },
        { v: "condition_report", l: "Condition Report" },
        { v: "damage_survey", l: "Damage Survey" },
        { v: "weight_tally", l: "Weight & Tally" },
        { v: "loading_supervision", l: "Loading Supervision" },
      ], { required: true })}
      {field("location", "Lokasi Survey", "e.g. Gudang Jakarta", { required: true })}
      {field("survey_date", "Tanggal Survey", "", { type: "date" })}
      {field("commodity", "Jenis Barang", "")}
      {field("quantity", "Jumlah Barang", "0", { type: "number" })}
      {textarea("notes", "Instruksi / Scope of Work", "")}
    </div>
  );

  if (type === "project_cargo") return (
    <div className="grid grid-cols-2 gap-3">
      {field("origin", "Lokasi Asal", "e.g. Jakarta Port", { required: true })}
      {field("destination", "Lokasi Tujuan", "e.g. Balikpapan", { required: true })}
      {field("cargo_description", "Deskripsi Kargo", "e.g. Transformator 500kV", { required: true })}
      {field("total_weight_tons", "Total Berat (ton)", "0", { type: "number" })}
      {field("length_m", "Panjang (m)", "0", { type: "number" })}
      {field("width_m", "Lebar (m)", "0", { type: "number" })}
      {field("height_m", "Tinggi (m)", "0", { type: "number" })}
      {sel("special_requirement", "Kebutuhan Khusus", [
        { v: "heavy_lift", l: "Heavy Lift Crane" },
        { v: "special_trailer", l: "Special Trailer" },
        { v: "escort", l: "Police Escort" },
        { v: "roll_on_off", l: "RoRo" },
        { v: "none", l: "Tidak Ada" },
      ])}
      {textarea("notes", "Catatan Tambahan / Scope of Work", "")}
    </div>
  );

  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ServiceCartPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/service-cart/:requestId");
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("trade_type");
  const [tradeType, setTradeType] = useState<TradeType | null>(null);
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerCompany: "",
    notes: "",
  });

  const [requestId, setRequestId] = useState<number | null>(null);
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Modal for adding/editing item
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [editingItem, setEditingItem] = useState<ServiceItem | null>(null);
  const [pendingServiceType, setPendingServiceType] = useState<ServiceType | null>(null);
  const [itemFormData, setItemFormData] = useState<Record<string, string | number | boolean>>({});
  const [itemTitle, setItemTitle] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const [savingItem, setSavingItem] = useState(false);

  // ── Load from query params if requestId provided ───────────────────────────
  useEffect(() => {
    if (params?.requestId) {
      fetch(`/api/customer-service-requests/${params.requestId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.id) {
            setRequestId(data.id);
            setRequestNumber(data.requestNumber);
            setTradeType(data.tradeType as TradeType);
            setCustomerInfo({
              customerName: data.customerName ?? "",
              customerEmail: data.customerEmail ?? "",
              customerPhone: data.customerPhone ?? "",
              customerCompany: data.customerCompany ?? "",
              notes: data.notes ?? "",
            });
            setItems(
              (data.items ?? []).map((item: ServiceItem & { id: number }) => ({
                ...item,
                tempId: `loaded-${item.id}`,
              }))
            );
            setStep("add_items");
          }
        })
        .catch(() => {});
    }
  }, [params?.requestId]);

  // ── Create draft request ───────────────────────────────────────────────────
  const createDraftRequest = async (): Promise<number | null> => {
    if (requestId) return requestId;
    if (!customerInfo.customerName || !customerInfo.customerEmail || !tradeType) return null;
    try {
      const res = await fetch("/api/customer-service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          customerName: customerInfo.customerName,
          customerEmail: customerInfo.customerEmail,
          customerPhone: customerInfo.customerPhone,
          customerCompany: customerInfo.customerCompany,
          tradeType,
          notes: customerInfo.notes,
          orderMode: "ITEM_MANDIRI",
          pricingMode: "PER_ITEM",
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setRequestId(data.id);
        setRequestNumber(data.requestNumber);
        return data.id;
      }
    } catch { /* ignore */ }
    return null;
  };

  // ── Save item to backend ───────────────────────────────────────────────────
  const saveItemToBackend = async (
    reqId: number,
    item: ServiceItem,
    isNew: boolean,
  ): Promise<ServiceItem | null> => {
    const payload = {
      itemType: item.itemType,
      title: item.title,
      description: item.description,
      formData: item.formData,
      requiredDocuments: SERVICE_CATALOG.find((s) => s.type === item.itemType)?.requiredDocs ?? [],
    };

    const url = isNew
      ? `/api/customer-service-requests/${reqId}/items`
      : `/api/customer-service-requests/${reqId}/items/${item.id}`;
    const method = isNew ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) return data;
    return null;
  };

  // ── Open picker to add new item ────────────────────────────────────────────
  const openAddItem = () => {
    setEditingItem(null);
    setPendingServiceType(null);
    setItemFormData({});
    setItemTitle("");
    setItemNotes("");
    setShowServicePicker(true);
  };

  // ── Open editor for existing item ─────────────────────────────────────────
  const openEditItem = (item: ServiceItem) => {
    setEditingItem(item);
    setPendingServiceType(item.itemType);
    setItemFormData({ ...item.formData });
    setItemTitle(item.title);
    setItemNotes(item.description ?? "");
    setShowServicePicker(true);
  };

  const selectServiceType = (type: ServiceType) => {
    setPendingServiceType(type);
    const catalog = SERVICE_CATALOG.find((s) => s.type === type);
    if (!editingItem) {
      setItemTitle(catalog?.title ?? "");
    }
    setItemFormData({});
  };

  // ── Confirm item form ──────────────────────────────────────────────────────
  const handleConfirmItem = async () => {
    if (!pendingServiceType || !itemTitle.trim()) {
      toast({ title: "Lengkapi form item", variant: "destructive" });
      return;
    }

    // Customer info required before adding first item
    if (!customerInfo.customerName || !customerInfo.customerEmail) {
      toast({ title: "Isi data diri terlebih dahulu di Step 1", variant: "destructive" });
      setShowServicePicker(false);
      return;
    }

    setSavingItem(true);
    try {
      // Create draft request if not yet created
      const reqId = await createDraftRequest();
      if (!reqId) {
        toast({ title: "Gagal membuat request", variant: "destructive" });
        setSavingItem(false);
        return;
      }

      const newItem: ServiceItem = {
        ...(editingItem ?? {}),
        tempId: editingItem?.tempId ?? crypto.randomUUID(),
        id: editingItem?.id,
        itemType: pendingServiceType,
        title: itemTitle.trim(),
        description: itemNotes.trim() || undefined,
        formData: { ...itemFormData },
      };

      const saved = await saveItemToBackend(reqId, newItem, !editingItem?.id);
      if (saved) {
        const savedItem: ServiceItem = { ...newItem, id: saved.id, sequenceNo: saved.sequenceNo };
        if (editingItem) {
          setItems((prev) => prev.map((it) => it.tempId === editingItem.tempId ? savedItem : it));
        } else {
          setItems((prev) => [...prev, savedItem]);
        }
        setShowServicePicker(false);
        toast({ title: `Item "${savedItem.title}" ${editingItem ? "diperbarui" : "ditambahkan"}` });
      } else {
        toast({ title: "Gagal menyimpan item", variant: "destructive" });
      }
    } catch {
      toast({ title: "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setSavingItem(false);
    }
  };

  // ── Delete item ────────────────────────────────────────────────────────────
  const handleDeleteItem = async (item: ServiceItem) => {
    if (item.id && requestId) {
      await fetch(`/api/customer-service-requests/${requestId}/items/${item.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
    }
    setItems((prev) => prev.filter((it) => it.tempId !== item.tempId));
    toast({ title: `Item "${item.title}" dihapus` });
  };

  // ── Submit request ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!requestId || items.length === 0) {
      toast({ title: "Tambahkan minimal 1 item layanan", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/customer-service-requests/${requestId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      if (res.ok) {
        setStep("success");
      } else {
        const data = await res.json();
        toast({ title: data.error ?? "Gagal submit", variant: "destructive" });
      }
    } catch {
      toast({ title: "Terjadi kesalahan saat submit", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Step: Trade Type ───────────────────────────────────────────────────────
  if (step === "trade_type") {
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <button
              onClick={() => navigate("/jasa")}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali
            </button>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <BoxSelect className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Buat Permintaan Layanan</h1>
                <p className="text-sm text-slate-500">Mode: Item Mandiri — pilih & gabung layanan sesuai kebutuhan</p>
              </div>
            </div>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-4">
              {["Data Diri & Jenis", "Tambah Layanan", "Review & Kirim"].map((label, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${idx === 0 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                    <span>{idx + 1}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </div>
                  {idx < 2 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                </div>
              ))}
            </div>
          </div>

          {/* Customer info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-800">Data Diri</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Nama Lengkap <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Nama Anda"
                  value={customerInfo.customerName}
                  onChange={(e) => setCustomerInfo((p) => ({ ...p, customerName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Email <span className="text-red-500">*</span></Label>
                <Input
                  type="email"
                  placeholder="email@perusahaan.com"
                  value={customerInfo.customerEmail}
                  onChange={(e) => setCustomerInfo((p) => ({ ...p, customerEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Nomor HP / WhatsApp</Label>
                <Input
                  placeholder="08xxxxxxxxxx"
                  value={customerInfo.customerPhone}
                  onChange={(e) => setCustomerInfo((p) => ({ ...p, customerPhone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Nama Perusahaan</Label>
                <Input
                  placeholder="PT / CV ..."
                  value={customerInfo.customerCompany}
                  onChange={(e) => setCustomerInfo((p) => ({ ...p, customerCompany: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Trade type */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-800">Jenis Perdagangan</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { type: "EXPORT" as TradeType, icon: "📤", desc: "Barang keluar dari Indonesia" },
                { type: "IMPORT" as TradeType, icon: "📥", desc: "Barang masuk ke Indonesia" },
                { type: "DOMESTIC" as TradeType, icon: "🇮🇩", desc: "Pengiriman dalam negeri" },
              ].map(({ type, icon, desc }) => (
                <button
                  key={type}
                  onClick={() => setTradeType(type)}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    tradeType === type
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 hover:border-blue-300 bg-white"
                  }`}
                >
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className={`font-semibold text-sm ${tradeType === type ? "text-blue-700" : "text-slate-800"}`}>
                    {type}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700"
            disabled={!tradeType || !customerInfo.customerName || !customerInfo.customerEmail}
            onClick={() => setStep("add_items")}
          >
            Lanjut — Tambah Layanan <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Add Items ────────────────────────────────────────────────────────
  if (step === "add_items") {
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <button
              onClick={() => setStep("trade_type")}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali
            </button>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Tambah Item Layanan</h1>
                <p className="text-sm text-slate-500">
                  <Badge variant="outline" className="mr-2">{tradeType}</Badge>
                  {customerInfo.customerName} · {requestNumber ?? "Draft"}
                </p>
              </div>
              <Badge className="bg-slate-100 text-slate-700 font-medium">
                {items.length} item
              </Badge>
            </div>
            {/* Steps */}
            <div className="flex items-center gap-2 mt-3">
              {["Data Diri & Jenis", "Tambah Layanan", "Review & Kirim"].map((label, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${idx === 1 ? "bg-blue-600 text-white" : idx === 0 ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                    {idx === 0 ? <CheckCircle2 className="w-3 h-3" /> : <span>{idx + 1}</span>}
                    <span className="hidden sm:inline">{label}</span>
                  </div>
                  {idx < 2 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                </div>
              ))}
            </div>
          </div>

          {/* Items list */}
          {items.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Plus className="w-7 h-7 text-slate-400" />
              </div>
              <p className="font-medium text-slate-700 mb-1">Belum ada item layanan</p>
              <p className="text-sm text-slate-500 mb-5">Klik tombol di bawah untuk menambahkan layanan pertama</p>
              <Button onClick={openAddItem} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" /> Tambah Layanan
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, idx) => {
                const catalog = SERVICE_CATALOG.find((s) => s.type === item.itemType);
                const Icon = catalog?.icon ?? Package;
                return (
                  <div
                    key={item.tempId}
                    className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-4"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${catalog?.bgColor ?? "bg-slate-100 border border-slate-200"}`}>
                      <Icon className={`w-5 h-5 ${catalog?.color ?? "text-slate-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-400">#{idx + 1}</span>
                        <span className="font-semibold text-slate-800 text-sm">{item.title}</span>
                        <Badge variant="outline" className="text-xs ml-auto">
                          {catalog?.title ?? item.itemType}
                        </Badge>
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{item.description}</p>
                      )}
                      {Object.keys(item.formData).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {Object.entries(item.formData).slice(0, 4).map(([k, v]) => v ? (
                            <span key={k} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {String(v)}
                            </span>
                          ) : null)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEditItem(item)}
                        className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-blue-500 hover:text-blue-700"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={openAddItem}
                className="w-full rounded-xl border-2 border-dashed border-blue-200 p-3 flex items-center justify-center gap-2 text-blue-600 hover:bg-blue-50 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Tambah Item Lagi
              </button>
            </div>
          )}

          {/* Actions */}
          {items.length > 0 && (
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={openAddItem}>
                <Plus className="w-4 h-4 mr-2" /> Tambah Item
              </Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => setStep("review")}>
                Review & Kirim <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </div>

        {/* Add/Edit Item Dialog */}
        <Dialog open={showServicePicker} onOpenChange={(open) => { if (!open) setShowServicePicker(false); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? "Edit Item Layanan" : "Tambah Item Layanan"}
              </DialogTitle>
            </DialogHeader>

            {/* Service type picker */}
            {!pendingServiceType ? (
              <div className="grid grid-cols-3 gap-2 py-2">
                {SERVICE_CATALOG.map(({ type, title, desc, icon: Icon, bgColor, color }) => (
                  <button
                    key={type}
                    onClick={() => selectServiceType(type)}
                    className={`rounded-xl border p-3 text-left hover:border-blue-400 transition-all ${bgColor}`}
                  >
                    <Icon className={`w-5 h-5 mb-1.5 ${color}`} />
                    <div className="font-semibold text-xs text-slate-800">{title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-tight">{desc}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {/* Change type button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const cat = SERVICE_CATALOG.find((s) => s.type === pendingServiceType);
                      const Icon = cat?.icon ?? Package;
                      return (
                        <>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat?.bgColor}`}>
                            <Icon className={`w-4 h-4 ${cat?.color}`} />
                          </div>
                          <span className="font-semibold text-slate-800">{cat?.title}</span>
                        </>
                      );
                    })()}
                  </div>
                  <button
                    onClick={() => { setPendingServiceType(null); setItemFormData({}); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    <RotateCcw className="w-3.5 h-3.5 inline mr-1" />Ganti layanan
                  </button>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Judul Item <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="e.g. Air Freight Jakarta → Singapura"
                    value={itemTitle}
                    onChange={(e) => setItemTitle(e.target.value)}
                  />
                </div>

                <Separator />

                {/* Service-specific form */}
                <ServiceForm
                  type={pendingServiceType}
                  data={itemFormData}
                  tradeType={tradeType ?? "DOMESTIC"}
                  onChange={(key, val) => setItemFormData((prev) => ({ ...prev, [key]: val }))}
                />

                {/* Required docs info */}
                {(() => {
                  const docs = SERVICE_CATALOG.find((s) => s.type === pendingServiceType)?.requiredDocs ?? [];
                  return docs.length > 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs font-medium text-amber-700 mb-1.5">Dokumen yang perlu disiapkan:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {docs.map((d) => (
                          <Badge key={d} variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                            <FileText className="w-3 h-3 mr-1" />{d}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowServicePicker(false)}>Batal</Button>
              {pendingServiceType && (
                <Button
                  onClick={handleConfirmItem}
                  disabled={savingItem || !itemTitle.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {savingItem ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editingItem ? "Simpan Perubahan" : "Tambah Item"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Step: Review ───────────────────────────────────────────────────────────
  if (step === "review") {
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <button
              onClick={() => setStep("add_items")}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali ke Item
            </button>
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-xl font-bold text-slate-900">Review Permintaan</h1>
              <Badge className="bg-amber-100 text-amber-700">Draft</Badge>
            </div>
            <p className="text-sm text-slate-500">Periksa semua item sebelum mengirim ke tim kami</p>
          </div>

          {/* Customer Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h2 className="font-semibold text-slate-800 text-sm">Informasi Pemohon</h2>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-slate-500">Nama</span>
              <span className="font-medium text-slate-800">{customerInfo.customerName}</span>
              <span className="text-slate-500">Email</span>
              <span className="font-medium text-slate-800">{customerInfo.customerEmail}</span>
              {customerInfo.customerPhone && <>
                <span className="text-slate-500">HP</span>
                <span className="font-medium text-slate-800">{customerInfo.customerPhone}</span>
              </>}
              {customerInfo.customerCompany && <>
                <span className="text-slate-500">Perusahaan</span>
                <span className="font-medium text-slate-800">{customerInfo.customerCompany}</span>
              </>}
              <span className="text-slate-500">Jenis Perdagangan</span>
              <Badge variant="outline">{tradeType}</Badge>
            </div>
          </div>

          {/* Items Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 text-sm">Item Layanan</h2>
              <Badge className="bg-blue-100 text-blue-700">{items.length} item</Badge>
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const catalog = SERVICE_CATALOG.find((s) => s.type === item.itemType);
                const Icon = catalog?.icon ?? Package;
                return (
                  <div key={item.tempId} className="px-5 py-4 flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${catalog?.bgColor ?? "bg-slate-100 border"}`}>
                      <Icon className={`w-4 h-4 ${catalog?.color ?? "text-slate-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-slate-400 font-medium">{idx + 1}.</span>
                        <span className="font-semibold text-slate-800 text-sm">{item.title}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <Badge variant="outline" className="text-xs">{catalog?.title ?? item.itemType}</Badge>
                        {Object.entries(item.formData).slice(0, 3).map(([k, v]) => v ? (
                          <span key={k} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{String(v)}</span>
                        ) : null)}
                      </div>
                    </div>
                    <button
                      onClick={() => { setStep("add_items"); openEditItem(item); }}
                      className="flex-shrink-0 text-xs text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm">Catatan Tambahan (opsional)</Label>
            <Textarea
              placeholder="Instruksi khusus, preferensi vendor, timeline, dll..."
              value={customerInfo.notes}
              onChange={(e) => setCustomerInfo((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-semibold mb-0.5">Setelah dikirim:</p>
              <p>Tim CST Logistics akan menghubungi Anda dalam 1×24 jam dengan penawaran harga untuk setiap item layanan.</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("add_items")}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Edit Item
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Kirim Permintaan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: Success ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 py-20 px-4">
      <div className="max-w-md mx-auto text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Permintaan Terkirim!</h1>
          <p className="text-slate-600">
            Nomor referensi Anda:
          </p>
          <div className="mt-3 bg-white border border-slate-200 rounded-xl px-6 py-3 inline-block">
            <span className="font-mono font-bold text-blue-700 text-lg">{requestNumber}</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 text-left space-y-3">
          <h2 className="font-semibold text-slate-800">Ringkasan</h2>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-slate-500">Nama</span>
            <span className="font-medium">{customerInfo.customerName}</span>
            <span className="text-slate-500">Total Item</span>
            <span className="font-medium">{items.length} layanan</span>
            <span className="text-slate-500">Jenis</span>
            <Badge variant="outline">{tradeType}</Badge>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          Konfirmasi telah dikirim ke <strong>{customerInfo.customerEmail}</strong>. Tim kami akan menghubungi Anda dalam 1×24 jam.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate("/dashboard")}>
            Dashboard Saya
          </Button>
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => navigate("/jasa")}>
            Tambah Request Lain
          </Button>
        </div>
      </div>
    </div>
  );
}
