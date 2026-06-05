import { Router, type Request } from "express";
import { sql } from "drizzle-orm";
import { db, chartOfAccountsTable, accountingJournalsTable } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";
import { postEntry } from "../lib/accounting.js";
import { ensureAccountingSettings } from "../lib/accountingSeed.js";
import { resolveCompanyId } from "../lib/resolveCompany.js";

const router = Router();
router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

// ─── Inline migration ────────────────────────────────────────────────────────
async function ensureTables() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS fixed_assets (
      id SERIAL PRIMARY KEY,
      company_id INTEGER,
      asset_number TEXT NOT NULL UNIQUE,
      asset_name TEXT NOT NULL,
      asset_type TEXT NOT NULL DEFAULT 'equipment',
      purchase_date DATE NOT NULL,
      purchase_price NUMERIC(14,2) NOT NULL,
      useful_life_months INTEGER NOT NULL DEFAULT 60,
      salvage_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
      accumulated_depreciation NUMERIC(14,2) NOT NULL DEFAULT 0,
      book_value NUMERIC(14,2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'bank',
      notes TEXT,
      tax_related BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      journal_entry_id INTEGER,
      created_by_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS asset_depreciation_records (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER NOT NULL,
      period_date DATE NOT NULL,
      depreciation_amount NUMERIC(14,2) NOT NULL,
      accumulated_after NUMERIC(14,2) NOT NULL,
      book_value_after NUMERIC(14,2) NOT NULL,
      journal_entry_id INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(asset_id, period_date)
    );
  `));
}

let migrated = false;
async function runMigration() { if (!migrated) { await ensureTables(); migrated = true; } }

async function nextAssetNumber(): Promise<string> {
  const prefix = "AST";
  const year = new Date().getFullYear();
  const rows = await db.execute(sql.raw(
    `SELECT asset_number FROM fixed_assets WHERE asset_number LIKE '${prefix}/${year}/%' ORDER BY id DESC LIMIT 1`
  ));
  const last = (rows.rows[0] as any)?.asset_number as string | undefined;
  let seq = 1;
  if (last) { const parts = last.split("/"); seq = (parseInt(parts[2] ?? "0", 10) || 0) + 1; }
  return `${prefix}/${year}/${String(seq).padStart(5, "0")}`;
}

/** Straight-line monthly depreciation */
function calcStraightLine(purchasePrice: number, salvageValue: number, usefulLifeMonths: number): number {
  if (usefulLifeMonths <= 0) return 0;
  return (purchasePrice - salvageValue) / usefulLifeMonths;
}

/** Declining balance monthly depreciation (double-declining) */
function calcDecliningBalance(bookValue: number, usefulLifeMonths: number): number {
  if (usefulLifeMonths <= 0) return 0;
  const annualRate = 2 / (usefulLifeMonths / 12);
  return (bookValue * annualRate) / 12;
}

// ─── GET /api/fixed-assets ────────────────────────────────────────────────────
router.get("/", async (req: Request, res) => {
  await runMigration();
  const companyId = await resolveCompanyId(req);
  const rows = await db.execute(sql.raw(
    `SELECT * FROM fixed_assets ${companyId ? `WHERE company_id = ${companyId}` : ""} ORDER BY id DESC`
  ));
  res.json(rows.rows);
});

// ─── GET /api/fixed-assets/:id ────────────────────────────────────────────────
router.get("/:id", async (req: Request, res) => {
  await runMigration();
  const id = parseInt(req.params.id);
  const result = await db.execute(sql.raw(`SELECT * FROM fixed_assets WHERE id = ${id}`));
  const asset = result.rows[0] as any;
  if (!asset) return res.status(404).json({ message: "Aset tidak ditemukan." });
  const deprResult = await db.execute(sql.raw(
    `SELECT * FROM asset_depreciation_records WHERE asset_id = ${id} ORDER BY period_date DESC`
  ));
  res.json({ ...asset, depreciationRecords: deprResult.rows });
});

// ─── POST /api/fixed-assets ───────────────────────────────────────────────────
router.post("/", async (req: Request, res) => {
  await runMigration();
  const companyId = await resolveCompanyId(req);
  const userId = (req as any).userId ?? null;
  const {
    assetName, assetType = "equipment", purchaseDate, purchasePrice,
    usefulLifeMonths = 60, salvageValue = 0, depreciationMethod = "straight_line",
    paymentMethod = "bank", notes, taxRelated = false,
  } = req.body;

  if (!assetName?.trim()) return res.status(400).json({ message: "Nama aset wajib diisi." });
  const price = parseFloat(purchasePrice);
  if (!price || price <= 0) return res.status(400).json({ message: "Harga beli harus lebih dari 0." });
  if (!purchaseDate) return res.status(400).json({ message: "Tanggal beli wajib diisi." });

  const assetNumber = await nextAssetNumber();

  // ── Jurnal: DR Aset Tetap, CR Kas/Bank ───────────────────────────────────
  let journalEntryId: number | null = null;
  try {
    const settings = await ensureAccountingSettings(companyId ?? undefined);
    const assetCoa = await db.select().from(chartOfAccountsTable)
      .where(sql`code LIKE '1-2010%' AND (company_id = ${companyId} OR company_id IS NULL)`).limit(1);
    const bankCoa = paymentMethod === "cash"
      ? await db.select().from(chartOfAccountsTable).where(sql`code LIKE '1-1010%' AND (company_id = ${companyId} OR company_id IS NULL)`).limit(1)
      : await db.select().from(chartOfAccountsTable).where(sql`code LIKE '1-1020%' AND (company_id = ${companyId} OR company_id IS NULL)`).limit(1);

    if (assetCoa[0] && bankCoa[0]) {
      const [je] = await db.insert(accountingJournalsTable).values({
        companyId, date: purchaseDate,
        description: `Perolehan aset ${assetNumber} — ${assetName}`,
        refType: "fixed_asset", refNumber: assetNumber,
        journalType: "general", status: "posted", createdById: userId,
      }).returning();
      await postEntry(je.id, [
        { accountId: assetCoa[0].id, debit: String(price), credit: "0" },
        { accountId: bankCoa[0].id, debit: "0", credit: String(price) },
      ]);
      journalEntryId = je.id;
    }
  } catch {}

  const insertResult = await db.execute(sql.raw(`
    INSERT INTO fixed_assets
      (company_id, asset_number, asset_name, asset_type, purchase_date, purchase_price,
       useful_life_months, salvage_value, depreciation_method, accumulated_depreciation,
       book_value, payment_method, notes, tax_related, is_active, journal_entry_id, created_by_id)
    VALUES
      (${companyId ?? "NULL"}, '${assetNumber}', '${assetName.replace(/'/g, "''")}',
       '${assetType}', '${purchaseDate}', ${price}, ${parseInt(usefulLifeMonths) || 60},
       ${parseFloat(salvageValue) || 0}, '${depreciationMethod}', 0, ${price},
       '${paymentMethod}', ${notes ? `'${String(notes).replace(/'/g, "''")}'` : "NULL"},
       ${taxRelated ? "TRUE" : "FALSE"}, TRUE, ${journalEntryId ?? "NULL"},
       ${userId ? `'${userId}'` : "NULL"})
    RETURNING *
  `));
  res.status(201).json(insertResult.rows[0]);
});

// ─── POST /api/fixed-assets/:id/depreciate ───────────────────────────────────
router.post("/:id/depreciate", async (req: Request, res) => {
  await runMigration();
  const id = parseInt(req.params.id);
  const result = await db.execute(sql.raw(`SELECT * FROM fixed_assets WHERE id = ${id}`));
  const asset = result.rows[0] as any;
  if (!asset) return res.status(404).json({ message: "Aset tidak ditemukan." });
  if (!asset.is_active) return res.status(400).json({ message: "Aset sudah tidak aktif." });

  const { periodDate, notes } = req.body;
  const period = periodDate ?? new Date().toISOString().slice(0, 7) + "-01";

  // Check duplicate
  const dupResult = await db.execute(sql.raw(
    `SELECT id FROM asset_depreciation_records WHERE asset_id = ${id} AND period_date = '${period}'`
  ));
  if (dupResult.rows.length > 0) return res.status(400).json({ message: `Penyusutan periode ${period} sudah ada.` });

  const bookValue = parseFloat(asset.book_value);
  const salvage = parseFloat(asset.salvage_value);
  if (bookValue <= salvage + 0.01) return res.status(400).json({ message: "Nilai buku sudah sama dengan nilai residu." });

  const price = parseFloat(asset.purchase_price);
  const life = parseInt(asset.useful_life_months);
  let depAmount = 0;
  if (asset.depreciation_method === "straight_line") {
    depAmount = calcStraightLine(price, salvage, life);
  } else {
    depAmount = calcDecliningBalance(bookValue, life);
  }
  depAmount = Math.min(depAmount, bookValue - salvage);
  depAmount = Math.round(depAmount * 100) / 100;

  const newAccumulated = parseFloat(asset.accumulated_depreciation) + depAmount;
  const newBookValue = price - newAccumulated;

  // ── Jurnal: DR Beban Penyusutan, CR Akumulasi Depresiasi ─────────────────
  let journalEntryId: number | null = null;
  try {
    const companyId = asset.company_id;
    const depExpCoa = await db.select().from(chartOfAccountsTable)
      .where(sql`code LIKE '5-2100%' AND (company_id = ${companyId} OR company_id IS NULL)`).limit(1);
    const accumCoa = await db.select().from(chartOfAccountsTable)
      .where(sql`code LIKE '1-2020%' AND (company_id = ${companyId} OR company_id IS NULL)`).limit(1);

    if (depExpCoa[0] && accumCoa[0]) {
      const [je] = await db.insert(accountingJournalsTable).values({
        companyId, date: period,
        description: `Penyusutan ${asset.asset_number} — ${asset.asset_name} (${period.slice(0, 7)})`,
        refType: "asset_depreciation", refNumber: asset.asset_number,
        journalType: "general", status: "posted",
      }).returning();
      await postEntry(je.id, [
        { accountId: depExpCoa[0].id, debit: String(depAmount), credit: "0" },
        { accountId: accumCoa[0].id, debit: "0", credit: String(depAmount) },
      ]);
      journalEntryId = je.id;
    }
  } catch {}

  await db.execute(sql.raw(`
    INSERT INTO asset_depreciation_records
      (asset_id, period_date, depreciation_amount, accumulated_after, book_value_after, journal_entry_id, notes)
    VALUES
      (${id}, '${period}', ${depAmount}, ${newAccumulated}, ${newBookValue},
       ${journalEntryId ?? "NULL"}, ${notes ? `'${String(notes).replace(/'/g, "''")}'` : "NULL"})
  `));
  await db.execute(sql.raw(`
    UPDATE fixed_assets
    SET accumulated_depreciation = ${newAccumulated}, book_value = ${newBookValue}
    WHERE id = ${id}
  `));

  const updatedResult = await db.execute(sql.raw(`SELECT * FROM fixed_assets WHERE id = ${id}`));
  res.json({ asset: updatedResult.rows[0], depreciationAmount: depAmount });
});

// ─── PATCH /api/fixed-assets/:id/deactivate ───────────────────────────────────
router.patch("/:id/deactivate", async (req: Request, res) => {
  await runMigration();
  const id = parseInt(req.params.id);
  await db.execute(sql.raw(`UPDATE fixed_assets SET is_active = FALSE WHERE id = ${id}`));
  res.json({ ok: true });
});

// ─── DELETE /api/fixed-assets/:id ─────────────────────────────────────────────
router.delete("/:id", async (req: Request, res) => {
  await runMigration();
  const id = parseInt(req.params.id);
  const result = await db.execute(sql.raw(`SELECT * FROM fixed_assets WHERE id = ${id}`));
  const asset = result.rows[0] as any;
  if (!asset) return res.status(404).json({ message: "Aset tidak ditemukan." });
  const deprCount = await db.execute(sql.raw(`SELECT COUNT(*) as c FROM asset_depreciation_records WHERE asset_id = ${id}`));
  if (parseInt((deprCount.rows[0] as any)?.c ?? "0") > 0) {
    return res.status(400).json({ message: "Aset yang sudah memiliki penyusutan tidak dapat dihapus." });
  }
  await db.execute(sql.raw(`DELETE FROM fixed_assets WHERE id = ${id}`));
  res.json({ ok: true });
});

export default router;
