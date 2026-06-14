import app from "./app";
import { logger } from "./lib/logger";
import { seedAccountingDefaults, seedAdditionalTaxes } from "./lib/accountingSeed";
import { seedLogisticsServiceItems } from "./lib/seedLogisticsItems";
import { seedCatalogProducts } from "./lib/seedCatalogProducts";
import { seedDemoData, seedDemoDrivers, seedAirFreightRates } from "./lib/seedDemoData";
import { startImapPoller } from "./lib/imapPoller";
import { startOcrTempCleanup } from "./lib/ocrTempCleanup";
import { startVmfGapNotifier, runVmfGapCheck } from "./lib/vmfGapNotifier";
import { startFulfillmentExpiryNotifier } from "./lib/fulfillmentExpiryNotifier";
import { runPhase1Migration } from "./lib/phase1Migration";
import { startWorkflowWorker } from "./lib/workflowWorker";
import { startDriverJobWorker } from "./lib/driverJobWorker.js";
import { startWaRetryWorker } from "./lib/waRetryWorker";
import { remediateOrphanProducts } from "./lib/remediateOrphanProducts";
import { seedProductTemplates } from "./routes/productTemplates.js";
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
import { runAuditReportsMigration } from "./lib/auditReportsMigration.js";
import { runWaTemplateMigration } from "./lib/orderNotification.js";
import { runRlsMigration } from "./lib/rlsMigration.js";
import { runCommodityTemplateMigration } from "./lib/commodityTemplateMigration.js";
import { migratePushSubscriptions } from "./lib/webPush.js";
import { runPgTrgmMigration } from "./lib/pgTrgmMigration.js";
import { runIntelligenceAlertSettingsMigration } from "./lib/intelligenceAlertSettingsMigration.js";
import { runAiGovernanceMigration } from "./lib/aiGovernanceMigration.js";
import { runPurchaseTemplateMigration } from "./lib/purchaseTemplateMigration.js";
import { runEnterpriseWorkflowMigration } from "./lib/enterpriseWorkflowTemplates.js";
import { runOrderProgressMigration } from "./lib/orderProgress.js";
import { runExceptionEnumMigration, runOrderExceptionsMigration } from "./lib/services/exceptionService.js";
import { runVendorCompanyAssignmentsMigration } from "./lib/vendorCompanyAssignmentsMigration.js";
import { runVendorCatalogSchemaMigration } from "./lib/vendorCatalogSchemaMigration.js";
import { runLogisticVendorFulfillmentsMigration } from "./lib/logisticVendorFulfillmentsMigration.js";
import { runProductFirstFlowMigration } from "./lib/productFirstFlowMigration.js";
import { runStep4TemplateMigration } from "./lib/step4TemplateMigration.js";
import { runServiceTemplateMigration } from "./lib/serviceTemplateMigration.js";
import { expireStaleApprovals } from "./lib/aiGovernance.js";
import { startDbBackupScheduler } from "./lib/dbBackup.js";
import { initAlertsBroadcast } from "./lib/alertsBroadcast.js";
import { warmupMailer } from "./lib/mailer.js";
import { runSportCenterMigration, runSportCenterAccountCorrection, runSportCenterCompanyInvoiceMigration } from "./modules/sport-center/migration.js";
import { runTenantMigration } from "./modules/tenant/migration.js";
import { startRecurringExpenseWorker } from "./modules/sport-center/recurringExpenseWorker.js";
import { startMemberReminderWorker } from "./modules/sport-center/memberReminderWorker.js";
import { startExpenseReminderWorker } from "./lib/expenseReminderWorker.js";
import { startWhtReminderWorker } from "./lib/whtReminderWorker.js";
import { startProductFirstReminderWorker } from "./lib/productFirstReminderWorker.js";
import { startProductFirstExceptionWorker } from "./lib/productFirstExceptionWorker.js";
import { startRekonsiliasiWorker } from "./lib/rekonsiliasiWorker.js";
import { runCostCenterMigration } from "./lib/costCenterMigration.js";
import { runDriverPodMigration, runDriverAssignmentMigration } from "./routes/driver.js";
import { runLogisticsRatesMigration } from "./lib/logisticsRatesMigration.js";
import { runProductVolumeCbmMigration } from "./routes/ecommerce.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { runStartupValidation } from "./lib/startupValidator.js";
import { backfillVendorPerformance } from "./routes/vendorPerformance.js";
import { runProductMediaMigration } from "./lib/productMediaMigration.js";
import { runTaxRulesMigration } from "./lib/taxRulesMigration.js";
import { backfillSportCenterAccountingPayments } from "./lib/backfillSportCenterPayments.js";
import { runFreightAccountingMigration } from "./lib/freightAccountingMigration.js";


