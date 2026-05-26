import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import multer from "multer";
import { db } from "@workspace/db";
import {
  vendorResponsesTable,
  logisticOrdersTable,
  logisticOrderItemsTable,
  suppliersTable,
  vendorCatalogItemsTable,
} from "@workspace/db";
import { sendWhatsApp } from "../lib/fonnte";
import { ObjectStorageService } from "../lib/objectStorage";
import { verifyVendorResponseToken } from "../lib/vendorResponseToken";
import { getAdminGroupWa } from "../lib/adminWa";
import { getPreferredDomain } from "../lib/domain";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const objectStorage = new ObjectStorageService();

db.execute(sql`ALTER TABLE vendor_responses ADD COLUMN IF NOT EXISTS quoted_price NUMERIC(14, 2)`).catch(() => {});

function nowWIB(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const day  = parts.find(p => p.type === "day")?.value ?? "";
  const mon  = parts.find(p => p.type === "month")?.value ?? "";
  const year = parts.find(p => p.type === "year")?.value ?? "";
  const hour = parts.find(p => p.type === "hour")?.value ?? "";
  const min  = parts.find(p => p.type === "minute")?.value ?? "";
  return `${day} ${mon} ${year}, ${hour}:${min} WIB`;
}

function formatWaAdminNotification(response: {
  orderNumber: string;
  vendorName: string | null;
  status: string;
  estimatedPickupTime: string | null;
  driverName: string | null;
  driverPhone: string | null;
  plateNumber: string | null;
  vehicleType: string | null;
  notes: string | null;
  quotedPrice?: string | null;
  orderId: number | null;
}): string {
  const statusEmoji = response.status === "READY" ? "✅" : "❌";
  const statusLabel = response.status === "READY" ? "READY" : "NOT READY";
  const domain = getPreferredDomain() || "cstlogistic.co.id";
  const approveUrl = `https://${domain}/approve/${response.orderNumber}`;

  const lines = [
    `${statusEmoji} *VENDOR RESPONSE — ${response.orderNumber}*`,
    `━━━━━━━━━━━━━━━━━━`,
    `Vendor: ${response.vendorName ?? "—"}`,
    `Status: ${statusEmoji} ${statusLabel}`,
  ];

  if (response.status === "READY") {
    if (response.quotedPrice) lines.push(`💰 Harga Penawaran: Rp ${Number(response.quotedPrice).toLocaleString("id-ID")}`);
    if (response.estimatedPickupTime) lines.push(`Est. Pickup: ${response.estimatedPickupTime}`);
    if (response.driverName) lines.push(`Driver: ${response.driverName}`);
    if (response.driverPhone) lines.push(`Phone: ${response.driverPhone}`);
    if (response.plateNumber) lines.push(`Plat: ${response.plateNumber}`);
    if (response.vehicleType) lines.push(`Unit: ${response.vehicleType}`);
  }

  if (response.notes) lines.push(`Catatan: ${response.notes}`);
  lines.push(`━━━━━━━━━━━━━━━━━━`);
  if (response.status === "READY") {
    lines.push(`📋 *Review & Approve:*\n${approveUrl}`);
  } else {
    lines.push(`📋 *Cek & pilih vendor lain:*\n${approveUrl}`);
  }
  lines.push(`\n_Dikirim: ${nowWIB()}_`);

  return lines.join("\n");
}

