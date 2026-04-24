import PDFDocument from "pdfkit";
import type { Response } from "express";

export interface InvoiceLine {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface InvoiceData {
  title: string;
  docNumber: string;
  status: string;
  kind: string;
  partyLabel: string;
  partyName: string;
  partyEmail?: string | null;
  partyPhone?: string | null;
  partyAddress?: string | null;
  partyTaxId?: string | null;
  validUntil?: string | null;
  expectedDate?: string | null;
  confirmedAt?: string | null;
  createdAt: string;
  notes?: string | null;
  lines: InvoiceLine[];
  totalAmount: number;
  invoiceStatus?: string | null;
  deliveryStatus?: string | null;
  receiveStatus?: string | null;
  billStatus?: string | null;
}

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string | null) => {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return d;
  }
};

export function streamInvoicePdf(res: Response, data: InvoiceData): void {
  const filename = `${data.docNumber.replace(/[\\/]/g, "-")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  doc.on("error", (err) => {
    // Best-effort: end response if not already sent.
    if (!res.headersSent) {
      res.status(500).json({ message: "PDF generation error", error: String(err?.message ?? err) });
    } else {
      res.end();
    }
  });
  res.on("close", () => {
    // Client disconnected — abort PDF document so we don't keep writing.
    if (!res.writableEnded) {
      try { doc.end(); } catch { /* ignore */ }
    }
  });
  doc.pipe(res);

  doc
    .fontSize(20)
    .fillColor("#0f172a")
    .text("BizPortal", { align: "left" })
    .fontSize(9)
    .fillColor("#64748b")
    .text("Sistem Manajemen Bisnis Multi-Divisi", { align: "left" })
    .moveDown(0.3);

  doc
    .fontSize(16)
    .fillColor("#0f172a")
    .text(data.title, { align: "right" })
    .fontSize(10)
    .fillColor("#475569")
    .text(`No: ${data.docNumber}`, { align: "right" })
    .text(`Tanggal: ${fmtDate(data.createdAt)}`, { align: "right" })
    .text(`Status: ${data.status.toUpperCase()}`, { align: "right" })
    .moveDown(1);

  doc
    .moveTo(48, doc.y)
    .lineTo(547, doc.y)
    .strokeColor("#e2e8f0")
    .stroke()
    .moveDown(0.5);

  const partyTop = doc.y;
  doc
    .fontSize(9)
    .fillColor("#64748b")
    .text(data.partyLabel.toUpperCase(), 48, partyTop)
    .fontSize(11)
    .fillColor("#0f172a")
    .text(data.partyName, 48, doc.y + 2);
  if (data.partyAddress)
    doc.fontSize(9).fillColor("#475569").text(data.partyAddress, 48, doc.y + 2, { width: 240 });
  if (data.partyEmail) doc.text(`Email: ${data.partyEmail}`, 48);
  if (data.partyPhone) doc.text(`Telp: ${data.partyPhone}`, 48);
  if (data.partyTaxId) doc.text(`NPWP: ${data.partyTaxId}`, 48);

  doc
    .fontSize(9)
    .fillColor("#64748b")
    .text("DETAIL DOKUMEN", 320, partyTop)
    .fontSize(10)
    .fillColor("#0f172a");
  if (data.validUntil) doc.text(`Berlaku Hingga: ${fmtDate(data.validUntil)}`, 320);
  if (data.expectedDate) doc.text(`Estimasi: ${fmtDate(data.expectedDate)}`, 320);
  if (data.confirmedAt) doc.text(`Dikonfirmasi: ${fmtDate(data.confirmedAt)}`, 320);
  if (data.invoiceStatus) doc.text(`Status Tagihan: ${data.invoiceStatus}`, 320);
  if (data.deliveryStatus) doc.text(`Status Kirim: ${data.deliveryStatus}`, 320);
  if (data.receiveStatus) doc.text(`Status Terima: ${data.receiveStatus}`, 320);
  if (data.billStatus) doc.text(`Status Bayar: ${data.billStatus}`, 320);

  doc.moveDown(2);
  const tableTop = Math.max(doc.y, 240);

  const colX = { name: 48, qty: 320, price: 380, sub: 470 };
  const colW = { name: 270, qty: 60, price: 90, sub: 77 };

  doc
    .rect(48, tableTop, 499, 22)
    .fillColor("#0f172a")
    .fill()
    .fillColor("#ffffff")
    .fontSize(10)
    .text("Item", colX.name + 6, tableTop + 6, { width: colW.name })
    .text("Qty", colX.qty, tableTop + 6, { width: colW.qty, align: "right" })
    .text("Harga Satuan", colX.price, tableTop + 6, { width: colW.price, align: "right" })
    .text("Subtotal", colX.sub, tableTop + 6, { width: colW.sub, align: "right" });

  let y = tableTop + 28;
  doc.fillColor("#0f172a").fontSize(10);
  for (const line of data.lines) {
    if (y > 720) {
      doc.addPage();
      y = 48;
    }
    doc.font("Helvetica-Bold").text(line.name, colX.name + 6, y, { width: colW.name });
    if (line.description) {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#64748b")
        .text(line.description, colX.name + 6, doc.y + 1, { width: colW.name })
        .fillColor("#0f172a")
        .fontSize(10);
    }
    const rowEndY = doc.y;
    doc
      .font("Helvetica")
      .text(String(line.quantity), colX.qty, y, { width: colW.qty, align: "right" })
      .text(idr(line.unitPrice), colX.price, y, { width: colW.price, align: "right" })
      .text(idr(line.subtotal), colX.sub, y, { width: colW.sub, align: "right" });
    y = Math.max(rowEndY, y + 14) + 8;
    doc
      .moveTo(48, y - 4)
      .lineTo(547, y - 4)
      .strokeColor("#f1f5f9")
      .stroke();
  }

  if (y > 700) {
    doc.addPage();
    y = 48;
  }
  doc
    .moveDown(1)
    .fontSize(11)
    .fillColor("#0f172a")
    .text("TOTAL", 380, y + 10, { width: 90, align: "right" })
    .font("Helvetica-Bold")
    .fontSize(14)
    .text(idr(data.totalAmount), 470, y + 8, { width: 77, align: "right" });

  if (data.notes) {
    doc
      .moveDown(3)
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#64748b")
      .text("Catatan:", 48)
      .fillColor("#0f172a")
      .text(data.notes, 48, doc.y + 2, { width: 499 });
  }

  doc
    .fontSize(8)
    .fillColor("#94a3b8")
    .text(
      `Dicetak otomatis oleh BizPortal pada ${new Date().toLocaleString("id-ID")}`,
      48,
      780,
      { width: 499, align: "center" },
    );

  doc.end();
}
