import { db, suppliersTable, vendorCatalogItemsTable, portalContentTable, waTemplateConfigsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { sendWhatsApp } from "./fonnte";
import { getAdminWa, getAdminGroupWa } from "./adminWa";
import { getPreferredDomain } from "./domain";
import { sendMail, isSmtpConfigured } from "./mailer";
import { logger } from "./logger";
import { generateShortLink } from "./shortLink";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admcst001@gmail.com";

export interface LogisticOrderData {
  id: number;
  orderNumber: string;
  customerName: string;
  companyName: string;
  email: string;
  phone: string;
  orderType?: string;
  shipmentType: string;
  origin: string;
  destination: string;
  commodity?: string | null;
  cargoDescription?: string | null;
  grossWeight?: number | null;
  volumeCbm?: number | null;
  jumlahKoli?: number | null;
  grandTotal: number;
  serviceList: string;
  orderItems?: Array<{ name: string; qty?: number | null; subtotal?: number | null }> | null;
  requiredDate?: string | null;
  notes?: string | null;
  jamOrder?: string | null;
  vehicleType?: string | null;
  createdAt?: Date | string | null;
  publicRfqToken?: string | null;
}

const BULAN_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
const TZ = "Asia/Jakarta";

function nowWIB(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const day  = parts.find(p => p.type === "day")?.value ?? "";
  const mon  = parts.find(p => p.type === "month")?.value ?? "";
  const year = parts.find(p => p.type === "year")?.value ?? "";
  const hour = parts.find(p => p.type === "hour")?.value ?? "";
  const min  = parts.find(p => p.type === "minute")?.value ?? "";
  return `${day} ${mon} ${year}, ${hour}:${min} WIB`;
}

function formatTanggal(dt: Date | string): string {
  const d = new Date(dt);
  const parts = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "2-digit", month: "long", year: "numeric" }).formatToParts(d);
  const day  = parts.find(p => p.type === "day")?.value ?? "";
  const mon  = parts.find(p => p.type === "month")?.value ?? "";
  const year = parts.find(p => p.type === "year")?.value ?? "";
  return `${day} ${mon} ${year}`;
}

function formatJam(dt: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(dt));
}

/** Format ISO date string "2026-05-14" → "14 Mei 2026" */
function formatISODate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  if (isNaN(d.getTime())) return dateStr;
  const parts = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "2-digit", month: "long", year: "numeric" }).formatToParts(d);
  const day  = parts.find(p => p.type === "day")?.value ?? "";
  const mon  = parts.find(p => p.type === "month")?.value ?? "";
  const year = parts.find(p => p.type === "year")?.value ?? "";
  return `${day} ${mon} ${year}`;
}

/** Format jam_order "16.13" or "16:13" → "16:13" */
function formatJamOrder(jam: string): string {
  return jam.replace(".", ":");
}

// ─── WA Template Engine ────────────────────────────────────────────────────────

/** Map shipmentType text → service type key used in {{#if X}} blocks */
export function deriveServiceType(shipmentType: string, orderType?: string): string {
  if (orderType === "product") return "product";
  const t = (shipmentType ?? "").toLowerCase();
  if (t.includes("trucking") || t.includes("truk")) return "trucking";
  if (t.includes("sea") || t.includes("laut") || t.includes("fcl") || t.includes("lcl")) return "freight_sea";
  if (t.includes("air") || t.includes("udara")) return "freight_air";
  if (t.includes("ppjk") || t.includes("customs") || t.includes("kepabeanan") || t.includes("bea cukai")) return "ppjk";
  if (t.includes("product") || t.includes("produk")) return "product";
  if (t.includes("handling")) return "handling";
  return "";
}

/** Resolve {{#if serviceTypeKey}}...{{/if}} conditional blocks */
export function resolveCondBlocks(body: string, serviceType: string): string {
  return body.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, cond, content: string) =>
    serviceType && cond === serviceType ? content : ""
  );
}

/**
 * Render a {{variable}} template. Lines containing a variable whose value is
 * empty/null are omitted from the output (optional-field pattern).
 * Empty lines (no variables) are always kept.
 * Supports {{#if serviceType}}...{{/if}} conditional blocks (resolved before var substitution).
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
  serviceType = "",
): string {
  const resolved = resolveCondBlocks(template, serviceType);
  const lines = resolved.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const matches = [...line.matchAll(/\{\{(\w+)\}\}/g)];
    if (matches.length === 0) { result.push(line); continue; }
    let skip = false;
    let rendered = line;
    for (const m of matches) {
      const val = vars[m[1]];
      if (val == null || val === "") { skip = true; break; }
      rendered = rendered.replaceAll(`{{${m[1]}}}`, val);
    }
    if (!skip) result.push(rendered);
  }
  // Collapse triple-newlines left by removed conditional blocks
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildOrderVars(
  order: LogisticOrderData,
  extras: Record<string, string | null | undefined> = {},
): Record<string, string | null | undefined> {
  const tgl = order.createdAt ? formatTanggal(order.createdAt) : null;
  const jam = order.jamOrder
    ? formatJamOrder(order.jamOrder)
    : order.createdAt ? formatJam(order.createdAt) : null;

  const isProduct = order.orderType === "product";

  const route = (order.origin && order.destination)
    ? `${order.origin} → ${order.destination}`
    : order.origin || order.destination || null;

  const productList: string | null = (() => {
    if (order.orderItems?.length) {
      return order.orderItems.map(i => `• ${i.name}`).join("\n");
    }
    if (isProduct && order.serviceList) {
      return order.serviceList;
    }
    return null;
  })();

  return {
    orderNumber: order.orderNumber,
    tanggal: tgl,
    jam,
    customerName: order.customerName,
    customerDisplay: order.customerName + (order.companyName ? ` (${order.companyName})` : ""),
    customerPhone: order.phone,
    companyName: order.companyName ?? null,
    email: order.email,
    phone: order.phone,
    serviceType: deriveServiceType(order.shipmentType, order.orderType),
    shipmentType: isProduct ? null : (order.shipmentType || null),
    route,
    origin: order.origin || null,
    destination: order.destination || null,
    commodity: order.commodity ?? null,
    cargoDescription: order.cargoDescription ?? null,
    grossWeightDisplay: (!isProduct && order.grossWeight) ? `${order.grossWeight} kg` : null,
    volumeDisplay: (!isProduct && order.volumeCbm) ? `${order.volumeCbm} CBM` : null,
    jumlahKoliDisplay: (!isProduct && order.jumlahKoli) ? `${order.jumlahKoli} koli` : null,
    serviceList: isProduct ? null : order.serviceList,
    productList,
    totalEst: formatRupiah(order.grandTotal),
    requiredDate: order.requiredDate ?? null,
    notes: order.notes ?? null,
    timestamp: nowWIB(),
    ...extras,
  };
}

// 5-minute in-memory cache for WA templates
let _waTemplateCache: Record<string, string> | null = null;
let _waTemplateCacheAt = 0;
const WA_TEMPLATE_TTL = 5 * 60 * 1000;

// Workflow-based template cache (new table: whatsapp_template_configs)
let _wfTemplateCache: Map<string, string> | null = null;
let _wfTemplateCacheAt = 0;

export function invalidateWaTemplateCache() {
  _waTemplateCache = null;
  _wfTemplateCache = null;
}

/** Fetch template body for a (recipient × workflow) pair from new DB table; falls back to defaultBody. */
export async function getWaTemplateConfig(
  recipient: string,
  workflow: string,
  defaultBody: string,
): Promise<string> {
  if (!_wfTemplateCache || Date.now() - _wfTemplateCacheAt > WA_TEMPLATE_TTL) {
    _wfTemplateCache = new Map();
    _wfTemplateCacheAt = Date.now();
    try {
      const rows = await db.select().from(waTemplateConfigsTable);
      for (const row of rows) _wfTemplateCache.set(`${row.recipient}__${row.workflow}`, row.body);
    } catch { /* use defaults */ }
  }
  return _wfTemplateCache.get(`${recipient}__${workflow}`) ?? defaultBody;
}

async function getWaTemplates(): Promise<Record<string, string>> {
  if (_waTemplateCache && Date.now() - _waTemplateCacheAt < WA_TEMPLATE_TTL) {
    return _waTemplateCache;
  }
  try {
    const { DEFAULT_WA_TEMPLATES } = await import("../routes/settings.js");
    const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, "wa_templates"));
    const stored: Record<string, string> = row ? JSON.parse(row.value) as Record<string, string> : {};
    _waTemplateCache = { ...DEFAULT_WA_TEMPLATES, ...stored };
    _waTemplateCacheAt = Date.now();
    return _waTemplateCache;
  } catch {
    return {};
  }
}

function getApproveFormUrl(orderNumber: string): string {
  const domain = getPreferredDomain();
  if (!domain) return "";
  return `https://${domain}/approve/${orderNumber}`;
}

async function createAdminReviewLink(orderId: number): Promise<string> {
  try {
    const { createAdminActionLink, getAdminActionUrl } = await import("../routes/adminAction.js");
    const token = await createAdminActionLink(orderId, "review_order", null, 72);
    const url = getAdminActionUrl(token);
    return await generateShortLink(url, { context: "admin_action", refType: "order", refId: String(orderId) });
  } catch {
    return "";
  }
}

function formatRupiah(amount: number): string {
  return amount.toLocaleString("id-ID");
}

/** Returns true for air/sea freight types that need per-unit pricing hints */
function isFreightWithDimensions(shipmentType: string): boolean {
  const t = shipmentType.toLowerCase();
  return t.includes("air") || t.includes("sea") || t.includes("laut") || t.includes("udara");
}

function buildAdminWaMessage(
  order: LogisticOrderData,
  tplBody: string,
  adminActionShortUrl?: string,
): string {
  const svcType = deriveServiceType(order.shipmentType, order.orderType);
  return renderTemplate(tplBody, buildOrderVars(order, { adminActionUrl: adminActionShortUrl ?? null }), svcType);
}

