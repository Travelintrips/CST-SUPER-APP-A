import { sendWhatsApp } from "./fonnte.js";
import { generateShortLink } from "./shortLink.js";
import { logger } from "./logger.js";

const TZ = "Asia/Jakarta";

function formatTanggal(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, day: "2-digit", month: "long", year: "numeric",
  }).format(date);
}

function formatJam(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date).replace(":", ".");
}

const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export interface VendorQuoteMessageInput {
  rfqNumber: string;
  orderNumber: string;
  vendorName: string;
  origin?: string;
  destination?: string;
  vehicleType?: string | null;
  commodity?: string | null;
  grossWeight?: number | null;
  volumeCbm?: number | null;
  requiredDate?: string | null;
  notes?: string | null;
  vendorBasePrice?: number | null;
  createdAt?: Date | string | null;
  jamOrder?: string | null;
  shortLinkUrl: string;
}

/**
 * Build a clean, modern mini-card WhatsApp message for vendor quote requests.
 * Falls back to short link (no interactive buttons since Fonnte doesn't expose
 * the WhatsApp Business interactive message API).
 */
export function generateVendorQuoteMessage(input: VendorQuoteMessageInput): string {
  const tgl = input.createdAt ? formatTanggal(input.createdAt) : "";
  const jam = input.jamOrder ?? (input.createdAt ? formatJam(input.createdAt) : "");

  const routeLine = input.origin && input.destination
    ? `📍 Rute       : ${input.origin} → ${input.destination}\n`
    : "";
  const vehicleLine = input.vehicleType ? `🚚 Unit       : ${input.vehicleType}\n` : "";
  const cargoLines = [
    input.commodity ? `📦 Komoditi   : ${input.commodity}\n` : "",
    input.grossWeight ? `⚖️  Berat      : ${input.grossWeight} kg\n` : "",
    input.volumeCbm ? `📐 Volume     : ${input.volumeCbm} CBM\n` : "",
    input.requiredDate ? `📅 Tgl Butuh  : ${input.requiredDate}\n` : "",
    input.notes ? `📝 Catatan    : ${input.notes}\n` : "",
  ].join("");

  const priceBlock = input.vendorBasePrice != null
    ? `\n💰 *Harga Vendor:*\n${fmtRp(input.vendorBasePrice)}\n`
    : "";

  return (
    `📦 *PERMINTAAN PENAWARAN VENDOR*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Kepada Yth. *${input.vendorName}*,\n\n` +
    `No. RFQ    : *${input.rfqNumber}*\n` +
    `No. Order  : ${input.orderNumber}\n` +
    (tgl ? `Tanggal    : ${tgl}\n` : "") +
    (jam ? `Jam        : ${jam}\n` : "") +
    routeLine +
    vehicleLine +
    cargoLines +
    priceBlock +
    `\n📝 Silakan isi harga & estimasi melalui tombol berikut.\n\n` +
    `🔗 *[ ISI PENAWARAN VENDOR ]*\n` +
    `👉 ${input.shortLinkUrl}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Terima kasih atas kerja sama Anda 🙏\n` +
    `_CST Logistics_`
  );
}

export interface SendVendorWhatsAppInput {
  vendorPhone: string;
  vendorName: string;
  vendorId: number;
  rfqNumber: string;
  orderId: number;
  orderNumber: string;
  longUrl: string;
  origin?: string;
  destination?: string;
  vehicleType?: string | null;
  commodity?: string | null;
  grossWeight?: number | null;
  volumeCbm?: number | null;
  requiredDate?: string | null;
  notes?: string | null;
  vendorBasePrice?: number | null;
  createdAt?: Date | string | null;
  jamOrder?: string | null;
}

/**
 * Reusable end-to-end helper:
 *   1. shortens the long vendor-quote URL into /q/<code>
 *   2. builds the modern mini-card message
 *   3. sends via Fonnte (with notification log)
 */
export async function sendVendorWhatsApp(input: SendVendorWhatsAppInput): Promise<void> {
  if (!input.vendorPhone?.trim()) {
    logger.warn({ vendorId: input.vendorId }, "sendVendorWhatsApp: empty phone, skip");
    return;
  }
  const shortLinkUrl = await generateShortLink(input.longUrl, {
    context: "vendor_quote",
    refType: "rfq",
    refId: input.rfqNumber,
  });
  const message = generateVendorQuoteMessage({
    ...input,
    shortLinkUrl,
  });
  await sendWhatsApp(input.vendorPhone, message, {
    context: "vendor_quote",
    refType: "rfq",
    refId: input.rfqNumber,
  });
}
