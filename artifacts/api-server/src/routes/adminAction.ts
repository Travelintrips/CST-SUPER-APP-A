import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq, desc, inArray, sql, and } from "drizzle-orm";
import {
  db,
  adminActionLinksTable,
  logisticOrdersTable,
  logisticOrderItemsTable,
  logisticOrderRfqsTable,
  rfqVendorLinksTable,
  suppliersTable,
  vendorCatalogItemsTable,
  customerQuoteLinksTable,
  orderUpdatesTable,
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { getPreferredDomain } from "../lib/domain.js";
import { logger } from "../lib/logger.js";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminGroupWa } from "../lib/adminWa.js";
import { sendVendorRequestNotification, type LogisticOrderData } from "../lib/orderNotification.js";
import { generateShortLink } from "../lib/shortLink.js";

export const adminActionRouter: Router = Router();
export const adminActionPublicRouter = Router();
export const adminActionAdminRouter = Router();

/**
 * GET /admin-action/:token
 *
 * Public no-login redirect link sent to admin via WhatsApp.
 *
 * Lookup strategy:
 *   1. Try publicRfqToken column on logistic_orders (new format, 32 hex chars)
 *   2. Fallback: query short_links table for target_url matching this token,
 *      then use ref_id as orderNumber or orderId.
 *   3. Final fallback: redirect to BizPortal logistics orders list.
 */
adminActionRouter.get("/admin-action/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "").trim();
  const domain = getPreferredDomain() || "cstlogistic.co.id";
  // Redirect to the public no-login admin review page on customer portal
  return res.redirect(302, `https://${domain}/admin-review/${token}`);
});

// ─── Boot migration ───────────────────────────────────────────────────────────
let migrationDone = false;
async function ensureTables() {
  if (migrationDone) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_action_links (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        action_type TEXT NOT NULL,
        order_id INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
        rfq_id INTEGER REFERENCES logistic_order_rfqs(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    migrationDone = true;
  } catch (err) {
    logger.error({ err }, "adminAction ensureTables error");
  }
}

// ─── Helper: generate admin action link ──────────────────────────────────────
export async function createAdminActionLink(
  orderId: number,
  actionType: string,
  rfqId?: number | null,
  expiresInHours = 72,
): Promise<string> {
  await ensureTables();
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);
  await db.insert(adminActionLinksTable).values({
    token,
    actionType,
    orderId,
    rfqId: rfqId ?? null,
    expiresAt,
  });
  return token;
}

export function getAdminActionUrl(token: string): string {
  const domain = getPreferredDomain() || "cstlogistic.co.id";
  return `https://${domain}/admin-review/${token}`;
}

// ─── Admin: POST /api/admin-action/create ────────────────────────────────────
adminActionAdminRouter.post("/create", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const { orderId, actionType, rfqId, expiresInHours = 72 } = req.body as {
    orderId: number;
    actionType: string;
    rfqId?: number;
    expiresInHours?: number;
  };
  if (!orderId || !actionType) {
    return res.status(400).json({ error: "orderId dan actionType wajib" });
  }

  await ensureTables();

  const token = await createAdminActionLink(orderId, actionType, rfqId, expiresInHours);
  const url = getAdminActionUrl(token);
  const shortUrl = await generateShortLink(url, {
    context: "admin_action",
    refType: "order",
    refId: String(orderId),
  });
  return res.json({ ok: true, token, url, shortUrl });
});

