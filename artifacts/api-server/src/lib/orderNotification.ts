import { db, suppliersTable } from "@workspace/db";
import { eq, and, or, isNull, ilike } from "drizzle-orm";
import { sendWhatsApp } from "./fonnte";
import { getAdminWa } from "./adminWa";
import { sendMail, isSmtpConfigured } from "./mailer";
import { logger } from "./logger";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admcst001@gmail.com";

export interface LogisticOrderData {
  id: number;
  orderNumber: string;
  customerName: string;
  companyName: string;
  email: string;
  phone: string;
  shipmentType: string;
  origin: string;
  destination: string;
  commodity?: string | null;
  cargoDescription?: string | null;
  grossWeight?: number | null;
  volumeCbm?: number | null;
  grandTotal: number;
  serviceList: string;
  requiredDate?: string | null;
  notes?: string | null;
}

function getOrderUrl(orderId: number): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
  if (!domain) return "";
  return `https://${domain}/bizportal/logistics/portal-orders/${orderId}`;
}

function formatRupiah(amount: number): string {
  return amount.toLocaleString("id-ID");
}

/** Returns true for air/sea freight types that need per-unit pricing hints */
function isFreightWithDimensions(shipmentType: string): boolean {
  const t = shipmentType.toLowerCase();
  return t.includes("air") || t.includes("sea") || t.includes("laut") || t.includes("udara");
}

function buildAdminWaMessage(order: LogisticOrderData): string {
  const orderUrl = getOrderUrl(order.id);
  return (
    `🚢 *ORDER LOGISTIK BARU*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `No. Order  : \`${order.orderNumber}\`\n` +
    `Customer   : ${order.customerName}${order.companyName ? ` (${order.companyName})` : ""}\n` +
    `Email      : ${order.email}\n` +
    `HP         : ${order.phone}\n` +
    `Jenis      : ${order.shipmentType}\n` +
    `Rute       : ${order.origin} → ${order.destination}\n` +
    (order.commodity ? `Komoditi   : ${order.commodity}\n` : ``) +
    (order.cargoDescription ? `Deskripsi  : ${order.cargoDescription}\n` : ``) +
    (order.grossWeight ? `Berat      : ${order.grossWeight} kg\n` : ``) +
    (order.volumeCbm ? `Volume     : ${order.volumeCbm} CBM\n` : ``) +
    `Layanan    :\n${order.serviceList}\n` +
    `Total Est. : Rp ${formatRupiah(order.grandTotal)}\n` +
    (order.requiredDate ? `Tgl Kirim  : ${order.requiredDate}\n` : ``) +
    (order.notes ? `Catatan    : ${order.notes}\n` : ``) +
    `━━━━━━━━━━━━━━━━━━\n` +
    (orderUrl ? `🔗 *Buka & Approve di BizPortal:*\n${orderUrl}\n\n` : ``) +
    `💬 *Atau approve via WA* (setelah vendor balas):\n` +
    `\`\`\`APPROVE ${order.orderNumber} [harga_jual]\`\`\`\n` +
    `_Contoh: APPROVE ${order.orderNumber} 5500000_`
  );
}