function buildVendorWaMessage(
  order: LogisticOrderData,
  vendorName: string,
  tplBody: string,
  extras: Record<string, string | null | undefined> = {},
): string {
  const responseUrl = getVendorResponseUrl(order.orderNumber);
  const svcType = deriveServiceType(order.shipmentType, order.orderType);
  return renderTemplate(tplBody, buildOrderVars(order, { vendorName, responseUrl, ...extras }), svcType);
}

function getVendorResponseUrl(orderNumber: string): string {
  const domain = getPreferredDomain() || "cstlogistic.co.id";
  const { signVendorResponseToken } = require("./vendorResponseToken") as typeof import("./vendorResponseToken");
  const token = signVendorResponseToken(orderNumber);
  return `https://${domain}/vendor-response/${orderNumber}?t=${token}`;
}

function buildPickupSchedule(order: LogisticOrderData): string | null {
  const pickupDate = order.requiredDate ? formatISODate(order.requiredDate) : "";
  const pickupTime = order.jamOrder ? formatJamOrder(order.jamOrder) : "";
  if (pickupDate) return `${pickupDate}${pickupTime ? ` | ${pickupTime} WIB` : ""}`;
  if (pickupTime) return `${pickupTime} WIB`;
  return null;
}

function getOrderUrl(orderId: number): string {
  const domain = getPreferredDomain() || "cstlogistic.co.id";
  return `https://${domain}/logistic/orders/${orderId}`;
}

function buildAdminGroupWaMessage(
  order: LogisticOrderData,
  tplBody: string,
  adminActionShortUrl?: string,
): string {
  const domain = getPreferredDomain() || "cstlogistic.co.id";
  const fallbackUrl = `https://${domain}/bizportal/logistics/orders/${order.id}`;
  const actionUrl = adminActionShortUrl || fallbackUrl;
  const svcType = deriveServiceType(order.shipmentType, order.orderType);
  return renderTemplate(tplBody, buildOrderVars(order, { adminActionUrl: actionUrl }), svcType);
}

function buildCustomerWaMessage(order: LogisticOrderData, tplBody: string): string {
  const svcType = deriveServiceType(order.shipmentType, order.orderType);
  return renderTemplate(tplBody, buildOrderVars(order), svcType);
}

