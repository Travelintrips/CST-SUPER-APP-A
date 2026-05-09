import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  logisticOrdersTable,
  logisticOrderItemsTable,
  portalContentTable,
  suppliersTable,
} from "@workspace/db";
import { eq, ilike, and, gte, lte, or, sql } from "drizzle-orm";
import { sendLogisticOrderNotification } from "../lib/orderNotification";
import { sendWhatsApp } from "../lib/fonnte";
import {
  CreateLogisticOrderBody,
  ListLogisticOrdersQueryParams,
  GetLogisticOrderByNumberParams,
  GetLogisticOrderParams,
  UpdateLogisticOrderStatusParams,
  UpdateLogisticOrderStatusBody,
} from "@workspace/api-zod";

export const logisticOrdersRouter = Router();

function generateOrderNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `LOG-${y}${m}${d}-${rand}`;
}

function toOrder(row: typeof logisticOrdersTable.$inferSelect, approvedVendorName?: string | null) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    companyName: row.companyName,
    customerName: row.customerName,
    email: row.email,
    phone: row.phone,
    shipmentType: row.shipmentType,
    origin: row.origin,
    destination: row.destination,
    commodity: row.commodity ?? null,
    cargoDescription: row.cargoDescription ?? null,
    grossWeight: row.grossWeight ? parseFloat(row.grossWeight) : null,
    volumeCbm: row.volumeCbm ? parseFloat(row.volumeCbm) : null,
    jumlahKoli: row.jumlahKoli ?? null,
    requiredDate: row.requiredDate ?? null,
    notes: row.notes ?? null,
    paymentType: row.paymentType ?? null,
    paymentMethod: row.paymentMethod ?? null,
    namaPenerima: row.namaPenerima ?? null,
    nomorPenerima: row.nomorPenerima ?? null,
    jamOrder: row.jamOrder ?? null,
    source: row.source ?? "manual",
    aiSessionToken: row.aiSessionToken ?? null,
    subtotal: parseFloat(row.subtotal),
    tax: parseFloat(row.tax),
    grandTotal: parseFloat(row.grandTotal),
    status: row.status,
    approvedQuoteId: row.approvedQuoteId ?? null,
    adminApprovalStatus: row.adminApprovalStatus ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedVendorId: row.approvedVendorId ?? null,
    approvedVendorName: approvedVendorName ?? null,
    finalSellingPrice: row.finalSellingPrice ? parseFloat(row.finalSellingPrice) : null,
    quotationSentAt: row.quotationSentAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toItem(row: typeof logisticOrderItemsTable.$inferSelect) {
  return {
    id: row.id,
    orderId: row.orderId,
    category: row.category,
    serviceName: row.serviceName,
    calculatorType: row.calculatorType,
    inputData: row.inputData,
    calculationResult: row.calculationResult,
    subtotal: parseFloat(row.subtotal),
    createdAt: row.createdAt.toISOString(),
  };
}

