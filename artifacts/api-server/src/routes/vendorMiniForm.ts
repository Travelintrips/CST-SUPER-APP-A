import { Router, type Request, type Response } from "express";
import { eq, desc, inArray, and, count } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  vendorMiniFormLinksTable,
  vendorMiniFormSubmissionsTable,
  customerApprovalsTable,
  vendorOperationalConfirmationsTable,
  vendorPriceHistoryTable,
  vmfActivityLogTable,
  notificationLogsTable,
  suppliersTable,
  logisticOrdersTable,
  logisticOrderItemsTable,
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";

const PUBLIC_CACHE = "public, max-age=300, stale-while-revalidate=600";

// ── Activity log helper ────────────────────────────────────────────────────────

async function logActivity(
  entityType: string, entityId: number, action: string,
  actor: string | null, note?: string | null, data?: object,
) {
  try {
    await db.insert(vmfActivityLogTable).values({
      entityType, entityId, action, actor: actor ?? "system",
      note: note ?? null, data: data ?? {},
    });
  } catch { /* non-fatal */ }
}

// ── Token cache ────────────────────────────────────────────────────────────────

type CachedForm = {
  id: number; serviceType: string; title: string | null; notes: string | null;
  vendorName: string | null; vendorPhone: string | null; vendorContactPerson: string | null;
  isActive: boolean; expiresAt: Date | null; mode: string;
  orderId: number | null; orderNumber: string | null; orderItemId: number | null;
  phase: string | null; maxSubmissions: number | null; resubmitAllowed: boolean | null;
  expiresCache: number;
};
const TOKEN_CACHE = new Map<string, CachedForm>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(token: string): CachedForm | null {
  const entry = TOKEN_CACHE.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresCache) { TOKEN_CACHE.delete(token); return null; }
  return entry;
}
function setCached(token: string, row: CachedForm) {
  TOKEN_CACHE.set(token, { ...row, expiresCache: Date.now() + CACHE_TTL_MS });
}
export function invalidateTokenCache(token: string) {
  TOKEN_CACHE.delete(token);
}

export const vendorMiniFormRouter = Router();

// ── Service schemas ────────────────────────────────────────────────────────────