function buildEmailHtml(title: string, intro: string, rows: [string, string][], footer: string): string {
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;color:#555;font-weight:600;white-space:nowrap;vertical-align:top">${label}</td>` +
        `<td style="padding:6px 12px;color:#222">${value}</td></tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
      <tr><td style="background:#1e40af;padding:24px 32px">
        <h1 style="margin:0;color:#fff;font-size:20px">🚢 CST Logistics</h1>
        <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px">${title}</p>
      </td></tr>
      <tr><td style="padding:24px 32px">
        <p style="margin:0 0 20px;color:#374151;font-size:15px">${intro}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
          ${rowsHtml}
        </table>
        <p style="margin:24px 0 0;color:#6b7280;font-size:13px">${footer}</p>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
        <p style="margin:0;color:#9ca3af;font-size:12px">CST Logistics — Jln. Ternate No. 10B/C, Jakarta 10150</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─── Default template bodies (fallback jika belum dikustomisasi di DB) ────────
const DEFAULT_TPL = {
  admin_personal: {
    order_new: ["🚢 *ORDER LOGISTIK BARU*","━━━━━━━━━━━━━━━━━━","No. Order       : `{{orderNumber}}`","Tanggal         : {{tanggal}}","Jam             : {{jam}}","Customer        : {{customerDisplay}}","Email           : {{email}}","HP              : {{phone}}","Jenis           : {{shipmentType}}","Rute            : {{route}}","Kategori Barang : {{commodity}}","Deskripsi       : {{cargoDescription}}","Berat           : {{grossWeightDisplay}}","Volume          : {{volumeDisplay}}","Jumlah Koli     : {{jumlahKoliDisplay}}","{{#if product}}","📦 Produk       :","{{productList}}","{{/if}}","Layanan         : {{serviceList}}","Total Est.      : Rp {{totalEst}}","Tgl Kirim       : {{requiredDate}}","Catatan         : {{notes}}","━━━━━━━━━━━━━━━━━━","⚡ *Aksi Cepat Admin (tanpa login):*","🔭 Review & Blast Vendor → {{adminActionUrl}}","_Dikirim: {{timestamp}}_"].join("\n"),
    vendor_submission: ["📩 *PENAWARAN VENDOR DITERIMA — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","No. RFQ     : {{rfqNumber}}","No. Order   : {{orderNumber}}","Vendor      : *{{vendorName}}*{{quotePosition}}","Harga       : *{{vendorPrice}}*","ETA Pickup  : {{estimatedPickup}}","ETA Delivery: {{estimatedDelivery}}","Est. Hari   : {{estimatedDays}} hari","Catatan     : {{vendorNotes}}","━━━━━━━━━━━━━━━━━━","✅ Approve & Kirim ke Customer:","{{approveUrl}}","","Segera review dan kirim ke customer.","_{{timestamp}}_"].join("\n"),
    vendor_confirmed: ["🔔 *VENDOR CONFIRMED — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Vendor      : *{{vendorName}}*","No. Order   : {{orderNumber}}","Harga Dasar : {{vendorPrice}}","Markup      : {{markup}}","Harga Final : {{finalCustomerPrice}}","━━━━━━━━━━━━━━━━━━","✅ Review & Approve:","{{approveUrl}}","_{{timestamp}}_"].join("\n"),
    vendor_rejected: ["🔴 *VENDOR REJECTED — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Vendor *{{vendorName}}* menolak order ini.","","📋 Cek & pilih vendor lain:","{{approveUrl}}","_{{timestamp}}_"].join("\n"),
    customer_approved: ["✅ *CUSTOMER APPROVED — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Customer: *{{customerName}}*","Order: {{orderNumber}}","Status: DISETUJUI ✅","No. RFQ: {{rfqNumber}}","Harga Final: {{sellingPrice}}","","Forward ke vendor (tanpa login):","{{fwdUrl}}","","Segera proses konfirmasi operasional ke vendor.","_{{timestamp}}_"].join("\n"),
    customer_revised: ["🟡 *CUSTOMER MINTA REVISI — {{rfqNumber}}*","━━━━━━━━━━━━━━━━━━","Customer: {{customerName}}","Catatan Revisi:","{{revisionNotes}}","━━━━━━━━━━━━━━━━━━","Buka RFQ:","{{rfqLink}}","_{{timestamp}}_"].join("\n"),
    customer_rejected: ["🔴 *CUSTOMER MENOLAK PENAWARAN — {{rfqNumber}}*","━━━━━━━━━━━━━━━━━━","Customer: {{customerName}}","Alasan:","{{rejectionReason}}","━━━━━━━━━━━━━━━━━━","Buka RFQ:","{{rfqLink}}","_{{timestamp}}_"].join("\n"),
    task_update: ["📦 *Update Order — {{orderNumber}}*","Dari: {{vendorName}}","Status: {{status}}","Catatan: {{notes}}","_{{timestamp}}_"].join("\n"),
    op_request: ["⚙️ *OP. REQUEST DIKIRIM — {{orderNumber}}*","","Form konfirmasi operasional telah dikirim ke vendor *{{vendorName}}*.","","No. Order : {{orderNumber}}","Customer  : {{customerName}}","Layanan   : {{serviceType}}","Route     : {{route}}","","{{#if trucking}}","Data yang diminta: Driver, No. Plat, Kendaraan.","{{/if}}","{{#if freight_sea}}","Data yang diminta: Vessel, Voyage, Container, BL.","{{/if}}","{{#if freight_air}}","Data yang diminta: Airline, AWB, Flight Number.","{{/if}}","{{#if ppjk}}","Data yang diminta: Nomor Aju, BC Type, SPPB.","{{/if}}","","🔗 Link Operasional: {{operationalFormLink}}","","_{{timestamp}}_"].join("\n"),
    driver_assigned: ["🚚 *DRIVER DITUGASKAN — {{orderNumber}}*","","Driver untuk order *{{orderNumber}}* telah ditugaskan.","Customer : {{customerName}}","Layanan  : {{serviceType}}","","{{#if trucking}}","👤 Driver    : {{driverName}}","📞 HP        : {{driverPhone}}","🚛 Kendaraan : {{vehicleType}}","🔢 Plat      : {{plateNumber}}","{{/if}}","","Notifikasi sudah dikirim ke customer.","_{{timestamp}}_"].join("\n"),
    shipment_update: ["🚢 *SHIPMENT UPDATE DIKIRIM — {{orderNumber}}*","","Update pengiriman sudah dikirim ke customer *{{customerName}}*.","Layanan : {{serviceType}}","Rute    : {{route}}","","{{#if freight_sea}}","🚢 Kapal     : {{vessel}} / {{voyage}}","📦 Container : {{containerNumber}}","📃 BL No     : {{blNumber}}","{{/if}}","","{{#if freight_air}}","✈️ Airline   : {{airline}}","📋 AWB       : {{awbNumber}}","🛫 Flight    : {{flightNumber}}","{{/if}}","","_{{timestamp}}_"].join("\n"),
    customs_update: ["🏛️ *KEPABEANAN UPDATE DIKIRIM — {{orderNumber}}*","","Update kepabeanan sudah dikirim ke customer *{{customerName}}*.","Layanan : {{serviceType}}","","{{#if ppjk}}","📋 No. Aju : {{ajuNumber}}","📄 BC Type : {{bcType}}","✅ SPPB    : {{sppbNumber}}","{{/if}}","","_{{timestamp}}_"].join("\n"),
    delivery_completed: ["🏁 *PENGIRIMAN SELESAI — {{orderNumber}}*","Customer: {{customerName}}","Rute: {{route}}","_{{timestamp}}_"].join("\n"),
  },
  admin_group: {
    order_new: ["🔔 *[ORDER MASUK] {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","🏷️ No. Tracking  : `{{orderNumber}}`","📆 Tanggal       : {{tanggal}}","👤 Customer      : *{{customerDisplay}}*","📞 HP            : {{phone}}","📧 Email         : {{email}}","━━━━━━━━━━━━━━━━━━","🚢 Jenis         : {{shipmentType}}","📍 Rute          : {{route}}","📦 Komoditi      : {{commodity}}","📋 Deskripsi     : {{cargoDescription}}","⚖️ Berat         : {{grossWeightDisplay}}","📐 Volume        : {{volumeDisplay}}","{{#if product}}","🛍️ Produk        :","{{productList}}","{{/if}}","📅 Tgl Kirim     : {{requiredDate}}","📝 Catatan       : {{notes}}","━━━━━━━━━━━━━━━━━━","💰 Total Est.    : *Rp {{totalEst}}*","🔵 Status        : Menunggu Konfirmasi","━━━━━━━━━━━━━━━━━━","⚡ *Aksi Cepat (tanpa login):*","🚀 Review & Blast Vendor → {{adminActionUrl}}","","_Harap segera diproses. Dikirim: {{timestamp}}_"].join("\n"),
    vendor_submission: ["📩 *VENDOR SUBMIT — {{orderNumber}}*","RFQ: {{rfqNumber}} | Vendor *{{vendorName}}*{{quotePosition}}","💰 Harga: {{vendorPrice}}","ETA: {{estimatedPickup}} → {{estimatedDelivery}}","Segera review!","_{{timestamp}}_"].join("\n"),
    vendor_confirmed: ["🔔 *VENDOR CONFIRMED — {{orderNumber}}*","Vendor: *{{vendorName}}* | Harga Final: {{finalCustomerPrice}}","{{approveUrl}}","_{{timestamp}}_"].join("\n"),
    vendor_rejected: ["🔴 *VENDOR REJECTED — {{orderNumber}}*","Vendor *{{vendorName}}* menolak. Pilih vendor lain:","{{approveUrl}}","_{{timestamp}}_"].join("\n"),
    customer_approved: ["🎉 *CUSTOMER APPROVED — {{orderNumber}}*","Customer *{{customerName}}* menyetujui penawaran.","Proses operasional sekarang!","_{{timestamp}}_"].join("\n"),
    customer_revised: ["🟡 *CUSTOMER REVISI — {{rfqNumber}}*","Customer: {{customerName}}","Catatan: {{revisionNotes}}","{{rfqLink}}","_{{timestamp}}_"].join("\n"),
    customer_rejected: ["🔴 *CUSTOMER TOLAK — {{rfqNumber}}*","Customer: {{customerName}}","Alasan: {{rejectionReason}}","{{rfqLink}}","_{{timestamp}}_"].join("\n"),
    task_update: ["📦 *Update Order — {{orderNumber}}*","Dari: {{vendorName}} | Status: {{status}}","_{{timestamp}}_"].join("\n"),
    op_request: ["⚙️ *[OP. REQUEST] {{orderNumber}}*","Form operasional dikirim ke vendor *{{vendorName}}*.","Customer: {{customerName}} | Layanan: {{serviceType}}","Rute: {{route}}","_{{timestamp}}_"].join("\n"),
    driver_assigned: ["🚚 *[DRIVER DITUGASKAN] {{orderNumber}}*","Customer: {{customerName}}","{{#if trucking}}","Driver: {{driverName}} | Plat: {{plateNumber}}","{{/if}}","_{{timestamp}}_"].join("\n"),
    shipment_update: ["🚢 *SHIPMENT UPDATE — {{orderNumber}}*","Customer: {{customerName}} | Rute: {{route}}","{{#if freight_sea}}","Vessel: {{vessel}} / BL: {{blNumber}}","{{/if}}","{{#if freight_air}}","AWB: {{awbNumber}} / Flight: {{flightNumber}}","{{/if}}","_{{timestamp}}_"].join("\n"),
    customs_update: ["🏛️ *KEPABEANAN UPDATE — {{orderNumber}}*","Customer: {{customerName}}","{{#if ppjk}}","Aju: {{ajuNumber}} | SPPB: {{sppbNumber}}","{{/if}}","_{{timestamp}}_"].join("\n"),
  },
  customer: {
    order_new: ["✅ *PESANAN ANDA DITERIMA*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Terima kasih telah mempercayakan pengiriman Anda kepada CST Logistics.","","No. Order       : *{{orderNumber}}*","Tanggal         : {{tanggal}}","Jam             : {{jam}}","Status          : Menunggu Penawaran Harga","Rute            : {{route}}","Kategori Barang : {{commodity}}","Berat           : {{grossWeightDisplay}}","Volume          : {{volumeDisplay}}","Layanan         :","{{serviceList}}","Tgl Butuh       : {{requiredDate}}","━━━━━━━━━━━━━━━━━━","Tim kami sedang memproses permintaan Anda dan akan segera mengirimkan *penawaran harga terbaik* untuk Anda.","","📞 Jakarta: (021) 6241234 | Tangerang: (021) 5591234","","_Dikirim: {{timestamp}}_"].join("\n"),
    customer_approval: ["✅ *PENAWARAN SIAP — CST LOGISTICS*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Penawaran untuk order *{{orderNumber}}* telah siap.","No. RFQ    : {{rfqNumber}}","Layanan    : {{shipmentType}}","Rute       : {{route}}","💰 Harga   : *{{sellingPrice}}*","ETA        : {{etaFinal}}","Valid s/d  : {{validUntil}}","","Silakan review dan konfirmasi melalui link berikut:","🔗 {{customerApprovalLink}}","","Penawaran berlaku 24 jam.","Terima kasih 🙏","_CST Logistics_"].join("\n"),
    customer_options: ["✅ *PENAWARAN {{shipmentType}} — CST Logistics*","📦 Order: {{orderNumber}}","📍 {{route}}","{{pickupInfo}}","━━━━━━━━━━━━━━","{{optionSummary}}","━━━━━━━━━━━━━━","👉 Pilih opsi Anda:","{{optionUrl}}","_{{timestamp}}_"].join("\n"),
    operational_update: ["{{statusEmoji}} *Update Status Pengiriman*","","No. Order: *{{orderNumber}}*","Customer: {{customerDisplay}}","Status: *{{statusLabel}}*","","CST Logistics — Terima kasih telah menggunakan layanan kami."].join("\n"),
    customer_approved: ["🎉 *TERIMA KASIH TELAH MENGKONFIRMASI!*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Penawaran order *{{orderNumber}}* telah diterima.","Tim operasional kami sedang memprosesnya.","","📞 Pertanyaan: (021) 6241234","_Dikirim: {{timestamp}}_"].join("\n"),
    so_created: ["📑 *SALES ORDER TERKONFIRMASI — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Pesanan Anda telah resmi dikonfirmasi!","","💰 Harga: {{sellingPrice}}","Rute: {{route}}","","Tim kami akan segera memproses pengiriman.","Terima kasih 🙏","_Dikirim: {{timestamp}}_"].join("\n"),
    driver_assigned: ["🚚 *DRIVER DITUGASKAN — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Driver untuk order *{{orderNumber}}* telah ditugaskan:","","{{#if trucking}}","👤 Driver: {{driverName}}","📞 HP: {{driverPhone}}","🚛 Kendaraan: {{vehicleType}}","🔢 No. Plat: {{plateNumber}}","{{/if}}","","Driver akan segera menghubungi Anda.","Terima kasih 🙏","_Dikirim: {{timestamp}}_"].join("\n"),
    shipment_update: ["📦 *UPDATE PENGIRIMAN — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Update status pengiriman order *{{orderNumber}}*:","Rute: {{route}}","","{{#if freight_sea}}","🚢 Kapal: {{vessel}} / Voyage: {{voyage}}","📦 Container: {{containerNumber}}","📃 BL No: {{blNumber}}","{{/if}}","","{{#if freight_air}}","✈️ Airline: {{airline}}","📋 AWB: {{awbNumber}}","🛫 Flight: {{flightNumber}}","{{/if}}","","Terima kasih 🙏","_Dikirim: {{timestamp}}_"].join("\n"),
    customs_update: ["🏛️ *UPDATE KEPABEANAN — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Update status kepabeanan order *{{orderNumber}}*:","","{{#if ppjk}}","📋 No. Aju: {{ajuNumber}}","📄 BC Type: {{bcType}}","✅ SPPB: {{sppbNumber}}","{{/if}}","","Terima kasih 🙏"].join("\n"),
    delivery_completed: ["🏁 *PENGIRIMAN SELESAI — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Halo *{{customerName}}*,","","Pengiriman order *{{orderNumber}}* telah selesai! ✅","Rute: {{route}}","","Terima kasih telah menggunakan CST Logistics!","","📞 Feedback: (021) 6241234","_Dikirim: {{timestamp}}_"].join("\n"),
  },
  product_order_status: {
    admin_personal: [
      "🔔 *[UPDATE STATUS PRODUK]*",
      "No. Order : {{orderNumber}}",
      "Customer  : {{customerName}}",
      "HP        : {{phone}}",
      "Status    : *{{statusLabel}}*",
      "_{{timestamp}}_",
    ].join("\n"),
    admin_group: [
      "🔔 *[STATUS ORDER PRODUK DIPERBARUI]*",
      "No. Order : {{orderNumber}} | Customer: {{customerName}}",
      "Status    : *{{statusLabel}}*",
      "_{{timestamp}}_",
    ].join("\n"),
    customer: [
      "📦 *Update Status Pesanan Anda*",
      "No. Order: {{orderNumber}}",
      "Customer: {{customerName}}",
      "Status: *{{statusLabel}}*",
      "",
      "Terima kasih telah berbelanja di CST Logistics. Hubungi kami jika ada pertanyaan. 🙏",
    ].join("\n"),
  },
  product_order: {
    admin_personal: [
      "🛒 *PESANAN PRODUK BARU*",
      "━━━━━━━━━━━━━━━━━━",
      "No. Order   : `{{orderNumber}}`",
      "Customer    : {{customerName}}",
      "Email       : {{email}}",
      "HP          : {{phone}}",
      "Alamat      : {{shippingAddress}}",
      "Produk      :",
      "{{itemList}}",
      "Total       : Rp {{grandTotal}}",
      "Catatan     : {{notes}}",
      "━━━━━━━━━━━━━━━━━━",
      "🔗 Lihat di BizPortal:",
      "{{orderUrl}}",
      "",
      "📋 *Form vendor (forward ke vendor):*",
      "{{vendorFormUrl}}",
      "",
      "_Dikirim: {{timestamp}}_",
    ].join("\n"),
    admin_group: [
      "🛒 *[PESANAN PRODUK] {{orderNumber}}*",
      "━━━━━━━━━━━━━━━━━━",
      "👤 Customer : *{{customerName}}*",
      "📞 HP       : {{phone}}",
      "📧 Email    : {{email}}",
      "📦 Produk   :",
      "{{itemList}}",
      "💰 Total    : *Rp {{grandTotal}}*",
      "Catatan     : {{notes}}",
      "━━━━━━━━━━━━━━━━━━",
      "📋 Form vendor → {{vendorFormUrl}}",
      "",
      "_Dikirim: {{timestamp}}_",
    ].join("\n"),
    customer: [
      "✅ *Pesanan Anda Berhasil Diterima!*",
      "No. Order: *{{orderNumber}}*",
      "",
      "{{itemList}}",
      "",
      "Total: Rp {{grandTotal}}",
      "",
      "Tim kami akan segera menghubungi Anda untuk konfirmasi. Terima kasih! 🙏",
    ].join("\n"),
  },
  vendor: {
    order_new: ["📦 *PERMINTAAN ORDER BARU — CST LOGISTICS*","━━━━━━━━━━━━━━━━━━━━","Kepada Yth. *{{vendorName}}*,","","No. Order       : *{{orderNumber}}*","Tanggal         : {{tanggal}}","Jenis           : {{shipmentType}}","Rute            : {{route}}","Kategori Barang : {{commodity}}","Deskripsi       : {{cargoDescription}}","Berat           : {{grossWeightDisplay}}","Volume          : {{volumeDisplay}}","Jumlah Koli     : {{jumlahKoliDisplay}}","Tgl Butuh       : {{requiredDate}}","{{#if trucking}}","🚛 Jenis Kendaraan: {{vehicleType}}","📅 Jadwal Pickup  : {{pickupSchedule}}","💰 Contract Rate  : {{contractRate}}","{{/if}}","Layanan         :","{{serviceList}}","Catatan         : {{notes}}","━━━━━━━━━━━━━━━━━━━━","🔗 *Aksi Cepat (klik link):*","✅ Terima  → {{responseUrl}}?action=accept","❌ Tolak   → {{responseUrl}}?action=reject","💬 Form    → {{responseUrl}}","","✏️ *Atau balas WA dengan format:*","📌 Harga: `{{orderNumber}} [HARGA] [TGL_PICKUP]`","📌 Terima: `TERIMA {{orderNumber}}`","📌 Tolak:  `TOLAK {{orderNumber}}`","","Terima kasih 🙏","_Dikirim: {{timestamp}}_"].join("\n"),
    vendor_request: ["📦 *PERMINTAAN PENAWARAN VENDOR*","━━━━━━━━━━━━━━━━━━","Kepada Yth. *{{vendorName}}*,","","No. RFQ    : *{{rfqNumber}}*","No. Order  : {{orderNumber}}","Tanggal    : {{tanggal}}","Jam        : {{jam}}","Jenis      : {{shipmentType}}","Rute       : {{route}}","Komoditi   : {{commodity}}","Deskripsi  : {{cargoDescription}}","Berat      : {{grossWeightDisplay}}","Volume     : {{volumeDisplay}}","Tgl Butuh  : {{requiredDate}}","Catatan    : {{notes}}","","📝 Silakan isi penawaran melalui link berikut:","","🔗 *[ ISI PENAWARAN VENDOR ]*","👉 {{vendorMiniFormLink}}","","━━━━━━━━━━━━━━━━━━","Terima kasih atas kerja sama Anda 🙏","_CST Logistics_"].join("\n"),
    task_link: ["🚚 *Tugas Order Baru — CST Logistics*","","Order: {{orderNumber}}","Rute: {{route}}","Keterangan: {{label}}","","Silakan buka link berikut untuk konfirmasi dan update status:","{{taskUrl}}","_{{timestamp}}_"].join("\n"),
    vendor_revision: ["↩️ *REVISI PENAWARAN — {{orderNumber}}*","━━━━━━━━━━━━━━━━━━","Kepada Yth. *{{vendorName}}*,","","Kami memerlukan revisi harga untuk order *{{orderNumber}}*.","Harga saat ini: {{vendorPrice}}","","Mohon kirim penawaran terbaik Anda kembali:","🔗 {{vendorMiniFormLink}}","","Terima kasih 🙏"].join("\n"),
    op_request: ["⚙️ *KONFIRMASI OPERASIONAL — CST LOGISTICS*","━━━━━━━━━━━━━━━━━━","Kepada Yth. *{{vendorName}}*,","","Customer telah menyetujui penawaran untuk order *{{orderNumber}}*.","Mohon lengkapi data operasional:","","🔗 {{operationalFormLink}}","","{{#if trucking}}","Data dibutuhkan: Driver, No. Plat, jadwal pickup.","{{/if}}","","{{#if freight_sea}}","Data dibutuhkan: Vessel, Voyage, ETA/ETD, BL.","{{/if}}","","{{#if freight_air}}","Data dibutuhkan: Airline, AWB, jadwal penerbangan.","{{/if}}","","{{#if ppjk}}","Data dibutuhkan: No. Aju, BC type, SPPB.","{{/if}}","","Terima kasih atas kerjasamanya 🙏"].join("\n"),
    vendor_submit_confirm: [
      "Halo *{{picLabel}}* dari *{{vendorLabel}}*,",
      "",
      "Terima kasih! Penawaran Anda telah kami terima dan akan segera diproses oleh tim CST Logistics.",
      "",
      "Order Ref: *{{orderNumber}}*",
      "",
      "_Pesan ini dikirim otomatis, mohon tidak dibalas._",
    ].join("\n"),
    vendor_rfq_forward: [
      "Halo *{{vendorLabel}}*,",
      "",
      "Anda menerima permintaan penawaran (RFQ) dari *CST Logistics*.",
      "",
      "📌 *Ref: {{rfqRef}}*",
      "👤 Customer: {{customerName}}",
      "🚚 Layanan: {{serviceNeeded}}",
      "📍 Rute: {{route}}",
      "⚖️ Berat/Volume: {{weightVolume}}",
      "📦 Barang: {{cargoDesc}}",
      "📅 Target Pengiriman: {{targetDeliveryDate}}",
      "⏰ *Batas Penawaran: {{quoteDeadline}}*",
      "",
      "📝 Pesan dari CST: {{notesToVendor}}",
      "",
      "Mohon submit penawaran Anda melalui link berikut:",
      "{{vendorFormUrl}}",
      "",
      "_Pesan ini dikirim otomatis oleh sistem CST Logistics._",
    ].join("\n"),
    revision_fallback: [
      "Halo *{{vendorName}}*,",
      "",
      "Kami mohon revisi harga penawaran Anda{{orderRef}}.",
      "",
      "Alasan: {{reason}}",
      "",
      "Silakan update penawaran melalui:",
      "{{vendorFormUrl}}",
    ].join("\n"),
  },
  admin_personal_extra: {
    vendor_submission_summary: [
      "📋 *Submission Form Vendor*",
      "Vendor: *{{vendorLabel}}*",
      "PIC: {{picLabel}} · {{contactPhone}}",
      "Order: {{orderNumber}}",
      "Service: {{serviceLabel}}",
      "Harga: {{priceStr}}",
      "Status: {{statusStr}}",
      "_{{timestamp}}_",
    ].join("\n"),
    rfq_vendor_recap: [
      "🔔 *Update Penawaran Vendor*",
      "",
      "RFQ: {{rfqNumber}}",
      "Layanan: {{shipmentType}}",
      "Rute: {{route}}",
      "",
      "{{vendorListWithHeader}}",
      "{{waitingListWithHeader}}",
      "🔗 Bandingkan & pilih vendor:",
      "{{compareLink}}",
      "_{{timestamp}}_",
    ].join("\n"),
    customer_rejection: [
      "❌ *Customer Tolak Penawaran*",
      "Order: {{orderNumber}}",
      "Customer: {{customerName}}",
      "Catatan: {{notes}}",
    ].join("\n"),
    op_confirm_submitted: [
      "🚚 *Data Operasional Vendor*",
      "Order: {{orderNumber}}",
      "Vendor: *{{vendorName}}*",
      "Service: {{serviceLabel}}",
      "Status: Data operasional sudah diisi.",
    ].join("\n"),
    customer_rfq_response: [
      "{{responseEmoji}} *Customer {{responseLabel}} Penawaran*",
      "",
      "👤 Customer: *{{customerName}}*",
      "📄 Order: *{{orderNumber}}*",
      "🚚 {{shipmentType}}: {{route}}",
      "💰 Penawaran: {{quotedPrice}}",
      "📝 Catatan: {{notes}}",
      "",
      "Silakan cek BizPortal › RFQ untuk tindak lanjut.",
    ].join("\n"),
  },
} as const;

async function notifyAdmin(order: LogisticOrderData): Promise<void> {
  const rows: [string, string][] = [
    ["No. Order", `<strong>${order.orderNumber}</strong>`],
    ["Customer", `${order.customerName}${order.companyName ? ` (${order.companyName})` : ""}`],
    ["Email", order.email],
    ["HP", order.phone],
    ["Jenis", order.shipmentType],
    ["Rute", `${order.origin} → ${order.destination}`],
    ...(order.commodity ? [["Komoditi", order.commodity] as [string, string]] : []),
    ...(order.cargoDescription ? [["Deskripsi", order.cargoDescription] as [string, string]] : []),
    ...(order.grossWeight ? [["Berat", `${order.grossWeight} kg`] as [string, string]] : []),
    ...(order.volumeCbm ? [["Volume", `${order.volumeCbm} CBM`] as [string, string]] : []),
    ["Layanan", order.serviceList.replace(/\n/g, "<br>")],
    ["Total Est.", `Rp ${formatRupiah(order.grandTotal)}`],
    ...(order.requiredDate ? [["Tgl Butuh", order.requiredDate] as [string, string]] : []),
    ...(order.notes ? [["Catatan", order.notes] as [string, string]] : []),
  ];

  // Generate admin review link upfront — used in both WA and email
  const adminReviewUrl = await createAdminReviewLink(order.id).catch(() => "");

  const [adminWa, tplAdminPersonal, tplAdminGroup] = await Promise.all([
    getAdminWa(),
    getWaTemplateConfig("admin_personal", "order_new", DEFAULT_TPL.admin_personal.order_new),
    getWaTemplateConfig("admin_group", "order_new", DEFAULT_TPL.admin_group.order_new),
  ]);
  if (adminWa) {
    logger.info({ phone: adminWa, orderNumber: order.orderNumber }, "Sending admin WA notification");
    let adminActionShortUrl: string | undefined;
    if (order.publicRfqToken) {
      const domain = getPreferredDomain() || "cstlogistic.co.id";
      const longUrl = `https://${domain}/admin-action/${order.publicRfqToken}`;
      adminActionShortUrl = await generateShortLink(longUrl, {
        context: "admin_action",
        refType: "order",
        refId: order.orderNumber,
      }).catch((err: unknown) => {
        logger.warn({ err }, "admin WA: failed to generate short link, using long URL");
        return longUrl;
      });
    }
    sendWhatsApp(adminWa, buildAdminWaMessage(order, tplAdminPersonal, adminActionShortUrl)).catch((err: unknown) =>
      logger.error({ err }, "WA admin notification failed")
    );
  } else {
    logger.warn("Admin WA target not configured — skipping (set FONNTE_ADMIN_WA or configure via admin panel)");
  }

  // Send to admin WhatsApp group if configured
  const adminGroupWa = await getAdminGroupWa();
  if (adminGroupWa) {
    logger.info({ groupId: adminGroupWa, orderNumber: order.orderNumber }, "Sending group WA notification");
    let groupActionUrl: string | undefined;
    if (order.publicRfqToken) {
      const domain = getPreferredDomain() || "cstlogistic.co.id";
      const longUrl = `https://${domain}/admin-action/${order.publicRfqToken}`;
      groupActionUrl = await generateShortLink(longUrl, {
        context: "admin_action",
        refType: "order",
        refId: order.orderNumber,
      }).catch(() => longUrl);
    }
    sendWhatsApp(adminGroupWa, buildAdminGroupWaMessage(order, tplAdminGroup, groupActionUrl)).catch((err: unknown) =>
      logger.error({ err }, "WA group notification failed")
    );
  } else {
    logger.info("Admin WA group not configured — skipping (set FONNTE_ADMIN_GROUP_ID or configure via admin panel)");
  }

  if (isSmtpConfigured()) {
    logger.info({ to: ADMIN_EMAIL, orderNumber: order.orderNumber }, "Sending admin email notification");
    const emailDomain = getPreferredDomain() || "cstlogistic.co.id";
    const reviewCta = adminReviewUrl
      ? `Tinjau dan proses order tanpa login: <a href="${adminReviewUrl}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#1e40af;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">🚀 Review &amp; Blast Vendor</a>`
      : `Login ke sistem: <a href="https://${emailDomain}/logistic-order">https://${emailDomain}/logistic-order</a>`;
    sendMail({
      to: ADMIN_EMAIL,
      subject: `[ORDER BARU] ${order.orderNumber} — ${order.customerName}`,
      html: buildEmailHtml(
        "Order Logistik Baru Masuk",
        `Order baru telah diterima dari <strong>${order.customerName}</strong>. Silakan tinjau dan proses.`,
        rows,
        reviewCta
      ),
      text:
        `ORDER BARU: ${order.orderNumber}\n` +
        `Customer: ${order.customerName} (${order.companyName})\n` +
        `Rute: ${order.origin} → ${order.destination}\n` +
        `Jenis: ${order.shipmentType}\n` +
        `Total: Rp ${formatRupiah(order.grandTotal)}` +
        (adminReviewUrl ? `\nReview & Blast Vendor: ${adminReviewUrl}` : ""),
    })
      .then(() => logger.info({ to: ADMIN_EMAIL, orderNumber: order.orderNumber }, "Admin email sent successfully"))
      .catch((err: unknown) => logger.error({ err, to: ADMIN_EMAIL }, "Email admin notification failed"));
  } else {
    logger.warn("SMTP not configured — skipping admin email");
  }
}

