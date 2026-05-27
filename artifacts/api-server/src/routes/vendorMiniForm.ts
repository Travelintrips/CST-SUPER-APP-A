import { Router, type Request, type Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { eq, desc, inArray, and, count, isNull, ne } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { eq, desc, inArray, and, count, isNull, ne, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import multer from "multer";
import { ObjectStorageService } from "../lib/objectStorage.js";
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
  salesDocumentsTable,
  orderUpdatesTable,
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin";
import { deleteFromSupabase } from "../lib/supabaseStorage.js";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminGroupWa } from "../lib/adminWa.js";
import { createSalesOrderFromVmfApproval } from "../lib/vmfSoIntegration.js";
import {
  sendCustomerApprovedNotification,
  sendSoCreatedNotification,
  sendOpRequestNotification,
  sendVendorRequestNotification,
  sendCustomerApprovalNotification,
  sendVendorRevisionNotification,
  sendVendorRevisionFallbackNotification,
  sendVendorSubmissionNotification,
  sendVendorSubmitConfirmNotification,
  sendVendorRfqForwardNotification,
  sendVendorSubmissionSummaryNotification,
  sendCustomerRejectionAdminNotification,
  sendOpConfirmSubmittedNotification,
  type LogisticOrderData,
} from "../lib/orderNotification.js";

function buildOrderDataFromRow(row: typeof logisticOrdersTable.$inferSelect): LogisticOrderData {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    companyName: row.companyName ?? "",
    email: row.email,
    phone: row.phone,
    orderType: row.orderType ?? undefined,
    shipmentType: row.shipmentType,
    origin: row.origin,
    destination: row.destination,
    commodity: row.commodity ?? null,
    cargoDescription: row.cargoDescription ?? null,
    grossWeight: row.grossWeight ? Number(row.grossWeight) : null,
    volumeCbm: row.volumeCbm ? Number(row.volumeCbm) : null,
    jumlahKoli: row.jumlahKoli ?? null,
    grandTotal: row.grandTotal ? Number(row.grandTotal) : 0,
    serviceList: row.shipmentType,
    requiredDate: row.requiredDate ?? null,
    notes: row.notes ?? null,
    jamOrder: row.jamOrder ?? null,
    vehicleType: row.truckType ?? null,
    createdAt: row.createdAt ?? null,
    publicRfqToken: row.publicRfqToken ?? null,
  };
}

async function buildOrderDataFromRowWithItems(row: typeof logisticOrdersTable.$inferSelect): Promise<LogisticOrderData> {
  const base = buildOrderDataFromRow(row);
  try {
    const items = await db.select({
      name: logisticOrderItemsTable.serviceName,
      subtotal: logisticOrderItemsTable.subtotal,
    }).from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, row.id));
    base.orderItems = items.map(i => ({
      name: i.name,
      subtotal: i.subtotal ? parseFloat(i.subtotal) : null,
    }));
  } catch { /* non-critical, skip */ }
  return base;
}

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

// ── Order updates helper (persists to order_updates timeline) ──────────────────

async function logOrderUpdate(
  orderId: number,
  status: string,
  notes: string,
  actorId?: string | null,
  isPublic = false,
) {
  try {
    await db.insert(orderUpdatesTable).values({
      orderId,
      actorType: "admin",
      actorId: actorId ?? null,
      actorName: "Admin",
      status,
      notes,
      isPublic,
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
  formTarget: string;
  expiresCache: number;
};

function getExpectedTarget(baseUrl: string): string {
  if (baseUrl.includes("customer-form")) return "customer";
  if (baseUrl.includes("admin-form")) return "admin";
  return "vendor";
}
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

// ── Rate limiter untuk public endpoints ───────────────────────────────────────

const vmfGetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak permintaan, coba lagi dalam 15 menit" },
  skip: (req) => req.path.startsWith("/admin"),
});

const vmfPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak pengiriman form, coba lagi dalam 15 menit" },
  skip: (req) => req.path.startsWith("/admin"),
});

// Stricter rate-limit khusus customer-approval: 5 req / 10 menit per token
// Melindungi dari spam yang memicu WA notification & activity log berulang
const vmfApprovalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const token = (req.params as { token?: string }).token;
    if (token) return `approval:${token}`;
    return ipKeyGenerator(req);
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan, coba lagi dalam 10 menit" },
});

