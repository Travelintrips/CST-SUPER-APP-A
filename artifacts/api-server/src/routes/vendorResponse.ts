import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
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

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const objectStorage = new ObjectStorageService();

const ADMIN_GROUP_WA = "120363409932084202@g.us";

function getPortalDomain(): string {
  const domains = (process.env.REPLIT_DOMAINS ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  return domains[0] ?? "cstlogistic.co.id";
}

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
  orderId: number | null;
}): string {
  const statusEmoji = response.status === "READY" ? "✅" : "❌";
  const statusLabel = response.status === "READY" ? "READY" : "NOT READY";
  const domain = getPortalDomain();
  const adminUrl = `https://${domain}/logistic-admin/orders/${response.orderId ?? ""}`;

  const lines = [
    `${statusEmoji} *VENDOR RESPONSE — ${response.orderNumber}*`,
    `━━━━━━━━━━━━━━━━━━`,
    `Vendor: ${response.vendorName ?? "—"}`,
    `Status: ${statusEmoji} ${statusLabel}`,
  ];

  if (response.status === "READY") {
    if (response.estimatedPickupTime) lines.push(`Est. Pickup: ${response.estimatedPickupTime}`);
    if (response.driverName) lines.push(`Driver: ${response.driverName}`);
    if (response.driverPhone) lines.push(`Phone: ${response.driverPhone}`);
    if (response.plateNumber) lines.push(`Plat: ${response.plateNumber}`);
    if (response.vehicleType) lines.push(`Unit: ${response.vehicleType}`);
  }

  if (response.notes) lines.push(`Catatan: ${response.notes}`);
  lines.push(`━━━━━━━━━━━━━━━━━━`);
  if (response.orderId) lines.push(`🔗 Lihat Detail:\n${adminUrl}`);
  lines.push(`\n_Dikirim: ${nowWIB()}_`);

  return lines.join("\n");
}

router.get("/:orderNumber", async (req: Request, res: Response) => {
  const { orderNumber } = req.params;
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
      existingResponse: existing ?? null,
    });
  } catch (err) {
    req.log?.error({ err }, "vendor-response GET error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:orderNumber/photo", upload.single("photo"), async (req: Request, res: Response) => {
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
  const { orderNumber } = req.params;
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
    await sendWhatsApp(ADMIN_GROUP_WA, waMsg).catch((err) =>
      req.log?.error({ err }, "vendor-response admin WA send failed")
    );

    res.json({ success: true, message: "Response berhasil dikirim" });
  } catch (err) {
    req.log?.error({ err }, "vendor-response POST error");
    res.status(500).json({ error: "Gagal menyimpan response" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const responses = await db
      .select()
      .from(vendorResponsesTable)
      .orderBy(vendorResponsesTable.submittedAt);
    res.json(responses);
  } catch (err) {
    req.log?.error({ err }, "vendor-responses list error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as vendorResponseRouter };