// POST /api/logistic/orders — create order (public)
logisticOrdersRouter.post("/", async (req: Request, res: Response) => {
  const parsed = CreateLogisticOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Data tidak valid", errors: parsed.error.errors });
  }
  const body = parsed.data;

  const orderNumber = generateOrderNumber();

  const [order] = await db
    .insert(logisticOrdersTable)
    .values({
      orderNumber,
      companyName: body.companyName,
      customerName: body.customerName,
      email: body.email,
      phone: body.phone,
      shipmentType: body.shipmentType,
      origin: body.origin,
      destination: body.destination,
      commodity: body.commodity ?? null,
      cargoDescription: body.cargoDescription ?? null,
      grossWeight: body.grossWeight != null ? String(body.grossWeight) : null,
      volumeCbm: body.volumeCbm != null ? String(body.volumeCbm) : null,
      jumlahKoli: body.jumlahKoli ?? null,
      requiredDate: body.requiredDate ?? null,
      notes: body.notes ?? null,
      paymentType: body.paymentType ?? null,
      paymentMethod: body.paymentMethod ?? null,
      namaPenerima: body.namaPenerima ?? null,
      nomorPenerima: body.nomorPenerima ?? null,
      jamOrder: body.jamOrder ?? null,
      source: "manual",
      subtotal: String(body.subtotal),
      tax: String(body.tax),
      grandTotal: String(body.grandTotal),
      status: "New Order",
    })
    .returning();

  const itemValues = body.items.map((item) => ({
    orderId: order.id,
    category: item.category,
    serviceName: item.serviceName,
    calculatorType: item.calculatorType,
    inputData: item.inputData as Record<string, unknown>,
    calculationResult: item.calculationResult as Record<string, unknown>,
    subtotal: String(item.subtotal),
  }));

  const items =
    itemValues.length > 0
      ? await db.insert(logisticOrderItemsTable).values(itemValues).returning()
      : [];

  const serviceList = body.items.map((i) => `• ${i.serviceName}`).join("\n");

  // Fire-and-forget: notify admin + vendors + customer via WA & email
  sendLogisticOrderNotification({
    id: order.id,
    orderNumber,
    customerName: body.customerName,
    companyName: body.companyName,
    email: body.email,
    phone: body.phone,
    shipmentType: body.shipmentType,
    origin: body.origin,
    destination: body.destination,
    commodity: body.commodity ?? null,
    cargoDescription: body.cargoDescription ?? null,
    grossWeight: body.grossWeight != null ? Number(body.grossWeight) : null,
    volumeCbm: body.volumeCbm != null ? Number(body.volumeCbm) : null,
    grandTotal: Number(body.grandTotal),
    serviceList,
    requiredDate: body.requiredDate ?? null,
    notes: body.notes ?? null,
    jamOrder: body.jamOrder ?? null,
    createdAt: order.createdAt,
  }).catch((err: unknown) => {
    req.log.error({ err }, "sendLogisticOrderNotification failed");
  });

  return res.status(201).json({
    ...toOrder(order),
    items: items.map(toItem),
  });
});

// GET /api/logistic/orders — list orders (admin)
logisticOrdersRouter.get("/", async (req: Request, res: Response) => {
  const parsed = ListLogisticOrdersQueryParams.safeParse(req.query);
  const q = parsed.success ? parsed.data : {};

  const conditions = [];
  if (q.status) conditions.push(eq(logisticOrdersTable.status, q.status));
  if (q.shipmentType) conditions.push(eq(logisticOrdersTable.shipmentType, q.shipmentType));
  if (q.search) {
    conditions.push(
      or(
        ilike(logisticOrdersTable.customerName, `%${q.search}%`),
        ilike(logisticOrdersTable.companyName, `%${q.search}%`),
        ilike(logisticOrdersTable.orderNumber, `%${q.search}%`)
      )!
    );
  }
  if (q.dateFrom) conditions.push(gte(logisticOrdersTable.createdAt, new Date(q.dateFrom)));
  if (q.dateTo) conditions.push(lte(logisticOrdersTable.createdAt, new Date(q.dateTo)));

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(logisticOrdersTable)
          .where(and(...conditions))
          .orderBy(sql`${logisticOrdersTable.createdAt} DESC`)
      : await db
          .select()
          .from(logisticOrdersTable)
          .orderBy(sql`${logisticOrdersTable.createdAt} DESC`);

  return res.json(rows.map(toOrder));
});

// GET /api/logistic/orders/summary — dashboard stats (admin)
logisticOrdersRouter.get("/summary", async (_req: Request, res: Response) => {
  const rows = await db.select().from(logisticOrdersTable);
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  return res.json({
    totalOrders: rows.length,
    newOrders: count("New Order"),
    underReviewOrders: count("Under Review"),
    quotationSentOrders: count("Quotation Sent"),
    confirmedOrders: count("Confirmed"),
    inProgressOrders: count("In Progress"),
    completedOrders: count("Completed"),
    cancelledOrders: count("Cancelled"),
    totalEstimatedRevenue: rows.reduce((acc, r) => acc + parseFloat(r.grandTotal), 0),
  });
});

// GET /api/logistic/orders/by-number/:orderNumber — lookup by order number (public)
logisticOrdersRouter.get(
  "/by-number/:orderNumber",
  async (req: Request, res: Response) => {
    const parsed = GetLogisticOrderByNumberParams.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ message: "Parameter tidak valid" });
    const { orderNumber } = parsed.data;

    const [order] = await db
      .select()
      .from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.orderNumber, orderNumber));

    if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

    const items = await db
      .select()
      .from(logisticOrderItemsTable)
      .where(eq(logisticOrderItemsTable.orderId, order.id));

    return res.json({ ...toOrder(order), items: items.map(toItem) });
  }
);