vendorMiniFormRouter.use((req, res, next) => {
  if (req.method === "GET") return vmfGetLimiter(req, res, next);
  if (req.method === "POST") return vmfPostLimiter(req, res, next);
  next();
});

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
      { key: "freight_rate", label: "Freight Rate", type: "number", required: true, section: "quotation" },
      { key: "currency", label: "Mata Uang", type: "select", options: ["USD", "IDR", "SGD", "EUR", "CNY"], required: true, section: "quotation" },
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
      { key: "rate_per_kg", label: "Rate per kg", type: "number", required: true, section: "quotation" },
      { key: "currency", label: "Mata Uang", type: "select", options: ["IDR", "USD", "SGD", "EUR", "CNY"], required: true, section: "quotation" },
      { key: "min_charge", label: "Minimum Charge", type: "number", section: "quotation" },
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
      { key: "customs_service", label: "Estimasi Biaya Jasa", type: "number", required: true, section: "quotation" },
      { key: "currency", label: "Mata Uang", type: "select", options: ["IDR", "USD"], required: true, section: "quotation" },
      { key: "duty_tax_estimate", label: "Estimasi Duty/Tax", type: "number", section: "quotation" },
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
      { key: "area_sqm", label: "Luas Tersedia (m²)", type: "number", section: "quotation" },
      { key: "handling_fee", label: "Handling Fee (Rp)", type: "number", required: true, section: "quotation" },
      { key: "storage_fee", label: "Storage Fee (Rp/m²/bulan)", type: "number", section: "quotation" },
      { key: "free_storage", label: "Free Storage (hari)", type: "number", section: "quotation" },
      { key: "loading_unloading_fee", label: "Loading/Unloading Fee (Rp/ton)", type: "number", section: "quotation" },
      { key: "temperature", label: "Suhu / Tipe", type: "select", options: ["Ambient", "Chilled (2–8°C)", "Frozen (-18°C)", "AC Room"], section: "quotation" },
      { key: "rack_system", label: "Sistem Racking", type: "select", options: ["Selective", "Drive-in", "Push Back", "Floor Storage", "Mezzanine"], section: "quotation" },
      { key: "sla", label: "SLA Proses (hari)", type: "number", section: "quotation" },
      { key: "equipment", label: "Equipment Support", type: "text", placeholder: "Contoh: Forklift 3 ton, CCTV 24 jam", section: "quotation" },
      { key: "security", label: "Keamanan", type: "text", placeholder: "Contoh: CCTV 24 jam, Satpam", section: "quotation" },
      { key: "notes", label: "Catatan", type: "textarea", section: "quotation" },
      // Operational
      { key: "wh_receipt_number", label: "No. Warehouse Receipt", type: "text", required: true, section: "operational" },
      { key: "inbound_date", label: "Tanggal Inbound", type: "date", section: "operational" },
      { key: "qty_received", label: "Qty Diterima", type: "number", section: "operational" },
      { key: "condition_note", label: "Kondisi Barang", type: "textarea", section: "operational" },
      { key: "outbound_date", label: "Tanggal Outbound", type: "date", section: "operational" },
      { key: "op_notes", label: "Catatan Operasional", type: "textarea", section: "operational" },
    ],
  },
  document: {
    label: "Document / Additional Service", emoji: "📄",
    fields: [
      { key: "service_name", label: "Nama Layanan", type: "text", required: true, section: "quotation" },
      { key: "description", label: "Deskripsi Layanan", type: "textarea", section: "quotation" },
      { key: "price", label: "Harga", type: "number", required: true, section: "quotation" },
      { key: "currency", label: "Mata Uang", type: "select", options: ["IDR", "USD"], required: true, section: "quotation" },
      { key: "sla", label: "SLA / Lead Time (hari)", type: "number", section: "quotation" },
      { key: "docs_required", label: "Dokumen yang Dibutuhkan", type: "textarea", section: "quotation" },
      { key: "validity", label: "Berlaku Sampai", type: "date", section: "quotation" },
      { key: "notes", label: "Catatan", type: "textarea", section: "quotation" },
      // Operational
      { key: "doc_reference", label: "No. Referensi Dokumen", type: "text", required: true, section: "operational" },
      { key: "issue_date", label: "Tanggal Terbit", type: "date", section: "operational" },
      { key: "status_doc", label: "Status Dokumen", type: "select", options: ["Dalam Proses", "Selesai", "Ditolak", "Revisi"], section: "operational" },
      { key: "op_notes", label: "Catatan Operasional", type: "textarea", section: "operational" },
    ],
  },
  exim_service: {
    label: "Exim Service", emoji: "🌐",
    fields: [
      { key: "service_type", label: "Layanan", type: "select", required: true, options: ["Import Door to Door", "Export Door to Door", "Import Port to Port", "Export Port to Port", "Full Service"], section: "quotation" },
      { key: "origin_country", label: "Negara Asal", type: "text", required: true, section: "quotation" },
      { key: "dest_country", label: "Negara Tujuan", type: "text", required: true, section: "quotation" },
      { key: "price", label: "Harga", type: "number", required: true, section: "quotation" },
      { key: "currency", label: "Mata Uang", type: "select", options: ["IDR", "USD", "SGD", "EUR", "CNY"], required: true, section: "quotation" },
      { key: "transit_time", label: "Transit Time (hari)", type: "number", section: "quotation" },
      { key: "incoterms", label: "Incoterms", type: "select", options: ["EXW", "FOB", "CIF", "DAP", "DDP", "FCA", "CPT", "CIP"], section: "quotation" },
      { key: "validity", label: "Masa Berlaku (hari)", type: "number", section: "quotation" },
      { key: "notes", label: "Catatan", type: "textarea", section: "quotation" },
      // Operational
      { key: "job_reference", label: "No. Job Reference", type: "text", required: true, section: "operational" },
      { key: "shipment_status", label: "Status Shipment", type: "select", options: ["Booking", "In Transit Origin", "On Vessel/Flight", "Arrived Destination", "Customs Clearance", "Out for Delivery", "Delivered"], section: "operational" },
      { key: "actual_etd", label: "ETD Aktual", type: "date", section: "operational" },
      { key: "actual_eta", label: "ETA Aktual", type: "date", section: "operational" },
      { key: "tracking_info", label: "Info Tracking", type: "textarea", section: "operational" },
      { key: "op_notes", label: "Catatan Operasional", type: "textarea", section: "operational" },
    ],
  },

  // ── Customer-facing schemas ─────────────────────────────────────────────────
  customer_shipment: {
    label: "Permintaan Pengiriman", emoji: "📦",
    fields: [
      { key: "cargo_name", label: "Nama / Jenis Barang", type: "text", required: true, section: "quotation" },
      { key: "origin", label: "Kota / Negara Asal", type: "text", required: true, section: "quotation" },
      { key: "destination", label: "Kota / Negara Tujuan", type: "text", required: true, section: "quotation" },
      { key: "weight", label: "Berat Perkiraan (kg)", type: "number", section: "quotation" },
      { key: "volume", label: "Volume / Dimensi (m³ atau cm)", type: "text", section: "quotation" },
      { key: "qty", label: "Jumlah", type: "number", section: "quotation" },
      { key: "unit", label: "Satuan", type: "select", options: ["pcs", "kg", "ton", "box", "palet", "kontainer"], section: "quotation" },
      { key: "service_pref", label: "Layanan yang Diinginkan", type: "select", options: ["Sea Freight", "Air Freight", "Trucking", "Customs Clearance", "Door to Door", "Lainnya"], section: "quotation" },
      { key: "preferred_date", label: "Tanggal Pengiriman yang Diinginkan", type: "date", section: "quotation" },
      { key: "incoterms", label: "Incoterms (jika ada)", type: "select", options: ["EXW", "FOB", "CIF", "DAP", "DDP", "Tidak tahu"], section: "quotation" },
      { key: "special_req", label: "Persyaratan Khusus", type: "textarea", section: "quotation" },
      { key: "notes", label: "Catatan Tambahan", type: "textarea", section: "quotation" },
    ],
  },
  customer_quote: {
    label: "Permintaan Penawaran Harga", emoji: "💼",
    fields: [
      { key: "service_type", label: "Layanan yang Dibutuhkan", type: "select", required: true, options: ["Freight Forwarding", "Custom Clearance", "Trucking", "Warehousing", "Exim Consulting", "Full Logistics", "Lainnya"], section: "quotation" },
      { key: "cargo_desc", label: "Deskripsi Barang / Komoditi", type: "textarea", required: true, section: "quotation" },
      { key: "origin_country", label: "Negara / Kota Asal", type: "text", required: true, section: "quotation" },
      { key: "dest_country", label: "Negara / Kota Tujuan", type: "text", required: true, section: "quotation" },
      { key: "weight_volume", label: "Berat / Volume Perkiraan", type: "text", section: "quotation" },
      { key: "frequency", label: "Frekuensi Pengiriman", type: "select", options: ["Sekali", "Mingguan", "2x/bulan", "Bulanan", "Berkala (proyek)"], section: "quotation" },
      { key: "budget", label: "Budget Perkiraan", type: "text", section: "quotation" },
      { key: "timeline", label: "Target Tanggal Pengiriman Pertama", type: "date", section: "quotation" },
      { key: "notes", label: "Informasi Tambahan", type: "textarea", section: "quotation" },
    ],
  },
  customer_document: {
    label: "Pengiriman Dokumen", emoji: "📋",
    fields: [
      { key: "doc_type", label: "Jenis Dokumen", type: "select", required: true, options: ["Invoice", "Packing List", "Bill of Lading", "AWB", "COO", "MSDS", "Phytosanitary", "Fumigation", "Lainnya"], section: "quotation" },
      { key: "doc_reference", label: "Nomor Referensi / PO", type: "text", section: "quotation" },
      { key: "issued_by", label: "Diterbitkan Oleh", type: "text", section: "quotation" },
      { key: "issued_date", label: "Tanggal Terbit", type: "date", section: "quotation" },
      { key: "related_shipment", label: "Terkait Shipment / Order", type: "text", section: "quotation" },
      { key: "notes", label: "Keterangan", type: "textarea", section: "quotation" },
    ],
  },
  customer_complaint: {
    label: "Keluhan / Klaim", emoji: "⚠️",
    fields: [
      { key: "order_ref", label: "Nomor Order / Shipment", type: "text", required: true, section: "quotation" },
      { key: "complaint_type", label: "Jenis Keluhan", type: "select", required: true, options: ["Keterlambatan", "Kerusakan Barang", "Kehilangan Barang", "Dokumen Salah", "Overcharge", "Pelayanan", "Lainnya"], section: "quotation" },
      { key: "incident_date", label: "Tanggal Kejadian", type: "date", section: "quotation" },
      { key: "description", label: "Deskripsi Masalah", type: "textarea", required: true, section: "quotation" },
      { key: "claimed_amount", label: "Nilai Klaim (Rp)", type: "number", section: "quotation" },
      { key: "expected_resolution", label: "Penyelesaian yang Diharapkan", type: "textarea", section: "quotation" },
    ],
  },
  customer_product: {
    label: "Pemesanan Produk", emoji: "🛒",
    fields: [
      { key: "product_name", label: "Nama / Jenis Produk", type: "text", required: true, section: "quotation", placeholder: "Contoh: Green Bean Arabica Grade 1" },
      { key: "brand_spec", label: "Brand / Spesifikasi", type: "text", section: "quotation", placeholder: "Contoh: Grade A, moisture max 12%" },
      { key: "qty", label: "Jumlah yang Dipesan", type: "number", required: true, section: "quotation" },
      { key: "unit", label: "Satuan", type: "select", required: true, options: ["pcs", "kg", "ton", "box", "karton", "sak", "lusin", "unit", "lainnya"], section: "quotation" },
      { key: "target_price", label: "Target Harga (Rp)", type: "number", section: "quotation", placeholder: "Kosongkan jika tidak ada target" },
      { key: "currency", label: "Mata Uang", type: "select", options: ["IDR", "USD", "SGD", "EUR"], section: "quotation" },
      { key: "delivery_address", label: "Alamat Pengiriman", type: "textarea", required: true, section: "quotation" },
      { key: "preferred_delivery_date", label: "Tanggal Pengiriman yang Diinginkan", type: "date", section: "quotation" },
      { key: "payment_terms", label: "Cara Pembayaran", type: "select", options: ["Cash", "Transfer 50% DP", "Transfer Lunas", "Credit 30 hari", "Credit 45 hari", "Lainnya"], section: "quotation" },
      { key: "notes", label: "Catatan Tambahan", type: "textarea", section: "quotation", placeholder: "Persyaratan khusus, kemasan, dokumen, dll." },
    ],
  },

  // ── Admin / Internal schemas ────────────────────────────────────────────────
  admin_checklist: {
    label: "Checklist Proses", emoji: "✅",
    fields: [
      { key: "process_name", label: "Nama Proses / Pekerjaan", type: "text", required: true, section: "quotation" },
      { key: "order_ref", label: "Nomor Order / Referensi", type: "text", section: "quotation" },
      { key: "responsible", label: "Penanggung Jawab", type: "text", required: true, section: "quotation" },
      { key: "check_date", label: "Tanggal Pengecekan", type: "date", section: "quotation" },
      { key: "item_1", label: "Checklist Item 1", type: "select", options: ["✅ Selesai", "⏳ Proses", "❌ Belum"], section: "quotation" },
      { key: "item_2", label: "Checklist Item 2", type: "select", options: ["✅ Selesai", "⏳ Proses", "❌ Belum"], section: "quotation" },
      { key: "item_3", label: "Checklist Item 3", type: "select", options: ["✅ Selesai", "⏳ Proses", "❌ Belum"], section: "quotation" },
      { key: "overall_status", label: "Status Keseluruhan", type: "select", required: true, options: ["Completed", "In Progress", "Blocked", "Cancelled"], section: "quotation" },
      { key: "issues", label: "Kendala / Issues", type: "textarea", section: "quotation" },
      { key: "next_action", label: "Tindakan Selanjutnya", type: "textarea", section: "quotation" },
      { key: "notes", label: "Catatan", type: "textarea", section: "quotation" },
    ],
  },
  admin_handover: {
    label: "Serah Terima Pekerjaan", emoji: "🤝",
    fields: [
      { key: "job_ref", label: "Nomor Job / Order", type: "text", required: true, section: "quotation" },
      { key: "from_staff", label: "Diserahkan Oleh", type: "text", required: true, section: "quotation" },
      { key: "to_staff", label: "Diterima Oleh", type: "text", required: true, section: "quotation" },
      { key: "handover_date", label: "Tanggal Serah Terima", type: "date", required: true, section: "quotation" },
      { key: "job_description", label: "Deskripsi Pekerjaan", type: "textarea", required: true, section: "quotation" },
      { key: "current_status", label: "Status Saat Ini", type: "select", required: true, options: ["Baru Mulai", "Sedang Berjalan", "Menunggu Dokumen", "Menunggu Vendor", "Menunggu Customer", "Hampir Selesai"], section: "quotation" },
      { key: "pending_items", label: "Item yang Belum Selesai", type: "textarea", section: "quotation" },
      { key: "important_contacts", label: "Kontak Penting", type: "textarea", section: "quotation" },
      { key: "notes", label: "Catatan Tambahan", type: "textarea", section: "quotation" },
    ],
  },
  admin_inspection: {
    label: "Laporan Inspeksi", emoji: "🔍",
    fields: [
      { key: "inspection_ref", label: "Nomor Inspeksi / Referensi", type: "text", required: true, section: "quotation" },
      { key: "location", label: "Lokasi Inspeksi", type: "text", required: true, section: "quotation" },
      { key: "inspection_date", label: "Tanggal Inspeksi", type: "date", required: true, section: "quotation" },
      { key: "inspector", label: "Nama Inspektor", type: "text", required: true, section: "quotation" },
      { key: "goods_desc", label: "Deskripsi Barang / Aset", type: "textarea", required: true, section: "quotation" },
      { key: "qty_checked", label: "Jumlah Diperiksa", type: "number", section: "quotation" },
      { key: "qty_ok", label: "Jumlah OK", type: "number", section: "quotation" },
      { key: "qty_rejected", label: "Jumlah Ditolak / Rusak", type: "number", section: "quotation" },
      { key: "condition", label: "Kondisi Umum", type: "select", required: true, options: ["Baik", "Cukup Baik", "Ada Kerusakan Minor", "Kerusakan Signifikan", "Ditolak"], section: "quotation" },
      { key: "findings", label: "Temuan / Catatan", type: "textarea", section: "quotation" },
      { key: "recommendation", label: "Rekomendasi", type: "textarea", section: "quotation" },
    ],
  },
  admin_rfq_forward: {
    label: "Forward RFQ Customer ke Vendor", emoji: "📨",
    fields: [
      { key: "customer_name", label: "Nama Customer / Perusahaan", type: "text", required: true, section: "quotation", placeholder: "Contoh: PT Maju Bersama" },
      { key: "rfq_ref", label: "Nomor RFQ / Referensi Internal", type: "text", section: "quotation", placeholder: "Contoh: RFQ/2025/001" },
      { key: "service_needed", label: "Layanan yang Dibutuhkan", type: "select", required: true, options: ["Sea Freight", "Air Freight", "Trucking", "Customs Clearance", "Warehousing", "Exim Full Service", "Door to Door", "Lainnya"], section: "quotation" },
      { key: "cargo_desc", label: "Deskripsi Barang / Komoditi", type: "textarea", required: true, section: "quotation", placeholder: "Jenis barang, HS code, kondisi khusus, dll." },
      { key: "origin", label: "Asal (Kota / Negara)", type: "text", required: true, section: "quotation" },
      { key: "destination", label: "Tujuan (Kota / Negara)", type: "text", required: true, section: "quotation" },
      { key: "weight_volume", label: "Berat / Volume", type: "text", section: "quotation", placeholder: "Contoh: 500 kg / 2 CBM" },
      { key: "incoterms", label: "Incoterms", type: "select", options: ["EXW", "FOB", "CIF", "DAP", "DDP", "FCA", "Tidak ditentukan"], section: "quotation" },
      { key: "target_delivery_date", label: "Target Tanggal Pengiriman", type: "date", section: "quotation" },
      { key: "customer_budget", label: "Budget Customer (Rp / USD)", type: "text", section: "quotation", placeholder: "Kosongkan jika tidak diketahui" },
      { key: "special_req", label: "Persyaratan Khusus dari Customer", type: "textarea", section: "quotation", placeholder: "Contoh: butuh insurance, dokumen tertentu, dll." },
      { key: "quote_deadline", label: "Batas Waktu Penawaran dari Vendor", type: "date", required: true, section: "quotation" },
      { key: "vendor_phone", label: "No. WhatsApp Vendor (untuk notifikasi otomatis)", type: "text", section: "quotation", placeholder: "Contoh: 628123456789" },
      { key: "notes_to_vendor", label: "Pesan / Instruksi ke Vendor", type: "textarea", section: "quotation", placeholder: "Tambahan informasi yang perlu diketahui vendor" },
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
          formTarget: vendorMiniFormLinksTable.formTarget,
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
        formTarget: dbRow.formTarget ?? "vendor",
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
    const expectedTarget = getExpectedTarget(req.baseUrl);
    if ((row.formTarget ?? "vendor") !== expectedTarget) {
      return res.status(404).json({ error: "Link tidak ditemukan atau sudah tidak valid" });
    }
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

// ── PUBLIC: POST /api/vendor-form/upload/:token ───────────────────────────────
const _vmfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const _vmfStorage = new ObjectStorageService();
const _vmfUploadRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

vendorMiniFormRouter.post("/upload/:token", _vmfUploadRateLimit, _vmfUpload.single("file"), async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  if (token === "admin") return res.status(404).json({ error: "Not found" });
  try {
    const [link] = await db.select({ id: vendorMiniFormLinksTable.id, isActive: vendorMiniFormLinksTable.isActive, expiresAt: vendorMiniFormLinksTable.expiresAt })
      .from(vendorMiniFormLinksTable)
      .where(eq(vendorMiniFormLinksTable.token, token));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (!link.isActive) return res.status(410).json({ error: "Link sudah dinonaktifkan" });
    if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).json({ error: "Link sudah kadaluarsa" });
    if (!req.file) return res.status(400).json({ error: "File diperlukan" });

    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    if (!allowed.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Tipe file tidak didukung. Gunakan PDF, gambar, atau dokumen Office." });
    }

    const objectPath = await _vmfStorage.uploadPrivateEntity(req.file.buffer, req.file.mimetype);
    return res.json({ objectPath });
  } catch (err) {
    req.log?.error({ err }, "vmf upload error");
    return res.status(500).json({ error: "Upload gagal" });
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
    const expectedTargetPost = getExpectedTarget(req.baseUrl);
    if ((link.formTarget ?? "vendor") !== expectedTargetPost) {
      return res.status(404).json({ error: "Link tidak ditemukan" });
    }
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

    const { vendorName, contactPerson, contactPhone, formData, responseStatus, vendorPrice, currency, eta, validUntil, attachmentUrl } = req.body as {
      vendorName?: string; contactPerson?: string; contactPhone?: string;
      formData?: Record<string, unknown>;
      responseStatus?: string; vendorPrice?: number; currency?: string;
      eta?: string; validUntil?: string; attachmentUrl?: string;
    };

    if (!formData || typeof formData !== "object") return res.status(400).json({ error: "formData diperlukan" });

    // Validasi attachmentUrl: hanya boleh objectPath dari private storage (/objects/...)
    // Tolak URL arbitrary (http://, https://, dll) untuk mencegah SSRF/XSS.
    if (attachmentUrl !== undefined && attachmentUrl !== null && attachmentUrl !== "") {
      if (!attachmentUrl.startsWith("/objects/")) {
        return res.status(400).json({ error: "attachmentUrl tidak valid. Gunakan endpoint upload terlebih dahulu." });
      }
    }

    // Validasi server-side untuk field required berdasarkan SERVICE_SCHEMAS
    const schema = SERVICE_SCHEMAS[link.serviceType];
    if (schema) {
      const activePhase = link.phase ?? "quotation";
      const requiredKeys = schema.fields
        .filter(f => f.required && (!f.section || f.section === activePhase || f.section === "both"))
        .map(f => f.key);
      const missingFields = requiredKeys.filter(k => {
        const val = (formData as Record<string, unknown>)[k];
        return val === undefined || val === null || String(val).trim() === "";
      });
      if (missingFields.length > 0) {
        return res.status(400).json({
          error: `Field wajib belum diisi: ${missingFields.join(", ")}`,
          missingFields,
        });
      }
    }

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
          attachmentUrl: attachmentUrl ?? undefined,
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
      // Wrap count-check + insert dalam transaksi dengan SELECT FOR UPDATE
      // Mengunci row link agar concurrent submissions tidak lolos quota check bersamaan
      const inserted = await db.transaction(async (tx) => {
        if (link.maxSubmissions !== null) {
          // Lock link row dulu agar transaksi concurrent harus antri di sini
          await tx
            .select({ id: vendorMiniFormLinksTable.id })
            .from(vendorMiniFormLinksTable)
            .where(eq(vendorMiniFormLinksTable.id, link.id))
            .for("update");
          const [cntRow] = await tx
            .select({ cnt: count() })
            .from(vendorMiniFormSubmissionsTable)
            .where(eq(vendorMiniFormSubmissionsTable.linkId, link.id));
          if (Number(cntRow?.cnt ?? 0) >= link.maxSubmissions) {
            throw Object.assign(new Error("QUOTA_EXCEEDED"), {});
          }
        }
        const [row] = await tx.insert(vendorMiniFormSubmissionsTable).values({
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
          attachmentUrl: attachmentUrl ?? null,
          orderId: link.orderId ?? null,
          orderItemId: link.orderItemId ?? null,
          submittedIp, submittedUa,
        }).returning();
        return row;
      });

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
      sendVendorSubmitConfirmNotification(
        contactPhone.trim(),
        picLabel,
        vendorLabel,
        link.orderNumber ?? null,
        token,
      ).catch(() => {});
    }

    // WA to vendor for admin_rfq_forward: notify vendor about the RFQ details
    if (link.serviceType === "admin_rfq_forward" && formData) {
      const fd = formData as Record<string, unknown>;
      const vendorPhoneRaw = (fd["vendor_phone"] as string | undefined)?.trim();
      if (vendorPhoneRaw) {
        const { normalizePhone } = await import("../lib/phoneUtils.js");
        const vendorPhoneNorm = normalizePhone(vendorPhoneRaw);
        if (vendorPhoneNorm) {
          const { getPreferredDomain } = await import("../lib/domain.js");
          const domain = getPreferredDomain();
          const vendorFormUrl = domain ? `https://${domain}/vendor-mini-form/${token}` : `/vendor-mini-form/${token}`;
          const vendorLabelRfq = link.vendorName?.trim() || vendorLabel;
          sendVendorRfqForwardNotification(
            vendorPhoneNorm,
            vendorLabelRfq,
            {
              rfqRef: (fd["rfq_ref"] as string | undefined)?.trim() ?? null,
              customerName: (fd["customer_name"] as string | undefined)?.trim() ?? null,
              serviceNeeded: (fd["service_needed"] as string | undefined)?.trim() ?? null,
              origin: (fd["origin"] as string | undefined)?.trim() ?? null,
              destination: (fd["destination"] as string | undefined)?.trim() ?? null,
              weightVolume: (fd["weight_volume"] as string | undefined)?.trim() ?? null,
              cargoDesc: (fd["cargo_desc"] as string | undefined)?.trim() ?? null,
              targetDeliveryDate: (fd["target_delivery_date"] as string | undefined)?.trim() ?? null,
              quoteDeadline: (fd["quote_deadline"] as string | undefined)?.trim() ?? null,
              notesToVendor: (fd["notes_to_vendor"] as string | undefined)?.trim() ?? null,
              vendorFormUrl,
            },
            token,
          ).catch(() => {});
        }
      }
    }

    // WA Summary to admin (especially useful for order-based: show all competing offers)
    (() => {
      const priceStr = vendorPrice ? `${currency ?? "IDR"} ${Number(vendorPrice).toLocaleString("id-ID")}` : "-";

      if (link.mode === "order_based" && link.orderId) {
        // Pakai template sendVendorSubmissionNotification
        db.select().from(logisticOrdersTable)
          .where(eq(logisticOrdersTable.id, link.orderId))
          .limit(1)
          .then(([orderRow]) => {
            if (!orderRow) return;
            sendVendorSubmissionNotification(buildOrderDataFromRow(orderRow), vendorLabel, priceStr).catch(() => {});
          }).catch(() => {});
      } else if (link.mode === "order_based" && link.orderNumber) {
        getAdminGroupWa().then(async (adminGroupWa) => {
          if (!adminGroupWa) return;
          const allSubs = await db
            .select({ vendorName: vendorMiniFormSubmissionsTable.vendorName, vendorPrice: vendorMiniFormSubmissionsTable.vendorPrice, currency: vendorMiniFormSubmissionsTable.currency, eta: vendorMiniFormSubmissionsTable.eta })
            .from(vendorMiniFormSubmissionsTable)
            .where(eq(vendorMiniFormSubmissionsTable.linkId, link.id))
            .orderBy(desc(vendorMiniFormSubmissionsTable.submittedAt));
          const lines = allSubs.map((s, i) => {
            const p = s.vendorPrice ? `${s.currency ?? "IDR"} ${Number(s.vendorPrice).toLocaleString("id-ID")}` : "-";
            return `${i + 1}. *${s.vendorName ?? "Vendor"}* - ${p}${s.eta ? ` - ETA ${s.eta}` : ""}`;
          });
          sendVendorSubmissionSummaryNotification(adminGroupWa, {
            vendorLabel,
            picLabel,
            contactPhone: contactPhone?.trim() ?? null,
            orderNumber: link.orderNumber ?? null,
            serviceLabel: `Order #${link.orderNumber}`,
            priceStr: lines.join("\n") || priceStr,
            statusStr: isRevision ? `REVISI (Rev-${(submission as { revisionCount?: number }).revisionCount ?? 1})` : (responseStatus ?? "submitted"),
          }, String(link.id)).catch(() => {});
        }).catch(() => {});
      } else {
        getAdminGroupWa().then((adminGroupWa) => {
          if (!adminGroupWa) return;
          sendVendorSubmissionSummaryNotification(adminGroupWa, {
            vendorLabel,
            picLabel,
            contactPhone: contactPhone?.trim() ?? null,
            orderNumber: link.orderNumber ?? null,
            serviceLabel: SERVICE_SCHEMAS[link.serviceType]?.label ?? link.serviceType,
            priceStr,
            statusStr: isRevision ? `REVISI (Rev-${(submission as { revisionCount?: number }).revisionCount ?? 1})` : (responseStatus ?? "submitted"),
          }, token).catch(() => {});
        }).catch(() => {});
      }
    })();

    return res.json({ success: true, submissionId: submission.id, message: "Penawaran berhasil dikirim, terima kasih!" });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
      return res.status(410).json({ error: "Kuota submission sudah penuh" });
    }
    req.log?.error({ err }, "vendor-mini-form POST error");
    return res.status(500).json({ error: "Gagal menyimpan data" });
  }
});