// REPLIT_API_PORT overrides PORT so the server listens on the local port
// that maps to external port 8080 in the Replit dev proxy (localPort=18444).
const rawPort = process.env["REPLIT_API_PORT"] ?? process.env["PORT"] ?? process.env["API_PORT"] ?? "5000";

// Security: PORTAL_ADMIN_EMAILS should be set in production.
if (process.env["NODE_ENV"] === "production" && !process.env["PORTAL_ADMIN_EMAILS"]?.trim()) {
  console.warn(
    "[WARN] PORTAL_ADMIN_EMAILS is not set. Portal admin access will rely on DB role only."
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const TRANSIENT = ["ECIRCUITBREAKER", "password authentication failed", "timeout exceeded", "ECONNREFUSED", "ETIMEDOUT", "temporarily blocked"];
  const causeMsg = (err as unknown as { cause?: { message?: string } }).cause?.message ?? "";
  const fullMsg = err.message + " " + causeMsg;
  return TRANSIENT.some((t) => fullMsg.includes(t));
}

async function runWithRetry<T>(
  name: string,
  fn: () => Promise<T>,
  maxAttempts = 5,
  delayMs = 15_000
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return;
    } catch (err: unknown) {
      const isTransient = isTransientDbError(err);
      if (isTransient && attempt < maxAttempts) {
        const backoff = delayMs * attempt;
        logger.warn(
          { attempt, maxAttempts, backoff },
          `${name}: transient DB error, retrying after ${backoff}ms...`
        );
        await sleep(backoff);
      } else {
        logger.error({ err }, `${name} failed (giving up after ${attempt} attempts)`);
        return;
      }
    }
  }
}