// --- Trucking Rates (must be registered BEFORE /:id) ---

const TRUCKING_RATES_KEY = "logistic_trucking_rates";

const DEFAULT_TRUCKING_RATES: Record<string, { ratePerKm: number; loadingFee: number }> = {
  CDE:      { ratePerKm: 5000,  loadingFee: 500000 },
  CDD:      { ratePerKm: 7000,  loadingFee: 700000 },
  Fuso:     { ratePerKm: 10000, loadingFee: 1000000 },
  Wingbox:  { ratePerKm: 12000, loadingFee: 1200000 },
  Trailer:  { ratePerKm: 15000, loadingFee: 1500000 },
};

async function getTruckingRates() {
  const [row] = await db
    .select()
    .from(portalContentTable)
    .where(eq(portalContentTable.key, TRUCKING_RATES_KEY));
  if (!row) return DEFAULT_TRUCKING_RATES;
  try {
    return JSON.parse(row.value) as typeof DEFAULT_TRUCKING_RATES;
  } catch {
    return DEFAULT_TRUCKING_RATES;
  }
}

// GET /api/logistic/orders/trucking-rates — public
logisticOrdersRouter.get("/trucking-rates", async (_req: Request, res: Response) => {
  const rates = await getTruckingRates();
  return res.json(rates);
});

// PUT /api/logistic/orders/trucking-rates — admin only
logisticOrdersRouter.put("/trucking-rates", async (req: Request, res: Response) => {
  const adminPassword = req.headers["x-admin-password"];
  if (adminPassword !== "admin123") {
    return res.status(403).json({ message: "Akses ditolak" });
  }
  const rates = req.body as Record<string, { ratePerKm: number; loadingFee: number }>;
  if (!rates || typeof rates !== "object") {
    return res.status(400).json({ message: "Format tarif tidak valid" });
  }
  const json = JSON.stringify(rates);
  const existing = await db
    .select()
    .from(portalContentTable)
    .where(eq(portalContentTable.key, TRUCKING_RATES_KEY));
  if (existing.length > 0) {
    await db
      .update(portalContentTable)
      .set({ value: json })
      .where(eq(portalContentTable.key, TRUCKING_RATES_KEY));
  } else {
    await db
      .insert(portalContentTable)
      .values({ key: TRUCKING_RATES_KEY, value: json });
  }
  return res.json({ message: "Tarif berhasil disimpan" });
});

// ─── Delivery Vendors CRUD (for BizPortal) ───────────────────────────────────

// GET /api/logistic/orders/vendors
logisticOrdersRouter.get("/vendors", async (_req: Request, res: Response) => {
  const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.sortOrder);
  return res.json(rows.map((v) => ({ ...v, fee: Number(v.fee ?? 0), email: v.contactEmail })));
});

// POST /api/logistic/orders/vendors
logisticOrdersRouter.post("/vendors", async (req: Request, res: Response) => {
  const { name, logo, eta, fee, note, phone, email, serviceType } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string" || !name.trim())
    return res.status(400).json({ message: "Nama vendor harus diisi" });
  const [maxRow] = await db.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(suppliersTable);
  const nextSort = Number(maxRow?.max ?? 0) + 1;
  const [created] = await db.insert(suppliersTable).values({
    name: String(name).trim(),
    logo: typeof logo === "string" && logo.trim() ? logo.trim() : "📦",
    eta: typeof eta === "string" && eta.trim() ? eta.trim() : "2-3 hari",
    fee: typeof fee === "number" ? String(fee) : "0",
    note: typeof note === "string" && note.trim() ? note.trim() : null,
    phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
    contactEmail: typeof email === "string" && email.trim() ? email.trim() : null,
    serviceType: typeof serviceType === "string" && serviceType.trim() ? serviceType.trim() : null,
    isActive: true,
    sortOrder: nextSort,
  }).returning();
  return res.status(201).json({ ...created, fee: Number(created.fee ?? 0), email: created.contactEmail });
});