async function notifyVendors(order: LogisticOrderData): Promise<void> {
  // Skip vendor blast for product and service orders — tidak butuh vendor logistik
  if (order.orderType === "product" || order.orderType === "service") {
    logger.info({ orderNumber: order.orderNumber, orderType: order.orderType }, "notifyVendors: skipping vendor notification for non-shipment order type");
    return;
  }
  // Guard: skip if shipmentType is empty — ilike('%%') would match ALL vendors
  if (!order.shipmentType || !order.shipmentType.trim()) {
    logger.warn({ orderNumber: order.orderNumber }, "notifyVendors: shipmentType is empty — skipping vendor notification to prevent all-vendor spam");
    return;
  }

  const isTrucking = order.shipmentType?.toLowerCase().includes("trucking");

  // Only notify vendors who explicitly have a matching serviceType.
  // Vendors with serviceType = null are purchase-only suppliers and must NOT receive logistics notifications.
  const vendors = await db
    .select()
    .from(suppliersTable)
    .where(
      and(
        eq(suppliersTable.isActive, true),
        ilike(suppliersTable.serviceType, `%${order.shipmentType}%`)
      )
    );

  logger.info(
    { shipmentType: order.shipmentType, candidateCount: vendors.length, vendors: vendors.map((v) => ({ id: v.id, name: v.name, serviceType: v.serviceType, hasPhone: !!v.phone })) },
    "Vendor candidates for order notification"
  );

  const eligible = vendors.filter((v) => v.contactEmail || v.phone);
  if (eligible.length === 0) {
    logger.info({ shipmentType: order.shipmentType }, "No vendors with contact info found for order type");
    return;
  }

  const rows: [string, string][] = [
    ["No. Order", `<strong>${order.orderNumber}</strong>`],
    ["Jenis", order.shipmentType],
    ["Rute", `${order.origin} → ${order.destination}`],
    ...(order.commodity ? [["Komoditi", order.commodity] as [string, string]] : []),
    ...(order.cargoDescription ? [["Deskripsi", order.cargoDescription] as [string, string]] : []),
    ...(order.grossWeight ? [["Berat", `${order.grossWeight} kg`] as [string, string]] : []),
    ...(order.volumeCbm ? [["Volume", `${order.volumeCbm} CBM`] as [string, string]] : []),
    ...(order.vehicleType ? [["Vehicle Type", order.vehicleType] as [string, string]] : []),
    ["Layanan", order.serviceList.replace(/\n/g, "<br>")],
    ...(order.requiredDate ? [["Tgl Pickup", formatISODate(order.requiredDate)] as [string, string]] : []),
    ...(order.notes ? [["Catatan", order.notes] as [string, string]] : []),
  ];

  for (const vendor of eligible) {
    // Fetch vendor catalog price (for trucking: match by vehicle type name)
    let contractRate: number | null = null;
    if (isTrucking) {
      const catalogItems = await db
        .select()
        .from(vendorCatalogItemsTable)
        .where(and(eq(vendorCatalogItemsTable.vendorId, vendor.id), eq(vendorCatalogItemsTable.isActive, true)));
      const match = order.vehicleType
        ? catalogItems.find((c) => c.name.toLowerCase().includes(order.vehicleType!.toLowerCase()))
        : null;
      contractRate = match
        ? Number(match.priceBase)
        : catalogItems[0] ? Number(catalogItems[0].priceBase) : null;
    }

    if (vendor.phone) {
      const longResponseUrl = getVendorResponseUrl(order.orderNumber);
      const responseUrl = isTrucking
        ? await generateShortLink(longResponseUrl, { context: "vendor_response", refType: "order", refId: order.orderNumber })
        : longResponseUrl;
      const vendorTpl = await getWaTemplateConfig("vendor", "order_new", DEFAULT_TPL.vendor.order_new);
      const pickupSchedule = buildPickupSchedule(order);
      const contractRateStr = contractRate ? `Rp ${Math.round(contractRate).toLocaleString("id-ID")}` : null;
      const msg = buildVendorWaMessage(order, vendor.name, vendorTpl, {
        pickupSchedule: isTrucking ? pickupSchedule : null,
        contractRate: isTrucking ? contractRateStr : null,
      });
      sendWhatsApp(vendor.phone, msg).catch((err: unknown) =>
        logger.error({ err, vendorId: vendor.id }, "WA vendor notification failed")
      );
    }

    if (vendor.contactEmail && isSmtpConfigured()) {
      const draftReplyHtml = isTrucking
        ? `<div style="margin-top:24px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:16px 20px">` +
          `<p style="margin:0 0 12px;font-weight:700;color:#0369a1;font-size:14px">📋 Response Form — Isi dan Balas Email Ini</p>` +
          `<pre style="background:#1e293b;color:#e2e8f0;padding:10px 14px;border-radius:4px;font-size:13px;margin:0">` +
          `Status: READY\nEstimated Pickup Time: \nDriver Name: \nDriver Phone: \nPlate Number: \nUnit Type: \nNotes: ` +
          `</pre></div>`
        : `<div style="margin-top:24px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:16px 20px">` +
          `<p style="margin:0 0 12px;font-weight:700;color:#0369a1;font-size:14px">✏️ Draft Balasan — Tinggal Copy, Isi Harga, Lalu Balas Email Ini</p>` +
          `<p style="margin:0 0 8px;color:#374151;font-size:13px"><strong>Opsi 1 — Kirim Penawaran Harga:</strong></p>` +
          `<pre style="background:#1e293b;color:#e2e8f0;padding:10px 14px;border-radius:4px;font-size:13px;margin:0 0 12px">${order.orderNumber} [HARGA] [TGL_PICKUP] [TGL_KIRIM]\n\nContoh:\n${order.orderNumber} 5500000 15-Mei 20-Mei</pre>` +
          `<p style="margin:0 0 8px;color:#374151;font-size:13px"><strong>Opsi 2 — Terima Pesanan:</strong></p>` +
          `<pre style="background:#1e293b;color:#e2e8f0;padding:10px 14px;border-radius:4px;font-size:13px;margin:0 0 12px">TERIMA ${order.orderNumber}</pre>` +
          `<p style="margin:0 0 8px;color:#374151;font-size:13px"><strong>Opsi 3 — Tolak Pesanan:</strong></p>` +
          `<pre style="background:#1e293b;color:#e2e8f0;padding:10px 14px;border-radius:4px;font-size:13px;margin:0">TOLAK ${order.orderNumber}</pre>` +
          `</div>`;

      sendMail({
        to: vendor.contactEmail,
        subject: isTrucking
          ? `[TRUCKING REQUEST] ${order.orderNumber} — ${order.origin} → ${order.destination}`
          : `[PERMINTAAN ORDER] ${order.orderNumber} — ${order.shipmentType}`,
        html: buildEmailHtml(
          isTrucking ? "Trucking Request Form" : "Permintaan Order Baru dari CST Logistics",
          `Kepada Yth. <strong>${vendor.name}</strong>,<br><br>${isTrucking ? "Ada permintaan trucking baru. Mohon lengkapi form di bawah dan balas email ini." : "Anda mendapat permintaan pengiriman baru dari CST Logistics. Silakan balas email ini dengan salah satu format di bawah."}`,
          rows,
          isTrucking ? "Balas email ini dengan form response yang sudah diisi." : "Balas email ini langsung dengan format penawaran di bawah ini."
        ).replace(
          `</td></tr>\n    </table>\n  </td></tr>`,
          `${draftReplyHtml}</td></tr>\n    </table>\n  </td></tr>`
        ),
        text: isTrucking
          ? `TRUCKING REQUEST: ${order.orderNumber}\nRute: ${order.origin} → ${order.destination}\n` +
            (order.vehicleType ? `Vehicle: ${order.vehicleType}\n` : ``) +
            (contractRate ? `Contract Rate: Rp ${Math.round(contractRate).toLocaleString("id-ID")}\n` : ``) +
            `\n=== RESPONSE FORM ===\nStatus: READY\nEstimated Pickup Time:\nDriver Name:\nDriver Phone:\nPlate Number:\nUnit Type:\nNotes:`
          : `PERMINTAAN ORDER: ${order.orderNumber}\nJenis: ${order.shipmentType}\nRute: ${order.origin} → ${order.destination}\n\n` +
            `Opsi 1 - Kirim Penawaran Harga:\n${order.orderNumber} [HARGA] [TGL_PICKUP] [TGL_KIRIM]\n` +
            `Opsi 2 - Terima Pesanan:\nTERIMA ${order.orderNumber}\n` +
            `Opsi 3 - Tolak Pesanan:\nTOLAK ${order.orderNumber}`,
      }).catch((err: unknown) => logger.error({ err, vendorId: vendor.id }, "Email vendor notification failed"));
    } else if (vendor.contactEmail) {
      logger.warn({ vendorId: vendor.id }, "SMTP not configured — skipping vendor email");
    }
  }
}