// ─── Public: GET /api/admin-action/:token ────────────────────────────────────
adminActionPublicRouter.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  await ensureTables();

  try {
    let link = (await db.select().from(adminActionLinksTable)
      .where(eq(adminActionLinksTable.token, token)))[0];

    const ORDER_COLS = {
      id: logisticOrdersTable.id,
      orderNumber: logisticOrdersTable.orderNumber,
      companyName: logisticOrdersTable.companyName,
      customerName: logisticOrdersTable.customerName,
      email: logisticOrdersTable.email,
      phone: logisticOrdersTable.phone,
      orderType: logisticOrdersTable.orderType,
      shipmentType: logisticOrdersTable.shipmentType,
      origin: logisticOrdersTable.origin,
      destination: logisticOrdersTable.destination,
      commodity: logisticOrdersTable.commodity,
      cargoDescription: logisticOrdersTable.cargoDescription,
      grossWeight: logisticOrdersTable.grossWeight,
      volumeCbm: logisticOrdersTable.volumeCbm,
      jumlahKoli: logisticOrdersTable.jumlahKoli,
      requiredDate: logisticOrdersTable.requiredDate,
      jamOrder: logisticOrdersTable.jamOrder,
      notes: logisticOrdersTable.notes,
      paymentType: logisticOrdersTable.paymentType,
      status: logisticOrdersTable.status,
      publicRfqToken: logisticOrdersTable.publicRfqToken,
      grandTotal: logisticOrdersTable.grandTotal,
      createdAt: logisticOrdersTable.createdAt,
    };

    // Fallback: token mungkin adalah publicRfqToken dari logistic_orders
    let orderFromPublicToken: typeof ORDER_COLS extends Record<string, unknown> ? any : any;
    if (!link) {
      const [ord] = await db.select(ORDER_COLS).from(logisticOrdersTable)
        .where(eq(logisticOrdersTable.publicRfqToken, token))
        .limit(1);
      if (!ord) return res.status(404).json({ error: "Link tidak ditemukan" });
      orderFromPublicToken = ord;
    }

    if (link && link.expiresAt && link.expiresAt < new Date()) {
      return res.status(410).json({ error: "Link sudah kadaluarsa", isExpired: true });
    }

    const order = orderFromPublicToken ?? (await db.select(ORDER_COLS).from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, link!.orderId))
      .limit(1))[0];
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

    const actionType = link?.actionType ?? "review_order";
    const base = {
      token,
      actionType,
      isUsed: link ? !!link.usedAt : false,
      usedAt: link?.usedAt?.toISOString() ?? null,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        companyName: order.companyName ?? null,
        email: order.email ?? null,
        phone: (order as any).phone ?? null,
        orderType: (order as any).orderType ?? null,
        serviceType: order.shipmentType,
        origin: order.origin,
        destination: order.destination,
        commodity: order.commodity ?? null,
        cargoDescription: order.cargoDescription ?? null,
        grossWeight: order.grossWeight ? String(order.grossWeight) : null,
        volumeCbm: order.volumeCbm ? String(order.volumeCbm) : null,
        jumlahKoli: (order as any).jumlahKoli ?? null,
        requiredDate: (order as any).requiredDate ?? null,
        notes: (order as any).notes ?? null,
        paymentType: (order as any).paymentType ?? null,
        grandTotal: order.grandTotal ? String(order.grandTotal) : null,
        status: order.status,
      },
    };

    // review_order: get list of all vendors + matching flag for blast
    if (actionType === "review_order") {
      const allVendors = await db.select({
        id: suppliersTable.id,
        name: suppliersTable.name,
        phone: suppliersTable.phone,
        email: suppliersTable.contactEmail,
        serviceType: suppliersTable.serviceType,
        eta: suppliersTable.eta,
        fee: suppliersTable.fee,
        note: suppliersTable.note,
      }).from(suppliersTable)
        .where(eq(suppliersTable.isActive, true))
        .orderBy(suppliersTable.name);

      // Normalize shipment type for matching (check all words, not just first)
      const shipType = (order.shipmentType ?? "").toLowerCase().trim();
      const shipKeywords = shipType.split(/[\s,]+/).filter((k) => k.length > 1);

      // Vendor harus punya phone.
      const allWithPhone = allVendors.filter((v) => !!v.phone);

      // Fetch catalog items for all vendors in one query to check commodity match
      const vendorIdList = allWithPhone.map((v) => v.id);
      const catalogItems = vendorIdList.length
        ? await db.select({
            vendorId: vendorCatalogItemsTable.vendorId,
            name: vendorCatalogItemsTable.name,
            type: vendorCatalogItemsTable.type,
            isCommodityTag: vendorCatalogItemsTable.isCommodityTag,
          }).from(vendorCatalogItemsTable)
            .where(and(
              inArray(vendorCatalogItemsTable.vendorId, vendorIdList),
              eq(vendorCatalogItemsTable.isActive, true),
            ))
        : [];

      // Build sets: vendor dengan commodity match & vendor yang punya item PRODUK di etalase
      const commodityKeyword = (order.commodity ?? "").toLowerCase().trim();
      const vendorIdsWithCommodity   = new Set<number>();
      const vendorIdsWithProductItem = new Set<number>(); // hanya type='product'

      for (const item of catalogItems) {
        if (item.type === "product") {
          vendorIdsWithProductItem.add(item.vendorId);
        }

        if (commodityKeyword) {
          const kwParts = commodityKeyword.split(/\s+/).filter((k: string) => k.length > 2);
          const isTagged = item.isCommodityTag === true;
          const itemName = item.name.toLowerCase();
          const nameMatches = itemName.includes(commodityKeyword) ||
            kwParts.some((kw: string) => itemName.includes(kw));
          if (isTagged || nameMatches) vendorIdsWithCommodity.add(item.vendorId);
        }
      }

      // Service type matching: vendor's serviceType must contain at least one of the ship keywords
      const isServiceMatch = (vendorServiceType: string | null): boolean => {
        if (!vendorServiceType || shipKeywords.length === 0) return false;
        const vst = vendorServiceType.toLowerCase();
        return shipKeywords.some((kw) => vst.includes(kw));
      };

      const allWithFlag = allWithPhone.map((v) => ({
        ...v,
        isMatching: isServiceMatch(v.serviceType),
        hasCommodityMatch: vendorIdsWithCommodity.has(v.id),
        hasProductItem: vendorIdsWithProductItem.has(v.id),
      }));

      const commodityMatched  = allWithFlag.filter((v) => v.hasCommodityMatch);
      const serviceMatched    = allWithFlag.filter((v) => v.isMatching && !v.hasCommodityMatch);
      const productVendors    = allWithFlag.filter((v) => v.hasProductItem);

      // ── Filter strategy ──────────────────────────────────────────────────
      // 1. shipmentType ada + ada match → hanya vendor yg match (service + commodity)
      // 2. shipmentType ada + tak ada match → semua vendor berserviceType + warning
      // 3. shipmentType kosong + commodity ada + ada commodity match → hanya vendor dg commodity match
      // 4. shipmentType kosong + commodity ada + tak ada match → vendor yg punya etalase apapun
      // 5. shipmentType kosong + commodity kosong + ada etalase → hanya vendor yg punya etalase
      // 6. shipmentType kosong + commodity kosong + tak ada etalase → vendor berserviceType (fallback)
      let vendors: typeof allWithFlag;
      let vendorFilterApplied = false;
      let filterMode: "service" | "commodity" | "etalase" | "none" = "none";

      if (shipType) {
        const hasMatch = commodityMatched.length > 0 || serviceMatched.length > 0;
        if (hasMatch) {
          vendors = [...commodityMatched, ...serviceMatched];
          vendorFilterApplied = true;
          filterMode = "service";
        } else {
          vendors = allWithFlag.filter((v) => !!(v.serviceType && v.serviceType.trim()));
        }
      } else if (commodityKeyword && commodityMatched.length > 0) {
        // Ada commodity + ada vendor yg punya produk itu di etalase
        vendors = commodityMatched;
        vendorFilterApplied = true;
        filterMode = "commodity";
      } else if (productVendors.length > 0) {
        // Tidak ada shipmentType → hanya tampilkan vendor yang punya item PRODUK di etalase
        vendors = productVendors;
        vendorFilterApplied = true;
        filterMode = "etalase";
      } else {
        // Tidak ada vendor dengan produk di etalase → fallback ke vendor berserviceType
        vendors = allWithFlag.filter((v) => !!(v.serviceType && v.serviceType.trim()));
      }

      // Get existing RFQs for this order
      const rfqs = await db.select({
        id: logisticOrderRfqsTable.id,
        rfqNumber: logisticOrderRfqsTable.rfqNumber,
        status: logisticOrderRfqsTable.status,
        createdAt: logisticOrderRfqsTable.createdAt,
      }).from(logisticOrderRfqsTable)
        .where(eq(logisticOrderRfqsTable.orderId, order.id))
        .orderBy(desc(logisticOrderRfqsTable.createdAt));

      return res.json({
        ...base,
        vendors,
        rfqs,
        vendorFilterApplied,
        filterMode,
        shipmentType: order.shipmentType,
        commodity: order.commodity,
      });
    }

    // compare_vendors: show vendor quotes for an RFQ
    if (link.actionType === "compare_vendors") {
      if (!link.rfqId) return res.status(400).json({ error: "rfqId diperlukan untuk compare_vendors" });

      const [rfq] = await db.select().from(logisticOrderRfqsTable)
        .where(eq(logisticOrderRfqsTable.id, link.rfqId));
      if (!rfq) return res.status(404).json({ error: "RFQ tidak ditemukan" });

      const vendorLinks = await db.select().from(rfqVendorLinksTable)
        .where(eq(rfqVendorLinksTable.rfqId, link.rfqId))
        .orderBy(sql`created_at ASC`);

      const vendorIds = vendorLinks.map((l) => l.vendorId);
      const vendors = vendorIds.length
        ? await db.select({ id: suppliersTable.id, name: suppliersTable.name, phone: suppliersTable.phone })
            .from(suppliersTable).where(inArray(suppliersTable.id, vendorIds))
        : [];
      const vendorMap = new Map(vendors.map((v) => [v.id, v]));

      const vendorRows = vendorLinks
        .sort((a, b) => {
          const pa = Number(a.offeredPrice ?? a.basicPrice ?? 9e9);
          const pb = Number(b.offeredPrice ?? b.basicPrice ?? 9e9);
          return pa - pb;
        })
        .map((l) => ({
          linkId: l.id,
          vendorId: l.vendorId,
          vendorName: vendorMap.get(l.vendorId)?.name ?? `Vendor #${l.vendorId}`,
          status: l.status,
          basicPrice: l.basicPrice ? Number(l.basicPrice) : null,
          offeredPrice: l.offeredPrice ? Number(l.offeredPrice) : null,
          eta: l.eta ?? null,
          notes: l.notes ?? null,
          submittedAt: l.submittedAt?.toISOString() ?? null,
        }));

      return res.json({
        ...base,
        rfq: {
          id: rfq.id,
          rfqNumber: rfq.rfqNumber,
          status: rfq.status,
        },
        vendors: vendorRows,
      });
    }

    // forward_vendor: show order + selected vendor to create fulfillment task
    if (link.actionType === "forward_vendor") {
      if (!link.rfqId) return res.status(400).json({ error: "rfqId diperlukan untuk forward_vendor" });

      const [rfq] = await db.select().from(logisticOrderRfqsTable)
        .where(eq(logisticOrderRfqsTable.id, link.rfqId));

      const selectedLinks = await db.select().from(rfqVendorLinksTable)
        .where(eq(rfqVendorLinksTable.rfqId, link.rfqId!));

      const selected = selectedLinks.find((l) => l.status === "selected");
      let selectedVendor = null;
      if (selected) {
        const [v] = await db.select({ id: suppliersTable.id, name: suppliersTable.name, phone: suppliersTable.phone })
          .from(suppliersTable).where(eq(suppliersTable.id, selected.vendorId));
        selectedVendor = v ?? null;
      }

      return res.json({
        ...base,
        rfq: rfq ? { id: rfq.id, rfqNumber: rfq.rfqNumber, status: rfq.status } : null,
        selectedVendor,
        selectedVendorLink: selected ?? null,
      });
    }

    return res.json(base);
  } catch (err) {
    logger.error({ err }, "admin-action GET error");
    return res.status(500).json({ error: "Gagal memuat data" });
  }
});

