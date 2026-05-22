import { Router, type Request, type Response } from "express";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  vendorMiniFormLinksTable,
  vendorMiniFormSubmissionsTable,
  suppliersTable,
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin";

const router = Router();

// ── Shared form schema ────────────────────────────────────────────────────────

export const SERVICE_SCHEMAS: Record<string, {
  label: string;
  emoji: string;
  fields: {
    key: string;
    label: string;
    type: "text" | "number" | "select" | "textarea";
    options?: string[];
    required?: boolean;
    placeholder?: string;
  }[];
}> = {
  product: {
    label: "Produk",
    emoji: "📦",
    fields: [
      { key: "product_name", label: "Nama Produk", type: "text", required: true },
      { key: "qty", label: "Kuantitas", type: "number", required: true },
      { key: "unit", label: "Satuan", type: "select", required: true, options: ["pcs", "kg", "ton", "box", "karton", "lusin", "unit"] },
      { key: "unit_price", label: "Harga per Satuan (Rp)", type: "number", required: true },
      { key: "stock", label: "Stok Tersedia", type: "number" },
      { key: "lead_time", label: "Lead Time (hari)", type: "number" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  trucking: {
    label: "Trucking",
    emoji: "🚛",
    fields: [
      { key: "truck_type", label: "Jenis Truk", type: "select", required: true, options: ["CDD", "CDE", "Fuso", "Tronton", "Trailer 20ft", "Trailer 40ft", "Pick Up", "Box Truck"] },
      { key: "price", label: "Harga per Trip (Rp)", type: "number", required: true },
      { key: "eta", label: "Estimasi Waktu (hari)", type: "text", required: true, placeholder: "Contoh: 1-2 hari" },
      { key: "free_time", label: "Free Time (jam)", type: "number" },
      { key: "coverage_area", label: "Area Layanan", type: "textarea", placeholder: "Contoh: Jakarta, Bekasi, Tangerang" },
      { key: "min_weight", label: "Berat Min (kg)", type: "number" },
      { key: "max_weight", label: "Berat Maks (kg)", type: "number" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  air_freight: {
    label: "Air Freight",
    emoji: "✈️",
    fields: [
      { key: "airline", label: "Maskapai / Agent", type: "text", required: true, placeholder: "Contoh: Garuda Cargo, DHL" },
      { key: "origin", label: "Bandara Asal (IATA)", type: "text", required: true, placeholder: "Contoh: CGK" },
      { key: "destination", label: "Bandara Tujuan (IATA)", type: "text", required: true, placeholder: "Contoh: SIN" },
      { key: "transit_time", label: "Transit Time (hari)", type: "number", required: true },
      { key: "freight_charge", label: "Freight Charge (Rp/kg)", type: "number", required: true },
      { key: "min_charge", label: "Minimum Charge (Rp)", type: "number" },
      { key: "fuel_surcharge", label: "Fuel Surcharge (%)", type: "number" },
      { key: "validity", label: "Masa Berlaku Rate (hari)", type: "number" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  sea_freight: {
    label: "Sea Freight",
    emoji: "🚢",
    fields: [
      { key: "shipping_line", label: "Shipping Line / Forwarder", type: "text", required: true, placeholder: "Contoh: Maersk, MSC" },
      { key: "pol", label: "Port of Loading", type: "text", required: true, placeholder: "Contoh: IDJKT" },
      { key: "pod", label: "Port of Discharge", type: "text", required: true, placeholder: "Contoh: SGSIN" },
      { key: "container_type", label: "Tipe Kontainer", type: "select", required: true, options: ["20' GP", "40' GP", "40' HC", "45' HC", "20' RF", "40' RF"] },
      { key: "freight_rate", label: "Freight Rate (USD)", type: "number", required: true },
      { key: "transit_time", label: "Transit Time (hari)", type: "number", required: true },
      { key: "free_time", label: "Free Time Demurrage (hari)", type: "number" },
      { key: "validity", label: "Masa Berlaku Rate (hari)", type: "number" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  ppjk: {
    label: "PPJK",
    emoji: "📋",
    fields: [
      { key: "pib_type", label: "Jenis PIB", type: "select", required: true, options: ["PIB Jalur Hijau", "PIB Jalur Kuning", "PIB Jalur Merah", "PIB Jalur Prioritas", "PIBK"] },
      { key: "undername", label: "Biaya Undername (Rp)", type: "number", placeholder: "Kosongkan jika tidak ada" },
      { key: "customs_service", label: "Jasa Kepabeanan (Rp)", type: "number", required: true },
      { key: "document_fee", label: "Biaya Dokumen (Rp)", type: "number" },
      { key: "hs_code_service", label: "Jasa Klasifikasi HS (Rp)", type: "number" },
      { key: "experience_years", label: "Pengalaman (tahun)", type: "number" },
      { key: "notes", label: "Catatan / Persyaratan Dokumen", type: "textarea" },
    ],
  },
  customs_clearance: {
    label: "Customs Clearance",
    emoji: "🛃",
    fields: [
      { key: "clearance_type", label: "Jenis Clearance", type: "select", required: true, options: ["Import", "Export", "Import + Export", "Transshipment"] },
      { key: "service_fee", label: "Biaya Jasa (Rp)", type: "number", required: true },
      { key: "scanning_fee", label: "Biaya Scanning (Rp)", type: "number" },
      { key: "document_fee", label: "Biaya Dokumen (Rp)", type: "number" },
      { key: "processing_time", label: "Waktu Proses (hari kerja)", type: "number" },
      { key: "port", label: "Pelabuhan / Bandara", type: "text", placeholder: "Contoh: Tanjung Priok" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  warehouse: {
    label: "Warehouse",
    emoji: "🏭",
    fields: [
      { key: "location", label: "Lokasi Gudang", type: "text", required: true, placeholder: "Contoh: Cikarang Barat" },
      { key: "area_sqm", label: "Luas Tersedia (m²)", type: "number", required: true },
      { key: "storage_rate", label: "Tarif Sewa (Rp/m²/bulan)", type: "number", required: true },
      { key: "min_volume", label: "Volume Min (m³)", type: "number" },
      { key: "temperature", label: "Suhu / Tipe", type: "select", options: ["Ambient", "Chilled (2–8°C)", "Frozen (-18°C)", "AC Room"] },
      { key: "rack_system", label: "Sistem Racking", type: "select", options: ["Selective", "Drive-in", "Push Back", "Floor Storage", "Mezzanine"] },
      { key: "security", label: "Keamanan", type: "text", placeholder: "Contoh: CCTV 24 jam, Satpam" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  handling: {
    label: "Handling",
    emoji: "🔧",
    fields: [
      { key: "handling_type", label: "Jenis Handling", type: "select", required: true, options: ["Loading", "Unloading", "Loading & Unloading", "Stuffing", "Stripping", "Packing", "Repacking"] },
      { key: "price_per_unit", label: "Harga per Unit (Rp)", type: "number", required: true },
      { key: "unit", label: "Satuan", type: "select", required: true, options: ["per ton", "per cbm", "per kontainer", "per pallet", "per trip", "per hari"] },
      { key: "capacity_per_day", label: "Kapasitas per Hari", type: "number" },
      { key: "equipment", label: "Peralatan Tersedia", type: "text", placeholder: "Contoh: Forklift 3 ton, Hand pallet" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  exim_service: {
    label: "Exim Service",
    emoji: "🌐",
    fields: [
      { key: "service_type", label: "Layanan", type: "select", required: true, options: ["Import Door to Door", "Export Door to Door", "Import Port to Port", "Export Port to Port", "Full Service"] },
      { key: "origin_country", label: "Negara Asal", type: "text", required: true },
      { key: "dest_country", label: "Negara Tujuan", type: "text", required: true },
      { key: "price", label: "Harga (Rp)", type: "number", required: true },
      { key: "transit_time", label: "Transit Time (hari)", type: "number" },
      { key: "incoterms", label: "Incoterms", type: "select", options: ["EXW", "FOB", "CIF", "DAP", "DDP", "FCA", "CPT", "CIP"] },
      { key: "validity", label: "Masa Berlaku (hari)", type: "number" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
};

// ── PUBLIC: GET /api/vendor-form/:token ───────────────────────────────────────

router.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const [link] = await db
      .select()
      .from(vendorMiniFormLinksTable)
      .where(eq(vendorMiniFormLinksTable.token, token));

    if (!link) return res.status(404).json({ error: "Link tidak ditemukan atau sudah tidak valid" });
    if (!link.isActive) return res.status(410).json({ error: "Link ini sudah dinonaktifkan" });
    if (link.expiresAt && link.expiresAt < new Date()) {
      return res.status(410).json({ error: "Link ini sudah kadaluarsa" });
    }

    let vendorName: string | null = null;
    if (link.supplierId) {
      const [vendor] = await db
        .select({ name: suppliersTable.name })
        .from(suppliersTable)
        .where(eq(suppliersTable.id, link.supplierId));
      vendorName = vendor?.name ?? null;
    }

    const schema = SERVICE_SCHEMAS[link.serviceType] ?? null;

    return res.json({
      id: link.id,
      serviceType: link.serviceType,
      title: link.title,
      notes: link.notes,
      vendorName,
      schema,
    });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form GET error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUBLIC: POST /api/vendor-form/:token ──────────────────────────────────────

router.post("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const [link] = await db
      .select()
      .from(vendorMiniFormLinksTable)
      .where(eq(vendorMiniFormLinksTable.token, token));

    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (!link.isActive) return res.status(410).json({ error: "Link ini sudah dinonaktifkan" });
    if (link.expiresAt && link.expiresAt < new Date()) {
      return res.status(410).json({ error: "Link ini sudah kadaluarsa" });
    }

    const { vendorName, contactPerson, contactPhone, formData } = req.body as {
      vendorName?: string;
      contactPerson?: string;
      contactPhone?: string;
      formData?: Record<string, unknown>;
    };

    if (!formData || typeof formData !== "object") {
      return res.status(400).json({ error: "formData diperlukan" });
    }

    await db.insert(vendorMiniFormSubmissionsTable).values({
      linkId: link.id,
      token,
      supplierId: link.supplierId,
      serviceType: link.serviceType,
      vendorName: vendorName ?? null,
      contactPerson: contactPerson ?? null,
      contactPhone: contactPhone ?? null,
      formData,
    });

    return res.json({ success: true, message: "Data berhasil dikirim, terima kasih!" });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form POST error");
    return res.status(500).json({ error: "Gagal menyimpan data" });
  }
});

// ── ADMIN: GET /api/vendor-form-admin/schemas ────────────────────────────────

router.get("/admin/schemas", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  return res.json(SERVICE_SCHEMAS);
});

// ── ADMIN: GET /api/vendor-form-admin/links ───────────────────────────────────

router.get("/admin/links", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const links = await db
      .select()
      .from(vendorMiniFormLinksTable)
      .orderBy(desc(vendorMiniFormLinksTable.createdAt));

    const vendorIds = links.map(l => l.supplierId).filter(Boolean) as number[];
    let vendorMap: Record<number, string> = {};
    if (vendorIds.length) {
      const vendors = await db.select({ id: suppliersTable.id, name: suppliersTable.name }).from(suppliersTable);
      vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.name]));
    }

    return res.json(links.map(l => ({
      ...l,
      vendorName: l.supplierId ? (vendorMap[l.supplierId] ?? null) : null,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin GET links error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: POST /api/vendor-form-admin/links ──────────────────────────────────

router.post("/admin/links", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const { supplierId, serviceType, title, notes, expiresInDays } = req.body as {
      supplierId?: number;
      serviceType: string;
      title?: string;
      notes?: string;
      expiresInDays?: number;
    };

    if (!serviceType || !SERVICE_SCHEMAS[serviceType]) {
      return res.status(400).json({ error: "serviceType tidak valid" });
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const userId = (req.user as { id: string } | undefined)?.id ?? null;

    const [link] = await db
      .insert(vendorMiniFormLinksTable)
      .values({
        token,
        supplierId: supplierId ?? null,
        serviceType,
        title: title ?? null,
        notes: notes ?? null,
        expiresAt: expiresAt ?? undefined,
        createdBy: userId,
      })
      .returning();

    return res.status(201).json({ ...link, expiresAt: link.expiresAt?.toISOString() ?? null, createdAt: link.createdAt.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin POST links error");
    return res.status(500).json({ error: "Gagal membuat link" });
  }
});

// ── ADMIN: PATCH /api/vendor-form-admin/links/:id ────────────────────────────

router.patch("/admin/links/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const { isActive, title, notes } = req.body as { isActive?: boolean; title?: string; notes?: string };
    const patch: Record<string, unknown> = {};
    if (typeof isActive === "boolean") patch["isActive"] = isActive;
    if (typeof title === "string") patch["title"] = title;
    if (typeof notes === "string") patch["notes"] = notes;

    const [updated] = await db
      .update(vendorMiniFormLinksTable)
      .set(patch)
      .where(eq(vendorMiniFormLinksTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Link tidak ditemukan" });
    return res.json({ ...updated, expiresAt: updated.expiresAt?.toISOString() ?? null, createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin PATCH links error");
    return res.status(500).json({ error: "Gagal update link" });
  }
});

// ── ADMIN: DELETE /api/vendor-form-admin/links/:id ───────────────────────────

router.delete("/admin/links/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [deleted] = await db
      .delete(vendorMiniFormLinksTable)
      .where(eq(vendorMiniFormLinksTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Link tidak ditemukan" });
    return res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin DELETE links error");
    return res.status(500).json({ error: "Gagal menghapus link" });
  }
});

// ── ADMIN: GET /api/vendor-form-admin/submissions ────────────────────────────

router.get("/admin/submissions", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const submissions = await db
      .select()
      .from(vendorMiniFormSubmissionsTable)
      .orderBy(desc(vendorMiniFormSubmissionsTable.submittedAt));

    return res.json(submissions.map(s => ({
      ...s,
      submittedAt: s.submittedAt.toISOString(),
    })));
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin GET submissions error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN: POST /api/vendor-form-admin/links/:id/short-link ──────────────────

router.post("/admin/links/:id/short-link", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [link] = await db
      .select()
      .from(vendorMiniFormLinksTable)
      .where(eq(vendorMiniFormLinksTable.id, id));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });

    // Return cached short URL if already generated
    if (link.shortUrl) {
      return res.json({ shortUrl: link.shortUrl, cached: true });
    }

    const { generateShortLink } = await import("../lib/shortLink.js");
    const { getPreferredDomain } = await import("../lib/domain.js");
    const domain = getPreferredDomain();
    const longUrl = domain
      ? `https://${domain}/vendor-mini-form/${link.token}`
      : `/vendor-mini-form/${link.token}`;

    const shortUrl = await generateShortLink(longUrl, {
      context: "vendor_mini_form",
      refType: "vendor_mini_form_link",
      refId: String(link.id),
    });

    // Persist short URL to DB
    await db
      .update(vendorMiniFormLinksTable)
      .set({ shortUrl })
      .where(eq(vendorMiniFormLinksTable.id, id));

    return res.json({ shortUrl, cached: false });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form short-link error");
    return res.status(500).json({ error: "Gagal generate short link" });
  }
});

// ── ADMIN: DELETE /api/vendor-form-admin/submissions/:id ─────────────────────

router.delete("/admin/submissions/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [deleted] = await db
      .delete(vendorMiniFormSubmissionsTable)
      .where(eq(vendorMiniFormSubmissionsTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Submission tidak ditemukan" });
    return res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "vendor-mini-form admin DELETE submissions error");
    return res.status(500).json({ error: "Gagal menghapus submission" });
  }
});

export { router as vendorMiniFormRouter };