async function notifyCustomer(order: LogisticOrderData): Promise<void> {
  if (order.phone) {
    const customerTpl = await getWaTemplateConfig("customer", "order_new", DEFAULT_TPL.customer.order_new);
    sendWhatsApp(order.phone, buildCustomerWaMessage(order, customerTpl)).catch((err: unknown) =>
      logger.error({ err, phone: order.phone }, "WA customer notification failed")
    );
  }

  const rows: [string, string][] = [
    ["No. Order", `<strong>${order.orderNumber}</strong>`],
    ["Status", "<span style='color:#d97706;font-weight:600'>Menunggu Penawaran Harga</span>"],
    ["Jenis", order.shipmentType],
    ["Rute", `${order.origin} → ${order.destination}`],
    ...(order.commodity ? [["Komoditi", order.commodity] as [string, string]] : []),
    ...(order.grossWeight ? [["Berat", `${order.grossWeight} kg`] as [string, string]] : []),
    ...(order.volumeCbm ? [["Volume", `${order.volumeCbm} CBM`] as [string, string]] : []),
    ["Layanan", order.serviceList.replace(/\n/g, "<br>")],
    ...(order.requiredDate ? [["Tgl Butuh", order.requiredDate] as [string, string]] : []),
  ];

  if (isSmtpConfigured()) {
    sendMail({
      to: order.email,
      subject: `Permintaan Diterima — ${order.orderNumber}`,
      html: buildEmailHtml(
        "Permintaan Pengiriman Diterima",
        `Halo <strong>${order.customerName}</strong>,<br><br>Terima kasih telah mempercayakan pengiriman Anda kepada CST Logistics. Tim kami sedang memproses permintaan Anda dan akan segera mengirimkan penawaran harga terbaik untuk Anda.`,
        rows,
        "Gunakan nomor order di atas untuk tracking. Hubungi kami di: <strong>(021) 6241234</strong>"
      ),
      text:
        `Permintaan Diterima!\n` +
        `No. Order: ${order.orderNumber}\n` +
        `Status: Menunggu Penawaran Harga\n` +
        `Rute: ${order.origin} → ${order.destination}\n\n` +
        `Tim kami sedang memproses permintaan Anda dan akan segera mengirimkan penawaran harga.`,
    }).then(() => logger.info({ email: order.email, orderNumber: order.orderNumber }, "Customer email sent successfully"))
      .catch((err: unknown) => logger.error({ err, email: order.email }, "Email customer notification failed"));
  } else {
    logger.warn("SMTP not configured — skipping customer email");
  }
}