function buildVendorWaMessage(order: LogisticOrderData, vendorName: string): string {
  const isFreight = isFreightWithDimensions(order.shipmentType);

  const priceHint = isFreight
    ? (
        `📐 *Format harga untuk jenis ini:*\n` +
        `Berikan harga total pengiriman.\n` +
        (order.grossWeight ? `Berat barang: *${order.grossWeight} kg*\n` : ``) +
        (order.volumeCbm ? `Volume: *${order.volumeCbm} CBM*\n` : ``) +
        `\n`
      )
    : ``;

  return (
    `📦 *PERMINTAAN ORDER BARU — CST LOGISTICS*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Kepada Yth. *${vendorName}*,\n\n` +
    `Anda mendapat permintaan pengiriman baru.\n\n` +
    `No. Order       : *${order.orderNumber}*\n` +
    `Jenis           : ${order.shipmentType}\n` +
    `Rute            : ${order.origin} → ${order.destination}\n` +
    (order.commodity ? `Kategori Barang : ${order.commodity}\n` : ``) +
    (order.cargoDescription ? `Deskripsi       : ${order.cargoDescription}\n` : ``) +
    (order.grossWeight ? `Berat           : ${order.grossWeight} kg\n` : ``) +
    (order.volumeCbm ? `Volume          : ${order.volumeCbm} CBM\n` : ``) +
    (order.requiredDate ? `Tgl Butuh       : ${order.requiredDate}\n` : ``) +
    `Layanan         :\n${order.serviceList}\n` +
    (order.notes ? `Catatan         : ${order.notes}\n` : ``) +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💰 *Cara mengirim harga penawaran:*\n\n` +
    priceHint +
    `Balas pesan ini dengan format:\n` +
    `\`\`\`${order.orderNumber} HARGA ETA_PICKUP ETA_DELIVERY CATATAN\`\`\`\n\n` +
    `Contoh:\n` +
    `\`\`\`${order.orderNumber} 5000000 besok 3hari barang-aman\`\`\`\n` +
    `\`\`\`${order.orderNumber} 3500000\`\`\`\n\n` +
    `⚠️ Pastikan No. Order *${order.orderNumber}* ada di awal pesan.\n` +
    `   Isi harga *tanpa titik/koma* pemisah ribuan.\n\n` +
    `Terima kasih 🙏`
  );
}