router.get("/:orderNumber", async (req: Request, res: Response) => {
  const orderNumber = req.params["orderNumber"] as string;
  const token = String(req.query.t ?? "").trim();
  if (!verifyVendorResponseToken(orderNumber, token)) {
    res.status(403).json({ error: "Link tidak valid atau sudah kadaluarsa" });
    return;
  }
  const vendorId = req.query.v ? parseInt(String(req.query.v), 10) : null;

  try {
    const [order] = await db
      .select()
      .from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.orderNumber, orderNumber));

    if (!order) {
      res.status(404).json({ error: "Order tidak ditemukan" });
      return;
    }

    const items = await db
      .select()
      .from(logisticOrderItemsTable)
      .where(eq(logisticOrderItemsTable.orderId, order.id));

    const truckingItem = items.find((i) => i.calculatorType === "trucking");
    const vehicleType =
      (truckingItem?.inputData as Record<string, unknown>)?.vehicleType as string | null ?? null;

    const [existing] = await db
      .select()
      .from(vendorResponsesTable)
      .where(eq(vendorResponsesTable.orderNumber, orderNumber));

    // Fetch vendor base price from catalog if vendorId provided
    let vendorBasePrice: number | null = null;
    let vendorNameFromDb: string | null = null;
    if (vendorId && !isNaN(vendorId)) {
      const [vendor] = await db
        .select({ name: suppliersTable.name })
        .from(suppliersTable)
        .where(eq(suppliersTable.id, vendorId));
      if (vendor) vendorNameFromDb = vendor.name;

      const catalogItems = await db
        .select()
        .from(vendorCatalogItemsTable)
        .where(and(
          eq(vendorCatalogItemsTable.vendorId, vendorId),
          eq(vendorCatalogItemsTable.isActive, true)
        ));

      const matchingItem = vehicleType
        ? catalogItems.find((c) => c.name.toLowerCase().includes(vehicleType.toLowerCase()))
        : null;
      vendorBasePrice = matchingItem
        ? Number(matchingItem.priceBase)
        : (catalogItems[0] ? Number(catalogItems[0].priceBase) : null);
    }

    res.json({
      orderNumber: order.orderNumber,
      companyName: order.companyName,
      customerName: order.customerName,
      origin: order.origin,
      destination: order.destination,
      commodity: order.commodity,
      grossWeight: order.grossWeight,
      vehicleType,
      requiredDate: order.requiredDate,
      jamOrder: order.jamOrder,
      shipmentType: order.shipmentType,
      vendorBasePrice,
      vendorNameFromDb,
      alreadySubmitted: !!existing,
    });
  } catch (err) {
    req.log?.error({ err }, "vendor-response GET error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:orderNumber/photo", upload.single("photo") as any, async (req: Request, res: Response) => {
  const orderNumberPhoto = req.params["orderNumber"] as string;
  const tokenPhoto = String(req.query.t ?? req.body?.t ?? "").trim();
  if (!verifyVendorResponseToken(orderNumberPhoto, tokenPhoto)) {
    res.status(403).json({ error: "Link tidak valid atau sudah kadaluarsa" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Tidak ada foto yang diupload" });
    return;
  }
  try {
    const objectId = randomUUID();
    const storagePath = `public/vendor-photos/${objectId}`;
    await objectStorage.uploadFile(req.file.buffer, storagePath, req.file.mimetype);
    const photoUrl = await objectStorage.getPublicUrl(storagePath);
    res.json({ url: photoUrl, objectPath: storagePath });
  } catch (err) {
    req.log?.error({ err }, "vendor-response photo upload error");
    res.status(500).json({ error: "Gagal upload foto" });
  }
});

router.post("/:orderNumber", async (req: Request, res: Response) => {
  const orderNumber = req.params["orderNumber"] as string;
  const token = String((req.query.t ?? (req.body as Record<string, unknown>)?.token ?? "")).trim();
  if (!verifyVendorResponseToken(orderNumber, token)) {
    res.status(403).json({ error: "Link tidak valid atau sudah kadaluarsa" });
    return;
  }
  const {
    vendorName,
    status,
    estimatedPickupTime,
    driverName,
    driverPhone,
    plateNumber,
    vehicleType,
    notes,
    unitPhotoUrl,
    quotedPrice,
  } = req.body as Record<string, string>;

  if (!status || !["READY", "NOT_READY"].includes(status)) {
    res.status(400).json({ error: "Status harus READY atau NOT_READY" });
    return;
  }

  try {
    const [order] = await db
      .select({ id: logisticOrdersTable.id, orderNumber: logisticOrdersTable.orderNumber })
      .from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.orderNumber, orderNumber));

    if (!order) {
      res.status(404).json({ error: "Order tidak ditemukan" });
      return;
    }

    const payload = {
      orderNumber,
      orderId: order.id,
      vendorName: vendorName ?? null,
      status,
      estimatedPickupTime: estimatedPickupTime ?? null,
      driverName: driverName ?? null,
      driverPhone: driverPhone ?? null,
      plateNumber: plateNumber ?? null,
      vehicleType: vehicleType ?? null,
      notes: notes ?? null,
      unitPhotoUrl: unitPhotoUrl ?? null,
      quotedPrice: quotedPrice ? String(quotedPrice) : null,
      submittedAt: new Date(),
    };

    const [existing] = await db
      .select({ id: vendorResponsesTable.id })
      .from(vendorResponsesTable)
      .where(eq(vendorResponsesTable.orderNumber, orderNumber));

    if (existing) {
      await db
        .update(vendorResponsesTable)
        .set(payload)
        .where(eq(vendorResponsesTable.orderNumber, orderNumber));
    } else {
      await db.insert(vendorResponsesTable).values(payload);
    }

    const waMsg = formatWaAdminNotification({ ...payload });
    const adminGroupWa = await getAdminGroupWa();
    if (adminGroupWa) {
      sendWhatsApp(adminGroupWa, waMsg).catch((err) =>
        req.log?.error({ err }, "vendor-response admin group WA send failed")
      );
    } else {
      req.log?.warn("Admin WA group not configured — skipping vendor response notification");
    }

    res.json({ success: true, message: "Response berhasil dikirim" });
  } catch (err) {
    req.log?.error({ err }, "vendor-response POST error");
    res.status(500).json({ error: "Gagal menyimpan response" });
  }
});


export { router as vendorResponseRouter };
