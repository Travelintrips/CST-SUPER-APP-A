import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

const REALTIME_TABLES = ["products", "product_categories", "product_category_map"];

/**
 * Adds product-related tables to the supabase_realtime publication so that
 * the Customer Portal can subscribe to live changes via Supabase Realtime.
 * Safe to call multiple times — ADD TABLE is idempotent when the table is
 * already a member of the publication.
 */
export async function enableRealtimeTables(): Promise<void> {
  try {
    const result = await db.execute<{ pubname: string; tablename: string }>(
      sql`SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`
    );
    const already = new Set(
      (result as unknown as { rows: { pubname: string; tablename: string }[] }).rows?.map((r) => r.tablename) ?? []
    );

    const toAdd = REALTIME_TABLES.filter((t) => !already.has(t));
    if (toAdd.length === 0) {
      logger.info("enableRealtimeTables: all product tables already in supabase_realtime");
      return;
    }

    for (const table of toAdd) {
      try {
        await db.execute(sql.raw(`ALTER PUBLICATION supabase_realtime ADD TABLE ${table}`));
        logger.info(`enableRealtimeTables: added '${table}' to supabase_realtime`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists") || msg.includes("duplicate")) {
          logger.info(`enableRealtimeTables: '${table}' already in publication`);
        } else {
          logger.warn({ err }, `enableRealtimeTables: could not add '${table}' (non-fatal)`);
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, "enableRealtimeTables: failed to check/update publication (non-fatal)");
  }
}