// Kolom yang aman dikirim ke customer — vendor cost tidak boleh bocor
const SAFE_OFFER_SUMMARY_KEYS = [
  "serviceType", "origin", "destination", "weight", "volume", "commodity",
  "incoterms", "eta", "notes", "items", "services",
];

function sanitizeOfferSummary(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([k]) =>
      SAFE_OFFER_SUMMARY_KEYS.includes(k),
    ),
  );
}

// ── PUBLIC: GET /api/vendor-form/customer-approval/:token ─────────────────────

vendorMiniFormRouter.get("/customer-approval/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const [approval] = await db.select().from(customerApprovalsTable).where(eq(customerApprovalsTable.token, token));
    if (!approval) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (approval.expiresAt && approval.expiresAt < new Date()) return res.status(410).json({ error: "Link penawaran sudah kadaluarsa" });
    return res.json({
      token: approval.token, orderNumber: approval.orderNumber,
      customerName: approval.customerName,
      offerSummary: sanitizeOfferSummary(approval.offerSummary),
      sellingPrice: approval.sellingPrice, currency: approval.currency,
      termsNotes: approval.termsNotes, status: approval.status, soNumber: approval.soNumber,
    });
  } catch (err) {
    req.log?.error({ err }, "customer-approval GET error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUBLIC: POST /api/vendor-form/customer-approval/:token ────────────────────

vendorMiniFormRouter.post("/customer-approval/:token", vmfApprovalLimiter, async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    // Cek awal sebelum masuk transaksi: hanya fast-fail untuk not found & expired.
    // Status check TIDAK dilakukan di sini untuk menghindari TOCTOU — perlindungan
    // double-approve dilakukan secara atomik via UPDATE WHERE status='pending' di dalam transaksi.
    const [preCheck] = await db.select({ expiresAt: customerApprovalsTable.expiresAt, status: customerApprovalsTable.status })
      .from(customerApprovalsTable).where(eq(customerApprovalsTable.token, token));
    if (!preCheck) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (preCheck.expiresAt && preCheck.expiresAt < new Date()) return res.status(410).json({ error: "Link penawaran sudah kadaluarsa" });

    const { action, notes } = req.body as { action: "approve" | "reject"; notes?: string };
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "action harus approve atau reject" });

    const now = new Date();
    let soNumber: string | null = null;
    let orderId: number | null = null;
    let orderNumber: string | null = null;
    let customerName: string | null = null;

    // Semua operasi dalam satu transaksi atomik
    await db.transaction(async (tx) => {
      // Atomic lock: UPDATE hanya jika status masih 'pending' — mencegah double-approve
      let locked: typeof customerApprovalsTable.$inferSelect | undefined;

      if (action === "approve") {
        // Atomic update: hanya berhasil jika status = 'pending'
        // soNumber TIDAK di-set di sini — satu jalur kanonik via vmfSoIntegration setelah transaksi
        const rows = await tx.update(customerApprovalsTable)
          .set({ status: "approved", approvedAt: now, notes: notes ?? null, locked: true })
          .where(and(eq(customerApprovalsTable.token, token), eq(customerApprovalsTable.status, "pending")))
          .returning();
        locked = rows[0];
        if (!locked) throw new Error("ALREADY_RESPONDED");

        orderId = locked.orderId;
        orderNumber = locked.orderNumber;
        customerName = locked.customerName;

        // Lock submissions
        if (locked.submissionId) {
          await tx.update(vendorMiniFormSubmissionsTable)
            .set({ locked: true, responseStatus: "customer_approved" })
            .where(eq(vendorMiniFormSubmissionsTable.id, locked.submissionId));
        } else if (locked.orderId) {
          await tx.update(vendorMiniFormSubmissionsTable)
            .set({ locked: true, responseStatus: "customer_approved" })
            .where(and(
              eq(vendorMiniFormSubmissionsTable.orderId, locked.orderId),
              eq(vendorMiniFormSubmissionsTable.selectedByAdmin, true),
            ));
        }

        // Update logistic order status
        if (locked.orderId) {
          await tx.update(logisticOrdersTable)
            .set({ customerConfirmStatus: "confirmed", customerConfirmedAt: now, status: "Customer Approved" })
            .where(eq(logisticOrdersTable.id, locked.orderId));

          // Update itemStatus di VMF links menjadi customer_approved
          await tx.update(vendorMiniFormLinksTable)
            .set({ itemStatus: "customer_approved" })
            .where(and(
              eq(vendorMiniFormLinksTable.orderId, locked.orderId),
              eq(vendorMiniFormLinksTable.mode, "order_based"),
            ));
        }
      } else {
        // Reject — atomic update
        const rows = await tx.update(customerApprovalsTable)
          .set({ status: "rejected", rejectedAt: now, notes: notes ?? null })
          .where(and(eq(customerApprovalsTable.token, token), eq(customerApprovalsTable.status, "pending")))
          .returning();
        locked = rows[0];
        if (!locked) throw new Error("ALREADY_RESPONDED");

        orderId = locked.orderId;
        orderNumber = locked.orderNumber;
        customerName = locked.customerName;

        if (locked.orderId) {
          await tx.update(logisticOrdersTable)
            .set({ customerConfirmStatus: "rejected", status: "Customer Rejected" })
            .where(eq(logisticOrdersTable.id, locked.orderId));
        }
      }
    });

    // ── Buat Sales Order nyata di sales_documents (hanya saat approve) ────
    let salesDocId: number | null = null;
    if (action === "approve") {
      // Re-fetch approval row yang sudah di-update supaya helper punya data lengkap
      const [freshApproval] = await db
        .select()
        .from(customerApprovalsTable)
        .where(eq(customerApprovalsTable.token, token))
        .limit(1);

      if (freshApproval) {
        const soResult = await createSalesOrderFromVmfApproval(freshApproval);
        if (soResult.ok) {
          // Gunakan doc_number dari sales_documents sebagai SO number canonical
          soNumber = soResult.docNumber;
          salesDocId = soResult.docId;
          // Update customer_approvals.so_number dengan nomor SO yang benar
          await db.update(customerApprovalsTable)
            .set({ soNumber: soResult.docNumber })
            .where(eq(customerApprovalsTable.token, token));
          // G-3: persist SO creation success ke order_updates
          if (orderId) {
            await logOrderUpdate(
              orderId,
              "SO Dibuat",
              `Sales Order ${soResult.docNumber} berhasil dibuat dari persetujuan customer.`,
              "system",
              false,
            ).catch(() => {});
          }
        } else if (soResult.reason === "already_exists") {
          soNumber = soResult.docNumber;
          salesDocId = soResult.docId;
        } else {
          // G-3: persist SO creation failure ke order_updates (sebelumnya hanya req.log.warn)
          req.log?.warn({ reason: soResult.message }, "VMF SO creation failed — approval tetap valid");
          if (orderId) {
            await logOrderUpdate(
              orderId,
              "Gagal Buat SO",
              `Pembuatan Sales Order gagal: ${soResult.message}`,
              "system",
              false,
            ).catch(() => {});
          }
        }
      }
    }

    // Activity log (non-fatal, di luar transaksi)
    if (action === "approve") {
      await logActivity("customer_approval", locked?.id ?? 0, "approved", "customer",
        `Customer ${customerName ?? "-"} menyetujui penawaran. SO: ${soNumber}`,
        { soNumber, salesDocId, orderId, approvalId: locked?.id }).catch?.(() => {})
      // order_updates entry untuk persetujuan customer
      if (orderId) {
        await logOrderUpdate(
          orderId,
          "Customer Approved",
          `Customer ${customerName ?? "-"} menyetujui penawaran.${soNumber ? ` SO: ${soNumber}` : ""}`,
          "system",
          true,
        ).catch(() => {});
      // Log SO creation activity jika SO berhasil dibuat

      if (salesDocId && soNumber) {
        await logActivity("sales_order", salesDocId, "so_created", "system",
          `SO ${soNumber} dibuat otomatis dari persetujuan customer VMF${customerName ? ` (${customerName})` : ""}`,
          { docNumber: soNumber, approvalId: locked?.id, orderId }).catch?.(() => {});
      }
    } else {
      await logActivity("customer_approval", locked?.id ?? 0, "rejected", "customer",
        `Customer ${customerName ?? "-"} menolak penawaran`, { orderId, approvalId: locked?.id }).catch?.(() => {});
      // order_updates entry untuk penolakan customer
      if (orderId) {
        await logOrderUpdate(
          orderId,
          "Customer Rejected",
          `Customer ${customerName ?? "-"} menolak penawaran.`,
          "system",
          false,
        ).catch(() => {});
      }
    }

    // Notify via WA templates (fire-and-forget)
    if (orderId) {
      db.select().from(logisticOrdersTable)
        .where(eq(logisticOrdersTable.id, orderId))
        .limit(1)
        .then(([orderRow]) => {
          if (!orderRow) return;
          const orderData: LogisticOrderData = {
            id: orderRow.id,
            orderNumber: orderRow.orderNumber,
            customerName: orderRow.customerName,
            companyName: orderRow.companyName ?? "",
            email: orderRow.email,
            phone: orderRow.phone,
            orderType: orderRow.orderType ?? undefined,
            shipmentType: orderRow.shipmentType,
            origin: orderRow.origin,
            destination: orderRow.destination,
            commodity: orderRow.commodity ?? null,
            cargoDescription: orderRow.cargoDescription ?? null,
            grossWeight: orderRow.grossWeight ? Number(orderRow.grossWeight) : null,
            volumeCbm: orderRow.volumeCbm ? Number(orderRow.volumeCbm) : null,
            jumlahKoli: orderRow.jumlahKoli ?? null,
            grandTotal: orderRow.grandTotal ? Number(orderRow.grandTotal) : 0,
            serviceList: orderRow.shipmentType,
            requiredDate: orderRow.requiredDate ?? null,
            notes: orderRow.notes ?? null,
            jamOrder: orderRow.jamOrder ?? null,
            vehicleType: orderRow.truckType ?? null,
            createdAt: orderRow.createdAt ?? null,
            publicRfqToken: orderRow.publicRfqToken ?? null,
          };
          if (action === "approve") {
            sendCustomerApprovedNotification(orderData).catch(() => {});
            if (soNumber) {
              const sellingPriceStr = orderRow.finalSellingPrice
                ? `Rp ${Number(orderRow.finalSellingPrice).toLocaleString("id-ID")}`
                : "-";
              sendSoCreatedNotification(orderData, sellingPriceStr).catch(() => {});
            }
          } else {
            getAdminGroupWa().then((adminGroupWa) => {
              if (!adminGroupWa) return;
              sendCustomerRejectionAdminNotification(adminGroupWa, { orderNumber: orderNumber ?? null, customerName: customerName ?? null, notes: notes ?? null }, token).catch(() => {});
            }).catch(() => {});
          }
        }).catch(() => {});
    }

    return res.json({
      success: true, action, soNumber, salesDocId,
      message: action === "approve"
        ? soNumber
          ? `Terima kasih! Persetujuan Anda telah kami catat. Sales Order ${soNumber} telah dibuat.`
          : "Terima kasih! Persetujuan Anda telah kami catat. Tim kami akan segera memproses pesanan Anda."
        : "Penolakan Anda telah kami catat. Tim kami akan segera menghubungi Anda.",
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "ALREADY_RESPONDED") {
      return res.status(409).json({ error: "Penawaran ini sudah direspons sebelumnya" });
    }
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

    // BF-2 FIX: Auto-advance order status to "In Progress" when vendor submits
    // operational data. Only transitions from Customer Approved / Confirmed states
    // to avoid overwriting terminal statuses (Completed, Cancelled).
    if (conf.orderId) {
      await db.update(logisticOrdersTable)
        .set({ status: "In Progress" })
        .where(
          and(
            eq(logisticOrdersTable.id, conf.orderId),
            inArray(logisticOrdersTable.status as any, ["Customer Approved", "Confirmed"]),
          ),
        )
        .catch((e: unknown) => req.log?.error({ e }, "BF-2: auto-update order status to In Progress failed"));
    }

    await logActivity("op_confirm", conf.id, "op_submitted", "vendor",
      `Data operasional diisi oleh ${conf.vendorName ?? "vendor"}`, { orderNumber: conf.orderNumber, serviceType: conf.serviceType });

    getAdminGroupWa().then((adminGroupWa) => {
      if (!adminGroupWa) return;
      sendOpConfirmSubmittedNotification(adminGroupWa, {
        orderNumber: conf.orderNumber ?? null,
        vendorName: conf.vendorName ?? null,
        serviceLabel: SERVICE_SCHEMAS[conf.serviceType]?.label ?? conf.serviceType,
      }, token).catch(() => {});
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

    // Auto-deactivate existing active links for the same order (order_based mode only)
    let deactivatedCount = 0;
    if ((mode ?? "rate_collection") === "order_based" && orderId) {
      const conditions = [
        eq(vendorMiniFormLinksTable.orderId, orderId),
        eq(vendorMiniFormLinksTable.isActive, true),
      ];
      if (orderItemId) conditions.push(eq(vendorMiniFormLinksTable.orderItemId, orderItemId));
      const deactivated = await db
        .update(vendorMiniFormLinksTable)
        .set({ isActive: false, adminNotes: "[auto-replaced] Dinonaktifkan otomatis karena ada link baru untuk order yang sama." })
        .where(and(...conditions))
        .returning({ id: vendorMiniFormLinksTable.id });
      deactivatedCount = deactivated.length;
      if (deactivatedCount > 0) {
        await logActivity("link", 0, "bulk_deactivated", userId,
          `${deactivatedCount} link lama dinonaktifkan otomatis saat membuat link baru untuk order ${orderNumber ?? orderId}`,
          { orderId, orderItemId, deactivatedIds: deactivated.map(d => d.id) });
      }
    }

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

    // G-1: tambahkan entry ke order_updates timeline
    if (orderId) {
      await logOrderUpdate(
        orderId,
        "VMF Link Dibuat",
        `Link form vendor dibuat untuk layanan ${serviceType}${vendorName ? ` (${vendorName})` : ""}`,
        userId,
      );
    }

    return res.status(201).json({ ...link, expiresAt: link.expiresAt?.toISOString() ?? null, createdAt: link.createdAt.toISOString(), deactivatedCount });
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
    const limitParam = Math.min(Number(req.query["limit"] ?? 100), 500);
    const offsetParam = Math.max(Number(req.query["offset"] ?? 0), 0);
    const submissions = await db.select().from(vendorMiniFormSubmissionsTable)
      .orderBy(desc(vendorMiniFormSubmissionsTable.submittedAt))
      .limit(limitParam).offset(offsetParam);
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

    // Wrap deselect-all + select-one dalam transaksi dengan SELECT FOR UPDATE
    // pada link row agar dua admin concurrent harus antri — mencegah race condition
    // di mana dua submission berbeda terpilih bersamaan.
    let updated: typeof vendorMiniFormSubmissionsTable.$inferSelect;
    let conflictError: string | null = null;
    await db.transaction(async (tx) => {
      // Lock link row terlebih dahulu — semua tx concurrent pada link ini harus antri
      if (sub.linkId) {
        await tx
          .select({ id: vendorMiniFormLinksTable.id })
          .from(vendorMiniFormLinksTable)
          .where(eq(vendorMiniFormLinksTable.id, sub.linkId))
          .for("update");

        // Setelah lock diperoleh, cek apakah ada submission lain yang sudah di-lock
        // oleh customer approval — jika iya, select admin tidak boleh mengganggunya
        const [lockedOther] = await tx
          .select({ id: vendorMiniFormSubmissionsTable.id, vendorName: vendorMiniFormSubmissionsTable.vendorName })
          .from(vendorMiniFormSubmissionsTable)
          .where(
            and(
              eq(vendorMiniFormSubmissionsTable.linkId, sub.linkId),
              eq(vendorMiniFormSubmissionsTable.locked, true),
              ne(vendorMiniFormSubmissionsTable.id, id)
            )
          )
          .limit(1);
        if (lockedOther) {
          conflictError = `Vendor ${lockedOther.vendorName ?? "-"} sudah dikunci oleh customer approval, tidak bisa diganti`;
          return;
        }
      }

      if (sub.linkId) {
        await tx.update(vendorMiniFormSubmissionsTable)
          .set({ selectedByAdmin: false, selectedAt: null })
          .where(eq(vendorMiniFormSubmissionsTable.linkId, sub.linkId));
      }
      const [row] = await tx.update(vendorMiniFormSubmissionsTable)
        .set({ selectedByAdmin: true, selectedAt: new Date(), responseStatus: "selected" })
        .where(eq(vendorMiniFormSubmissionsTable.id, id))
        .returning();
      if (!row) throw new Error("Submission tidak ditemukan dalam transaksi");
      updated = row;

      if (sub.linkId) {
        await tx.update(vendorMiniFormLinksTable)
          .set({ itemStatus: "admin_review" })
          .where(eq(vendorMiniFormLinksTable.id, sub.linkId));
      }

      // Update logistic_orders.status agar admin bisa filter "Vendor Selected"
      if (sub.orderId) {
        await tx.update(logisticOrdersTable)
          .set({ status: "Vendor Selected" })
          .where(eq(logisticOrdersTable.id, sub.orderId));
      }
    });

    if (conflictError) {
      return res.status(409).json({ error: conflictError });
    }

    await logActivity("submission", id, "selected", userId,
      `Vendor ${sub.vendorName ?? "-"} dipilih oleh admin`,
      { vendorPrice: sub.vendorPrice, currency: sub.currency, linkId: sub.linkId });

    return res.json({ ...updated!, selectedAt: updated!.selectedAt?.toISOString() ?? null, submittedAt: updated!.submittedAt.toISOString() });
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

        if (linkRow.orderId) {
          // Pakai template vendor_revision
          const [orderRow] = await db.select().from(logisticOrdersTable)
            .where(eq(logisticOrdersTable.id, linkRow.orderId)).limit(1);
          if (orderRow) {
            const currentPrice = sub.vendorPrice
              ? `${sub.currency ?? "IDR"} ${Number(sub.vendorPrice).toLocaleString("id-ID")}`
              : "-";
            sendVendorRevisionNotification(
              buildOrderDataFromRow(orderRow),
              sub.vendorName ?? "Vendor",
              sub.contactPhone,
              currentPrice,
              formUrl,
            ).catch(() => {});
          }
        } else {
          sendVendorRevisionFallbackNotification(
            sub.contactPhone,
            sub.vendorName ?? "Vendor",
            linkRow.orderNumber ?? null,
            reason ?? null,
            formUrl,
            String(sub.linkId ?? sub.id),
          ).catch(() => {});
        }
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
    const {
      entityType, action, orderNumber, actor,
      from, to,
      limit: limitQ, offset: offsetQ,
    } = req.query as Record<string, string | undefined>;

    const limit = Math.min(Number(limitQ) || 200, 500);
    const offset = Number(offsetQ) || 0;

    const conditions = [];
    if (entityType) conditions.push(eq(vmfActivityLogTable.entityType, entityType));
    if (action) conditions.push(eq(vmfActivityLogTable.action, action));
    if (actor) conditions.push(eq(vmfActivityLogTable.actor, actor));
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(sql`${vmfActivityLogTable.createdAt} >= ${fromDate}`);
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        conditions.push(sql`${vmfActivityLogTable.createdAt} <= ${toDate}`);
      }
    }
    if (orderNumber) {
      conditions.push(sql`${vmfActivityLogTable.data}->>'orderNumber' = ${orderNumber}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, countResult] = await Promise.all([
      db.select().from(vmfActivityLogTable)
        .where(where)
        .orderBy(desc(vmfActivityLogTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(vmfActivityLogTable).where(where),
    ]);

    return res.json({
      rows: logs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
      total: countResult[0]?.total ?? 0,
    });
  } catch (err) {
    req.log?.error({ err }, "activity-log error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/activity-log/gaps ───────────────────────
// Returns orders where at least one critical VMF step is missing.
// Critical flow: link_generated → approval_sent → so_created → op_confirm_sent

vendorMiniFormRouter.get("/admin/activity-log/gaps", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const { from, to, orderNumber, gapAfter } = req.query as Record<string, string | undefined>;

    const fromDate = from ? new Date(from) : null;
    const toDate   = to   ? (() => { const d = new Date(to); d.setHours(23, 59, 59, 999); return d; })() : null;

    const extraConds = sql.join(
      [
        fromDate && !isNaN(fromDate.getTime()) ? sql`AND ${vmfActivityLogTable.createdAt} >= ${fromDate}` : null,
        toDate   && !isNaN(toDate.getTime())   ? sql`AND ${vmfActivityLogTable.createdAt} <= ${toDate}`   : null,
        orderNumber ? sql`AND ${vmfActivityLogTable.data}->>'orderNumber' = ${orderNumber}` : null,
      ].filter(Boolean) as ReturnType<typeof sql>[],
      sql` `,
    );

    const result = await db.execute(sql`
      SELECT
        ${vmfActivityLogTable.data}->>'orderNumber'          AS order_number,
        bool_or(${vmfActivityLogTable.action} = 'link_generated')   AS has_link_generated,
        bool_or(${vmfActivityLogTable.action} = 'approval_sent')    AS has_approval_sent,
        bool_or(${vmfActivityLogTable.action} = 'so_created')       AS has_so_created,
        bool_or(${vmfActivityLogTable.action} = 'op_confirm_sent')  AS has_op_confirm_sent,
        MIN(${vmfActivityLogTable.createdAt})  AS first_event,
        MAX(${vmfActivityLogTable.createdAt})  AS last_event,
        COUNT(*)::int                          AS total_events
      FROM ${vmfActivityLogTable}
      WHERE ${vmfActivityLogTable.data}->>'orderNumber' IS NOT NULL
        AND ${vmfActivityLogTable.action} IN ('link_generated','approval_sent','so_created','op_confirm_sent')
        ${extraConds}
      GROUP BY ${vmfActivityLogTable.data}->>'orderNumber'
      ORDER BY MIN(${vmfActivityLogTable.createdAt}) DESC
    `);

    type DbRow = {
      order_number: string;
      has_link_generated: boolean;
      has_approval_sent: boolean;
      has_so_created: boolean;
      has_op_confirm_sent: boolean;
      first_event: string;
      last_event: string;
      total_events: number;
    };

    const allOrders = (result.rows as unknown as DbRow[]);

    const CRITICAL = ["link_generated", "approval_sent", "so_created", "op_confirm_sent"] as const;
    type CriticalKey = typeof CRITICAL[number];
    const hasMap: Record<CriticalKey, keyof DbRow> = {
      link_generated:  "has_link_generated",
      approval_sent:   "has_approval_sent",
      so_created:      "has_so_created",
      op_confirm_sent: "has_op_confirm_sent",
    };

    const gapRows = allOrders
      .map(row => {
        const present = CRITICAL.filter(a => row[hasMap[a]]);
        const missing = CRITICAL.filter(a => !row[hasMap[a]]);
        const lastPresentIdx = Math.max(-1, ...present.map(a => CRITICAL.indexOf(a)));
        // Gap = has made some progress but is missing a subsequent step
        const hasGap = lastPresentIdx >= 0 && missing.some(a => CRITICAL.indexOf(a) <= lastPresentIdx + 2);
        return {
          orderNumber: row.order_number,
          present,
          missing,
          hasGap,
          firstEvent: row.first_event,
          lastEvent: row.last_event,
          totalEvents: Number(row.total_events),
        };
      })
      .filter(r => {
        if (r.present.length === 0) return false;
        if (gapAfter && !r.present.includes(gapAfter as CriticalKey)) return false;
        return r.hasGap;
      });

    return res.json({
      rows: gapRows,
      total: gapRows.length,
      summary: {
        total_orders:           allOrders.length,
        orders_with_gap:        gapRows.length,
        missing_link_generated:  allOrders.filter(r => !r.has_link_generated).length,
        missing_approval_sent:   allOrders.filter(r => !r.has_approval_sent).length,
        missing_so_created:      allOrders.filter(r => !r.has_so_created).length,
        missing_op_confirm_sent: allOrders.filter(r => !r.has_op_confirm_sent).length,
      },
    });
  } catch (err) {
    req.log?.error({ err }, "activity-log/gaps error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: GET /api/vendor-form/admin/gap-config ─────────────────────────────

vendorMiniFormRouter.get("/admin/gap-config", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const { getThresholdDays, getNotifierEnabled } = await import("../lib/vmfGapNotifier.js");
    const [thresholdDays, enabled] = await Promise.all([getThresholdDays(), getNotifierEnabled()]);
    return res.json({ thresholdDays, enabled });
  } catch (err) {
    req.log?.error({ err }, "gap-config GET error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/gap-config ────────────────────────────

vendorMiniFormRouter.post("/admin/gap-config", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const { thresholdDays, enabled } = req.body as { thresholdDays?: unknown; enabled?: unknown };
    const { setThresholdDays, setNotifierEnabled } = await import("../lib/vmfGapNotifier.js");

    const updates: string[] = [];
    if (thresholdDays !== undefined) {
      const n = Number(thresholdDays);
      if (isNaN(n) || n < 1 || n > 365) return res.status(400).json({ error: "thresholdDays harus antara 1–365" });
      await setThresholdDays(Math.round(n));
      updates.push(`thresholdDays=${Math.round(n)}`);
    }
    if (enabled !== undefined) {
      await setNotifierEnabled(Boolean(enabled));
      updates.push(`enabled=${Boolean(enabled)}`);
    }
    if (updates.length === 0) return res.status(400).json({ error: "Tidak ada field yang diupdate" });
    return res.json({ ok: true, updated: updates });
  } catch (err) {
    req.log?.error({ err }, "gap-config POST error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: POST /api/vendor-form/admin/activity-log/gaps/trigger ─────────────
// Manually triggers a VMF gap check and WA digest right now.

vendorMiniFormRouter.post("/admin/activity-log/gaps/trigger", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const { runVmfGapCheck } = await import("../lib/vmfGapNotifier.js");
    // Run in background — return immediately
    runVmfGapCheck().catch((err: unknown) => {
      req.log?.warn({ err }, "manual VMF gap check error");
    });
    return res.json({ ok: true, message: "Gap check dimulai. Notifikasi WA akan dikirim jika ada order yang stuck." });
  } catch (err) {
    req.log?.error({ err }, "gap trigger error");
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

    // DA-1 FIX: Prevent duplicate pending approvals for the same order.
    // Admin must expire/cancel the existing pending approval before creating a new one.
    if (orderId) {
      const [existingPending] = await db
        .select({ id: customerApprovalsTable.id, orderNumber: customerApprovalsTable.orderNumber })
        .from(customerApprovalsTable)
        .where(and(eq(customerApprovalsTable.orderId, orderId), eq(customerApprovalsTable.status, "pending")))
        .limit(1);
      if (existingPending) {
        return res.status(409).json({
          error: `Order ini sudah memiliki link approval pending (ID: ${existingPending.id}). Batalkan atau tunggu link lama expired sebelum membuat yang baru.`,
          existingApprovalId: existingPending.id,
        });
      }
    }

    const token = randomBytes(20).toString("hex");
    const userId = (req.user as { id: string } | undefined)?.id ?? null;
    const effectiveExpiry = expiresInDays ?? 7;
    const expiresAt = new Date(Date.now() + effectiveExpiry * 24 * 60 * 60 * 1000);

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

    // G-2: tambahkan entry ke order_updates timeline
    if (orderId) {
      const priceLabel = sellingPrice
        ? `${currency ?? "IDR"} ${Number(sellingPrice).toLocaleString("id-ID")}`
        : "-";
      await logOrderUpdate(
        orderId,
        "Penawaran Dibuat",
        `Link persetujuan customer dibuat. Harga: ${priceLabel}`,
        userId,
      );
    }

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
    const approvals = await db
      .select({
        approval: customerApprovalsTable,
        salesDocId: salesDocumentsTable.id,
      })
      .from(customerApprovalsTable)
      .leftJoin(
        salesDocumentsTable,
        eq(salesDocumentsTable.docNumber, customerApprovalsTable.soNumber),
      )
      .orderBy(desc(customerApprovalsTable.createdAt));
    return res.json(approvals.map(({ approval: a, salesDocId }) => ({
      ...a,
      salesDocId: salesDocId ?? null,
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

    const userId4a = (req.user as { id: string } | undefined)?.id ?? "admin";
    await logActivity("op_confirm", conf.id, "created", userId4a,
      `Link konfirmasi operasional dibuat untuk ${vendorName ?? "vendor"}`, { orderNumber, serviceType });

    // G-4: tambahkan entry ke order_updates timeline
    if (orderId) {
      await logOrderUpdate(
        orderId,
        "Konfirmasi Operasional Diminta",
        `Link konfirmasi operasional dikirim ke ${vendorName ?? "vendor"} (${serviceType}).`,
        userId4a,
      ).catch(() => {});
    }

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
    const userId = (req.user as { id: string } | undefined)?.id ?? "admin";
    await logActivity("submission", id, "deleted", userId,
      `Submission dari ${deleted.vendorName ?? "vendor"} dihapus oleh admin`,
      { vendorPrice: deleted.vendorPrice, responseStatus: deleted.responseStatus });
    if (deleted.attachmentUrl) deleteFromSupabase(deleted.attachmentUrl).catch(() => {});
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
    await logActivity("link", id, "link_generated", (req.user as { id: string } | undefined)?.id ?? "admin",
      `Short link di-generate untuk ${link.serviceType}${link.orderNumber ? ` (Order: ${link.orderNumber})` : ""}`,
      { shortUrl, serviceType: link.serviceType, orderNumber: link.orderNumber });
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
    await logActivity("link", id, "link_generated", (req.user as { id: string } | undefined)?.id ?? "admin",
      `Short link di-reset untuk ${link.serviceType}${link.orderNumber ? ` (Order: ${link.orderNumber})` : ""}`,
      { shortUrl, serviceType: link.serviceType, orderNumber: link.orderNumber });
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

    if (!customMessage?.trim() && link.orderId && link.vendorName) {
      // Pakai template vendor_request
      const [orderRow] = await db.select().from(logisticOrdersTable)
        .where(eq(logisticOrdersTable.id, link.orderId)).limit(1);
      if (orderRow) {
        await sendVendorRequestNotification(await buildOrderDataFromRowWithItems(orderRow), link.vendorName, phone.trim(), formUrl);
        await logActivity("link", id, "sent_wa", (req.user as { id: string } | undefined)?.id ?? "admin", `WA dikirim ke ${phone}`, { phone });
        return res.json({ success: true, message: "Pesan WA berhasil dikirim" });
      }
    }

    // Fallback: customMessage atau tidak ada order
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

// ── ADMIN: POST /api/vendor-form/admin/customer-approvals/:id/retry-so ─────────

vendorMiniFormRouter.post("/admin/customer-approvals/:id/retry-so", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [approval] = await db.select().from(customerApprovalsTable).where(eq(customerApprovalsTable.id, id));
    if (!approval) return res.status(404).json({ error: "Approval tidak ditemukan" });
    if (approval.status !== "approved") return res.status(409).json({ error: "Approval belum disetujui customer" });

    const soResult = await createSalesOrderFromVmfApproval(approval);
    if (soResult.ok) {
      await db.update(customerApprovalsTable)
        .set({ soNumber: soResult.docNumber })
        .where(eq(customerApprovalsTable.id, id));
      await logActivity("sales_order", soResult.docId, "so_created", (req.user as { id: string } | undefined)?.id ?? "admin",
        `SO ${soResult.docNumber} dibuat ulang via retry untuk approval ID ${id}${approval.customerName ? ` (${approval.customerName})` : ""}`,
        { docNumber: soResult.docNumber, approvalId: id, orderId: approval.orderId, orderNumber: approval.orderNumber });
      return res.json({ ok: true, docId: soResult.docId, docNumber: soResult.docNumber });
    } else if (soResult.reason === "already_exists") {
      if (!approval.soNumber) {
        await db.update(customerApprovalsTable)
          .set({ soNumber: soResult.docNumber })
          .where(eq(customerApprovalsTable.id, id));
      }
      return res.json({ ok: true, already: true, docId: soResult.docId, docNumber: soResult.docNumber });
    } else {
      return res.status(500).json({ error: soResult.message });
    }
  } catch (err) {
    req.log?.error({ err }, "retry-so error");
    return res.status(500).json({ error: "Gagal membuat SO" });
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

    if (!customMessage?.trim() && approval.orderId) {
      // Pakai template customer_approval
      const [orderRow] = await db.select().from(logisticOrdersTable)
        .where(eq(logisticOrdersTable.id, approval.orderId)).limit(1);
      if (orderRow) {
        await sendCustomerApprovalNotification(buildOrderDataFromRow(orderRow), priceStr, approvalUrl);
        const userId2b = (req.user as { id: string } | undefined)?.id ?? "admin";
        await logActivity("customer_approval", id, "sent_wa", userId2b,
          `WA penawaran dikirim ke customer ${approval.customerName ?? "-"}`, { phone: target });
        // G-2b: order_updates entry saat WA approval dikirim ke customer
        if (approval.orderId) {
          await logOrderUpdate(
            approval.orderId,
            "Penawaran Dikirim ke Customer",
            `WA penawaran harga ${priceStr} dikirim ke ${approval.customerName ?? "customer"} (${target}).`,
            userId2b,
          ).catch(() => {});
        }
        const actorId = (req.user as { id: string } | undefined)?.id ?? "admin";
        await logActivity("customer_approval", id, "sent_wa", actorId,
          `WA penawaran dikirim ke customer ${approval.customerName ?? "-"}`, { phone: target });
        await logActivity("customer_approval", id, "approval_sent", actorId,
          `Link approval dikirim ke customer ${approval.customerName ?? "-"} via WhatsApp${approval.orderNumber ? ` (Order: ${approval.orderNumber})` : ""}`,
          { phone: target, channel: "whatsapp", orderNumber: approval.orderNumber, sellingPrice: approval.sellingPrice });
        return res.json({ success: true, message: "Pesan WA ke customer berhasil dikirim" });
      }
    }

    // Fallback: customMessage atau tidak ada order
    const msg = customMessage?.trim() ||
      `Halo${approval.customerName ? ` *${approval.customerName}*` : ""}, berikut penawaran kami untuk request Anda.\n\n` +
      (approval.orderNumber ? `Order Ref: *${approval.orderNumber}*\n` : "") +
      `Total Harga: *${priceStr}*\n\n` +
      `Silakan review dan konfirmasi melalui link berikut:\n${approvalUrl}`;

    await sendWhatsApp(target, msg, { context: "customer-approval-send", refType: "customer_approval", refId: String(approval.id) });

    const actorId = (req.user as { id: string } | undefined)?.id ?? "admin";
    await logActivity("customer_approval", id, "sent_wa", actorId,
      `WA penawaran dikirim ke customer ${approval.customerName ?? "-"}`, { phone: target });
    await logActivity("customer_approval", id, "approval_sent", actorId,
      `Link approval dikirim ke customer ${approval.customerName ?? "-"} via WhatsApp${approval.orderNumber ? ` (Order: ${approval.orderNumber})` : ""}`,
      { phone: target, channel: "whatsapp", orderNumber: approval.orderNumber, sellingPrice: approval.sellingPrice });

    // order_updates entry
    if (approval.orderId) {
      await logOrderUpdate(
        approval.orderId,
        "Penawaran Dikirim ke Customer",
        `WA penawaran harga ${priceStr} dikirim ke ${approval.customerName ?? "customer"} (${target}).`,
        actorId,
      ).catch(() => {});
    }

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

    if (customMessage?.trim()) {
      // Custom message override — kirim langsung
      await sendWhatsApp(phone.trim(), customMessage.trim(), { context: "op-confirm-send", refType: "vendor_op_confirm", refId: String(conf.id) });
    } else if (conf.orderId) {
      // Ada order — pakai template sendOpRequestNotification
      const [orderRow] = await db.select().from(logisticOrdersTable)
        .where(eq(logisticOrdersTable.id, conf.orderId)).limit(1);
      if (orderRow) {
        const orderData: LogisticOrderData = {
          id: orderRow.id,
          orderNumber: orderRow.orderNumber,
          customerName: orderRow.customerName,
          companyName: orderRow.companyName ?? "",
          email: orderRow.email,
          phone: orderRow.phone,
          orderType: orderRow.orderType ?? undefined,
          shipmentType: orderRow.shipmentType,
          origin: orderRow.origin,
          destination: orderRow.destination,
          commodity: orderRow.commodity ?? null,
          cargoDescription: orderRow.cargoDescription ?? null,
          grossWeight: orderRow.grossWeight ? Number(orderRow.grossWeight) : null,
          volumeCbm: orderRow.volumeCbm ? Number(orderRow.volumeCbm) : null,
          jumlahKoli: orderRow.jumlahKoli ?? null,
          grandTotal: orderRow.grandTotal ? Number(orderRow.grandTotal) : 0,
          serviceList: orderRow.shipmentType,
          requiredDate: orderRow.requiredDate ?? null,
          notes: orderRow.notes ?? null,
          jamOrder: orderRow.jamOrder ?? null,
          vehicleType: orderRow.truckType ?? null,
          createdAt: orderRow.createdAt ?? null,
          publicRfqToken: orderRow.publicRfqToken ?? null,
        };
        await sendOpRequestNotification(orderData, conf.vendorName ?? "Vendor", phone.trim(), confirmUrl);
      } else {
        // Order tidak ditemukan — fallback ke hardcoded
        const svcLabel = SERVICE_SCHEMAS[conf.serviceType]?.label ?? conf.serviceType;
        const msg = `Halo${conf.vendorName ? ` *${conf.vendorName}*` : ""}, customer sudah menyetujui penawaran.\n\n` +
          `Mohon lengkapi data operasional untuk layanan *${svcLabel}*` +
          (conf.orderNumber ? ` (Order: ${conf.orderNumber})` : "") +
          ` melalui link berikut:\n${confirmUrl}` +
          (conf.instruction ? `\n\nInstruksi: ${conf.instruction}` : "");
        await sendWhatsApp(phone.trim(), msg, { context: "op-confirm-send", refType: "vendor_op_confirm", refId: String(conf.id) });
      }
    } else {
      // Tidak ada orderId — fallback ke hardcoded
      const svcLabel = SERVICE_SCHEMAS[conf.serviceType]?.label ?? conf.serviceType;
      const msg = `Halo${conf.vendorName ? ` *${conf.vendorName}*` : ""}, customer sudah menyetujui penawaran.\n\n` +
        `Mohon lengkapi data operasional untuk layanan *${svcLabel}*` +
        (conf.orderNumber ? ` (Order: ${conf.orderNumber})` : "") +
        ` melalui link berikut:\n${confirmUrl}` +
        (conf.instruction ? `\n\nInstruksi: ${conf.instruction}` : "");
      await sendWhatsApp(phone.trim(), msg, { context: "op-confirm-send", refType: "vendor_op_confirm", refId: String(conf.id) });
    }

    const userId4b = (req.user as { id: string } | undefined)?.id ?? "admin";
    const opActorId = (req.user as { id: string } | undefined)?.id ?? "admin";
    await logActivity("op_confirm", id, "sent_wa", opActorId,
      `WA op-confirm dikirim ke ${conf.vendorName ?? "vendor"}`, { phone });
    await logActivity("op_confirm", id, "op_confirm_sent", opActorId,
      `Link konfirmasi operasional dikirim ke ${conf.vendorName ?? "vendor"} via WhatsApp${conf.orderNumber ? ` (Order: ${conf.orderNumber})` : ""}`,
      { phone, channel: "whatsapp", orderNumber: conf.orderNumber, serviceType: conf.serviceType });

    // G-4b: order_updates entry saat WA op-confirm dikirim ke vendor
    if (conf.orderId) {
      await logOrderUpdate(
        conf.orderId,
        "Op-Confirm WA Dikirim",
        `WA konfirmasi operasional dikirim ke ${conf.vendorName ?? "vendor"} (${SERVICE_SCHEMAS[conf.serviceType]?.label ?? conf.serviceType}).`,
        userId4b,
      ).catch(() => {});
    }

    return res.json({ success: true, message: "Pesan WA ke vendor berhasil dikirim" });
  } catch (err) {
    req.log?.error({ err }, "send-wa op-confirm error");
    return res.status(500).json({ error: "Gagal mengirim WA" });
  }
});