// ── Pre-startup critical schema migrations (run BEFORE accepting requests) ────
// These ensure Drizzle ORM columns exist before any query can be executed.
async function runCriticalPreStartMigrations() {
  // Buat wa_otp_codes dan trusted_devices PERTAMA — diperlukan untuk WA OTP login
  // Gunakan try/catch terpisah agar tidak menghalangi migrasi lain
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS wa_otp_codes (
        id          SERIAL PRIMARY KEY,
        phone       TEXT NOT NULL,
        code_hash   TEXT NOT NULL,
        purpose     TEXT NOT NULL DEFAULT 'register',
        attempts    INTEGER NOT NULL DEFAULT 0,
        verified    BOOLEAN NOT NULL DEFAULT FALSE,
        verify_token TEXT,
        expires_at  TIMESTAMP NOT NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS wa_otp_phone_idx ON wa_otp_codes (phone)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS wa_otp_token_idx ON wa_otp_codes (verify_token)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trusted_devices (
        id           SERIAL PRIMARY KEY,
        phone        TEXT NOT NULL,
        device_token TEXT NOT NULL UNIQUE,
        expires_at   TIMESTAMP NOT NULL,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("wa_otp_codes & trusted_devices tables ready");
  } catch (err) {
    logger.warn({ err }, "wa_otp_codes creation failed (non-fatal, will retry via portal migration)");
  }

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

  // Add is_commodity_tag to vendor_catalog_items for blast auto-matching
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_catalog_items') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'vendor_catalog_items' AND column_name = 'is_commodity_tag'
        ) THEN
          ALTER TABLE vendor_catalog_items ADD COLUMN is_commodity_tag BOOLEAN NOT NULL DEFAULT FALSE;
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

  // Add version column to logistic_orders (optimistic locking)
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistic_orders' AND column_name = 'version'
      ) THEN
        ALTER TABLE logistic_orders ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      END IF;
    END $$;
  `);

  // Add vendor_accept_token and vendor_accepted_at to purchase_documents (Vendor PO Accept feature)
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_documents') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'purchase_documents' AND column_name = 'vendor_accept_token'
        ) THEN
          ALTER TABLE purchase_documents ADD COLUMN vendor_accept_token TEXT UNIQUE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'purchase_documents' AND column_name = 'vendor_accepted_at'
        ) THEN
          ALTER TABLE purchase_documents ADD COLUMN vendor_accepted_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'purchase_documents' AND column_name = 'vendor_accept_notes'
        ) THEN
          ALTER TABLE purchase_documents ADD COLUMN vendor_accept_notes TEXT;
        END IF;
      END IF;
    END $$;
  `);

  // Add volume_cbm to products (CBM langsung untuk item kapas)
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'volume_cbm'
      ) THEN
        ALTER TABLE products ADD COLUMN volume_cbm NUMERIC(12,4);
      END IF;
    END $$;
  `);

  // Add missing columns to logistic_orders (multi-mode, product, AI, truck fields)
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logistic_orders') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='transport_mode') THEN
          ALTER TABLE logistic_orders ADD COLUMN transport_mode TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='origin_district') THEN
          ALTER TABLE logistic_orders ADD COLUMN origin_district TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='dest_district') THEN
          ALTER TABLE logistic_orders ADD COLUMN dest_district TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='etd') THEN
          ALTER TABLE logistic_orders ADD COLUMN etd TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='eta') THEN
          ALTER TABLE logistic_orders ADD COLUMN eta TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='origin_port') THEN
          ALTER TABLE logistic_orders ADD COLUMN origin_port TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='dest_port') THEN
          ALTER TABLE logistic_orders ADD COLUMN dest_port TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='options_token') THEN
          ALTER TABLE logistic_orders ADD COLUMN options_token TEXT UNIQUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='options_sent_at') THEN
          ALTER TABLE logistic_orders ADD COLUMN options_sent_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='direction') THEN
          ALTER TABLE logistic_orders ADD COLUMN direction TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='is_dangerous_good') THEN
          ALTER TABLE logistic_orders ADD COLUMN is_dangerous_good BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='service_category') THEN
          ALTER TABLE logistic_orders ADD COLUMN service_category TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='cargo_special_tags') THEN
          ALTER TABLE logistic_orders ADD COLUMN cargo_special_tags TEXT[];
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='required_docs') THEN
          ALTER TABLE logistic_orders ADD COLUMN required_docs TEXT[];
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='truck_vendor_id') THEN
          ALTER TABLE logistic_orders ADD COLUMN truck_vendor_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='truck_price') THEN
          ALTER TABLE logistic_orders ADD COLUMN truck_price NUMERIC(14,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='truck_source') THEN
          ALTER TABLE logistic_orders ADD COLUMN truck_source TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='product_price') THEN
          ALTER TABLE logistic_orders ADD COLUMN product_price NUMERIC(14,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='ai_session_token') THEN
          ALTER TABLE logistic_orders ADD COLUMN ai_session_token TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='payment_type') THEN
          ALTER TABLE logistic_orders ADD COLUMN payment_type TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='payment_method') THEN
          ALTER TABLE logistic_orders ADD COLUMN payment_method TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='nama_penerima') THEN
          ALTER TABLE logistic_orders ADD COLUMN nama_penerima TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='nomor_penerima') THEN
          ALTER TABLE logistic_orders ADD COLUMN nomor_penerima TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='pickup_date') THEN
          ALTER TABLE logistic_orders ADD COLUMN pickup_date TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='pickup_time') THEN
          ALTER TABLE logistic_orders ADD COLUMN pickup_time TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='truck_type') THEN
          ALTER TABLE logistic_orders ADD COLUMN truck_type TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='markup_percent') THEN
          ALTER TABLE logistic_orders ADD COLUMN markup_percent NUMERIC(5,2) DEFAULT 20;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='final_price') THEN
          ALTER TABLE logistic_orders ADD COLUMN final_price NUMERIC(14,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='final_selling_price') THEN
          ALTER TABLE logistic_orders ADD COLUMN final_selling_price NUMERIC(14,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='quotation_sent_at') THEN
          ALTER TABLE logistic_orders ADD COLUMN quotation_sent_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='customer_confirm_token') THEN
          ALTER TABLE logistic_orders ADD COLUMN customer_confirm_token TEXT UNIQUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='customer_confirm_status') THEN
          ALTER TABLE logistic_orders ADD COLUMN customer_confirm_status TEXT DEFAULT 'pending';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='customer_confirmed_at') THEN
          ALTER TABLE logistic_orders ADD COLUMN customer_confirmed_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='approved_quote_id') THEN
          ALTER TABLE logistic_orders ADD COLUMN approved_quote_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='admin_approval_status') THEN
          ALTER TABLE logistic_orders ADD COLUMN admin_approval_status TEXT DEFAULT 'pending';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='approved_at') THEN
          ALTER TABLE logistic_orders ADD COLUMN approved_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='approved_vendor_id') THEN
          ALTER TABLE logistic_orders ADD COLUMN approved_vendor_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='source') THEN
          ALTER TABLE logistic_orders ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='jam_order') THEN
          ALTER TABLE logistic_orders ADD COLUMN jam_order TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='required_date') THEN
          ALTER TABLE logistic_orders ADD COLUMN required_date TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='jumlah_koli') THEN
          ALTER TABLE logistic_orders ADD COLUMN jumlah_koli INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='cargo_description') THEN
          ALTER TABLE logistic_orders ADD COLUMN cargo_description TEXT;
        END IF;
      END IF;
    END $$;
  `);

  // Add missing columns to drivers table
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'drivers') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='drivers' AND column_name='company_id') THEN
          ALTER TABLE drivers ADD COLUMN company_id INTEGER;
        END IF;
      END IF;
    END $$;
  `);

  // Add kategori to vendor_catalog_items
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendor_catalog_items') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'vendor_catalog_items' AND column_name = 'kategori'
        ) THEN
          ALTER TABLE vendor_catalog_items ADD COLUMN kategori TEXT;
        END IF;
      END IF;
    END $$;
  `);

  // Add lead_time_days and stock_availability to rfq_vendor_links
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rfq_vendor_links') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'rfq_vendor_links' AND column_name = 'lead_time_days'
        ) THEN
          ALTER TABLE rfq_vendor_links ADD COLUMN lead_time_days INTEGER;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'rfq_vendor_links' AND column_name = 'stock_availability'
        ) THEN
          ALTER TABLE rfq_vendor_links ADD COLUMN stock_availability TEXT DEFAULT 'unknown';
        END IF;
      END IF;
    END $$;
  `);

  // Add template columns to logistic_order_rfqs
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'logistic_order_rfqs') THEN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'logistic_order_rfqs' AND column_name = 'template_id'
        ) THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN template_id INTEGER;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'logistic_order_rfqs' AND column_name = 'template_version'
        ) THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN template_version TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'logistic_order_rfqs' AND column_name = 'template_snapshot'
        ) THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN template_snapshot JSONB;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'logistic_order_rfqs' AND column_name = 'created_by_user_id'
        ) THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN created_by_user_id TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'logistic_order_rfqs' AND column_name = 'created_by_user_name'
        ) THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN created_by_user_name TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'logistic_order_rfqs' AND column_name = 'opened_vendor_ids'
        ) THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN opened_vendor_ids INTEGER[] NOT NULL DEFAULT '{}';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'logistic_order_rfqs' AND column_name = 'vendor_ids'
        ) THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN vendor_ids INTEGER[] NOT NULL DEFAULT '{}';
        END IF;
      END IF;
    END $$;
  `);

  // Ensure sessions table exists (critical for login)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      sid    TEXT PRIMARY KEY,
      sess   JSONB NOT NULL,
      expire TIMESTAMPTZ NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire)
  `);

  // Add missing users columns (login query selects these)
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='division') THEN
          ALTER TABLE users ADD COLUMN division TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='system_role') THEN
          ALTER TABLE users ADD COLUMN system_role TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='default_branch_id') THEN
          ALTER TABLE users ADD COLUMN default_branch_id INTEGER;
        END IF;
      END IF;
    END $$;
  `);

  // Add missing accounting_settings columns (portal and BizPortal queries select these)
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'accounting_settings') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounting_settings' AND column_name='cogs_account_id') THEN
          ALTER TABLE accounting_settings ADD COLUMN cogs_account_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounting_settings' AND column_name='inventory_account_id') THEN
          ALTER TABLE accounting_settings ADD COLUMN inventory_account_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounting_settings' AND column_name='company_name') THEN
          ALTER TABLE accounting_settings ADD COLUMN company_name TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounting_settings' AND column_name='company_address') THEN
          ALTER TABLE accounting_settings ADD COLUMN company_address TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounting_settings' AND column_name='company_npwp') THEN
          ALTER TABLE accounting_settings ADD COLUMN company_npwp TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounting_settings' AND column_name='company_logo_url') THEN
          ALTER TABLE accounting_settings ADD COLUMN company_logo_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounting_settings' AND column_name='meta') THEN
          ALTER TABLE accounting_settings ADD COLUMN meta JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounting_settings' AND column_name='updated_at') THEN
          ALTER TABLE accounting_settings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
      END IF;
    END $$;
  `);

  // Create logistics rate tables (needed before first request, not deferrable)
  await runLogisticsRatesMigration();

  // Buat tabel wa_otp_codes (diperlukan untuk WA OTP login BizPortal)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wa_otp_codes (
      id          SERIAL PRIMARY KEY,
      phone       TEXT NOT NULL,
      code_hash   TEXT NOT NULL,
      purpose     TEXT NOT NULL DEFAULT 'register',
      attempts    INTEGER NOT NULL DEFAULT 0,
      verified    BOOLEAN NOT NULL DEFAULT FALSE,
      verify_token TEXT,
      expires_at  TIMESTAMP NOT NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS wa_otp_phone_idx ON wa_otp_codes (phone)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS wa_otp_token_idx ON wa_otp_codes (verify_token)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id           SERIAL PRIMARY KEY,
      phone        TEXT NOT NULL,
      device_token TEXT NOT NULL UNIQUE,
      expires_at   TIMESTAMP NOT NULL,
      created_at   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

// Flag set to true once the full migration + seed chain completes.
// Exposed via GET /api/health/ready so tests and clients can poll before
// triggering write operations that touch migrating tables.
let migrationsComplete = false;

async function startServer() {
  // Health-ready endpoint — must be registered before server.listen so it is
  // available as soon as the socket is open.
  app.get("/api/health/ready", (_req, res) => {
    res.json({ ready: migrationsComplete });
  });

  // Listen on port FIRST so Replit's startup health-check passes immediately.
  // All migrations & seeds run in the background after the server is ready.
  const server = app.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });

  // Attach WebSocket server for real-time Intelligence Alerts
  initAlertsBroadcast(server);
  warmupMailer().catch(() => {});

  // Startup dependency validation — non-blocking, results cached for /api/system/runtime-check
  runStartupValidation().catch((err) => {
    logger.warn({ err }, "[startupValidator] validation error (non-fatal)");
  });

  // Also bind on secondary gateway port if REPLIT_API_GATEWAY_PORT is set.
  // Set SKIP_GATEWAY=1 to disable this secondary binding.
  const GATEWAY_PORT = process.env.REPLIT_API_GATEWAY_PORT ? Number(process.env.REPLIT_API_GATEWAY_PORT) : null;
  let gatewayServer: ReturnType<typeof app.listen> | null = null;
  if (GATEWAY_PORT && port !== GATEWAY_PORT && !process.env.SKIP_GATEWAY) {
    gatewayServer = app.listen(GATEWAY_PORT, () => {
      logger.info({ port: GATEWAY_PORT }, "Also listening on gateway port");
    });
  }

  // Graceful shutdown on SIGTERM / SIGINT — close BOTH servers so ports release immediately
  const shutdown = () => {
    gatewayServer?.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3_000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  // Start background services immediately
  startImapPoller(3 * 60 * 1000);
  startOcrTempCleanup();
  startVmfGapNotifier();
  startFulfillmentExpiryNotifier();
  startWorkflowWorker();
  startDriverJobWorker();
  startRecurringExpenseWorker();
  startMemberReminderWorker();
  startExpenseReminderWorker();
  startWhtReminderWorker();
  startProductFirstReminderWorker();
  startProductFirstExceptionWorker();
  startRekonsiliasiWorker();
  startDbBackupScheduler();
  startWaRetryWorker();

  // AI Governance: expire stale approvals & auto-approve setiap 5 menit
  setInterval(() => {
    expireStaleApprovals().catch((err: unknown) => {
      logger.warn({ err }, "expireStaleApprovals background tick failed (non-fatal)");
    });
  }, 5 * 60 * 1000).unref();

  // Run all migrations + seeds in the background with an initial delay
  // to let the DB pool stabilize before hammering pgBouncer with DDL.
  sleep(8_000)
    .then(async () => {
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          await runCriticalPreStartMigrations();
          logger.info("Pre-start schema migrations applied");
          return;
        } catch (err: unknown) {
          if (isTransientDbError(err) && attempt < 10) {
            const backoff = Math.min(attempt * 15_000, 120_000);
            logger.warn(
              { attempt, backoff },
              `Pre-start migration: transient DB error, retrying after ${backoff}ms...`
            );
            await sleep(backoff);
          } else {
            logger.warn({ err }, "Pre-start migrations failed (non-fatal)");
            return;
          }
        }
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
    .then(() => runWithRetry("Product-first flow migration", runProductFirstFlowMigration))
    .then(() => runWithRetry("Customer quote flow migration", runCustomerQuoteFlowMigration))
    .then(() => runWithRetry("Enterprise migration", runEnterpriseMigration))
    .then(() => runWithRetry("Short links migration", runShortLinksMigration))
    .then(() => runWithRetry("Geofence migration", runGeofenceMigration))
    .then(() => runWithRetry("Order fulfillment migration", runOrderFulfillmentMigration))
    .then(() => runWithRetry("Trusted devices migration", runTrustedDevicesMigration))
    .then(() => runWithRetry("ERP audit reports migration", runAuditReportsMigration))
    .then(() => runWithRetry("WA template migration", runWaTemplateMigration))
    .then(() => runWithRetry("RLS migration", runRlsMigration))
    .then(() => runWithRetry("Commodity template migration", runCommodityTemplateMigration))
    .then(() => runWithRetry("Phase 1 migration", runPhase1Migration))
    .then(() => runWithRetry("Push subscriptions migration", migratePushSubscriptions))
    .then(() => runWithRetry("pg_trgm indexes migration", runPgTrgmMigration))
    .then(() => runWithRetry("Intelligence alert settings migration", runIntelligenceAlertSettingsMigration))
    .then(() => runWithRetry("AI governance migration", runAiGovernanceMigration))
    .then(() => runWithRetry("Purchase template migration", runPurchaseTemplateMigration))
    .then(() => runWithRetry("Enterprise workflow template migration", runEnterpriseWorkflowMigration))
    .then(() => runWithRetry("Order progress migration", runOrderProgressMigration))
    .then(() => runWithRetry("Exception enum migration", runExceptionEnumMigration))
    .then(() => runWithRetry("Order exceptions migration", runOrderExceptionsMigration))
    .then(() => runWithRetry("Step 4 template snapshot migration", runStep4TemplateMigration))
    .then(() => runWithRetry("Service template migration", runServiceTemplateMigration))
    .then(() => runWithRetry("Cost Center migration", runCostCenterMigration))
    .then(() => runWithRetry("Sport Center migration", runSportCenterMigration))
    .then(() => runWithRetry("Sport Center account correction", runSportCenterAccountCorrection))
    .then(() => runWithRetry("Sport Center company invoice migration", runSportCenterCompanyInvoiceMigration))
    .then(() => runWithRetry("Tenant migration", runTenantMigration))
    .then(() => runWithRetry("Driver POD migration", runDriverPodMigration))
    .then(() => runWithRetry("Driver assignment migration", runDriverAssignmentMigration))
    .then(() => runWithRetry("Vendor company assignments migration", runVendorCompanyAssignmentsMigration))
    .then(() => runWithRetry("Vendor catalog schema migration", runVendorCatalogSchemaMigration))
    .then(() => runWithRetry("Logistic vendor fulfillments migration", runLogisticVendorFulfillmentsMigration))
    .then(() => runWithRetry("Product media migration", runProductMediaMigration))
    .then(() => runWithRetry("Tax rules migration", runTaxRulesMigration))
    .then(() => runWithRetry("Freight accounting migration", runFreightAccountingMigration))
    .then(() => runWithRetry("Logistics rates migration", runLogisticsRatesMigration))
    .then(() => enableRealtimeTables().catch((err) => {
      logger.warn({ err }, "Supabase Realtime table enable failed (non-fatal)");
    }))
    .then(() => seedAccountingDefaults().catch((err) => {
      logger.error({ err }, "Accounting seed failed");
    }))
    .then(() => seedAdditionalTaxes().catch((err) => {
      logger.warn({ err }, "Additional tax seed failed (non-fatal)");
    }))
    .then(() => seedUom().catch((err) => {
      logger.warn({ err }, "UOM seed failed (non-fatal)");
    }))
    .then(() => seedProductTemplates().catch((err) => {
      logger.warn({ err }, "Product templates seed failed (non-fatal)");
    }))
    .then(() =>
      seedLogisticsServiceItems()
        .then(() => seedCatalogProducts())
        .then(() => seedDemoData())
        .then(() => seedDemoDrivers())
        .then(() => seedAirFreightRates())
        .then(() => remediateOrphanProducts())
        .catch((seedErr) => {
          logger.error({ err: seedErr }, "Logistics/demo seed failed");
        })
    )
    .then(() =>
      backfillVendorPerformance().catch((err) => {
        logger.warn({ err }, "Vendor performance backfill failed (non-fatal)");
      })
    )
    .then(() =>
      backfillSportCenterAccountingPayments().catch((err) => {
        logger.warn({ err }, "Sport Center accounting payments backfill failed (non-fatal)");
      })
    )
    .then(() => {
      migrationsComplete = true;
      logger.info("All startup migrations complete — /api/health/ready → true");
    })
    .catch((err) => {
      logger.error({ err }, "Startup migration/seed chain failed");
    });
}

startServer().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
