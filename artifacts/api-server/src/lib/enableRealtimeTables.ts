import { logger } from "./logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const TABLES = ["driver_jobs", "driver_job_logs", "vendor_responses"];

export async function enableRealtimeTables(): Promise<void> {
  for (const table of TABLES) {
    try {
      await db.execute(sql.raw(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = '${table}'
          ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE ${table};
          END IF;
        END $$;
      `));
      logger.info(`Supabase Realtime: table '${table}' enabled`);
    } catch (err) {
      logger.warn({ err }, `Supabase Realtime: could not enable table '${table}' (non-fatal)`);
    }
  }
}