export async function sendLogisticOrderNotification(order: LogisticOrderData): Promise<void> {
  await Promise.allSettled([
    notifyAdmin(order),
    notifyCustomer(order),
  ]);
}

function buildExpiredLinkRefreshMessage(refId: string, newShortUrl: string): string {
  return (
    `🔄 *LINK ADMIN DIPERBARUI OTOMATIS*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Link *Review & Blast Vendor* untuk order \`${refId}\` sudah kadaluarsa.\n\n` +
    `Link baru telah dibuat secara otomatis (berlaku 72 jam):\n` +
    `🚀 Review & Blast Vendor → ${newShortUrl}\n\n` +
    `_Dikirim: ${nowWIB()}_`
  );
}

/**
 * Kirim notifikasi WhatsApp ke admin (personal + group) bahwa link admin
 * yang expired sudah diperbarui otomatis dengan link baru.
 */
export async function sendAdminLinkRefreshedNotification(
  refId: string,
  newShortUrl: string,
): Promise<void> {
  const msg = buildExpiredLinkRefreshMessage(refId, newShortUrl);
  const [adminWa, adminGroupWa] = await Promise.all([getAdminWa(), getAdminGroupWa()]);
  if (adminWa) {
    sendWhatsApp(adminWa, msg).catch((err: unknown) =>
      logger.error({ err }, "WA expired link refresh (admin) failed")
    );
  }
  if (adminGroupWa) {
    sendWhatsApp(adminGroupWa, msg).catch((err: unknown) =>
      logger.error({ err }, "WA expired link refresh (group) failed")
    );
  }
}

// ─── Workflow Notification Helpers ────────────────────────────────────────────

function renderWf(
  tplBody: string,
  order: LogisticOrderData,
  extras: Record<string, string | null | undefined> = {},
): string {
  const svcType = deriveServiceType(order.shipmentType, order.orderType);
  return renderTemplate(tplBody, buildOrderVars(order, extras), svcType);
}

// ── Vendor Request (kirim mini form link ke vendor untuk pengisian penawaran) ──
export async function sendVendorRequestNotification(
  order: LogisticOrderData,
  vendorName: string,
  vendorPhone: string,
  vendorMiniFormLink: string,
): Promise<void> {
  const tpl = await getWaTemplateConfig("vendor", "vendor_request", DEFAULT_TPL.vendor.vendor_request);
  const msg = renderWf(tpl, order, { vendorName, vendorPhone, vendorMiniFormLink });
  sendWhatsApp(vendorPhone, msg).catch((e: unknown) => logger.error({ e, vendorName }, "WA vendor_request failed"));
}

// ── Vendor Submission (admin notif saat vendor submit penawaran) ───────────────
export async function sendVendorSubmissionNotification(
  order: LogisticOrderData,
  vendorName: string,
  vendorPrice: string,
): Promise<void> {
  const [tplP, tplG] = await Promise.all([
    getWaTemplateConfig("admin_personal", "vendor_submission", DEFAULT_TPL.admin_personal.vendor_submission),
    getWaTemplateConfig("admin_group", "vendor_submission", DEFAULT_TPL.admin_group.vendor_submission),
  ]);
  const extras = { vendorName, vendorPrice };
  const [wa, group] = await Promise.all([getAdminWa(), getAdminGroupWa()]);
  if (wa) sendWhatsApp(wa, renderWf(tplP, order, extras)).catch((e: unknown) => logger.error({ e }, "WA vendor_submission (admin) failed"));
  if (group) sendWhatsApp(group, renderWf(tplG, order, extras)).catch((e: unknown) => logger.error({ e }, "WA vendor_submission (group) failed"));
}

// ── Vendor Revision (minta revisi harga ke vendor) ────────────────────────────
export async function sendVendorRevisionNotification(
  order: LogisticOrderData,
  vendorName: string,
  vendorPhone: string,
  vendorPrice: string,
  vendorMiniFormLink: string,
): Promise<void> {
  const tpl = await getWaTemplateConfig("vendor", "vendor_revision", DEFAULT_TPL.vendor.vendor_revision);
  const msg = renderWf(tpl, order, { vendorName, vendorPhone, vendorPrice, vendorMiniFormLink });
  sendWhatsApp(vendorPhone, msg).catch((e: unknown) => logger.error({ e, vendorName }, "WA vendor_revision failed"));
}

