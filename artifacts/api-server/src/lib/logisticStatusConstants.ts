/**
 * 15 Canonical Logistic Order Statuses
 * Single source of truth — imported by routes and frontend components.
 */

export const LOGISTIC_STATUSES = [
  "Order Received",
  "Admin Review",
  // ── Phase 2A: Product-First statuses (only active for orderType="product_first") ──
  "Product RFQ Sent",
  "Product Quote Received",
  "Product Vendor Selected",
  "Customer Product Approval",
  "Shipment Selection Pending",
  "Ready for Pickup",
  // ─────────────────────────────────────────────────────────────────────────────────
  "RFQ Sent",
  "Quote Received",
  "Customer Approval",
  "Vendor Confirmed",
  "In Progress",
  "Pickup",
  "In Transit",
  "Arrived",
  "Delivered",
  "POD Uploaded",
  "Invoice Issued",
  "Payment Received",
  "Completed",
  "Cancelled",
] as const;

export type LogisticStatus = (typeof LOGISTIC_STATUSES)[number];

export const STATUS_RANK: Record<string, number> = {
  "Order Received":             0,
  "Admin Review":               1,
  // Phase 2A: product-first sub-ranks (between Admin Review and RFQ Sent)
  "Product RFQ Sent":           1.2,
  "Product Quote Received":     1.4,
  "Product Vendor Selected":    1.6,
  "Customer Product Approval":  1.8,
  "Shipment Selection Pending": 1.9,
  "Ready for Pickup":           5.5,
  // ─────────────────────────────────────────────────────────────────────────
  "RFQ Sent":                   2,
  "Quote Received":             3,
  "Customer Approval":          4,
  "Vendor Confirmed":           5,
  "In Progress":                6,
  "Pickup":                     7,
  "In Transit":                 8,
  "Arrived":                    9,
  "Delivered":                  10,
  "POD Uploaded":               11,
  "Invoice Issued":             12,
  "Payment Received":           13,
  "Completed":                  14,
  "Cancelled":                  99,
};

export const STATUS_LABEL_ID: Record<string, string> = {
  "Order Received":             "Order Diterima",
  "Admin Review":               "Ditinjau Admin",
  "Product RFQ Sent":           "RFQ Produk Terkirim",
  "Product Quote Received":     "Penawaran Produk Masuk",
  "Product Vendor Selected":    "Vendor Produk Dipilih",
  "Customer Product Approval":  "Menunggu Persetujuan Harga Produk",
  "Shipment Selection Pending": "Menunggu Pilihan Pengiriman",
  "Ready for Pickup":           "Siap Dijemput",
  "RFQ Sent":                   "RFQ Terkirim",
  "Quote Received":   "Penawaran Masuk",
  "Customer Approval": "Menunggu Persetujuan",
  "Vendor Confirmed": "Vendor Dikonfirmasi",
  "In Progress":      "Sedang Diproses",
  "Pickup":           "Penjemputan",
  "In Transit":       "Dalam Perjalanan",
  "Arrived":          "Tiba di Tujuan",
  "Delivered":        "Terkirim",
  "POD Uploaded":     "Bukti Terkirim",
  "Invoice Issued":   "Invoice Diterbitkan",
  "Payment Received": "Pembayaran Diterima",
  "Completed":        "Selesai",
  "Cancelled":        "Dibatalkan",
};

/**
 * Map old/legacy status values → canonical status
 */
export const LEGACY_STATUS_MAP: Record<string, string> = {
  "New Order":           "Order Received",
  "Under Review":        "Admin Review",
  "admin_review":        "Admin Review",
  "Pending Vendor":      "RFQ Sent",
  "rfq_sent":            "RFQ Sent",
  "vendor_blasted":      "RFQ Sent",
  "Quote Received":      "Quote Received",
  "Quotation Sent":      "Customer Approval",
  "customer_quoted":     "Customer Approval",
  "Customer Approved":   "Vendor Confirmed",
  "order_confirmed":     "Vendor Confirmed",
  "assigned_to_vendor":  "Vendor Confirmed",
  "Vendor Confirmed":    "Vendor Confirmed",
  "In Progress":         "In Progress",
  "waiting_pickup":      "Pickup",
  "picked_up":           "Pickup",
  "in_progress":         "In Transit",
  "Arrived":             "Arrived",
  "delivered":           "Delivered",
  "Delivered":           "Delivered",
  "pod_uploaded":        "POD Uploaded",
  "invoice_created":     "Invoice Issued",
  "payment_pending":     "Payment Received",
  "paid":                "Payment Received",
  "completed":           "Completed",
  "Completed":           "Completed",
  "cancelled":           "Cancelled",
  "Cancelled":           "Cancelled",
  "Customer Rejected":   "Admin Review",
  "Vendor Assigned":     "Vendor Confirmed",
  "Vendor Accepted":     "In Progress",
  "Vendor Rejected":     "Admin Review",
};

