import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  // Update all quotes that have markup_percentage=0 by pulling markup_pct from the supplier
  const result = await db.execute(sql`
    UPDATE logistic_order_quotes lq
    SET
      markup_percentage = s.markup_pct,
      selling_price = (lq.vendor_price::numeric * (1 + s.markup_pct::numeric / 100))::text
    FROM suppliers s
    WHERE lq.vendor_id = s.id
      AND lq.markup_percentage::numeric = 0
      AND s.markup_pct::numeric > 0
    RETURNING lq.id, lq.vendor_id, s.name, lq.vendor_price, s.markup_pct,
              lq.selling_price
  `);

  const rows = result.rows as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    console.log("No quotes to update (all either already have markup, or vendor markup_pct = 0).");
  } else {
    console.log(`Updated ${rows.length} quote(s):`);
    for (const r of rows) {
      console.log(`  Quote #${r.id} | vendor: ${r.name} | vendorPrice: ${r.vendor_price} | markup: ${r.markup_pct}% | newSellingPrice: ${r.selling_price}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
