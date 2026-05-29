import { sendViaService as sendWhatsApp } from "./waTransport.js";
import { generateShortLink } from "./shortLink.js";
import { logger } from "./logger.js";
import { getWaTemplateConfig, renderTemplate, deriveServiceType } from "./orderNotification.js";

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

export interface VendorQuoteOrderItem {
  serviceName: string;
  category: string;
  subtotal?: number | null;
  quantity?: number | null;
  unit?: string | null;
  sellingUnitPrice?: number | null;
}

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
  orderItems?: VendorQuoteOrderItem[] | null;
  isTrucking?: boolean;
  orderType?: string | null;
}

/**
 * Build a clean, modern mini-card WhatsApp message for vendor quote requests.
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

  // Produk/layanan yang dipesan customer — tampilkan qty, harga jual/unit, total
  const itemsBlock = input.orderItems && input.orderItems.length > 0
    ? `\n🛒 *Produk Dipesan:*\n` +
      input.orderItems.map((it) => {
        const qty = it.quantity ?? 1;
        const unit = it.unit ?? "Unit";
        const lines: string[] = [`   • ${it.serviceName}`];
        lines.push(`     Qty: ${qty} ${unit}`);
        if (it.sellingUnitPrice != null && it.sellingUnitPrice > 0) {
          lines.push(`     Harga Jual/Unit: ${fmtRp(it.sellingUnitPrice)}`);
          lines.push(`     Total: ${fmtRp(it.sellingUnitPrice * qty)}`);
        } else if (it.subtotal != null && it.subtotal > 0) {
          lines.push(`     Total: ${fmtRp(it.subtotal)}`);
        }
        return lines.join("\n");
      }).join("\n\n") + "\n"
    : "";

  const truckingDateBlock = input.isTrucking && (tgl || jam)
    ? `📅 Tgl Order  : ${tgl}\n` +
      (jam ? `🕐 Jam Order  : ${jam}\n` : "")
    : "";

  const priceBlock = input.vendorBasePrice != null
    ? `\n💰 *Harga Vendor:*\n${fmtRp(input.vendorBasePrice)}\n`
    : "";

  return (
    `📦 *PERMINTAAN PENAWARAN VENDOR*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Kepada Yth. *${input.vendorName}*,\n\n` +
    `No. RFQ    : *${input.rfqNumber}*\n` +
    `No. Order  : ${input.orderNumber}\n` +
    (!input.isTrucking && tgl ? `Tanggal    : ${tgl}\n` : "") +
    (!input.isTrucking && jam ? `Jam        : ${jam}\n` : "") +
    truckingDateBlock +
    routeLine +
    vehicleLine +
    cargoLines +
    itemsBlock +
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
  orderItems?: VendorQuoteOrderItem[] | null;
  isTrucking?: boolean;
  orderType?: string | null;
}

/**
 * Reusable end-to-end helper:
 *   1. shortens the long vendor-quote URL into /q/<code>
 *   2. renders vendor_request template from Settings (DB) or default
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

  const defaultTpl = generateVendorQuoteMessage({ ...input, shortLinkUrl });

  const tplBody = await getWaTemplateConfig("vendor", "vendor_request", defaultTpl);

  const svcType = deriveServiceType(
    input.vehicleType ?? input.orderItems?.[0]?.category ?? "",
    input.orderType ?? undefined,
  );
  const tgl = input.createdAt ? formatTanggal(input.createdAt) : null;
  const jam = input.jamOrder ?? (input.createdAt ? formatJam(input.createdAt) : null);

  const productList: string | null = (() => {
    if (!input.orderItems?.length) return null;
    const items = svcType === "product"
      ? input.orderItems
      : input.orderItems.filter((it) => {
          const cat = (it.category ?? "").toLowerCase();
          return cat.includes("product") || cat.includes("produk");
        });
    if (!items.length) return null;
    return items
      .map((it) => {
        const qty = it.quantity ?? 1;
        const unit = it.unit ?? "Unit";
        const lines: string[] = [`• ${it.serviceName}`];
        lines.push(`  Qty: ${qty} ${unit}`);
        if (it.sellingUnitPrice != null && it.sellingUnitPrice > 0) {
          lines.push(`  Harga Jual/Unit: ${fmtRp(it.sellingUnitPrice)}`);
          lines.push(`  Total: ${fmtRp(it.sellingUnitPrice * qty)}`);
        } else if (it.subtotal != null && it.subtotal > 0) {
          lines.push(`  Total: ${fmtRp(it.subtotal)}`);
        }
        return lines.join("\n");
      })
      .join("\n\n");
  })();

  const conditions: string[] = svcType ? [svcType] : [];
  if (productList && !conditions.includes("product")) conditions.push("product");

  const vars: Record<string, string | null | undefined> = {
    rfqNumber: input.rfqNumber,
    orderNumber: input.orderNumber,
    vendorName: input.vendorName,
    route: input.origin && input.destination ? `${input.origin} → ${input.destination}` : null,
    origin: input.origin ?? null,
    destination: input.destination ?? null,
    shipmentType: input.vehicleType ?? null,
    vehicleType: input.vehicleType ?? null,
    commodity: input.commodity ?? null,
    cargoDescription: null,
    grossWeightDisplay: input.grossWeight ? `${input.grossWeight} kg` : null,
    volumeDisplay: input.volumeCbm ? `${input.volumeCbm} CBM` : null,
    requiredDate: input.requiredDate ?? null,
    notes: input.notes ?? null,
    vendorMiniFormLink: shortLinkUrl,
    vendorBasePrice: input.vendorBasePrice != null ? fmtRp(input.vendorBasePrice) : null,
    productList,
    tanggal: tgl,
    jam,
    timestamp: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
  };

  const message = renderTemplate(tplBody, vars, conditions);
  await sendWhatsApp(input.vendorPhone, message, {
    context: "vendor_quote",
    refType: "rfq",
    refId: input.rfqNumber,
  });
}
