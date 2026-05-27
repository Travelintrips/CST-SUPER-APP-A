import { Router } from "express";
import { db, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { deleteFromSupabase } from "../lib/supabaseStorage.js";

const router = Router();

/** Detects PostgreSQL unique constraint violation (23505) on company_code column. */
function getDuplicateCompanyCodeMessage(err: any): string | null {
  const pgCode: string | undefined = err?.cause?.code ?? err?.code;
  if (pgCode !== "23505") return null;

  const detail: string =
    err?.cause?.constraint ?? err?.constraint ??
    err?.cause?.message ?? err?.message ?? "";

  if (
    detail.includes("companies_company_code_unique") ||
    detail.includes("company_code") ||
    detail.includes("company code")
  ) {
    return "Kode perusahaan sudah digunakan oleh perusahaan lain. Gunakan kode yang berbeda.";
  }

  if (pgCode === "23505") {
    return "Terjadi konflik data unik pada perusahaan. Periksa kembali nilai yang Anda masukkan.";
  }

  return null;
}

/**
 * Tambahkan perusahaan ke semua holding group yang aktif (CST-GROUP).
 * Idempotent — ON CONFLICT DO NOTHING karena ada UNIQUE(holding_group_id, company_id).
 */
async function addCompanyToHoldingGroups(companyId: number): Promise<void> {
  try {
    const groups = await db.execute(sql`SELECT id FROM holding_groups ORDER BY id`);
    for (const row of groups.rows) {
      const holdingGroupId = (row as { id: number }).id;
      await db.execute(sql`
        INSERT INTO company_holding_members (holding_group_id, company_id, ownership_percentage, consolidation_method)
        VALUES (${holdingGroupId}, ${companyId}, 100.00, 'full')
        ON CONFLICT ON CONSTRAINT chm_holding_company_unique DO NOTHING
      `);
    }
  } catch {
    // Jangan gagalkan pembuatan perusahaan hanya karena holding insert gagal
  }
}

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
      })
      .returning();

    // Otomatis daftarkan ke holding group (kecuali perusahaan ini sendiri adalah holding)
    if (!created.isHolding) {
      await addCompanyToHoldingGroups(created.id);
    }

    return res.status(201).json({ ...created, createdAt: created.createdAt.toISOString() });
  } catch (err: any) {
    const msg = getDuplicateCompanyCodeMessage(err);
    if (msg) return res.status(409).json({ message: msg });
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
  if (companyName !== undefined) patch.companyName = companyName;
  if (companyCode !== undefined) patch.companyCode = companyCode;
  if (logoUrl !== undefined) patch.logoUrl = logoUrl;
  if (address !== undefined) patch.address = address;
  if (phone !== undefined) patch.phone = phone;
  if (email !== undefined) patch.email = email;
  if (npwp !== undefined) patch.npwp = npwp;
  if (isActive !== undefined) patch.isActive = isActive;
  if (isHolding !== undefined) patch.isHolding = isHolding;
  if (parentCompanyId !== undefined) patch.parentCompanyId = parentCompanyId ? Number(parentCompanyId) : null;
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: "No fields to update" });
  try {
    const [updated] = await db
      .update(companiesTable)
      .set(patch)
      .where(eq(companiesTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Company not found" });
    return res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch (err: any) {
    const msg = getDuplicateCompanyCodeMessage(err);
    if (msg) return res.status(409).json({ message: msg });
    throw err;
  }
});

// DELETE /companies/:id — admin only
router.delete("/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  // Prevent deleting core companies 1-4
  if (id <= 4) return res.status(403).json({ message: "Tidak dapat menghapus perusahaan inti (id 1-4)" });
  const [company] = await db.select({ logoUrl: companiesTable.logoUrl }).from(companiesTable).where(eq(companiesTable.id, id));
  await db.delete(companiesTable).where(eq(companiesTable.id, id));
  if (company?.logoUrl) deleteFromSupabase(company.logoUrl).catch(() => {});
  return res.json({ success: true });
});

export default router;
