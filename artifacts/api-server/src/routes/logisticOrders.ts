import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  logisticOrdersTable,
  logisticOrderItemsTable,
} from "@workspace/db";
import { eq, ilike, and, gte, lte, or, sql } from "drizzle-orm";
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

function toOrder(row: typeof logisticOrdersTable.$inferSelect) {
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
    requiredDate: row.requiredDate ?? null,
    notes: row.notes ?? null,
    subtotal: parseFloat(row.subtotal),
    tax: parseFloat(row.tax),
    grandTotal: parseFloat(row.grandTotal),
    status: row.status,
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
      requiredDate: body.requiredDate ?? null,
      notes: body.notes ?? null,
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
  const totalOrders = rows.length;
  const newOrders = rows.filter((r) => r.status === "New Order").length;
  const confirmedOrders = rows.filter((r) => r.status === "Confirmed").length;
  const completedOrders = rows.filter((r) => r.status === "Completed").length;
  const totalEstimatedRevenue = rows.reduce(
    (acc, r) => acc + parseFloat(r.grandTotal),
    0
  );
  return res.json({
    totalOrders,
    newOrders,
    confirmedOrders,
    completedOrders,
    totalEstimatedRevenue,
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

  return res.json({ ...toOrder(order), items: items.map(toItem) });
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

  return res.json(toOrder(updated));
});