const fmtRp = (n: number | null | string | undefined) => {
  const num = Number(n ?? 0);
  return `Rp ${Math.round(num).toLocaleString("id-ID")}`;
};

// ─── Public: POST /api/admin-action/:token ───────────────────────────────────
adminActionPublicRouter.post("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  await ensureTables();

  try {
    let link = (await db.select().from(adminActionLinksTable)
      .where(eq(adminActionLinksTable.token, token)))[0] ?? null;

    // Fallback: token mungkin publicRfqToken dari logistic_orders (WA direct link)
    let orderFromPublicToken: any = null;
    if (!link) {
      const ORDER_COLS = {
        id: logisticOrdersTable.id,
        orderNumber: logisticOrdersTable.orderNumber,
        companyName: logisticOrdersTable.companyName,
        customerName: logisticOrdersTable.customerName,
        email: logisticOrdersTable.email,
        phone: logisticOrdersTable.phone,
        shipmentType: logisticOrdersTable.shipmentType,
        origin: logisticOrdersTable.origin,
        destination: logisticOrdersTable.destination,
        commodity: logisticOrdersTable.commodity,
        status: logisticOrdersTable.status,
        publicRfqToken: logisticOrdersTable.publicRfqToken,
        grandTotal: logisticOrdersTable.grandTotal,
      };
      const [ord] = await db.select(ORDER_COLS).from(logisticOrdersTable)
        .where(eq(logisticOrdersTable.publicRfqToken, token))
        .limit(1);
      if (!ord) return res.status(404).json({ error: "Link tidak ditemukan" });
      orderFromPublicToken = ord;
    }

    if (link && link.expiresAt && link.expiresAt < new Date()) {
      return res.status(410).json({ error: "Link sudah kadaluarsa" });
    }
    // compare_vendors and forward_vendor are single-use; review_order is multi-use
    if (link && link.actionType !== "review_order" && link.usedAt) {
      return res.status(409).json({ error: "Link sudah digunakan", isUsed: true, usedAt: link.usedAt?.toISOString() });
    }

    const order = orderFromPublicToken ?? (await db.select().from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, link!.orderId)))[0];
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

    const actionType = link?.actionType ?? "review_order";

    // ── review_order: create RFQ + blast to selected vendors ──────────────
    if (actionType === "review_order") {
      const { vendorIds, deadlineHours = 48 } = req.body as {
        vendorIds: number[];
        deadlineHours?: number;
      };
      if (!vendorIds?.length) return res.status(400).json({ error: "vendorIds wajib diisi" });

      // Create or reuse RFQ
      let rfq = await db.select().from(logisticOrderRfqsTable)
        .where(eq(logisticOrderRfqsTable.orderId, order.id))
        .then((r) => r[0]);

      if (!rfq) {
        const yr = new Date().getFullYear();
        const seq = Date.now().toString().slice(-5);
        const rfqNumber = `RFQ/${yr}/${seq}`;
        const [inserted] = await db.insert(logisticOrderRfqsTable).values({
          orderId: order.id,
          rfqNumber,
          status: "draft",
          vendorIds: vendorIds,
        }).returning();
        rfq = inserted!;
      }

      const vendors = await db.select().from(suppliersTable)
        .where(inArray(suppliersTable.id, vendorIds));
      const eligible = vendors.filter((v) => v.phone);

      const expiredAt = new Date(Date.now() + deadlineHours * 3600_000);
      const domain = getPreferredDomain() || "cstlogistic.co.id";

      const results: { vendorId: number; vendorName: string; sent: boolean }[] = [];

      for (const vendor of eligible) {
        const existing = await db.select().from(rfqVendorLinksTable)
          .where(eq(rfqVendorLinksTable.rfqId, rfq.id))
          .then((r) => r.find((l) => l.vendorId === vendor.id));

        let linkToken: string;
        if (existing) {
          linkToken = existing.token;
        } else {
          const { randomUUID } = await import("crypto");
          linkToken = randomUUID();
          await db.insert(rfqVendorLinksTable).values({
            rfqId: rfq.id,
            vendorId: vendor.id,
            token: linkToken,
            status: "waiting_response",
            expiredAt,
          });
        }

        const formUrl = `https://${domain}/vendor-form/${linkToken}`;
        const shortUrl = await generateShortLink(formUrl, { context: "vendor_rfq", refType: "rfq", refId: String(rfq.id) });

        const rawItems = await db.select({
          serviceName: logisticOrderItemsTable.serviceName,
          subtotal: logisticOrderItemsTable.subtotal,
        }).from(logisticOrderItemsTable)
          .where(eq(logisticOrderItemsTable.orderId, order.id));

        const isProductOrder = (order.orderType ?? "") === "product";
        const serviceList = rawItems.length
          ? rawItems.map(i => `• ${i.serviceName}`).join("\n")
          : "";
        const orderItems = rawItems.length
          ? rawItems.map(i => ({
              name: i.serviceName ?? "",
              subtotal: i.subtotal != null ? parseFloat(String(i.subtotal)) : null,
            }))
          : undefined;

        const orderData: LogisticOrderData = {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName ?? "",
          companyName: order.companyName ?? "",
          email: order.email ?? "",
          phone: order.phone ?? "",
          orderType: order.orderType ?? undefined,
          shipmentType: order.shipmentType ?? "",
          origin: order.origin ?? "",
          destination: order.destination ?? "",
          commodity: order.commodity,
          cargoDescription: order.cargoDescription,
          grossWeight: !isProductOrder && order.grossWeight != null ? parseFloat(String(order.grossWeight)) : null,
          volumeCbm: !isProductOrder && order.volumeCbm != null ? parseFloat(String(order.volumeCbm)) : null,
          jumlahKoli: !isProductOrder ? (order.jumlahKoli ?? null) : null,
          grandTotal: order.grandTotal != null ? parseFloat(String(order.grandTotal)) : 0,
          serviceList,
          orderItems,
          requiredDate: order.requiredDate ?? null,
          notes: order.notes,
          jamOrder: order.jamOrder ?? null,
          createdAt: order.createdAt,
          publicRfqToken: order.publicRfqToken,
        };

        try {
          await sendVendorRequestNotification(orderData, vendor.name!, vendor.phone!, shortUrl);
          results.push({ vendorId: vendor.id, vendorName: vendor.name, sent: true });
        } catch (_e) {
          results.push({ vendorId: vendor.id, vendorName: vendor.name, sent: false });
        }
      }

      await db.update(logisticOrderRfqsTable).set({
        status: "vendor_blasted",
        vendorIds,
        responseDeadline: expiredAt,
      }).where(eq(logisticOrderRfqsTable.id, rfq.id));

      // Activity log
      const sentNames = results.filter(r => r.sent).map(r => r.vendorName).join(", ");
      await db.insert(orderUpdatesTable).values({
        orderId: order.id,
        actorType: "admin",
        actorName: "Admin",
        status: "vendor_blasted",
        notes: `RFQ ${rfq.rfqNumber} di-blast ke ${results.filter(r => r.sent).length} vendor via mini form: ${sentNames}`,
        isPublic: false,
      }).catch(() => {});

      if (link) {
        await db.update(adminActionLinksTable).set({ usedAt: new Date() })
          .where(eq(adminActionLinksTable.token, token));
      }

      // Create compare_vendors link for next step
      const compareToken = await createAdminActionLink(order.id, "compare_vendors", rfq.id, 72);
      const compareUrl = getAdminActionUrl(compareToken);
      const compareShort = await generateShortLink(compareUrl, { context: "admin_action", refType: "rfq", refId: String(rfq.id) });

      const adminGroupWa = await getAdminGroupWa();
      if (adminGroupWa) {
        const sentCount = results.filter((r) => r.sent).length;
        sendWhatsApp(adminGroupWa,
          `✅ RFQ ${rfq.rfqNumber} telah di-blast ke ${sentCount} vendor\n` +
          `Order: ${order.orderNumber}\n` +
          `Bandingkan penawaran vendor:\n${compareShort}`
        ).catch(() => {});
      }

      return res.json({ ok: true, rfqId: rfq.id, rfqNumber: rfq.rfqNumber, results, compareUrl: compareShort });
    }

    // ── compare_vendors: select vendor + (optionally) send customer quote ──
    if (actionType === "compare_vendors") {
      const { linkId, sellingPrice, quoteNotes, sendQuoteToCustomer = false } = req.body as {
        linkId: number;
        sellingPrice?: number;
        quoteNotes?: string;
        sendQuoteToCustomer?: boolean;
      };
      if (!linkId) return res.status(400).json({ error: "linkId wajib diisi" });
      if (!link.rfqId) return res.status(400).json({ error: "rfqId tidak ada di link ini" });

      const [vendorLink] = await db.select().from(rfqVendorLinksTable)
        .where(eq(rfqVendorLinksTable.id, linkId));
      if (!vendorLink) return res.status(404).json({ error: "Vendor link tidak ditemukan" });
      // Scope check: vendorLink must belong to the RFQ tied to this token
      if (vendorLink.rfqId !== link.rfqId) {
        return res.status(403).json({ error: "Vendor link tidak sesuai dengan RFQ pada token ini" });
      }

      const [rfq] = await db.select().from(logisticOrderRfqsTable)
        .where(eq(logisticOrderRfqsTable.id, link.rfqId));
      if (!rfq) return res.status(404).json({ error: "RFQ tidak ditemukan" });

      const [vendor] = await db.select().from(suppliersTable)
        .where(eq(suppliersTable.id, vendorLink.vendorId));

      // Mark selected
      await db.update(rfqVendorLinksTable).set({ status: "selected" })
        .where(eq(rfqVendorLinksTable.id, linkId));

      const otherLinks = await db.select({ id: rfqVendorLinksTable.id, status: rfqVendorLinksTable.status })
        .from(rfqVendorLinksTable)
        .where(eq(rfqVendorLinksTable.rfqId, link.rfqId!));

      for (const other of otherLinks) {
        if (other.id !== linkId && !["rejected", "expired", "late_response"].includes(other.status)) {
          await db.update(rfqVendorLinksTable).set({ status: "not_selected" })
            .where(eq(rfqVendorLinksTable.id, other.id));
        }
      }

      await db.update(logisticOrderRfqsTable).set({ status: "vendor_selected" })
        .where(eq(logisticOrderRfqsTable.id, link.rfqId!));

      if (sellingPrice) {
        await db.update(logisticOrdersTable)
          .set({ finalSellingPrice: String(sellingPrice), approvedVendorId: vendorLink.vendorId })
          .where(eq(logisticOrdersTable.id, order.id));
      }

      // Optionally send quote to customer
      let quoteToken: string | null = null;
      let quoteShortUrl: string | null = null;
      if (sendQuoteToCustomer && sellingPrice) {
        const finalPrice = sellingPrice;
        const yr = new Date().getFullYear();
        const seq = Date.now().toString().slice(-5);
        const quotationNumber = `QUO/${yr}/${seq}`;
        quoteToken = randomBytes(24).toString("hex");

        await db.insert(customerQuoteLinksTable).values({
          rfqId: rfq.id,
          orderId: order.id,
          token: quoteToken,
          status: "pending",
          finalCustomerPrice: String(finalPrice),
          vendorCost: String(vendorLink.offeredPrice ?? vendorLink.basicPrice ?? 0),
          quoteNotes: quoteNotes ?? null,
          eta: vendorLink.eta ?? null,
          quotationNumber,
        } as any);

        await db.execute(sql`
          UPDATE logistic_order_rfqs
          SET status = 'customer_quoted', quoted_price = ${finalPrice}, quoted_at = NOW(), quote_notes = ${quoteNotes ?? null}
          WHERE id = ${link.rfqId}
        `);

        const domain = getPreferredDomain() || "cstlogistic.co.id";
        const quoteUrl = `https://${domain}/customer-quote/${quoteToken}`;
        quoteShortUrl = await generateShortLink(quoteUrl, { context: "customer_quote", refType: "rfq", refId: String(rfq.id) });

        if (order.phone) {
          sendWhatsApp(order.phone,
            `✅ *Penawaran Harga Siap — CST Logistics*\n\n` +
            `Halo *${order.customerName}*,\n\n` +
            `Penawaran harga untuk order Anda telah siap:\n\n` +
            `📦 ${order.shipmentType} — ${order.origin} → ${order.destination}\n` +
            `💰 Harga: ${fmtRp(finalPrice)}\n` +
            (vendorLink.eta ? `⏱ ETA: ${vendorLink.eta}\n` : "") +
            `\nSilakan review dan konfirmasi:\n${quoteShortUrl}`
          ).catch(() => {});
        }
      }

      // Activity log
      await db.insert(orderUpdatesTable).values({
        orderId: order.id,
        actorType: "admin",
        actorName: "Admin",
        status: "vendor_selected",
        notes: `Vendor dipilih: ${vendor?.name ?? `#${vendorLink.vendorId}`}${sellingPrice ? ` | Harga jual: ${fmtRp(sellingPrice)}` : ""}${sendQuoteToCustomer ? " | Penawaran terkirim ke customer" : ""}`,
        isPublic: false,
      }).catch(() => {});

      await db.update(adminActionLinksTable).set({ usedAt: new Date() })
        .where(eq(adminActionLinksTable.token, token));

      // Create forward_vendor link for next step
      const fwdToken = await createAdminActionLink(order.id, "forward_vendor", rfq.id, 72);
      const fwdUrl = getAdminActionUrl(fwdToken);
      const fwdShort = await generateShortLink(fwdUrl, { context: "admin_action", refType: "rfq", refId: String(rfq.id) });

      const adminGroupWa2 = await getAdminGroupWa();
      if (adminGroupWa2) {
        const vendorName = vendor?.name ?? `Vendor #${vendorLink.vendorId}`;
        sendWhatsApp(adminGroupWa2,
          `✅ Vendor dipilih: *${vendorName}*\n` +
          `Order: ${order.orderNumber} | ${fmtRp(vendorLink.offeredPrice ?? vendorLink.basicPrice)}\n` +
          (quoteShortUrl ? `📤 Penawaran terkirim ke customer\n` : "") +
          `\n📦 Forward ke vendor untuk eksekusi:\n${fwdShort}`
        ).catch(() => {});
      }

      return res.json({
        ok: true,
        vendorName: vendor?.name,
        sellingPrice,
        quoteToken,
        quoteUrl: quoteShortUrl,
        forwardVendorUrl: fwdShort,
      });
    }

    // ── forward_vendor: create fulfillment task link for vendor ───────────
    if (actionType === "forward_vendor") {
      const { vendorId, serviceType, expiresInHours = 72 } = req.body as {
        vendorId: number;
        serviceType: string;
        expiresInHours?: number;
      };
      if (!vendorId || !serviceType) {
        return res.status(400).json({ error: "vendorId dan serviceType wajib" });
      }

      const { vendorFulfillmentLinksTable } = await import("@workspace/db");
      const fulfillToken = randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);

      await db.insert(vendorFulfillmentLinksTable).values({
        token: fulfillToken,
        orderId: order.id,
        vendorId,
        serviceType,
        status: "pending",
        expiresAt,
      });

      const domain = getPreferredDomain() || "cstlogistic.co.id";
      const fulfillUrl = `https://${domain}/vendor-fulfillment/${fulfillToken}`;
      const shortUrl = await generateShortLink(fulfillUrl, {
        context: "vendor_fulfillment",
        refType: "order",
        refId: order.orderNumber,
      });

      const [vendor] = await db.select().from(suppliersTable)
        .where(eq(suppliersTable.id, vendorId));

      if (vendor?.phone) {
        sendWhatsApp(vendor.phone,
          `📦 *Penugasan Fulfillment — CST Logistics*\n\n` +
          `Kepada Yth. *${vendor.name}*,\n\n` +
          `Order Anda telah dikonfirmasi. Mohon lengkapi detail fulfillment:\n\n` +
          `No. Order   : *${order.orderNumber}*\n` +
          `Layanan     : ${order.shipmentType}\n` +
          `Rute        : ${order.origin} → ${order.destination}\n\n` +
          `📱 *Isi data fulfillment di sini:*\n${shortUrl}\n\n` +
          `⏰ Batas waktu: ${expiresInHours} jam\n\nTerima kasih 🙏`
        ).catch(() => {});
      }

      // Activity log
      await db.insert(orderUpdatesTable).values({
        orderId: order.id,
        actorType: "admin",
        actorName: "Admin",
        status: "assigned_to_vendor",
        notes: `Link fulfillment dikirim ke vendor ${vendor?.name ?? `#${vendorId}`} (${serviceType}) via mini form`,
        isPublic: false,
      }).catch(() => {});

      await db.update(adminActionLinksTable).set({ usedAt: new Date() })
        .where(eq(adminActionLinksTable.token, token));

      return res.json({ ok: true, fulfillToken, fulfillUrl: shortUrl, vendorName: vendor?.name });
    }

    return res.status(400).json({ error: "actionType tidak dikenal" });
  } catch (err) {
    logger.error({ err }, "admin-action POST error");
    return res.status(500).json({ error: "Gagal memproses aksi" });
  }
});
