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

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Buat tabel companies + company_id columns (idempotent)
  runCompaniesMigration().catch((err) => {
    logger.error({ err }, "Companies migration error");
  });

  // Buat tabel holding_groups + company_holding_members + seed CST-GROUP (idempotent)
  runHoldingMigration().catch((err) => {
    logger.error({ err }, "Holding migration error");
  });

  // Jalankan portal schema migration (idempotent — aman untuk prod)
  runPortalMigration().catch((err) => {
    logger.error({ err }, "Portal migration error");
  });

  // Jalankan accounting schema migration (idempotent — tambah kolom automation)
  runAccountingMigration().catch((err) => {
    logger.error({ err }, "Accounting migration error");
  });

  // Buat tabel oauth_states untuk Google OAuth state management
  runOauthStateMigration().catch((err) => {
    logger.error({ err }, "OAuth state migration error");
  });

  // Buat tabel chatbot_knowledge_base (idempotent)
  runKnowledgeBaseMigration().catch((err) => {
    logger.error({ err }, "Knowledge base migration error");
  });

  // Enable Supabase Realtime on driver tables (idempotent)
  enableRealtimeTables().catch((err) => {
    logger.warn({ err }, "Supabase Realtime table enable failed (non-fatal)");
  });

  // Run idempotent accounting seed (no-op if accounts already exist)
  seedAccountingDefaults().catch((seedErr) => {
    logger.error({ err: seedErr }, "Accounting seed failed");
  });

  // Seed logistics service items, catalog products, then demo data, then remediate any remaining orphan products
  seedLogisticsServiceItems()
    .then(() => seedCatalogProducts())
    .then(() => seedDemoData())
    .then(() => seedDemoDrivers())
    .then(() => remediateOrphanProducts())
    .catch((seedErr) => {
      logger.error({ err: seedErr }, "Logistics/demo seed failed");
    });

  // Buat tabel POS Kasir Thai Tea (idempotent)
  runPosKasirMigration().catch((err) => {
    logger.error({ err }, "POS Kasir migration error");
  });

  // Start IMAP email poller (polls every 3 minutes when IMAP credentials are configured)
  startImapPoller(3 * 60 * 1000);

  // Auto-delete OCR temp files older than 24 hours (runs every 6 hours)
  startOcrTempCleanup();

});