export function normalizeStatus(raw: string): string {
  return LEGACY_STATUS_MAP[raw] ?? raw;
}

/** WA message sent to customer when order reaches a given status.
 *  @param orderNumber  Nomor order (e.g. LOG-260531-12345)
 *  @param trackUrl     URL tracking publik langsung ke detail order (opsional)
 */
export const CUSTOMER_WA_MESSAGES: Record<string, (orderNumber: string, trackUrl?: string) => string> = {
  // ── Phase 2A: Product-First status WA messages ─────────────────────────
  "Product RFQ Sent": (n, u) =>
    `📋 *Permintaan Penawaran Produk Dikirim*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Kami sedang mengumpulkan penawaran terbaik dari vendor produk kami untuk Anda.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "Product Quote Received": (n, u) =>
    `💰 *Penawaran Produk Diterima*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Penawaran dari vendor produk sudah masuk. Tim kami sedang mengevaluasi dan akan segera menghubungi Anda.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "Product Vendor Selected": (n, u) =>
    `✅ *Vendor Produk Dipilih*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Tim kami telah memilih vendor produk terbaik untuk order Anda. Kami akan segera mengirimkan detail penawaran.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "Customer Product Approval": (n, u) =>
    `✅ *Penawaran Harga Produk Siap Disetujui*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Penawaran harga produk sudah siap. Silakan cek link yang dikirimkan untuk menyetujui atau menolak harga produk.` +
    (u ? `\n\n🔗 Detail order:\n${u}` : ""),

  "Shipment Selection Pending": (n, u) =>
    `🚚 *Pilih Metode Pengiriman*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Harga produk Anda sudah dikonfirmasi! Silakan pilih metode pengiriman yang Anda inginkan melalui link berikut.` +
    (u ? `\n\n🔗 Pilih pengiriman:\n${u}` : ""),

  "Ready for Pickup": (n, u) =>
    `📦 *Produk Siap Dijemput*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Produk Anda sudah siap untuk dijemput! Tim kami akan menghubungi Anda dengan detail lokasi pengambilan.` +
    (u ? `\n\n🔗 Detail order:\n${u}` : ""),

  // ── Existing statuses ───────────────────────────────────────────────────
  "Order Received": (n, u) =>
    `📦 *Order Anda Diterima*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n` +
    `Status   : Order Diterima\n\n` +
    `Order Anda sudah kami terima dan sedang kami proses.\n` +
    (u ? `\n🔗 Pantau status order Anda:\n${u}\n` : "") +
    `\nTerima kasih telah menggunakan CST Logistics.`,

  "Admin Review": (n, u) =>
    `🔍 *Order Sedang Ditinjau*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Tim admin kami sedang meninjau order Anda. Kami akan segera menghubungi Anda.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "RFQ Sent": (n, u) =>
    `📋 *Permintaan Penawaran Dikirim*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Kami sedang mengumpulkan penawaran terbaik dari vendor kami untuk Anda.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "Quote Received": (n, u) =>
    `💰 *Penawaran Vendor Diterima*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Kami telah menerima penawaran dari vendor. Tim kami sedang menyiapkan proposal untuk Anda.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "Customer Approval": (n, u) =>
    `✅ *Penawaran Siap untuk Anda Setujui*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Penawaran kami sudah siap. Silakan cek link yang dikirimkan untuk menyetujui atau menolak.` +
    (u ? `\n\n🔗 Detail order:\n${u}` : ""),

  "Vendor Confirmed": (n, u) =>
    `🤝 *Vendor Dikonfirmasi*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Vendor telah dikonfirmasi untuk menangani pengiriman Anda. Persiapan pengiriman segera dimulai.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "In Progress": (n, u) =>
    `🔄 *Pengiriman Sedang Diproses*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Order Anda sedang dalam proses persiapan pengiriman.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "Pickup": (n, u) =>
    `🚚 *Proses Penjemputan*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Driver sedang dalam perjalanan atau sedang mengambil muatan Anda.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "In Transit": (n, u) =>
    `🛣️ *Muatan Dalam Perjalanan*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Muatan Anda sedang dalam perjalanan menuju tujuan.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "Arrived": (n, u) =>
    `📍 *Muatan Tiba di Tujuan*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Muatan Anda telah tiba di lokasi tujuan.` +
    (u ? `\n\n🔗 Pantau status:\n${u}` : ""),

  "Delivered": (n, u) =>
    `✅ *Muatan Berhasil Dikirim*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Muatan Anda telah berhasil dikirim. Terima kasih telah menggunakan CST Logistics!` +
    (u ? `\n\n🔗 Detail pengiriman:\n${u}` : ""),

  "POD Uploaded": (n, u) =>
    `📄 *Bukti Pengiriman Diunggah*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Bukti pengiriman (POD) telah diunggah. Kami sedang memproses invoice untuk Anda.` +
    (u ? `\n\n🔗 Lihat dokumen:\n${u}` : ""),

  "Invoice Issued": (n, u) =>
    `🧾 *Invoice Diterbitkan*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Invoice untuk order Anda telah diterbitkan. Silakan cek email Anda.` +
    (u ? `\n\n🔗 Detail order:\n${u}` : ""),

  "Payment Received": (n, u) =>
    `💳 *Pembayaran Diterima*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Pembayaran Anda telah kami terima. Terima kasih!` +
    (u ? `\n\n🔗 Detail order:\n${u}` : ""),

  "Completed": (n, u) =>
    `🎉 *Order Selesai*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Order Anda telah selesai sepenuhnya. Terima kasih telah menggunakan layanan CST Logistics!` +
    (u ? `\n\n🔗 Detail order:\n${u}` : ""),

  "Cancelled": (n, u) =>
    `❌ *Order Dibatalkan*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `No Order : *${n}*\n\n` +
    `Order Anda telah dibatalkan. Hubungi kami jika ada pertanyaan.` +
    (u ? `\n\n🔗 Detail order:\n${u}` : ""),
};

/** WA message note for vendor when status changes */
export const VENDOR_WA_NOTES: Record<string, string> = {
  "Vendor Confirmed": "Customer telah menyetujui penawaran. Silakan lanjutkan persiapan pengiriman sesuai rencana.",
  "In Progress":      "Order kini berstatus In Progress. Pastikan semua berjalan sesuai jadwal dan SOP.",
  "Pickup":           "Pastikan driver siap untuk penjemputan muatan.",
  "In Transit":       "Muatan sedang dalam perjalanan. Pastikan driver memperbarui posisi secara berkala.",
  "Arrived":          "Muatan telah tiba di tujuan. Segera konfirmasi kepada penerima.",
  "Delivered":        "Muatan berhasil dikirim. Harap upload bukti pengiriman (POD) sesegera mungkin.",
  "Completed":        "Order telah diselesaikan. Terima kasih atas kerja sama Anda.",
  "Cancelled":        "⚠️ Order ini telah DIBATALKAN. Mohon hentikan semua proses terkait order ini segera.",
};

export const VENDOR_NOTIFY_STATUS_SET = new Set<string>([
  "Vendor Confirmed", "In Progress", "Pickup", "In Transit",
  "Arrived", "Delivered", "Completed", "Cancelled",
]);

/** SQL to normalize legacy status values in the DB */
export const STATUS_NORMALIZATION_SQL = `
UPDATE logistic_orders SET status = 'Order Received' WHERE status IN ('New Order');
UPDATE logistic_orders SET status = 'Admin Review'   WHERE status IN ('Under Review', 'admin_review');
UPDATE logistic_orders SET status = 'RFQ Sent'       WHERE status IN ('Pending Vendor', 'rfq_sent');
UPDATE logistic_orders SET status = 'Customer Approval' WHERE status IN ('Quotation Sent', 'customer_quoted');
UPDATE logistic_orders SET status = 'Vendor Confirmed'  WHERE status IN ('order_confirmed', 'assigned_to_vendor', 'Customer Approved');
UPDATE logistic_orders SET status = 'Pickup'         WHERE status IN ('waiting_pickup', 'picked_up');
UPDATE logistic_orders SET status = 'In Transit'     WHERE status IN ('in_progress');
UPDATE logistic_orders SET status = 'Delivered'      WHERE status IN ('delivered');
UPDATE logistic_orders SET status = 'POD Uploaded'   WHERE status IN ('pod_uploaded');
UPDATE logistic_orders SET status = 'Invoice Issued' WHERE status IN ('invoice_created');
UPDATE logistic_orders SET status = 'Payment Received' WHERE status IN ('payment_pending', 'paid');
UPDATE logistic_orders SET status = 'Completed'      WHERE status IN ('completed');
UPDATE logistic_orders SET status = 'Cancelled'      WHERE status IN ('cancelled');
UPDATE logistic_orders SET status = 'Admin Review'   WHERE status IN ('Customer Rejected');
`;