// ── Customer Approval (kirim link approval ke customer) ───────────────────────
export async function sendCustomerApprovalNotification(
  order: LogisticOrderData,
  sellingPrice: string,
  customerApprovalLink: string,
): Promise<void> {
  if (!order.phone) return;
  const tpl = await getWaTemplateConfig("customer", "customer_approval", DEFAULT_TPL.customer.customer_approval);
  const msg = renderWf(tpl, order, { sellingPrice, customerApprovalLink });
  sendWhatsApp(order.phone, msg).catch((e: unknown) => logger.error({ e }, "WA customer_approval failed"));
}

// ── Customer Approved (notif admin + customer saat customer menyetujui) ──────
export async function sendCustomerApprovedNotification(
  order: LogisticOrderData,
): Promise<void> {
  const [tplP, tplG, custTpl, wa, group] = await Promise.all([
    getWaTemplateConfig("admin_personal", "customer_approved", DEFAULT_TPL.admin_personal.customer_approved),
    getWaTemplateConfig("admin_group", "customer_approved", DEFAULT_TPL.admin_group.customer_approved),
    getWaTemplateConfig("customer", "customer_approved", DEFAULT_TPL.customer.customer_approved),
    getAdminWa(),
    getAdminGroupWa(),
  ]);
  if (wa) sendWhatsApp(wa, renderWf(tplP, order)).catch((e: unknown) => logger.error({ e }, "WA customer_approved (admin) failed"));
  if (group) sendWhatsApp(group, renderWf(tplG, order)).catch((e: unknown) => logger.error({ e }, "WA customer_approved (group) failed"));
  if (order.phone) sendWhatsApp(order.phone, renderWf(custTpl, order)).catch((e: unknown) => logger.error({ e }, "WA customer_approved (customer) failed"));
}

// ── SO Created (konfirmasi SO ke customer) ────────────────────────────────────
export async function sendSoCreatedNotification(
  order: LogisticOrderData,
  sellingPrice: string,
): Promise<void> {
  if (!order.phone) return;
  const tpl = await getWaTemplateConfig("customer", "so_created", DEFAULT_TPL.customer.so_created);
  const msg = renderWf(tpl, order, { sellingPrice });
  sendWhatsApp(order.phone, msg).catch((e: unknown) => logger.error({ e }, "WA so_created failed"));
}

