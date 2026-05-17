import { Router } from "express";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";

const router = Router();

// GET /companies — all logged-in users can read (for CompanySwitcher)
router.get("/", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const rows = await db
    .select()
    .from(companiesTable)
    .orderBy(companiesTable.id);
  return res.json(rows.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

// POST /companies — admin only
router.post("/", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { companyName, companyCode, logoUrl, address, phone, email, npwp, isHolding, parentCompanyId } = req.body ?? {};
  if (!companyName || !companyCode) {
    return res.status(400).json({ message: "companyName and companyCode are required" });
  }
  try {
    const [created] = await db
      .insert(companiesTable)
      .values({
        companyName,
        companyCode,
        logoUrl,
        address,
        phone,
        email,
        npwp,
        isHolding: isHolding ?? false,
        parentCompanyId: parentCompanyId ? Number(parentCompanyId) : null,
        name: companyName,
        code: companyCode,
      })
      .returning();
    return res.status(201).json({ ...created, createdAt: created.createdAt.toISOString() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique")) return res.status(409).json({ message: "Kode perusahaan sudah digunakan" });
    throw err;
  }
});

// PATCH /companies/:id — admin only
router.patch("/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { companyName, companyCode, logoUrl, address, phone, email, npwp, isActive, isHolding, parentCompanyId } = req.body ?? {};
  const patch: Partial<typeof companiesTable.$inferInsert> = {};
  if (companyName !== undefined) { patch.companyName = companyName; patch.name = companyName; }
  if (companyCode !== undefined) { patch.companyCode = companyCode; patch.code = companyCode; }
  if (logoUrl !== undefined) patch.logoUrl = logoUrl;
  if (address !== undefined) patch.address = address;
  if (phone !== undefined) patch.phone = phone;
  if (email !== undefined) patch.email = email;
  if (npwp !== undefined) patch.npwp = npwp;
  if (isActive !== undefined) patch.isActive = isActive;
  if (isHolding !== undefined) patch.isHolding = isHolding;
  if (parentCompanyId !== undefined) patch.parentCompanyId = parentCompanyId ? Number(parentCompanyId) : null;
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: "No fields to update" });
  const [updated] = await db
    .update(companiesTable)
    .set(patch)
    .where(eq(companiesTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ message: "Company not found" });
  return res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

// DELETE /companies/:id — admin only
router.delete("/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  // Prevent deleting core companies 1-4
  if (id <= 4) return res.status(403).json({ message: "Tidak dapat menghapus perusahaan inti (id 1-4)" });
  await db.delete(companiesTable).where(eq(companiesTable.id, id));
  return res.json({ success: true });
});

export default router;
