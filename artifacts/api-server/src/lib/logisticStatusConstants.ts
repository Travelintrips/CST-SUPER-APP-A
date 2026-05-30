/**
 * 15 Canonical Logistic Order Statuses
 * Single source of truth — imported by routes and frontend components.
 */

export const LOGISTIC_STATUSES = [
  "Order Received",
  "Admin Review",
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
  "Order Received":   0,
  "Admin Review":     1,
  "RFQ Sent":         2,
  "Quote Received":   3,
  "Customer Approval": 4,
  "Vendor Confirmed": 5,
  "In Progress":      6,
  "Pickup":           7,
  "In Transit":       8,
  "Arrived":          9,
  "Delivered":        10,
  "POD Uploaded":     11,
  "Invoice Issued":   12,
  "Payment Received": 13,
  "Completed":        14,
  "Cancelled":        99,
};

export const STATUS_LABEL_ID: Record<string, string> = {
  "Order Received":   "Order Diterima",
  "Admin Review":     "Ditinjau Admin",
  "RFQ Sent":         "RFQ Terkirim",
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
};

export function normalizeStatus(raw: string): string {
  return LEGACY_STATUS_MAP[raw] ?? raw;
}

/** WA message sent to customer when order reaches a given status */
export const CUSTOMER_WA_MESSAGES: Record<string, (orderNumber: string) => string> = {
  "Order Received":   (n) => `📦 *Order Anda Diterima*\nNo Order: ${n}\nOrder Anda sudah kami terima dan sedang kami proses. Terima kasih telah menggunakan CST Logistics.`,
  "Admin Review":     (n) => `🔍 *Order Sedang Ditinjau*\nNo Order: ${n}\nTim admin kami sedang meninjau order Anda. Kami akan segera menghubungi Anda.`,
  "RFQ Sent":         (n) => `📋 *Permintaan Penawaran Dikirim*\nNo Order: ${n}\nKami sedang mengumpulkan penawaran terbaik dari vendor kami untuk Anda.`,
  "Quote Received":   (n) => `💰 *Penawaran Vendor Diterima*\nNo Order: ${n}\nKami telah menerima penawaran dari vendor. Tim kami sedang menyiapkan proposal untuk Anda.`,
  "Customer Approval":(n) => `✅ *Penawaran Siap untuk Anda Setujui*\nNo Order: ${n}\nPenawaran kami sudah siap. Silakan cek link yang dikirimkan untuk menyetujui atau menolak.`,
  "Vendor Confirmed": (n) => `🤝 *Vendor Dikonfirmasi*\nNo Order: ${n}\nVendor telah dikonfirmasi untuk menangani pengiriman Anda. Persiapan pengiriman segera dimulai.`,
  "In Progress":      (n) => `🔄 *Pengiriman Sedang Diproses*\nNo Order: ${n}\nOrder Anda sedang dalam proses persiapan pengiriman.`,
  "Pickup":           (n) => `🚚 *Proses Penjemputan*\nNo Order: ${n}\nDriver sedang dalam perjalanan atau sedang mengambil muatan Anda.`,
  "In Transit":       (n) => `🛣️ *Muatan Dalam Perjalanan*\nNo Order: ${n}\nMuatan Anda sedang dalam perjalanan menuju tujuan.`,
  "Arrived":          (n) => `📍 *Muatan Tiba di Tujuan*\nNo Order: ${n}\nMuatan Anda telah tiba di lokasi tujuan.`,
  "Delivered":        (n) => `✅ *Muatan Berhasil Dikirim*\nNo Order: ${n}\nMuatan Anda telah berhasil dikirim. Terima kasih telah menggunakan CST Logistics!`,
  "POD Uploaded":     (n) => `📄 *Bukti Pengiriman Diunggah*\nNo Order: ${n}\nBukti pengiriman (POD) telah diunggah. Kami sedang memproses invoice untuk Anda.`,
  "Invoice Issued":   (n) => `🧾 *Invoice Diterbitkan*\nNo Order: ${n}\nInvoice untuk order Anda telah diterbitkan. Silakan cek email Anda.`,
  "Payment Received": (n) => `💳 *Pembayaran Diterima*\nNo Order: ${n}\nPembayaran Anda telah kami terima. Terima kasih!`,
  "Completed":        (n) => `🎉 *Order Selesai*\nNo Order: ${n}\nOrder Anda telah selesai sepenuhnya. Terima kasih telah menggunakan layanan CST Logistics!`,
  "Cancelled":        (n) => `❌ *Order Dibatalkan*\nNo Order: ${n}\nOrder Anda telah dibatalkan. Hubungi kami jika ada pertanyaan.`,
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
