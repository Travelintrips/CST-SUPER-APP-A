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
import { runAuditLogMigration } from "./lib/auditLogMigration";

import { runNavPreferencesMigration } from "./lib/navPreferencesMigration";
import { runNotificationLogMigration } from "./lib/notificationLogMigration";
import { runAdminNotificationsMigration } from "./lib/adminNotificationsMigration";

import { runVendorMiniFormMigration } from "./lib/vendorMiniFormMigration";
import { runCustomerQuoteFlowMigration } from "./lib/customerQuoteFlowMigration";
import { runEnterpriseMigration } from "./lib/enterpriseMigration";
import { runShortLinksMigration } from "./lib/shortLinksMigration";
import { runGeofenceMigration } from "./lib/geofenceMigration";
import { runOrderFulfillmentMigration } from "./routes/orderFulfillment.js";
import { runTrustedDevicesMigration } from "./lib/trustedDevicesMigration.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";


// REPLIT_API_PORT overrides PORT so the server listens on the local port
// that maps to external port 8080 in the Replit dev proxy (localPort=18444).
const rawPort = process.env["REPLIT_API_PORT"] ?? process.env["PORT"] ?? process.env["API_PORT"] ?? "5000";

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

  // Add condition column to wh_return_lines for "kondisi barang" (layak / rusak / hilang)
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wh_return_lines') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'wh_return_lines' AND column_name = 'condition'
        ) THEN
          ALTER TABLE wh_return_lines ADD COLUMN condition TEXT NOT NULL DEFAULT 'layak';
        END IF;
      END IF;
    END $$;
  `);

  // Ensure wh_returns has company_id column (older installs may lack it)
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wh_returns') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'wh_returns' AND column_name = 'company_id'
        ) THEN
          ALTER TABLE wh_returns ADD COLUMN company_id INTEGER;
        END IF;
      END IF;
    END $$;
  `);

  // Add order_type to logistic_orders (Drizzle schema field missing from older DB installs)
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistic_orders' AND column_name = 'order_type'
      ) THEN
        ALTER TABLE logistic_orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'shipment';
      END IF;
    END $$;
  `);
}

async function startServer() {
  // Listen on port FIRST so Replit's startup health-check passes immediately.
  // All migrations & seeds run in the background after the server is ready.
  const server = app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });

  // Graceful shutdown on SIGTERM / SIGINT
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  // Start background services immediately
  startImapPoller(3 * 60 * 1000);
  startOcrTempCleanup();

  // Run all migrations + seeds in the background with a small initial delay
  // to prevent a DB connection storm on cold starts.
  sleep(2_000)
    .then(async () => {
      try {
        await runCriticalPreStartMigrations();
        logger.info("Pre-start schema migrations applied");
      } catch (err) {
        logger.warn({ err }, "Pre-start migrations failed (non-fatal)");
      }
    })
    .then(() => runWithRetry("Sessions migration", runSessionsMigration))
    .then(() => runWithRetry("Companies migration", runCompaniesMigration))
    .then(() => runWithRetry("Holding migration", runHoldingMigration))
    .then(() => runWithRetry("Portal migration", runPortalMigration))
    .then(() => runWithRetry("Accounting migration", runAccountingMigration))
    .then(() => runWithRetry("OAuth state migration", runOauthStateMigration))
    .then(() => runWithRetry("Knowledge base migration", runKnowledgeBaseMigration))
    .then(() => runWithRetry("Custom roles migration", runCustomRolesMigration))
    .then(() => runWithRetry("UOM migration", runUomMigration))
    .then(() => runWithRetry("Freight audit log migration", runFreightAuditMigration))
    .then(() => runWithRetry("Audit fix migration", runAuditFixMigration))
    .then(() => runWithRetry("Org full migration", runOrgFullMigration))
    .then(() => runWithRetry("Org unique codes migration", runOrgUniqueCodesMigration))
    .then(() => runWithRetry("Org/role migration", runOrgRoleMigration))
    .then(() => runWithRetry("User role enum migration", runUserRoleMigration))
    .then(() => runWithRetry("Audit log migration", runAuditLogMigration))
    .then(() => runWithRetry("Notification log migration", runNotificationLogMigration))
    .then(() => runWithRetry("Admin notifications migration", runAdminNotificationsMigration))
    .then(() => runWithRetry("Nav preferences migration", runNavPreferencesMigration))
    .then(() => runWithRetry("Vendor mini form migration", runVendorMiniFormMigration))
    .then(() => runWithRetry("Customer quote flow migration", runCustomerQuoteFlowMigration))
    .then(() => runWithRetry("Enterprise migration", runEnterpriseMigration))
    .then(() => runWithRetry("Short links migration", runShortLinksMigration))
    .then(() => runWithRetry("Geofence migration", runGeofenceMigration))
    .then(() => runWithRetry("Order fulfillment migration", runOrderFulfillmentMigration))
    .then(() => runWithRetry("Trusted devices migration", runTrustedDevicesMigration))
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
}

startServer().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
