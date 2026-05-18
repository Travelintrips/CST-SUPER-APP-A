import app from "./app";
import { logger } from "./lib/logger";
import { seedAccountingDefaults } from "./lib/accountingSeed";
import { seedLogisticsServiceItems } from "./lib/seedLogisticsItems";
import { seedCatalogProducts } from "./lib/seedCatalogProducts";
import { seedDemoData, seedDemoDrivers } from "./lib/seedDemoData";
import { startImapPoller } from "./lib/imapPoller";
import { startOcrTempCleanup } from "./lib/ocrTempCleanup";
import { remediateOrphanProducts } from "./lib/remediateOrphanProducts";
import { runPortalMigration } from "./lib/portalMigration";
import { runAccountingMigration } from "./lib/accountingMigration";
import { runOauthStateMigration } from "./lib/oauthStateMigration";
import { enableRealtimeTables } from "./lib/enableRealtimeTables";
import { runKnowledgeBaseMigration } from "./lib/knowledgeBaseMigration";
import { runCompaniesMigration } from "./lib/companiesMigration";
import { runHoldingMigration } from "./lib/holdingMigration";
import { runPosKasirMigration } from "./lib/posKasirMigration";
import { runSessionsMigration } from "./lib/sessionsMigration";
import { runCustomRolesMigration } from "./lib/customRolesMigration";
import { runUomMigration } from "./lib/uomMigration";
import { runFreightAuditMigration } from "./lib/freightAuditMigration";
import { runAuditFixMigration } from "./lib/auditFixMigration";
import { seedUom } from "./lib/uomSeed";
import { runOrgFullMigration } from "./lib/orgFullMigration";
import { runOrgUniqueCodesMigration } from "./lib/orgUniqueCodesMigration";
import { runOrgRoleMigration } from "./lib/orgRoleMigration";
import { runUserRoleMigration } from "./lib/userRoleMigration";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"] ?? process.env["API_PORT"] ?? "5000";

// Security: PORTAL_ADMIN_EMAILS must be set in production.
// Without it, requirePortalAdmin falls back to DB role-only check,
// allowing pre-existing forged admin rows to pass.
if (process.env["NODE_ENV"] === "production" && !process.env["PORTAL_ADMIN_EMAILS"]?.trim()) {
  throw new Error(
    "PORTAL_ADMIN_EMAILS environment variable is required in production. " +
    "Set it to a comma-separated list of allowed portal admin emails."
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWithRetry<T>(
  name: string,
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 10_000
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return;
    } catch (err: unknown) {
      const isCircuitBreaker =
        err instanceof Error && err.message.includes("ECIRCUITBREAKER");
      if (isCircuitBreaker && attempt < maxAttempts) {
        logger.warn(
          { attempt, maxAttempts, delayMs },
          `${name}: circuit breaker tripped, retrying after ${delayMs}ms...`
        );
        await sleep(delayMs);
      } else {
        logger.error({ err }, `${name} failed`);
        return;
      }
    }
  }
}

// ── Pre-startup critical schema migrations (run BEFORE accepting requests) ────
// These ensure Drizzle ORM columns exist before any query can be executed.
async function runCriticalPreStartMigrations() {
  // Add grir_account_id column without FK (FK is added later in accountingMigration when COA exists)
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounting_settings') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'accounting_settings' AND column_name = 'grir_account_id'
        ) THEN
          ALTER TABLE accounting_settings ADD COLUMN grir_account_id INTEGER;
        END IF;
      END IF;
    END $$;
  `);
}

async function startServer() {
  try {
    await runCriticalPreStartMigrations();
    logger.info("Pre-start schema migrations applied");
  } catch (err) {
    logger.warn({ err }, "Pre-start migrations failed (non-fatal — table may not exist yet)");
  }

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

  // Graceful shutdown on SIGTERM / SIGINT — release port immediately so the
  // next process can bind without waiting for OS TIME_WAIT.
  const shutdown = () => {
    server.close(() => process.exit(0));
    // Force-exit after 5 s if connections are still draining.
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  // Start IMAP email poller (polls every 3 minutes when IMAP credentials are configured)
  startImapPoller(3 * 60 * 1000);

  // Auto-delete OCR temp files older than 24 hours (runs every 6 hours)
  startOcrTempCleanup();

  // Jalankan semua migration BERURUTAN dengan jeda 5 detik di awal.
  // Ini mencegah connection storm ke Supabase yang men-trigger circuit breaker
  // (ECIRCUITBREAKER) akibat banyak koneksi DB dibuka serentak saat startup.
  sleep(5_000)
    .then(() => runWithRetry("Sessions migration", runSessionsMigration))
    .then(() => runWithRetry("Companies migration", runCompaniesMigration))
    .then(() => runWithRetry("Holding migration", runHoldingMigration))
    .then(() => runWithRetry("Portal migration", runPortalMigration))
    .then(() => runWithRetry("Accounting migration", runAccountingMigration))
    .then(() => runWithRetry("OAuth state migration", runOauthStateMigration))
    .then(() => runWithRetry("Knowledge base migration", runKnowledgeBaseMigration))
    .then(() => runWithRetry("POS Kasir migration", runPosKasirMigration))
    .then(() => runWithRetry("Custom roles migration", runCustomRolesMigration))
    .then(() => runWithRetry("UOM migration", runUomMigration))
    .then(() => runWithRetry("Freight audit log migration", runFreightAuditMigration))
    .then(() => runWithRetry("Audit fix migration", runAuditFixMigration))
    .then(() => runWithRetry("Org full migration", runOrgFullMigration))
    .then(() => runWithRetry("Org unique codes migration", runOrgUniqueCodesMigration))
    .then(() => runWithRetry("Org/role migration", runOrgRoleMigration))
    .then(() => runWithRetry("User role enum migration", runUserRoleMigration))
    .then(() => enableRealtimeTables().catch((err) => {
      logger.warn({ err }, "Supabase Realtime table enable failed (non-fatal)");
    }))
    .then(() => seedAccountingDefaults().catch((err) => {
      logger.error({ err }, "Accounting seed failed");
    }))
    .then(() => seedUom().catch((err) => {
      logger.warn({ err }, "UOM seed failed (non-fatal)");
    }))
    .then(() =>
      seedLogisticsServiceItems()
        .then(() => seedCatalogProducts())
        .then(() => seedDemoData())
        .then(() => seedDemoDrivers())
        .then(() => remediateOrphanProducts())
        .catch((seedErr) => {
          logger.error({ err: seedErr }, "Logistics/demo seed failed");
        })
    )
    .catch((err) => {
      logger.error({ err }, "Startup migration/seed chain failed");
    });
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
