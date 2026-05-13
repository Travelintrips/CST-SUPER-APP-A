import { db, suppliersTable, logisticOrderQuotesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const quotes = await db.select({
    id: logisticOrderQuotesTable.id,
    vendorId: logisticOrderQuotesTable.vendorId,
    vendorPrice: logisticOrderQuotesTable.vendorPrice,
    markupPercentage: logisticOrderQuotesTable.markupPercentage,
  }).from(logisticOrderQuotesTable)
    .where(eq(logisticOrderQuotesTable.markupPercentage, "0.00"));

  console.log("Quotes with markup=0:", quotes.length);

  for (const q of quotes) {
    const [vendor] = await db.select({ markupPct: suppliersTable.markupPct, name: suppliersTable.name })
      .from(suppliersTable).where(eq(suppliersTable.id, q.vendorId));
    if (!vendor) { console.log("  skip quote", q.id, "- vendor not found"); continue; }
    const mp = Number(vendor.markupPct ?? 0);
    if (mp === 0) { console.log("  skip quote", q.id, "vendor:", vendor.name, "- supplier markup juga 0"); continue; }
    const vp = Number(q.vendorPrice);
    const sp = vp * (1 + mp / 100);
    await db.update(logisticOrderQuotesTable)
      .set({ markupPercentage: String(mp), sellingPrice: String(sp) })
      .where(eq(logisticOrderQuotesTable.id, q.id));
    console.log(`  Updated quote ${q.id} | vendor: ${vendor.name} | markup: ${mp}% | vendorPrice: ${vp} | sellingPrice: ${sp}`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