// PUT /api/logistic/orders/vendors/:id
logisticOrdersRouter.put("/vendors/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { name, logo, eta, fee, note, phone, email, serviceType, isActive, sortOrder } = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  if (typeof logo === "string") patch.logo = logo.trim() || "📦";
  if (typeof eta === "string" && eta.trim()) patch.eta = eta.trim();
  if (typeof fee === "number") patch.fee = String(fee);
  if (note !== undefined) patch.note = typeof note === "string" && note.trim() ? note.trim() : null;
  if (phone !== undefined) patch.phone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
  if (email !== undefined) patch.contactEmail = typeof email === "string" && email.trim() ? email.trim() : null;
  if (serviceType !== undefined) patch.serviceType = typeof serviceType === "string" && serviceType.trim() ? serviceType.trim() : null;
  if (typeof isActive === "boolean") patch.isActive = isActive;
  if (typeof sortOrder === "number") patch.sortOrder = sortOrder;
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: "Tidak ada data yang diperbarui" });
  const [updated] = await db.update(suppliersTable).set(patch).where(eq(suppliersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Vendor tidak ditemukan" });
  return res.json({ ...updated, fee: Number(updated.fee ?? 0), email: updated.contactEmail });
});

// DELETE /api/logistic/orders/vendors/:id
logisticOrdersRouter.delete("/vendors/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const [deleted] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ message: "Vendor tidak ditemukan" });
  return res.json({ success: true });
});

// GET /api/logistic/orders/:id — get order detail (admin)
logisticOrdersRouter.get("/:id", async (req: Request, res: Response) => {
  const parsed = GetLogisticOrderParams.safeParse({
    id: parseInt(req.params.id, 10),
  });
  if (!parsed.success || isNaN(parsed.data.id))
    return res.status(400).json({ message: "ID tidak valid" });
  const { id } = parsed.data;

  const [order] = await db
    .select()
    .from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, id));

  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const items = await db
    .select()
    .from(logisticOrderItemsTable)
    .where(eq(logisticOrderItemsTable.orderId, id));

  let approvedVendorName: string | null = null;
  if (order.approvedVendorId) {
    const [v] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, order.approvedVendorId));
    approvedVendorName = v?.name ?? null;
  }

  return res.json({ ...toOrder(order, approvedVendorName), items: items.map(toItem) });
});

// PUT /api/logistic/orders/:id/status — update status (admin)
logisticOrdersRouter.put("/:id/status", async (req: Request, res: Response) => {
  const paramsParsed = UpdateLogisticOrderStatusParams.safeParse({
    id: parseInt(req.params.id, 10),
  });
  const bodyParsed = UpdateLogisticOrderStatusBody.safeParse(req.body);

  if (!paramsParsed.success || isNaN(paramsParsed.data.id))
    return res.status(400).json({ message: "ID tidak valid" });
  if (!bodyParsed.success)
    return res.status(400).json({ message: "Status tidak valid" });

  const { id } = paramsParsed.data;
  const { status } = bodyParsed.data;

  const [updated] = await db
    .update(logisticOrdersTable)
    .set({ status })
    .where(eq(logisticOrdersTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ message: "Order tidak ditemukan" });

  // Notify customer via WhatsApp (fire-and-forget)
  if (updated.phone) {
    const statusLabels: Record<string, string> = {
      "New Order": "Order Baru",
      "Under Review": "Sedang Ditinjau",
      "Quotation Sent": "Penawaran Telah Dikirim",
      "Confirmed": "Dikonfirmasi",
      "In Progress": "Sedang Diproses",
      "Completed": "Selesai",
      "Cancelled": "Dibatalkan",
    };
    const label = statusLabels[status] ?? status;
    const msg =
      `📦 *Update Status Order Anda*\n` +
      `No Order: ${updated.orderNumber}\n` +
      `Status: *${label}*\n\n` +
      `Terima kasih telah menggunakan layanan kami. Hubungi kami jika ada pertanyaan.`;
    sendWhatsApp(updated.phone, msg).catch(() => undefined);
  }

  return res.json(toOrder(updated));
});

// DELETE /api/logistic/orders/:id
logisticOrdersRouter.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] ?? "");
  if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
  const [deleted] = await db
    .delete(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Order tidak ditemukan" });
  return res.json({ message: "Deleted", id });
});