// ── Op Request (kirim form konfirmasi operasional ke vendor) ──────────────────
export async function sendOpRequestNotification(
  order: LogisticOrderData,
  vendorName: string,
  vendorPhone: string,
  operationalFormLink: string,
): Promise<void> {
  const [vendorTpl, adminTpl, groupTpl, adminWa, adminGroupWa] = await Promise.all([
    getWaTemplateConfig("vendor", "op_request", DEFAULT_TPL.vendor.op_request),
    getWaTemplateConfig("admin_personal", "op_request", DEFAULT_TPL.admin_personal.op_request),
    getWaTemplateConfig("admin_group", "op_request", DEFAULT_TPL.admin_group.op_request),
    getAdminWa(),
    getAdminGroupWa(),
  ]);
  const extras = { vendorName, vendorPhone, operationalFormLink };
  sendWhatsApp(vendorPhone, renderWf(vendorTpl, order, extras)).catch((e: unknown) =>
    logger.error({ e, vendorName }, "WA op_request (vendor) failed"),
  );
  if (adminWa) {
    sendWhatsApp(adminWa, renderWf(adminTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA op_request (admin) failed"),
    );
  }
  if (adminGroupWa) {
    sendWhatsApp(adminGroupWa, renderWf(groupTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA op_request (group) failed"),
    );
  }
}

// ── Driver Assigned (notif customer + admin saat driver ditugaskan) ───────────
export async function sendDriverAssignedNotification(
  order: LogisticOrderData,
  driverName: string,
  driverPhone: string,
  plateNumber: string,
  vehicleType: string,
): Promise<void> {
  const [custTpl, adminTpl, groupTpl, adminWa, adminGroupWa] = await Promise.all([
    getWaTemplateConfig("customer", "driver_assigned", DEFAULT_TPL.customer.driver_assigned),
    getWaTemplateConfig("admin_personal", "driver_assigned", DEFAULT_TPL.admin_personal.driver_assigned),
    getWaTemplateConfig("admin_group", "driver_assigned", DEFAULT_TPL.admin_group.driver_assigned),
    getAdminWa(),
    getAdminGroupWa(),
  ]);
  const extras = { driverName, driverPhone, plateNumber, vehicleType };
  if (order.phone) {
    sendWhatsApp(order.phone, renderWf(custTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA driver_assigned (customer) failed"),
    );
  }
  if (adminWa) {
    sendWhatsApp(adminWa, renderWf(adminTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA driver_assigned (admin) failed"),
    );
  }
  if (adminGroupWa) {
    sendWhatsApp(adminGroupWa, renderWf(groupTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA driver_assigned (group) failed"),
    );
  }
}

// ── Shipment Update (update status pengiriman ke customer + admin) ────────────
export async function sendShipmentUpdateNotification(
  order: LogisticOrderData,
  extras: {
    vessel?: string; voyage?: string; containerNumber?: string; blNumber?: string;
    airline?: string; awbNumber?: string; flightNumber?: string;
  } = {},
): Promise<void> {
  const [custTpl, adminTpl, groupTpl, adminWa, adminGroupWa] = await Promise.all([
    getWaTemplateConfig("customer", "shipment_update", DEFAULT_TPL.customer.shipment_update),
    getWaTemplateConfig("admin_personal", "shipment_update", DEFAULT_TPL.admin_personal.shipment_update),
    getWaTemplateConfig("admin_group", "shipment_update", DEFAULT_TPL.admin_group.shipment_update),
    getAdminWa(),
    getAdminGroupWa(),
  ]);
  if (order.phone) {
    sendWhatsApp(order.phone, renderWf(custTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA shipment_update (customer) failed"),
    );
  }
  if (adminWa) {
    sendWhatsApp(adminWa, renderWf(adminTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA shipment_update (admin) failed"),
    );
  }
  if (adminGroupWa) {
    sendWhatsApp(adminGroupWa, renderWf(groupTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA shipment_update (group) failed"),
    );
  }
}

// ── Customs Update (update status kepabeanan ke customer + admin) ─────────────
export async function sendCustomsUpdateNotification(
  order: LogisticOrderData,
  extras: { ajuNumber?: string; bcType?: string; sppbNumber?: string } = {},
): Promise<void> {
  const [custTpl, adminTpl, groupTpl, adminWa, adminGroupWa] = await Promise.all([
    getWaTemplateConfig("customer", "customs_update", DEFAULT_TPL.customer.customs_update),
    getWaTemplateConfig("admin_personal", "customs_update", DEFAULT_TPL.admin_personal.customs_update),
    getWaTemplateConfig("admin_group", "customs_update", DEFAULT_TPL.admin_group.customs_update),
    getAdminWa(),
    getAdminGroupWa(),
  ]);
  if (order.phone) {
    sendWhatsApp(order.phone, renderWf(custTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA customs_update (customer) failed"),
    );
  }
  if (adminWa) {
    sendWhatsApp(adminWa, renderWf(adminTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA customs_update (admin) failed"),
    );
  }
  if (adminGroupWa) {
    sendWhatsApp(adminGroupWa, renderWf(groupTpl, order, extras)).catch((e: unknown) =>
      logger.error({ e }, "WA customs_update (group) failed"),
    );
  }
}

// ── Delivery Completed (notifikasi pengiriman selesai) ────────────────────────
export async function sendDeliveryCompletedNotification(
  order: LogisticOrderData,
): Promise<void> {
  const [custTpl, adminTpl, groupTpl, adminWa, adminGroupWa] = await Promise.all([
    getWaTemplateConfig("customer", "delivery_completed", DEFAULT_TPL.customer.delivery_completed),
    getWaTemplateConfig("admin_personal", "delivery_completed", DEFAULT_TPL.admin_personal.delivery_completed),
    getWaTemplateConfig("admin_group", "delivery_completed", DEFAULT_TPL.admin_group.delivery_completed),
    getAdminWa(),
    getAdminGroupWa(),
  ]);
  if (order.phone) {
    sendWhatsApp(order.phone, renderWf(custTpl, order)).catch((e: unknown) =>
      logger.error({ e }, "WA delivery_completed (customer) failed"),
    );
  }
  if (adminWa) {
    sendWhatsApp(adminWa, renderWf(adminTpl, order)).catch((e: unknown) =>
      logger.error({ e }, "WA delivery_completed (admin) failed"),
    );
  }
  if (adminGroupWa) {
    sendWhatsApp(adminGroupWa, renderWf(groupTpl, order)).catch((e: unknown) =>
      logger.error({ e }, "WA delivery_completed (group) failed"),
    );
  }
}

// ─── Product Order WA Notification ───────────────────────────────────────────

export interface ProductOrderItem {
  productName: string;
  qty: number;
  unit?: string | null;
  subtotal: number;
}

export interface ProductOrderData {
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string;
  shippingAddress: string;
  notes?: string | null;
  grandTotal: number;
  items: ProductOrderItem[];
  orderUrl?: string;
  vendorFormUrl?: string;
}

export interface ProductOrderStatusData {
  orderNumber: string;
  customerName: string;
  phone?: string | null;
  statusLabel: string;
}

export async function sendProductOrderStatusUpdateWa(order: ProductOrderStatusData): Promise<void> {
  const vars: Record<string, string | null | undefined> = {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    phone: order.phone ?? null,
    statusLabel: order.statusLabel,
    timestamp: nowWIB(),
  };

  const [tplAdminPersonal, tplAdminGroup, tplCustomer, adminWa, adminGroupWa] = await Promise.all([
    getWaTemplateConfig("admin_personal", "product_order_status_update", DEFAULT_TPL.product_order_status.admin_personal),
    getWaTemplateConfig("admin_group", "product_order_status_update", DEFAULT_TPL.product_order_status.admin_group),
    getWaTemplateConfig("customer", "product_order_status_update", DEFAULT_TPL.product_order_status.customer),
    getAdminWa(),
    getAdminGroupWa(),
  ]);

  if (adminWa) {
    sendWhatsApp(adminWa, renderTemplate(tplAdminPersonal, vars)).catch((err: unknown) =>
      logger.error({ err }, "WA product_order_status_update (admin) failed"),
    );
  }
  if (adminGroupWa) {
    sendWhatsApp(adminGroupWa, renderTemplate(tplAdminGroup, vars)).catch((err: unknown) =>
      logger.error({ err }, "WA product_order_status_update (admin_group) failed"),
    );
  }
  if (order.phone) {
    sendWhatsApp(order.phone, renderTemplate(tplCustomer, vars)).catch((err: unknown) =>
      logger.error({ err }, "WA product_order_status_update (customer) failed"),
    );
  }
}

export async function sendProductOrderWaNotification(order: ProductOrderData): Promise<void> {
  const itemList = order.items
    .map((i) => `• ${i.productName} × ${i.qty} (${i.unit ?? "pcs"}) — Rp ${formatRupiah(i.subtotal)}`)
    .join("\n");

  const vars: Record<string, string | null | undefined> = {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    email: order.email,
    phone: order.phone,
    shippingAddress: order.shippingAddress,
    itemList,
    grandTotal: formatRupiah(order.grandTotal),
    notes: order.notes ?? null,
    orderUrl: order.orderUrl ?? null,
    vendorFormUrl: order.vendorFormUrl ?? null,
    timestamp: nowWIB(),
  };

  const [tplAdminPersonal, tplAdminGroup, tplCustomer, adminWa, adminGroupWa] = await Promise.all([
    getWaTemplateConfig("admin_personal", "product_order_new", DEFAULT_TPL.product_order.admin_personal),
    getWaTemplateConfig("admin_group", "product_order_new", DEFAULT_TPL.product_order.admin_group),
    getWaTemplateConfig("customer", "product_order_new", DEFAULT_TPL.product_order.customer),
    getAdminWa(),
    getAdminGroupWa(),
  ]);

  if (adminWa) {
    sendWhatsApp(adminWa, renderTemplate(tplAdminPersonal, vars)).catch((err: unknown) =>
      logger.error({ err }, "WA product_order_new (admin) failed"),
    );
  }

  if (adminGroupWa) {
    sendWhatsApp(adminGroupWa, renderTemplate(tplAdminGroup, vars)).catch((err: unknown) =>
      logger.error({ err }, "WA product_order_new (admin_group) failed"),
    );
  }

  if (order.phone) {
    sendWhatsApp(order.phone, renderTemplate(tplCustomer, vars)).catch((err: unknown) =>
      logger.error({ err }, "WA product_order_new (customer) failed"),
    );
  }
}

// ── sendVendorSubmitConfirmNotification ────────────────────────────────────────
export async function sendVendorSubmitConfirmNotification(
  contactPhone: string,
  picLabel: string,
  vendorLabel: string,
  orderNumber: string | null,
  refToken: string,
): Promise<void> {
  const tpl = await getWaTemplateConfig("vendor", "vendor_submit_confirm", DEFAULT_TPL.vendor.vendor_submit_confirm);
  const msg = renderTemplate(tpl, {
    picLabel,
    vendorLabel,
    orderNumber: orderNumber ?? null,
    timestamp: nowWIB(),
  });
  sendWhatsApp(contactPhone, msg, {
    context: "vendor-mini-form-confirm",
    refType: "vendor_mini_form",
    refId: refToken,
  }).catch(() => {});
}

// ── sendVendorRfqForwardNotification ───────────────────────────────────────────
export async function sendVendorRfqForwardNotification(
  vendorPhone: string,
  vendorLabel: string,
  vars: {
    rfqRef?: string | null;
    customerName?: string | null;
    serviceNeeded?: string | null;
    origin?: string | null;
    destination?: string | null;
    weightVolume?: string | null;
    cargoDesc?: string | null;
    targetDeliveryDate?: string | null;
    quoteDeadline?: string | null;
    notesToVendor?: string | null;
    vendorFormUrl: string;
  },
  refToken: string,
): Promise<void> {
  const tpl = await getWaTemplateConfig("vendor", "vendor_rfq_forward", DEFAULT_TPL.vendor.vendor_rfq_forward);
  const route = (vars.origin && vars.destination) ? `${vars.origin} → ${vars.destination}` : null;
  const msg = renderTemplate(tpl, {
    vendorLabel,
    rfqRef: vars.rfqRef ?? null,
    customerName: vars.customerName ?? null,
    serviceNeeded: vars.serviceNeeded ?? null,
    route,
    weightVolume: vars.weightVolume ?? null,
    cargoDesc: vars.cargoDesc ?? null,
    targetDeliveryDate: vars.targetDeliveryDate ?? null,
    quoteDeadline: vars.quoteDeadline ?? null,
    notesToVendor: vars.notesToVendor ?? null,
    vendorFormUrl: vars.vendorFormUrl,
    timestamp: nowWIB(),
  });
  sendWhatsApp(vendorPhone, msg, {
    context: "admin-rfq-forward-vendor-notif",
    refType: "vendor_mini_form",
    refId: refToken,
  }).catch(() => {});
}

// ── sendVendorRevisionFallbackNotification ─────────────────────────────────────
export async function sendVendorRevisionFallbackNotification(
  vendorPhone: string,
  vendorName: string,
  orderNumber: string | null,
  reason: string | null,
  vendorFormUrl: string,
  refId: string,
): Promise<void> {
  const tpl = await getWaTemplateConfig("vendor", "revision_fallback", DEFAULT_TPL.vendor.revision_fallback);
  const orderRef = orderNumber ? ` untuk Order *${orderNumber}*` : "";
  const msg = renderTemplate(tpl, {
    vendorName,
    orderRef,
    reason: reason ?? null,
    vendorFormUrl,
    timestamp: nowWIB(),
  });
  sendWhatsApp(vendorPhone, msg, {
    context: "revision-request",
    refType: "vendor_mini_form",
    refId,
  }).catch(() => {});
}

// ── sendCustomerRejectionAdminNotification ─────────────────────────────────────
export async function sendCustomerRejectionAdminNotification(
  adminWa: string,
  vars: { orderNumber: string | null; customerName: string | null; notes: string | null },
  refToken: string,
): Promise<void> {
  const tpl = await getWaTemplateConfig("admin_personal", "customer_rejection", DEFAULT_TPL.admin_personal_extra.customer_rejection);
  const msg = renderTemplate(tpl, {
    orderNumber: vars.orderNumber ?? null,
    customerName: vars.customerName ?? null,
    notes: vars.notes ?? null,
  });
  sendWhatsApp(adminWa, msg, {
    context: "customer-approval",
    refType: "customer_approval",
    refId: refToken,
  }).catch(() => {});
}

// ── sendOpConfirmSubmittedNotification ─────────────────────────────────────────
export async function sendOpConfirmSubmittedNotification(
  adminWa: string,
  vars: { orderNumber: string | null; vendorName: string | null; serviceLabel: string },
  refToken: string,
): Promise<void> {
  const tpl = await getWaTemplateConfig("admin_personal", "op_confirm_submitted", DEFAULT_TPL.admin_personal_extra.op_confirm_submitted);
  const msg = renderTemplate(tpl, {
    orderNumber: vars.orderNumber ?? null,
    vendorName: vars.vendorName ?? null,
    serviceLabel: vars.serviceLabel,
  });
  sendWhatsApp(adminWa, msg, {
    context: "op-confirm",
    refType: "vendor_op_confirm",
    refId: refToken,
  }).catch(() => {});
}

// ── sendCustomerRfqResponseAdminNotification ───────────────────────────────────
export async function sendCustomerRfqResponseAdminNotification(
  adminWa: string,
  vars: {
    response: "approved" | "revision_requested" | "rejected";
    customerName: string;
    orderNumber: string;
    shipmentType: string;
    origin: string;
    destination: string;
    quotedPrice: string | null;
    notes: string | null;
  },
): Promise<void> {
  const tpl = await getWaTemplateConfig("admin_personal", "customer_rfq_response", DEFAULT_TPL.admin_personal_extra.customer_rfq_response);
  const emoji = vars.response === "approved" ? "✅" : vars.response === "revision_requested" ? "🔄" : "❌";
  const label = vars.response === "approved" ? "MENYETUJUI" :
    vars.response === "revision_requested" ? "MINTA REVISI" : "MENOLAK";
  const msg = renderTemplate(tpl, {
    responseEmoji: emoji,
    responseLabel: label,
    customerName: vars.customerName,
    orderNumber: vars.orderNumber,
    shipmentType: vars.shipmentType,
    route: `${vars.origin} → ${vars.destination}`,
    quotedPrice: vars.quotedPrice ?? null,
    notes: vars.notes ?? null,
    timestamp: nowWIB(),
  });
  sendWhatsApp(adminWa, msg).catch(() => {});
}

// ── sendVendorSubmissionSummaryNotification ────────────────────────────────────
export async function sendVendorSubmissionSummaryNotification(
  adminWa: string,
  vars: {
    vendorLabel: string;
    picLabel: string;
    contactPhone?: string | null;
    orderNumber?: string | null;
    serviceLabel: string;
    priceStr: string;
    statusStr: string;
  },
  refToken: string,
): Promise<void> {
  const tpl = await getWaTemplateConfig("admin_personal", "vendor_submission_summary", DEFAULT_TPL.admin_personal_extra.vendor_submission_summary);
  const msg = renderTemplate(tpl, {
    vendorLabel: vars.vendorLabel,
    picLabel: vars.picLabel,
    contactPhone: vars.contactPhone ?? null,
    orderNumber: vars.orderNumber ?? null,
    serviceLabel: vars.serviceLabel,
    priceStr: vars.priceStr,
    statusStr: vars.statusStr,
    timestamp: nowWIB(),
  });
  sendWhatsApp(adminWa, msg, {
    context: "vendor-mini-form-admin-notif",
    refType: "vendor_mini_form",
    refId: refToken,
  }).catch(() => {});
}

// ── getRfqVendorRecapTemplate ──────────────────────────────────────────────────
export async function getRfqVendorRecapTemplate(): Promise<string> {
  return getWaTemplateConfig("admin_personal", "rfq_vendor_recap", DEFAULT_TPL.admin_personal_extra.rfq_vendor_recap);
}