function buildCustomerWaMessage(order: LogisticOrderData): string {
  return (
    `✅ *PESANAN ANDA DITERIMA*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Halo ${order.customerName},\n\n` +
    `Terima kasih telah mempercayakan pengiriman Anda kepada CST Logistics.\n\n` +
    `No. Order       : *${order.orderNumber}*\n` +
    `Status          : Menunggu Konfirmasi\n` +
    `Jenis           : ${order.shipmentType}\n` +
    `Rute            : ${order.origin} → ${order.destination}\n` +
    (order.commodity ? `Kategori Barang : ${order.commodity}\n` : ``) +
    (order.grossWeight ? `Berat           : ${order.grossWeight} kg\n` : ``) +
    (order.volumeCbm ? `Volume          : ${order.volumeCbm} CBM\n` : ``) +
    `Layanan         :\n${order.serviceList}\n` +
    `Total Est.      : Rp ${formatRupiah(order.grandTotal)}\n` +
    (order.requiredDate ? `Tgl Butuh       : ${order.requiredDate}\n` : ``) +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Tim kami akan segera menghubungi Anda untuk konfirmasi lebih lanjut.\n` +
    `📞 Jakarta: (021) 6241234 | Tangerang: (021) 5591234`
  );
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

  const adminWa = await getAdminWa();
  if (adminWa) {
    sendWhatsApp(adminWa, buildAdminWaMessage(order)).catch((err: unknown) =>
      logger.error({ err }, "WA admin notification failed")
    );
  }

  if (isSmtpConfigured()) {
    sendMail({
      to: ADMIN_EMAIL,
      subject: `[ORDER BARU] ${order.orderNumber} — ${order.customerName}`,
      html: buildEmailHtml(
        "Order Logistik Baru Masuk",
        `Order baru telah diterima dari <strong>${order.customerName}</strong>. Silakan login ke sistem untuk memproses.`,
        rows,
        'Login ke sistem: <a href="https://cstlogistic.co.id/logistic-order">https://cstlogistic.co.id/logistic-order</a>'
      ),
      text:
        `ORDER BARU: ${order.orderNumber}\n` +
        `Customer: ${order.customerName} (${order.companyName})\n` +
        `Rute: ${order.origin} → ${order.destination}\n` +
        `Jenis: ${order.shipmentType}\n` +
        `Total: Rp ${formatRupiah(order.grandTotal)}`,
    }).catch((err: unknown) => logger.error({ err }, "Email admin notification failed"));
  } else {
    logger.warn("SMTP not configured — skipping admin email");
  }
}

async function notifyVendors(order: LogisticOrderData): Promise<void> {
  const vendors = await db
    .select()
    .from(suppliersTable)
    .where(
      and(
        eq(suppliersTable.isActive, true),
        or(
          isNull(suppliersTable.serviceType),
          ilike(suppliersTable.serviceType, `%${order.shipmentType}%`)
        )
      )
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
    ["Layanan", order.serviceList.replace(/\n/g, "<br>")],
    ...(order.requiredDate ? [["Tgl Butuh", order.requiredDate] as [string, string]] : []),
    ...(order.notes ? [["Catatan", order.notes] as [string, string]] : []),
  ];

  for (const vendor of eligible) {
    if (vendor.phone) {
      sendWhatsApp(vendor.phone, buildVendorWaMessage(order, vendor.name)).catch((err: unknown) =>
        logger.error({ err, vendorId: vendor.id }, "WA vendor notification failed")
      );
    }

    if (vendor.contactEmail && isSmtpConfigured()) {
      sendMail({
        to: vendor.contactEmail,
        subject: `[PERMINTAAN ORDER] ${order.orderNumber} — ${order.shipmentType}`,
        html: buildEmailHtml(
          "Permintaan Order Baru dari CST Logistics",
          `Kepada Yth. <strong>${vendor.name}</strong>,<br><br>Anda mendapat permintaan pengiriman baru. Balas email ini atau hubungi kami jika ada pertanyaan.`,
          rows,
          "Email ini dikirim otomatis oleh sistem CST Logistics. Hubungi admin untuk konfirmasi."
        ),
        text:
          `PERMINTAAN ORDER: ${order.orderNumber}\n` +
          `Jenis: ${order.shipmentType}\n` +
          `Rute: ${order.origin} → ${order.destination}\n` +
          `Balas email ini jika ada pertanyaan.`,
      }).catch((err: unknown) => logger.error({ err, vendorId: vendor.id }, "Email vendor notification failed"));
    } else if (vendor.contactEmail) {
      logger.warn({ vendorId: vendor.id }, "SMTP not configured — skipping vendor email");
    }
  }
}

async function notifyCustomer(order: LogisticOrderData): Promise<void> {
  if (order.phone) {
    sendWhatsApp(order.phone, buildCustomerWaMessage(order)).catch((err: unknown) =>
      logger.error({ err, phone: order.phone }, "WA customer notification failed")
    );
  }

  const rows: [string, string][] = [
    ["No. Order", `<strong>${order.orderNumber}</strong>`],
    ["Status", "<span style='color:#059669;font-weight:600'>Menunggu Konfirmasi</span>"],
    ["Jenis", order.shipmentType],
    ["Rute", `${order.origin} → ${order.destination}`],
    ...(order.commodity ? [["Komoditi", order.commodity] as [string, string]] : []),
    ...(order.grossWeight ? [["Berat", `${order.grossWeight} kg`] as [string, string]] : []),
    ...(order.volumeCbm ? [["Volume", `${order.volumeCbm} CBM`] as [string, string]] : []),
    ["Layanan", order.serviceList.replace(/\n/g, "<br>")],
    ["Total Est.", `Rp ${formatRupiah(order.grandTotal)}`],
    ...(order.requiredDate ? [["Tgl Butuh", order.requiredDate] as [string, string]] : []),
  ];

  if (isSmtpConfigured()) {
    sendMail({
      to: order.email,
      subject: `Pesanan Diterima — ${order.orderNumber}`,
      html: buildEmailHtml(
        "Pesanan Anda Telah Diterima",
        `Halo <strong>${order.customerName}</strong>,<br><br>Terima kasih telah mempercayakan pengiriman Anda kepada CST Logistics. Tim kami akan segera menghubungi Anda untuk konfirmasi lebih lanjut.`,
        rows,
        "Gunakan nomor order di atas untuk tracking. Hubungi kami di: <strong>(021) 6241234</strong>"
      ),
      text:
        `Pesanan Diterima!\n` +
        `No. Order: ${order.orderNumber}\n` +
        `Status: Menunggu Konfirmasi\n` +
        `Rute: ${order.origin} → ${order.destination}\n` +
        `Total: Rp ${formatRupiah(order.grandTotal)}\n\n` +
        `Tim kami akan segera menghubungi Anda.`,
    }).catch((err: unknown) => logger.error({ err, email: order.email }, "Email customer notification failed"));
  } else {
    logger.warn("SMTP not configured — skipping customer email");
  }
}

export async function sendLogisticOrderNotification(order: LogisticOrderData): Promise<void> {
  await Promise.allSettled([
    notifyAdmin(order),
    notifyVendors(order),
    notifyCustomer(order),
  ]);
}