export const SERVICE_SCHEMAS: Record<string, {
  label: string; emoji: string;
  fields: {
    key: string; label: string;
    type: "text" | "number" | "select" | "textarea" | "date";
    options?: string[]; required?: boolean; placeholder?: string;
    section?: "quotation" | "operational" | "both";
  }[];
}> = {
  product: {
    label: "Produk", emoji: "📦",
    fields: [
      { key: "product_name", label: "Nama Produk", type: "text", required: true, section: "both" },
      { key: "brand", label: "Brand / Spesifikasi", type: "text", section: "quotation" },
      { key: "unit_price", label: "Harga per Satuan (Rp)", type: "number", required: true, section: "quotation" },
      { key: "currency", label: "Mata Uang", type: "select", options: ["IDR", "USD", "SGD", "EUR"], section: "quotation" },
      { key: "qty_available", label: "Qty Tersedia", type: "number", section: "quotation" },
      { key: "min_order", label: "Minimum Order", type: "number", section: "quotation" },
      { key: "unit", label: "Satuan", type: "select", options: ["pcs", "kg", "ton", "box", "karton", "lusin", "unit"], required: true, section: "both" },
      { key: "lead_time", label: "Lead Time (hari)", type: "number", section: "quotation" },
      { key: "stock_status", label: "Status Stok", type: "select", options: ["Ready Stock", "Indent", "Pre-order"], section: "quotation" },
      { key: "valid_until", label: "Harga Berlaku Sampai", type: "date", section: "quotation" },
      { key: "eta", label: "Estimasi Pengiriman (hari)", type: "text", section: "quotation" },
      { key: "notes", label: "Catatan", type: "textarea", section: "both" },
      // Operational fields
      { key: "stock_confirmation", label: "Konfirmasi Stok", type: "select", options: ["Ready", "Partially Ready", "Indent"], section: "operational" },
      { key: "packing_confirmation", label: "Status Packing", type: "select", options: ["Belum Packing", "Sedang Packing", "Sudah Packing"], section: "operational" },
      { key: "delivery_schedule", label: "Jadwal Pengiriman", type: "text", section: "operational" },
      { key: "invoice_vendor", label: "No. Invoice Vendor", type: "text", section: "operational" },
    ],
  },
  trucking: {
    label: "Trucking", emoji: "🚛",
    fields: [
      { key: "truck_type", label: "Jenis Armada", type: "select", required: true, options: ["CDD", "CDE", "Fuso", "Tronton", "Trailer 20ft", "Trailer 40ft", "Pick Up", "Box Truck"], section: "quotation" },
      { key: "capacity", label: "Kapasitas (ton)", type: "number", section: "quotation" },
      { key: "area_pickup", label: "Area Pickup", type: "text", required: true, placeholder: "Contoh: Cilincing, Jakarta Utara", section: "quotation" },
      { key: "area_delivery", label: "Area Delivery", type: "text", required: true, placeholder: "Contoh: Cibitung, Bekasi", section: "quotation" },
      { key: "price", label: "Harga Trucking (Rp)", type: "number", required: true, section: "quotation" },
      { key: "additional_charge", label: "Biaya Tambahan (Rp)", type: "number", placeholder: "Kosongkan jika tidak ada", section: "quotation" },
      { key: "eta_pickup", label: "Estimasi Pickup", type: "text", placeholder: "Contoh: H+1 setelah konfirmasi", section: "quotation" },
      { key: "eta_delivery", label: "Estimasi Delivery", type: "text", placeholder: "Contoh: 1–2 hari setelah pickup", section: "quotation" },
      { key: "valid_until", label: "Rate Berlaku Sampai", type: "date", section: "quotation" },
      { key: "notes", label: "Catatan Penawaran", type: "textarea", section: "quotation" },
      // Operational
      { key: "driver_name", label: "Nama Driver", type: "text", required: true, section: "operational" },
      { key: "driver_phone", label: "No HP Driver", type: "text", required: true, section: "operational" },
      { key: "plate_number", label: "Plat Nomor Kendaraan", type: "text", required: true, section: "operational" },
      { key: "vehicle_type", label: "Jenis Kendaraan", type: "text", section: "operational" },
      { key: "pickup_time", label: "Waktu Pickup", type: "text", section: "operational" },
      { key: "delivery_time", label: "Waktu Delivery", type: "text", section: "operational" },
      { key: "op_notes", label: "Catatan Operasional", type: "textarea", section: "operational" },
    ],
  },
  sea_freight: {
    label: "Sea Freight", emoji: "🚢",
    fields: [
      { key: "shipping_line", label: "Shipping Line / Forwarder", type: "text", required: true, placeholder: "Contoh: Maersk, MSC", section: "quotation" },
      { key: "pol", label: "Port of Loading (POL)", type: "text", required: true, placeholder: "Contoh: IDJKT", section: "quotation" },
      { key: "pod", label: "Port of Discharge (POD)", type: "text", required: true, placeholder: "Contoh: SGSIN", section: "quotation" },
      { key: "container_type", label: "Tipe Kontainer", type: "select", required: true, options: ["20' GP", "40' GP", "40' HC", "45' HC", "20' RF", "40' RF"], section: "quotation" },
      { key: "freight_rate", label: "Freight Rate (USD)", type: "number", required: true, section: "quotation" },
      { key: "etd", label: "ETD", type: "date", section: "quotation" },
      { key: "eta", label: "ETA", type: "date", section: "quotation" },
      { key: "transit_time", label: "Transit Time (hari)", type: "number", required: true, section: "quotation" },
      { key: "free_time", label: "Free Time Demurrage (hari)", type: "number", section: "quotation" },
      { key: "charges_include", label: "Include Charges", type: "textarea", placeholder: "Contoh: BL Fee, THC Origin", section: "quotation" },
      { key: "surcharge_note", label: "Surcharge / Additional", type: "textarea", section: "quotation" },
      { key: "validity", label: "Rate Berlaku Sampai", type: "date", section: "quotation" },
      { key: "notes", label: "Catatan", type: "textarea", section: "quotation" },
      // Operational
      { key: "booking_number", label: "Booking Number", type: "text", required: true, section: "operational" },
      { key: "vessel_name", label: "Vessel / Kapal", type: "text", section: "operational" },
      { key: "op_etd", label: "ETD Aktual", type: "text", section: "operational" },
      { key: "op_eta", label: "ETA Aktual", type: "text", section: "operational" },
      { key: "bl_number", label: "BL Number", type: "text", section: "operational" },
    ],
  },
  air_freight: {
    label: "Air Freight", emoji: "✈️",
    fields: [
      { key: "airline", label: "Maskapai / Agent", type: "text", required: true, placeholder: "Contoh: Garuda Cargo, DHL", section: "quotation" },
      { key: "origin_airport", label: "Bandara Asal (IATA)", type: "text", required: true, placeholder: "Contoh: CGK", section: "quotation" },
      { key: "dest_airport", label: "Bandara Tujuan (IATA)", type: "text", required: true, placeholder: "Contoh: SIN", section: "quotation" },
      { key: "rate_per_kg", label: "Rate per kg (Rp)", type: "number", required: true, section: "quotation" },
      { key: "min_charge", label: "Minimum Charge (Rp)", type: "number", section: "quotation" },
      { key: "fsc", label: "FSC / SSC / MYC", type: "text", placeholder: "Kosongkan jika tidak ada", section: "quotation" },
      { key: "etd", label: "ETD / Jadwal Penerbangan", type: "date", section: "quotation" },
      { key: "transit_time", label: "Transit Time (hari)", type: "number", required: true, section: "quotation" },
      { key: "chargeable_weight_rule", label: "Chargeable Weight Rule", type: "select", options: ["Actual Weight", "Volume Weight", "Higher of Both"], section: "quotation" },
      { key: "charges_include", label: "Include Charges", type: "textarea", section: "quotation" },
      { key: "validity", label: "Rate Berlaku Sampai", type: "date", section: "quotation" },
      { key: "notes", label: "Catatan", type: "textarea", section: "quotation" },
      // Operational
      { key: "booking_number", label: "Booking Number", type: "text", required: true, section: "operational" },
      { key: "flight_number", label: "Nomor Penerbangan", type: "text", section: "operational" },
      { key: "op_etd", label: "ETD Aktual", type: "text", section: "operational" },
      { key: "op_eta", label: "ETA Aktual", type: "text", section: "operational" },
      { key: "awb_number", label: "AWB Number", type: "text", section: "operational" },
    ],
  },
  ppjk: {
    label: "PPJK / Customs Clearance", emoji: "📋",
    fields: [
      { key: "doc_type", label: "Jenis Dokumen BC", type: "select", required: true, options: ["PIB Jalur Hijau", "PIB Jalur Kuning", "PIB Jalur Merah", "PIB Jalur Prioritas", "PIBK", "PEB", "BCF"], section: "quotation" },
      { key: "hs_code", label: "HS Code (opsional)", type: "text", section: "quotation" },
      { key: "customs_service", label: "Estimasi Biaya Jasa (Rp)", type: "number", required: true, section: "quotation" },
      { key: "duty_tax_estimate", label: "Estimasi Duty/Tax (Rp)", type: "number", section: "quotation" },
      { key: "docs_required", label: "Dokumen yang Dibutuhkan", type: "textarea", section: "quotation" },
      { key: "sla", label: "SLA Proses (hari kerja)", type: "number", section: "quotation" },
      { key: "undername", label: "Biaya Undername (Rp)", type: "number", placeholder: "Kosongkan jika tidak ada", section: "quotation" },
      { key: "notes", label: "Catatan / Compliance", type: "textarea", section: "quotation" },
      // Operational
      { key: "nomor_aju", label: "Nomor Aju", type: "text", required: true, section: "operational" },
      { key: "jenis_dokumen", label: "Jenis Dokumen Aktual", type: "text", section: "operational" },
      { key: "status_customs", label: "Status Customs", type: "select", options: ["Dalam Proses", "Jalur Hijau", "Jalur Kuning", "Jalur Merah", "SPPB Terbit"], section: "operational" },
      { key: "billing_info", label: "Info Billing / Pajak", type: "textarea", section: "operational" },
    ],
  },
  handling: {
    label: "Handling / Warehouse", emoji: "🏭",
    fields: [
      { key: "location", label: "Lokasi Warehouse", type: "text", required: true, placeholder: "Contoh: Cikarang Barat", section: "quotation" },
      { key: "handling_fee", label: "Handling Fee (Rp)", type: "number", required: true, section: "quotation" },
      { key: "storage_fee", label: "Storage Fee (Rp/m²/bulan)", type: "number", section: "quotation" },
      { key: "free_storage", label: "Free Storage (hari)", type: "number", section: "quotation" },
      { key: "loading_unloading_fee", label: "Loading/Unloading Fee (Rp/ton)", type: "number", section: "quotation" },
      { key: "sla", label: "SLA Proses (hari)", type: "number", section: "quotation" },
      { key: "equipment", label: "Equipment Support", type: "text", placeholder: "Contoh: Forklift 3 ton, CCTV 24 jam", section: "quotation" },
      { key: "notes", label: "Catatan", type: "textarea", section: "quotation" },
    ],
  },
  document: {
    label: "Document / Additional Service", emoji: "📄",
    fields: [
      { key: "service_name", label: "Nama Layanan", type: "text", required: true, section: "quotation" },
      { key: "description", label: "Deskripsi Layanan", type: "textarea", section: "quotation" },
      { key: "price", label: "Harga (Rp)", type: "number", required: true, section: "quotation" },
      { key: "currency", label: "Mata Uang", type: "select", options: ["IDR", "USD"], section: "quotation" },
      { key: "sla", label: "SLA / Lead Time (hari)", type: "number", section: "quotation" },
      { key: "docs_required", label: "Dokumen yang Dibutuhkan", type: "textarea", section: "quotation" },
      { key: "validity", label: "Berlaku Sampai", type: "date", section: "quotation" },
      { key: "notes", label: "Catatan", type: "textarea", section: "quotation" },
    ],
  },
  warehouse: {
    label: "Warehouse", emoji: "🏭",
    fields: [
      { key: "location", label: "Lokasi Gudang", type: "text", required: true },
      { key: "area_sqm", label: "Luas Tersedia (m²)", type: "number", required: true },
      { key: "storage_rate", label: "Tarif Sewa (Rp/m²/bulan)", type: "number", required: true },
      { key: "min_volume", label: "Volume Min (m³)", type: "number" },
      { key: "temperature", label: "Suhu / Tipe", type: "select", options: ["Ambient", "Chilled (2–8°C)", "Frozen (-18°C)", "AC Room"] },
      { key: "rack_system", label: "Sistem Racking", type: "select", options: ["Selective", "Drive-in", "Push Back", "Floor Storage", "Mezzanine"] },
      { key: "security", label: "Keamanan", type: "text", placeholder: "Contoh: CCTV 24 jam, Satpam" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  customs_clearance: {
    label: "Customs Clearance", emoji: "🛃",
    fields: [
      { key: "clearance_type", label: "Jenis Clearance", type: "select", required: true, options: ["Import", "Export", "Import + Export", "Transshipment"] },
      { key: "service_fee", label: "Biaya Jasa (Rp)", type: "number", required: true },
      { key: "scanning_fee", label: "Biaya Scanning (Rp)", type: "number" },
      { key: "document_fee", label: "Biaya Dokumen (Rp)", type: "number" },
      { key: "processing_time", label: "Waktu Proses (hari kerja)", type: "number" },
      { key: "port", label: "Pelabuhan / Bandara", type: "text", placeholder: "Contoh: Tanjung Priok" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  exim_service: {
    label: "Exim Service", emoji: "🌐",
    fields: [
      { key: "service_type", label: "Layanan", type: "select", required: true, options: ["Import Door to Door", "Export Door to Door", "Import Port to Port", "Export Port to Port", "Full Service"] },
      { key: "origin_country", label: "Negara Asal", type: "text", required: true },
      { key: "dest_country", label: "Negara Tujuan", type: "text", required: true },
      { key: "price", label: "Harga (Rp)", type: "number", required: true },
      { key: "transit_time", label: "Transit Time (hari)", type: "number" },
      { key: "incoterms", label: "Incoterms", type: "select", options: ["EXW", "FOB", "CIF", "DAP", "DDP", "FCA", "CPT", "CIP"] },
      { key: "validity", label: "Masa Berlaku (hari)", type: "number" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
};

// ── PUBLIC: GET /api/vendor-form/:token ───────────────────────────────────────

vendorMiniFormRouter.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  if (token === "admin") return res.status(404).json({ error: "Not found" });
  try {
    let row = getCached(token);
    if (!row) {
      const [dbRow] = await db
        .select({
          id: vendorMiniFormLinksTable.id,
          serviceType: vendorMiniFormLinksTable.serviceType,
          title: vendorMiniFormLinksTable.title,
          notes: vendorMiniFormLinksTable.notes,
          isActive: vendorMiniFormLinksTable.isActive,
          expiresAt: vendorMiniFormLinksTable.expiresAt,
          mode: vendorMiniFormLinksTable.mode,
          orderId: vendorMiniFormLinksTable.orderId,
          orderNumber: vendorMiniFormLinksTable.orderNumber,
          orderItemId: vendorMiniFormLinksTable.orderItemId,
          phase: vendorMiniFormLinksTable.phase,
          maxSubmissions: vendorMiniFormLinksTable.maxSubmissions,
          resubmitAllowed: vendorMiniFormLinksTable.resubmitAllowed,
          vendorName: suppliersTable.name,
          vendorPhone: suppliersTable.phone,
          vendorContactPerson: suppliersTable.contactPerson,
          linkVendorName: vendorMiniFormLinksTable.vendorName,
        })
        .from(vendorMiniFormLinksTable)
        .leftJoin(suppliersTable, eq(suppliersTable.id, vendorMiniFormLinksTable.supplierId))
        .where(eq(vendorMiniFormLinksTable.token, token));

      if (!dbRow) return res.status(404).json({ error: "Link tidak ditemukan atau sudah tidak valid" });
      row = {
        id: dbRow.id,
        serviceType: dbRow.serviceType,
        title: dbRow.title,
        notes: dbRow.notes,
        isActive: dbRow.isActive,
        expiresAt: dbRow.expiresAt,
        mode: dbRow.mode ?? "rate_collection",
        orderId: dbRow.orderId ?? null,
        orderNumber: dbRow.orderNumber ?? null,
        orderItemId: dbRow.orderItemId ?? null,
        phase: dbRow.phase ?? "quotation",
        maxSubmissions: dbRow.maxSubmissions ?? null,
        resubmitAllowed: dbRow.resubmitAllowed ?? false,
        vendorName: dbRow.linkVendorName ?? dbRow.vendorName ?? null,
        vendorPhone: dbRow.vendorPhone ?? null,
        vendorContactPerson: dbRow.vendorContactPerson ?? null,
        expiresCache: 0,
      };
      if (dbRow.isActive && (!dbRow.expiresAt || dbRow.expiresAt >= new Date())) {
        setCached(token, row);
      }
    }
    if (!row) return res.status(404).json({ error: "Link tidak ditemukan atau sudah tidak valid" });
    if (!row.isActive) return res.status(410).json({ error: "Link ini sudah dinonaktifkan" });
    if (row.expiresAt && row.expiresAt < new Date()) {
      invalidateTokenCache(token);
      return res.status(410).json({ error: "Link ini sudah kadaluarsa" });
    }

    // Check submission count & duplicate
    const existingCount = await db
      .select({ cnt: count() })
      .from(vendorMiniFormSubmissionsTable)
      .where(eq(vendorMiniFormSubmissionsTable.token, token));
    const submissionCount = Number(existingCount[0]?.cnt ?? 0);

    // Max submissions check
    if (row.maxSubmissions !== null && submissionCount >= row.maxSubmissions) {
      return res.status(410).json({ error: "Kuota submission untuk link ini sudah penuh" });
    }

    // Anti-duplicate: order-based or if resubmit not allowed
    let alreadySubmitted = false;
    if (submissionCount > 0) {
      if (row.mode === "order_based" && !row.resubmitAllowed) {
        alreadySubmitted = true;
      } else if (row.mode === "rate_collection" && !row.resubmitAllowed) {
        alreadySubmitted = true;
      }
    }

    const schema = SERVICE_SCHEMAS[row.serviceType] ?? null;
    const filteredSchema = schema ? {
      ...schema,
      fields: schema.fields.filter(f => {
        if (!f.section) return true;
        if (row!.phase === "operational") return f.section === "operational" || f.section === "both";
        return f.section === "quotation" || f.section === "both";
      }),
    } : null;

    res.setHeader("Cache-Control", PUBLIC_CACHE);
    return res.json({
      id: row.id,
      serviceType: row.serviceType,
      title: row.title,
      notes: row.notes,
      vendorName: row.vendorName,
      vendorPhone: row.vendorPhone,
      vendorContactPerson: row.vendorContactPerson,
      mode: row.mode,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      orderItemId: row.orderItemId,
      phase: row.phase,
      alreadySubmitted,
      schema: filteredSchema,
    });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form GET error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUBLIC: POST /api/vendor-form/:token ──────────────────────────────────────

vendorMiniFormRouter.post("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  if (token === "admin") return res.status(404).json({ error: "Not found" });
  try {
    const [link] = await db
      .select()
      .from(vendorMiniFormLinksTable)
      .where(eq(vendorMiniFormLinksTable.token, token));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (!link.isActive) return res.status(410).json({ error: "Link ini sudah dinonaktifkan" });
    if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).json({ error: "Link sudah kadaluarsa" });

    // Anti-duplicate check
    const [existing] = await db
      .select({ id: vendorMiniFormSubmissionsTable.id, locked: vendorMiniFormSubmissionsTable.locked })
      .from(vendorMiniFormSubmissionsTable)
      .where(eq(vendorMiniFormSubmissionsTable.token, token))
      .limit(1);

    if (existing) {
      if (existing.locked) return res.status(409).json({ error: "Penawaran sudah dikunci — harga tidak dapat diubah setelah customer menyetujui" });
      if (!link.resubmitAllowed) return res.status(409).json({ error: "Penawaran sudah pernah dikirim. Hubungi admin untuk izin revisi." });
    }

    // Max submissions check
    if (link.maxSubmissions !== null) {
      const [cntRow] = await db
        .select({ cnt: count() })
        .from(vendorMiniFormSubmissionsTable)
        .where(eq(vendorMiniFormSubmissionsTable.token, token));
      if (Number(cntRow?.cnt ?? 0) >= link.maxSubmissions) {
        return res.status(410).json({ error: "Kuota submission sudah penuh" });
      }
    }

    const { vendorName, contactPerson, contactPhone, formData, responseStatus, vendorPrice, currency, eta, validUntil } = req.body as {
      vendorName?: string; contactPerson?: string; contactPhone?: string;
      formData?: Record<string, unknown>;
      responseStatus?: string; vendorPrice?: number; currency?: string;
      eta?: string; validUntil?: string;
    };

    if (!formData || typeof formData !== "object") return res.status(400).json({ error: "formData diperlukan" });

    // Capture IP and UA
    const submittedIp = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket?.remoteAddress ?? null;
    const submittedUa = (req.headers["user-agent"] ?? null) as string | null;

    const isRevision = existing && link.resubmitAllowed;

    let submission: typeof vendorMiniFormSubmissionsTable.$inferSelect;

    if (isRevision && existing) {
      // Update existing submission (price versioning)
      const [prev] = await db
        .select({ vendorPrice: vendorMiniFormSubmissionsTable.vendorPrice, currency: vendorMiniFormSubmissionsTable.currency, revisionCount: vendorMiniFormSubmissionsTable.revisionCount })
        .from(vendorMiniFormSubmissionsTable)
        .where(eq(vendorMiniFormSubmissionsTable.id, existing.id));

      // Save price history if price changed
      if (vendorPrice !== undefined && prev?.vendorPrice !== null) {
        const [lastVer] = await db
          .select({ versionNumber: vendorPriceHistoryTable.versionNumber })
          .from(vendorPriceHistoryTable)
          .where(eq(vendorPriceHistoryTable.submissionId, existing.id))
          .orderBy(desc(vendorPriceHistoryTable.versionNumber))
          .limit(1);
        await db.insert(vendorPriceHistoryTable).values({
          submissionId: existing.id,
          versionNumber: (lastVer?.versionNumber ?? 1) + 1,
          oldPrice: prev?.vendorPrice ?? null,
          newPrice: vendorPrice ? String(vendorPrice) : null,
          currency: currency ?? prev?.currency ?? "IDR",
          reason: "Revisi oleh vendor",
          changedBy: "vendor",
        });
      }

      const [updated] = await db.update(vendorMiniFormSubmissionsTable)
        .set({
          formData, vendorName: vendorName ?? link.vendorName ?? undefined,
          contactPerson: contactPerson ?? undefined, contactPhone: contactPhone ?? undefined,
          responseStatus: "resubmitted", vendorPrice: vendorPrice ? String(vendorPrice) : undefined,
          currency: currency ?? undefined, eta: eta ?? undefined, validUntil: validUntil ?? undefined,
          submittedIp, submittedUa,
          revisionCount: (prev?.revisionCount ?? 0) + 1,
        })
        .where(eq(vendorMiniFormSubmissionsTable.id, existing.id))
        .returning();

      // Reset resubmitAllowed after revision
      await db.update(vendorMiniFormLinksTable)
        .set({ resubmitAllowed: false })
        .where(eq(vendorMiniFormLinksTable.id, link.id));
      invalidateTokenCache(token);

      submission = updated;
      await logActivity("submission", existing.id, "resubmitted", "vendor",
        `Revisi penawaran oleh ${vendorName ?? link.vendorName ?? "vendor"}`,
        { vendorPrice, currency, eta });
    } else {
      const [inserted] = await db.insert(vendorMiniFormSubmissionsTable).values({
        linkId: link.id, token,
        supplierId: link.supplierId,
        serviceType: link.serviceType,
        vendorName: vendorName ?? link.vendorName ?? null,
        contactPerson: contactPerson ?? null, contactPhone: contactPhone ?? null,
        formData,
        responseStatus: responseStatus ?? "submitted",
        vendorPrice: vendorPrice ? String(vendorPrice) : null,
        currency: currency ?? "IDR",
        eta: eta ?? null, validUntil: validUntil ?? null,
        orderId: link.orderId ?? null,
        orderItemId: link.orderItemId ?? null,
        submittedIp, submittedUa,
      }).returning();

      submission = inserted;
      await logActivity("submission", inserted.id, "submitted", "vendor",
        `Penawaran dari ${vendorName ?? link.vendorName ?? "vendor"}`,
        { linkId: link.id, orderNumber: link.orderNumber, vendorPrice, currency, eta });
    }

    // Update link item_status for order-based
    if (link.mode === "order_based") {
      await db.update(vendorMiniFormLinksTable)
        .set({ itemStatus: "vendor_submitted" })
        .where(eq(vendorMiniFormLinksTable.id, link.id));
    }

    const vendorLabel = vendorName?.trim() || link.vendorName || "Vendor";
    const picLabel = contactPerson?.trim() || "-";

    // Confirm WA to vendor
    if (contactPhone?.trim()) {
      const msgVendor =
        `Halo *${picLabel}* dari *${vendorLabel}*,\n\n` +
        `Terima kasih! Penawaran Anda telah kami terima dan akan segera diproses oleh tim CST Logistics.\n\n` +
        (link.orderNumber ? `Order Ref: *${link.orderNumber}*\n\n` : "") +
        `_Pesan ini dikirim otomatis, mohon tidak dibalas._`;
      sendWhatsApp(contactPhone.trim(), msgVendor, {
        context: "vendor-mini-form-confirm",
        refType: "vendor_mini_form",
        refId: token,
      }).catch(() => {});
    }

    // WA Summary to admin (especially useful for order-based: show all competing offers)
    getAdminWa().then(async (adminWa) => {
      if (!adminWa) return;
      const priceStr = vendorPrice ? `${currency ?? "IDR"} ${Number(vendorPrice).toLocaleString("id-ID")}` : "-";

      if (link.mode === "order_based" && link.orderNumber) {
        // Gather all existing submissions for this link for summary
        const allSubs = await db
          .select({ vendorName: vendorMiniFormSubmissionsTable.vendorName, vendorPrice: vendorMiniFormSubmissionsTable.vendorPrice, currency: vendorMiniFormSubmissionsTable.currency, eta: vendorMiniFormSubmissionsTable.eta })
          .from(vendorMiniFormSubmissionsTable)
          .where(eq(vendorMiniFormSubmissionsTable.linkId, link.id))
          .orderBy(desc(vendorMiniFormSubmissionsTable.submittedAt));

        const { getPreferredDomain } = await import("../lib/domain.js");
        const domain = getPreferredDomain();
        const adminReviewLink = domain ? `https://${domain}/bizportal/purchase/vendor-forms` : "/bizportal/purchase/vendor-forms";

        const lines = allSubs.map((s, i) => {
          const p = s.vendorPrice ? `${s.currency ?? "IDR"} ${Number(s.vendorPrice).toLocaleString("id-ID")}` : "-";
          const etaStr = s.eta ? ` - ETA ${s.eta}` : "";
          return `${i + 1}. *${s.vendorName ?? "Vendor"}* - ${p}${etaStr}`;
        });

        const msgAdmin =
          `📊 *Update Penawaran Vendor untuk Order #${link.orderNumber}*\n` +
          `${lines.join("\n")}\n\n` +
          `Review: ${adminReviewLink}`;
        sendWhatsApp(adminWa, msgAdmin, {
          context: "vendor-mini-form-summary",
          refType: "vendor_mini_form_link",
          refId: String(link.id),
        }).catch(() => {});
      } else {
        // Simple notification for rate_collection
        const msgAdmin =
          `📋 *Submission Form Vendor*\n` +
          `Vendor: *${vendorLabel}*\n` +
          `PIC: ${picLabel} · ${contactPhone?.trim() || "-"}\n` +
          (link.orderNumber ? `Order: ${link.orderNumber}\n` : "") +
          `Service: ${SERVICE_SCHEMAS[link.serviceType]?.label ?? link.serviceType}\n` +
          `Harga: ${priceStr}\n` +
          (isRevision ? `Status: *REVISI* (Rev-${(submission as { revisionCount?: number }).revisionCount ?? 1})` : `Status: ${responseStatus ?? "submitted"}`);
        sendWhatsApp(adminWa, msgAdmin, {
          context: "vendor-mini-form-admin-notif",
          refType: "vendor_mini_form",
          refId: token,
        }).catch(() => {});
      }
    }).catch(() => {});

    return res.json({ success: true, submissionId: submission.id, message: "Penawaran berhasil dikirim, terima kasih!" });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form POST error");
    return res.status(500).json({ error: "Gagal menyimpan data" });
  }
});

// ── PUBLIC: GET /api/vendor-form/customer-approval/:token ─────────────────────

vendorMiniFormRouter.get("/customer-approval/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const [approval] = await db.select().from(customerApprovalsTable).where(eq(customerApprovalsTable.token, token));
    if (!approval) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (approval.expiresAt && approval.expiresAt < new Date()) return res.status(410).json({ error: "Link penawaran sudah kadaluarsa" });
    return res.json({
      token: approval.token, orderNumber: approval.orderNumber,
      customerName: approval.customerName, offerSummary: approval.offerSummary,
      sellingPrice: approval.sellingPrice, currency: approval.currency,
      termsNotes: approval.termsNotes, status: approval.status, soNumber: approval.soNumber,
    });
  } catch (err) {
    req.log?.error({ err }, "customer-approval GET error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUBLIC: POST /api/vendor-form/customer-approval/:token ────────────────────

vendorMiniFormRouter.post("/customer-approval/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const [approval] = await db.select().from(customerApprovalsTable).where(eq(customerApprovalsTable.token, token));
    if (!approval) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (approval.status !== "pending") return res.status(409).json({ error: "Penawaran ini sudah direspons sebelumnya", status: approval.status });
    if (approval.expiresAt && approval.expiresAt < new Date()) return res.status(410).json({ error: "Link penawaran sudah kadaluarsa" });

    const { action, notes } = req.body as { action: "approve" | "reject"; notes?: string };
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "action harus approve atau reject" });

    const now = new Date();
    let soNumber: string | null = null;

    if (action === "approve") {
      const dateStr = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, "0");
      soNumber = `SO/${dateStr}/${String(approval.id).padStart(5, "0")}`;

      await db.update(customerApprovalsTable)
        .set({ status: "approved", approvedAt: now, notes: notes ?? null, soNumber, locked: true })
        .where(eq(customerApprovalsTable.token, token));

      // Lock selected submissions if submissionId is known
      if (approval.submissionId) {
        await db.update(vendorMiniFormSubmissionsTable)
          .set({ locked: true, responseStatus: "customer_approved" })
          .where(eq(vendorMiniFormSubmissionsTable.id, approval.submissionId));
      } else if (approval.orderId) {
        // Lock all selected submissions for this order
        await db.update(vendorMiniFormSubmissionsTable)
          .set({ locked: true, responseStatus: "customer_approved" })
          .where(and(
            eq(vendorMiniFormSubmissionsTable.orderId, approval.orderId),
            eq(vendorMiniFormSubmissionsTable.selectedByAdmin, true),
          ));
      }

      // Update logistic order status
      if (approval.orderId) {
        await db.update(logisticOrdersTable)
          .set({ customerConfirmStatus: "confirmed", customerConfirmedAt: now, status: "Customer Approved" })
          .where(eq(logisticOrdersTable.id, approval.orderId));
      }

      await logActivity("customer_approval", approval.id, "approved", "customer",
        `Customer ${approval.customerName ?? "-"} menyetujui penawaran. SO: ${soNumber}`,
        { soNumber, orderId: approval.orderId });
    } else {
      await db.update(customerApprovalsTable)
        .set({ status: "rejected", rejectedAt: now, notes: notes ?? null })
        .where(eq(customerApprovalsTable.token, token));

      if (approval.orderId) {
        await db.update(logisticOrdersTable)
          .set({ customerConfirmStatus: "rejected", status: "Customer Rejected" })
          .where(eq(logisticOrdersTable.id, approval.orderId));
      }

      await logActivity("customer_approval", approval.id, "rejected", "customer",
        `Customer ${approval.customerName ?? "-"} menolak penawaran`, { orderId: approval.orderId });
    }

    // Notify admin
    getAdminWa().then((adminWa) => {
      if (!adminWa) return;
      const emoji = action === "approve" ? "✅" : "❌";
      const msg = `${emoji} *Customer ${action === "approve" ? "Setuju" : "Tolak"} Penawaran*\n` +
        `Order: ${approval.orderNumber ?? "-"}\n` +
        `Customer: ${approval.customerName ?? "-"}\n` +
        (soNumber ? `SO: ${soNumber}\n` : "") +
        (notes ? `Catatan: ${notes}` : "");
      sendWhatsApp(adminWa, msg, { context: "customer-approval", refType: "customer_approval", refId: token }).catch(() => {});
    }).catch(() => {});

    return res.json({
      success: true, action, soNumber,
      message: action === "approve"
        ? `Terima kasih! Persetujuan Anda telah kami catat. Sales Order ${soNumber} telah dibuat.`
        : "Penolakan Anda telah kami catat. Tim kami akan segera menghubungi Anda.",
    });
  } catch (err) {
    req.log?.error({ err }, "customer-approval POST error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUBLIC: GET /api/vendor-form/op-confirm/:token ────────────────────────────

vendorMiniFormRouter.get("/op-confirm/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const [conf] = await db.select().from(vendorOperationalConfirmationsTable).where(eq(vendorOperationalConfirmationsTable.token, token));
    if (!conf) return res.status(404).json({ error: "Link tidak ditemukan" });
    const schema = SERVICE_SCHEMAS[conf.serviceType] ?? null;
    const opFields = schema ? {
      ...schema,
      fields: schema.fields.filter(f => f.section === "operational" || f.section === "both"),
    } : null;
    return res.json({
      token: conf.token, orderNumber: conf.orderNumber, vendorName: conf.vendorName,
      serviceType: conf.serviceType, instruction: conf.instruction, status: conf.status, schema: opFields,
    });
  } catch (err) {
    req.log?.error({ err }, "op-confirm GET error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUBLIC: POST /api/vendor-form/op-confirm/:token ───────────────────────────

vendorMiniFormRouter.post("/op-confirm/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const [conf] = await db.select().from(vendorOperationalConfirmationsTable).where(eq(vendorOperationalConfirmationsTable.token, token));
    if (!conf) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (conf.status === "submitted") return res.status(409).json({ error: "Data operasional sudah dikirim sebelumnya" });

    const { payload } = req.body as { payload: Record<string, unknown> };
    if (!payload) return res.status(400).json({ error: "payload diperlukan" });

    await db.update(vendorOperationalConfirmationsTable)
      .set({ payload, status: "submitted", submittedAt: new Date() })
      .where(eq(vendorOperationalConfirmationsTable.token, token));

    await logActivity("op_confirm", conf.id, "op_submitted", "vendor",
      `Data operasional diisi oleh ${conf.vendorName ?? "vendor"}`, { orderNumber: conf.orderNumber, serviceType: conf.serviceType });

    getAdminWa().then((adminWa) => {
      if (!adminWa) return;
      const msg = `🚚 *Data Operasional Vendor*\n` +
        `Order: ${conf.orderNumber ?? "-"}\n` +
        `Vendor: ${conf.vendorName ?? "-"}\n` +
        `Service: ${SERVICE_SCHEMAS[conf.serviceType]?.label ?? conf.serviceType}\n` +
        `Status: Data operasional sudah diisi.`;
      sendWhatsApp(adminWa, msg, { context: "op-confirm", refType: "vendor_op_confirm", refId: token }).catch(() => {});
    }).catch(() => {});

    return res.json({ success: true, message: "Data operasional berhasil dikirim, terima kasih!" });
  } catch (err) {
    req.log?.error({ err }, "op-confirm POST error");
    return res.status(500).json({ error: "Gagal menyimpan data" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/schemas ─────────────────────────────────

vendorMiniFormRouter.get("/admin/schemas", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  return res.json(SERVICE_SCHEMAS);
});

// ── ADMIN: GET /api/vendor-form/admin/links ───────────────────────────────────

vendorMiniFormRouter.get("/admin/links", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const links = await db.select().from(vendorMiniFormLinksTable).orderBy(desc(vendorMiniFormLinksTable.createdAt));
    const vendorIds = links.map(l => l.supplierId).filter(Boolean) as number[];
    let vendorMap: Record<number, string> = {};
    if (vendorIds.length) {
      const vendors = await db.select({ id: suppliersTable.id, name: suppliersTable.name }).from(suppliersTable);
      vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.name]));
    }
    return res.json(links.map(l => ({
      ...l,
      vendorName: l.vendorName ?? (l.supplierId ? (vendorMap[l.supplierId] ?? null) : null),
      expiresAt: l.expiresAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin GET links error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/links ──────────────────────────────────

vendorMiniFormRouter.post("/admin/links", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const { supplierId, serviceType, title, notes, expiresInDays, mode, orderId, orderNumber, orderItemId, vendorName, maxSubmissions, adminNotes } = req.body as {
      supplierId?: number; serviceType: string; title?: string; notes?: string; expiresInDays?: number;
      mode?: string; orderId?: number; orderNumber?: string; orderItemId?: number; vendorName?: string;
      maxSubmissions?: number; adminNotes?: string;
    };

    if (!serviceType || !SERVICE_SCHEMAS[serviceType]) return res.status(400).json({ error: "serviceType tidak valid" });

    const token = randomBytes(24).toString("hex");
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;
    const userId = (req.user as { id: string } | undefined)?.id ?? null;

    const [link] = await db.insert(vendorMiniFormLinksTable).values({
      token, supplierId: supplierId ?? null, serviceType,
      title: title ?? null, notes: notes ?? null,
      expiresAt: expiresAt ?? undefined,
      createdBy: userId,
      mode: mode ?? "rate_collection",
      orderId: orderId ?? null, orderNumber: orderNumber ?? null, orderItemId: orderItemId ?? null,
      vendorName: vendorName ?? null,
      itemStatus: mode === "order_based" ? "waiting_vendor" : null,
      phase: "quotation",
      maxSubmissions: maxSubmissions ?? null,
      adminNotes: adminNotes ?? null,
    }).returning();

    await logActivity("link", link.id, "created", userId,
      `Link dibuat untuk ${serviceType} (mode: ${mode ?? "rate_collection"})`,
      { serviceType, orderId, orderNumber, mode });

    return res.status(201).json({ ...link, expiresAt: link.expiresAt?.toISOString() ?? null, createdAt: link.createdAt.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin POST links error");
    return res.status(500).json({ error: "Gagal membuat link" });
  }
});

// ── ADMIN: PATCH /api/vendor-form/admin/links/:id ────────────────────────────

vendorMiniFormRouter.patch("/admin/links/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const { isActive, title, notes, itemStatus, adminNotes, resubmitAllowed, maxSubmissions } = req.body as {
      isActive?: boolean; title?: string; notes?: string; itemStatus?: string;
      adminNotes?: string; resubmitAllowed?: boolean; maxSubmissions?: number | null;
    };
    const patch: Record<string, unknown> = {};
    if (typeof isActive === "boolean") patch["isActive"] = isActive;
    if (typeof title === "string") patch["title"] = title;
    if (typeof notes === "string") patch["notes"] = notes;
    if (typeof itemStatus === "string") patch["itemStatus"] = itemStatus;
    if (typeof adminNotes === "string") patch["adminNotes"] = adminNotes;
    if (typeof resubmitAllowed === "boolean") patch["resubmitAllowed"] = resubmitAllowed;
    if (maxSubmissions !== undefined) patch["maxSubmissions"] = maxSubmissions;

    const [updated] = await db.update(vendorMiniFormLinksTable).set(patch).where(eq(vendorMiniFormLinksTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Link tidak ditemukan" });
    invalidateTokenCache(updated.token);
    return res.json({ ...updated, expiresAt: updated.expiresAt?.toISOString() ?? null, createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin PATCH links error");
    return res.status(500).json({ error: "Gagal update link" });
  }
});

// ── ADMIN: DELETE /api/vendor-form/admin/links/:id ───────────────────────────

vendorMiniFormRouter.delete("/admin/links/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [deleted] = await db.delete(vendorMiniFormLinksTable).where(eq(vendorMiniFormLinksTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Link tidak ditemukan" });
    invalidateTokenCache(deleted.token);
    return res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin DELETE links error");
    return res.status(500).json({ error: "Gagal menghapus link" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/submissions ─────────────────────────────

vendorMiniFormRouter.get("/admin/submissions", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const submissions = await db.select().from(vendorMiniFormSubmissionsTable).orderBy(desc(vendorMiniFormSubmissionsTable.submittedAt));
    const tokens = submissions.map(s => s.token);
    let waMap: Record<string, { status: string; recipient: string; createdAt: string }> = {};
    if (tokens.length > 0) {
      const waLogs = await db
        .select({ refId: notificationLogsTable.refId, status: notificationLogsTable.status, recipient: notificationLogsTable.recipient, createdAt: notificationLogsTable.createdAt })
        .from(notificationLogsTable)
        .where(inArray(notificationLogsTable.refId, tokens))
        .orderBy(desc(notificationLogsTable.createdAt));
      for (const log of waLogs) {
        if (log.refId && !waMap[log.refId]) {
          waMap[log.refId] = { status: log.status, recipient: log.recipient, createdAt: log.createdAt.toISOString() };
        }
      }
    }
    return res.json(submissions.map(s => ({
      ...s,
      submittedAt: s.submittedAt.toISOString(),
      selectedAt: s.selectedAt?.toISOString() ?? null,
      waStatus: waMap[s.token]?.status ?? null,
      waRecipient: waMap[s.token]?.recipient ?? null,
      waAt: waMap[s.token]?.createdAt ?? null,
    })));
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin GET submissions error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/submissions/:id/select ─────────────────

vendorMiniFormRouter.post("/admin/submissions/:id/select", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const userId = (req.user as { id: string } | undefined)?.id ?? "admin";
    const [sub] = await db.select().from(vendorMiniFormSubmissionsTable).where(eq(vendorMiniFormSubmissionsTable.id, id));
    if (!sub) return res.status(404).json({ error: "Submission tidak ditemukan" });

    if (sub.linkId) {
      await db.update(vendorMiniFormSubmissionsTable)
        .set({ selectedByAdmin: false, selectedAt: null })
        .where(eq(vendorMiniFormSubmissionsTable.linkId, sub.linkId));
    }
    const [updated] = await db.update(vendorMiniFormSubmissionsTable)
      .set({ selectedByAdmin: true, selectedAt: new Date(), responseStatus: "selected" })
      .where(eq(vendorMiniFormSubmissionsTable.id, id))
      .returning();

    if (sub.linkId) {
      await db.update(vendorMiniFormLinksTable)
        .set({ itemStatus: "admin_review" })
        .where(eq(vendorMiniFormLinksTable.id, sub.linkId));
    }

    await logActivity("submission", id, "selected", userId,
      `Vendor ${sub.vendorName ?? "-"} dipilih oleh admin`,
      { vendorPrice: sub.vendorPrice, currency: sub.currency, linkId: sub.linkId });

    return res.json({ ...updated, selectedAt: updated.selectedAt?.toISOString() ?? null, submittedAt: updated.submittedAt.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "select submission error");
    return res.status(500).json({ error: "Gagal memilih submission" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/submissions/:id/request-revision ────────

vendorMiniFormRouter.post("/admin/submissions/:id/request-revision", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const userId = (req.user as { id: string } | undefined)?.id ?? "admin";
    const { reason } = req.body as { reason?: string };

    const [sub] = await db.select().from(vendorMiniFormSubmissionsTable).where(eq(vendorMiniFormSubmissionsTable.id, id));
    if (!sub) return res.status(404).json({ error: "Submission tidak ditemukan" });
    if (sub.locked) return res.status(409).json({ error: "Submission sudah dikunci oleh customer approval" });

    // Update submission status
    await db.update(vendorMiniFormSubmissionsTable)
      .set({ responseStatus: "revision_requested" })
      .where(eq(vendorMiniFormSubmissionsTable.id, id));

    // Allow resubmission on the link
    if (sub.linkId) {
      await db.update(vendorMiniFormLinksTable)
        .set({ resubmitAllowed: true, isActive: true })
        .where(eq(vendorMiniFormLinksTable.id, sub.linkId));
      const [link] = await db.select({ token: vendorMiniFormLinksTable.token }).from(vendorMiniFormLinksTable).where(eq(vendorMiniFormLinksTable.id, sub.linkId));
      if (link) invalidateTokenCache(link.token);
    }

    await logActivity("submission", id, "revision_requested", userId,
      `Admin meminta revisi harga dari ${sub.vendorName ?? "vendor"}${reason ? `. Alasan: ${reason}` : ""}`,
      { reason, linkId: sub.linkId, previousPrice: sub.vendorPrice });

    // Optionally notify vendor if phone available
    if (sub.contactPhone) {
      const [linkRow] = sub.linkId ? await db.select().from(vendorMiniFormLinksTable).where(eq(vendorMiniFormLinksTable.id, sub.linkId)) : [null];
      if (linkRow) {
        const { getPreferredDomain } = await import("../lib/domain.js");
        const domain = getPreferredDomain();
        const formUrl = linkRow.shortUrl ?? (domain ? `https://${domain}/vendor-mini-form/${linkRow.token}` : `/vendor-mini-form/${linkRow.token}`);
        const msg = `Halo *${sub.vendorName ?? "Vendor"}*, kami mohon revisi harga penawaran Anda` +
          (linkRow.orderNumber ? ` untuk Order *${linkRow.orderNumber}*` : "") +
          (reason ? `.\n\nAlasan: ${reason}` : "") +
          `.\n\nSilakan update penawaran melalui:\n${formUrl}`;
        sendWhatsApp(sub.contactPhone, msg, {
          context: "revision-request",
          refType: "vendor_mini_form",
          refId: String(sub.linkId ?? sub.id),
        }).catch(() => {});
      }
    }

    return res.json({ success: true, message: "Permintaan revisi berhasil dikirim" });
  } catch (err) {
    req.log?.error({ err }, "request-revision error");
    return res.status(500).json({ error: "Gagal meminta revisi" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/submissions/:id/price-history ────────────

vendorMiniFormRouter.get("/admin/submissions/:id/price-history", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const history = await db
      .select()
      .from(vendorPriceHistoryTable)
      .where(eq(vendorPriceHistoryTable.submissionId, id))
      .orderBy(desc(vendorPriceHistoryTable.changedAt));
    return res.json(history.map(h => ({ ...h, changedAt: h.changedAt.toISOString() })));
  } catch (err) {
    req.log?.error({ err }, "price-history error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/activity-log ────────────────────────────

vendorMiniFormRouter.get("/admin/activity-log", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const logs = await db
      .select()
      .from(vmfActivityLogTable)
      .orderBy(desc(vmfActivityLogTable.createdAt))
      .limit(200);
    return res.json(logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })));
  } catch (err) {
    req.log?.error({ err }, "activity-log error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/customer-approvals ────────────────────

vendorMiniFormRouter.post("/admin/customer-approvals", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const {
      orderId, orderNumber, customerName, customerPhone, customerEmail,
      offerSummary, sellingPrice, currency, termsNotes, expiresInDays,
      submissionId, vendorCost, markupPct, markupNominal, ppnPct, ppnNominal,
      profitMarginPct, adminNotes,
    } = req.body as {
      orderId?: number; orderNumber?: string; customerName?: string; customerPhone?: string; customerEmail?: string;
      offerSummary?: object; sellingPrice?: number; currency?: string; termsNotes?: string; expiresInDays?: number;
      submissionId?: number; vendorCost?: number; markupPct?: number; markupNominal?: number;
      ppnPct?: number; ppnNominal?: number; profitMarginPct?: number; adminNotes?: string;
    };

    const token = randomBytes(20).toString("hex");
    const userId = (req.user as { id: string } | undefined)?.id ?? null;
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const [approval] = await db.insert(customerApprovalsTable).values({
      token, orderId: orderId ?? null, orderNumber: orderNumber ?? null,
      customerName: customerName ?? null, customerPhone: customerPhone ?? null, customerEmail: customerEmail ?? null,
      offerSummary: offerSummary ?? {},
      sellingPrice: sellingPrice ? String(sellingPrice) : null,
      currency: currency ?? "IDR", termsNotes: termsNotes ?? null, status: "pending",
      createdBy: userId, expiresAt: expiresAt ?? undefined,
      submissionId: submissionId ?? null,
      vendorCost: vendorCost ? String(vendorCost) : null,
      markupPct: markupPct ? String(markupPct) : null,
      markupNominal: markupNominal ? String(markupNominal) : null,
      ppnPct: ppnPct !== undefined ? String(ppnPct) : "11",
      ppnNominal: ppnNominal ? String(ppnNominal) : null,
      profitMarginPct: profitMarginPct ? String(profitMarginPct) : null,
      adminNotes: adminNotes ?? null,
    }).returning();

    await logActivity("customer_approval", approval.id, "created", userId,
      `Link approval dibuat untuk ${customerName ?? "customer"}`,
      { orderNumber, sellingPrice, currency, vendorCost, markupPct });

    // Update link itemStatus if orderId matches
    if (orderId) {
      await db.update(vendorMiniFormLinksTable)
        .set({ itemStatus: "waiting_customer" })
        .where(and(eq(vendorMiniFormLinksTable.orderId, orderId), eq(vendorMiniFormLinksTable.mode, "order_based")));
    }

    return res.status(201).json({ ...approval, createdAt: approval.createdAt.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "create customer-approval error");
    return res.status(500).json({ error: "Gagal membuat link approval" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/customer-approvals ─────────────────────

vendorMiniFormRouter.get("/admin/customer-approvals", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const approvals = await db.select().from(customerApprovalsTable).orderBy(desc(customerApprovalsTable.createdAt));
    return res.json(approvals.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      approvedAt: a.approvedAt?.toISOString() ?? null,
      rejectedAt: a.rejectedAt?.toISOString() ?? null,
      expiresAt: a.expiresAt?.toISOString() ?? null,
    })));
  } catch (err) {
    req.log?.error({ err }, "get customer-approvals error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/op-confirms ────────────────────────────

vendorMiniFormRouter.post("/admin/op-confirms", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const { orderId, orderNumber, orderItemId, supplierId, vendorName, serviceType, instruction } = req.body as {
      orderId?: number; orderNumber?: string; orderItemId?: number; supplierId?: number;
      vendorName?: string; serviceType: string; instruction?: string;
    };
    if (!serviceType) return res.status(400).json({ error: "serviceType wajib" });

    const token = randomBytes(20).toString("hex");
    const [conf] = await db.insert(vendorOperationalConfirmationsTable).values({
      token, orderId: orderId ?? null, orderNumber: orderNumber ?? null,
      orderItemId: orderItemId ?? null, supplierId: supplierId ?? null,
      vendorName: vendorName ?? null, serviceType,
      instruction: instruction ?? null, status: "pending",
    }).returning();

    await logActivity("op_confirm", conf.id, "created", (req.user as { id: string } | undefined)?.id ?? "admin",
      `Link konfirmasi operasional dibuat untuk ${vendorName ?? "vendor"}`, { orderNumber, serviceType });

    return res.status(201).json({ ...conf, createdAt: conf.createdAt.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "create op-confirm error");
    return res.status(500).json({ error: "Gagal membuat link konfirmasi" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/op-confirms ─────────────────────────────

vendorMiniFormRouter.get("/admin/op-confirms", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const confs = await db.select().from(vendorOperationalConfirmationsTable).orderBy(desc(vendorOperationalConfirmationsTable.createdAt));
    return res.json(confs.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), submittedAt: c.submittedAt?.toISOString() ?? null })));
  } catch (err) {
    req.log?.error({ err }, "get op-confirms error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/orders ──────────────────────────────────

vendorMiniFormRouter.get("/admin/orders", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const orders = await db
      .select({ id: logisticOrdersTable.id, orderNumber: logisticOrdersTable.orderNumber, customerName: logisticOrdersTable.customerName, status: logisticOrdersTable.status, createdAt: logisticOrdersTable.createdAt })
      .from(logisticOrdersTable)
      .orderBy(desc(logisticOrdersTable.createdAt))
      .limit(100);
    return res.json(orders.map(o => ({ ...o, createdAt: o.createdAt.toISOString() })));
  } catch (err) {
    req.log?.error({ err }, "admin/orders error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/orders/:id/items ───────────────────────

vendorMiniFormRouter.get("/admin/orders/:id/items", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const items = await db.select().from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, id));
    return res.json(items.map(i => ({ ...i, createdAt: i.createdAt.toISOString() })));
  } catch (err) {
    req.log?.error({ err }, "admin/orders/:id/items error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: PUT /api/vendor-form/admin/submissions/:id ────────────────────────

vendorMiniFormRouter.put("/admin/submissions/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const userId = (req.user as { id: string } | undefined)?.id ?? "admin";
    const { formData, staffData, responseStatus, vendorPrice, currency, adminNotes } = req.body as {
      formData?: Record<string, unknown>; staffData?: Record<string, unknown>;
      responseStatus?: string; vendorPrice?: number; currency?: string; adminNotes?: string;
    };
    const [existing] = await db.select().from(vendorMiniFormSubmissionsTable).where(eq(vendorMiniFormSubmissionsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Submission tidak ditemukan" });
    if (existing.locked) return res.status(409).json({ error: "Submission sudah dikunci oleh customer approval. Gunakan unlock terlebih dahulu." });

    // Save price history if price changed
    if (vendorPrice !== undefined && existing.vendorPrice !== null && String(vendorPrice) !== existing.vendorPrice) {
      const [lastVer] = await db
        .select({ versionNumber: vendorPriceHistoryTable.versionNumber })
        .from(vendorPriceHistoryTable)
        .where(eq(vendorPriceHistoryTable.submissionId, id))
        .orderBy(desc(vendorPriceHistoryTable.versionNumber))
        .limit(1);
      await db.insert(vendorPriceHistoryTable).values({
        submissionId: id,
        versionNumber: (lastVer?.versionNumber ?? 1) + 1,
        oldPrice: existing.vendorPrice ?? null,
        newPrice: String(vendorPrice),
        currency: currency ?? existing.currency ?? "IDR",
        reason: "Admin edit",
        changedBy: userId,
      });
      await logActivity("submission", id, "price_updated", userId,
        `Harga diubah dari ${existing.vendorPrice} → ${vendorPrice}`,
        { oldPrice: existing.vendorPrice, newPrice: vendorPrice, currency });
    }

    const patch: Record<string, unknown> = {};
    if (formData !== undefined) patch["formData"] = formData;
    if (staffData !== undefined) patch["staffData"] = { ...(existing.staffData as object ?? {}), ...staffData };
    if (responseStatus !== undefined) patch["responseStatus"] = responseStatus;
    if (vendorPrice !== undefined) patch["vendorPrice"] = String(vendorPrice);
    if (currency !== undefined) patch["currency"] = currency;
    if (adminNotes !== undefined) patch["adminNotes"] = adminNotes;

    const [updated] = await db.update(vendorMiniFormSubmissionsTable).set(patch).where(eq(vendorMiniFormSubmissionsTable.id, id)).returning();
    return res.json({ ...updated, submittedAt: updated.submittedAt.toISOString(), selectedAt: updated.selectedAt?.toISOString() ?? null });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form PUT submission error");
    return res.status(500).json({ error: "Gagal update submission" });
  }
});

// ── ADMIN: DELETE /api/vendor-form/admin/submissions/:id ─────────────────────

vendorMiniFormRouter.delete("/admin/submissions/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [deleted] = await db.delete(vendorMiniFormSubmissionsTable).where(eq(vendorMiniFormSubmissionsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Submission tidak ditemukan" });
    return res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form DELETE submission error");
    return res.status(500).json({ error: "Gagal menghapus submission" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/links/:id/short-link ──────────────────

vendorMiniFormRouter.post("/admin/links/:id/short-link", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [link] = await db.select().from(vendorMiniFormLinksTable).where(eq(vendorMiniFormLinksTable.id, id));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (link.shortUrl) return res.json({ shortUrl: link.shortUrl, cached: true });

    const { generateShortLink } = await import("../lib/shortLink.js");
    const { getPreferredDomain } = await import("../lib/domain.js");
    const domain = getPreferredDomain();
    const longUrl = domain ? `https://${domain}/vendor-mini-form/${link.token}` : `/vendor-mini-form/${link.token}`;
    const shortUrl = await generateShortLink(longUrl, { context: "vendor_mini_form", refType: "vendor_mini_form_link", refId: String(link.id) });
    await db.update(vendorMiniFormLinksTable).set({ shortUrl }).where(eq(vendorMiniFormLinksTable.id, id));
    return res.json({ shortUrl, cached: false });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form short-link error");
    return res.status(500).json({ error: "Gagal generate short link" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/links/:id/reset-short-link ────────────

vendorMiniFormRouter.post("/admin/links/:id/reset-short-link", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [link] = await db.select().from(vendorMiniFormLinksTable).where(eq(vendorMiniFormLinksTable.id, id));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });
    const { generateShortLink } = await import("../lib/shortLink.js");
    const { getPreferredDomain } = await import("../lib/domain.js");
    const domain = getPreferredDomain();
    const longUrl = domain ? `https://${domain}/vendor-mini-form/${link.token}` : `/vendor-mini-form/${link.token}`;
    const shortUrl = await generateShortLink(longUrl, { context: "vendor_mini_form", refType: "vendor_mini_form_link", refId: String(link.id) });
    await db.update(vendorMiniFormLinksTable).set({ shortUrl }).where(eq(vendorMiniFormLinksTable.id, id));
    return res.json({ shortUrl });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form reset-short-link error");
    return res.status(500).json({ error: "Gagal reset short link" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/links/:id/send-wa ─────────────────────

vendorMiniFormRouter.post("/admin/links/:id/send-wa", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [link] = await db.select().from(vendorMiniFormLinksTable).where(eq(vendorMiniFormLinksTable.id, id));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });

    const { phone, customMessage } = req.body as { phone?: string; customMessage?: string };
    if (!phone) return res.status(400).json({ error: "phone wajib" });

    const { getPreferredDomain } = await import("../lib/domain.js");
    const domain = getPreferredDomain();
    const formUrl = link.shortUrl ?? (domain ? `https://${domain}/vendor-mini-form/${link.token}` : `/vendor-mini-form/${link.token}`);
    const svcLabel = SERVICE_SCHEMAS[link.serviceType]?.label ?? link.serviceType;
    const msg = customMessage?.trim() ||
      `Halo${link.vendorName ? ` *${link.vendorName}*` : ""}, kami mohon bantuannya untuk mengisi penawaran layanan *${svcLabel}*` +
      (link.orderNumber ? ` untuk order *${link.orderNumber}*` : "") +
      `.\n\nSilakan isi melalui link berikut:\n${formUrl}` +
      (link.expiresAt ? `\n\n_Link berlaku sampai ${new Date(link.expiresAt).toLocaleDateString("id-ID")}._` : "");

    await sendWhatsApp(phone.trim(), msg, { context: "vendor-mini-form-send", refType: "vendor_mini_form_link", refId: String(link.id) });

    await logActivity("link", id, "sent_wa", (req.user as { id: string } | undefined)?.id ?? "admin",
      `WA dikirim ke ${phone}`, { phone });

    return res.json({ success: true, message: "Pesan WA berhasil dikirim" });
  } catch (err) {
    req.log?.error({ err }, "send-wa error");
    return res.status(500).json({ error: "Gagal mengirim WA" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/customer-approvals/:id/send-wa ─────────

vendorMiniFormRouter.post("/admin/customer-approvals/:id/send-wa", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [approval] = await db.select().from(customerApprovalsTable).where(eq(customerApprovalsTable.id, id));
    if (!approval) return res.status(404).json({ error: "Approval tidak ditemukan" });

    const { phone, customMessage } = req.body as { phone?: string; customMessage?: string };
    const target = phone?.trim() ?? approval.customerPhone?.trim();
    if (!target) return res.status(400).json({ error: "phone wajib" });

    const { getPreferredDomain } = await import("../lib/domain.js");
    const domain = getPreferredDomain();
    const approvalUrl = domain ? `https://${domain}/customer-approval/${approval.token}` : `/customer-approval/${approval.token}`;
    const priceStr = approval.sellingPrice ? `${approval.currency ?? "IDR"} ${Number(approval.sellingPrice).toLocaleString("id-ID")}` : "-";
    const msg = customMessage?.trim() ||
      `Halo${approval.customerName ? ` *${approval.customerName}*` : ""}, berikut penawaran kami untuk request Anda.\n\n` +
      (approval.orderNumber ? `Order Ref: *${approval.orderNumber}*\n` : "") +
      `Total Harga: *${priceStr}*\n\n` +
      `Silakan review dan konfirmasi melalui link berikut:\n${approvalUrl}`;

    await sendWhatsApp(target, msg, { context: "customer-approval-send", refType: "customer_approval", refId: String(approval.id) });

    await logActivity("customer_approval", id, "sent_wa", (req.user as { id: string } | undefined)?.id ?? "admin",
      `WA penawaran dikirim ke customer ${approval.customerName ?? "-"}`, { phone: target });

    return res.json({ success: true, message: "Pesan WA ke customer berhasil dikirim" });
  } catch (err) {
    req.log?.error({ err }, "send-wa customer-approval error");
    return res.status(500).json({ error: "Gagal mengirim WA" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/op-confirms/:id/send-wa ───────────────

vendorMiniFormRouter.post("/admin/op-confirms/:id/send-wa", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [conf] = await db.select().from(vendorOperationalConfirmationsTable).where(eq(vendorOperationalConfirmationsTable.id, id));
    if (!conf) return res.status(404).json({ error: "Konfirmasi tidak ditemukan" });

    const { phone, customMessage } = req.body as { phone?: string; customMessage?: string };
    if (!phone) return res.status(400).json({ error: "phone wajib" });

    const { getPreferredDomain } = await import("../lib/domain.js");
    const domain = getPreferredDomain();
    const confirmUrl = domain ? `https://${domain}/op-confirm/${conf.token}` : `/op-confirm/${conf.token}`;
    const svcLabel = SERVICE_SCHEMAS[conf.serviceType]?.label ?? conf.serviceType;
    const msg = customMessage?.trim() ||
      `Halo${conf.vendorName ? ` *${conf.vendorName}*` : ""}, customer sudah menyetujui penawaran.\n\n` +
      `Mohon lengkapi data operasional untuk layanan *${svcLabel}*` +
      (conf.orderNumber ? ` (Order: ${conf.orderNumber})` : "") +
      ` melalui link berikut:\n${confirmUrl}` +
      (conf.instruction ? `\n\nInstruksi: ${conf.instruction}` : "");

    await sendWhatsApp(phone.trim(), msg, { context: "op-confirm-send", refType: "vendor_op_confirm", refId: String(conf.id) });

    await logActivity("op_confirm", id, "sent_wa", (req.user as { id: string } | undefined)?.id ?? "admin",
      `WA op-confirm dikirim ke ${conf.vendorName ?? "vendor"}`, { phone });

    return res.json({ success: true, message: "Pesan WA ke vendor berhasil dikirim" });
  } catch (err) {
    req.log?.error({ err }, "send-wa op-confirm error");
    return res.status(500).json({ error: "Gagal mengirim WA" });
  }
});
