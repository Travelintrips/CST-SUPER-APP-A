import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import ecommerceRouter from "./ecommerce";
import tradingRouter from "./trading";
// logistics.ts (LAMA) dinonaktifkan — pakai freight.ts (BARU) yang memakai tabel freight_shipments.
// Jika diaktifkan kembali, akan terjadi route shadowing di /api/logistics/shipments → tabel lama.
// import logisticsRouter from "./logistics";
import freightRouter from "./freight";
import salesRouter from "./sales";
import purchaseRouter, { purchasePublicRouter } from "./purchase";
import reportsRouter from "./reports";
import paymentsRouter from "./payments";
import accountingRouter from "./accounting";
import storageRouter from "./storage";
import correspondencesRouter from "./correspondences";
import emailCorrespondencesRouter from "./emailCorrespondences";
import scanDocumentRouter from "./scanDocument";
import expensesRouter from "./expenses";
import portalRouter from "./portal";
import { logisticOrdersRouter } from "./logisticOrders";
import { logisticRfqRouter } from "./logisticRfq";
import { productFirstFlowRouter } from "./productFirstFlow";
import { logisticRfqV2Router } from "./logisticRfqV2";
import settingsRouter from "./settings";
import { driverRouter, driversAdminRouter } from "./driver";
import webhooksRouter from "./webhooks";
import { aiAgentRouter } from "./aiAgent";
import { portalProductOrdersRouter } from "./portalProductOrders";
import geocodeRouter from "./geocode";
import { whatsappRouter } from "./whatsapp";
import { vendorResponseRouter } from "./vendorResponse";
import mediaRouter from "./media";
import taxRouter from "./tax.js";
import { customerServiceRequestsRouter } from "./customerServiceRequests.js";
import { servicePackagesRouter } from "./servicePackages.js";
import { portalCustomerProfileRouter } from "./portalCustomerProfile.js";
import { customerVerificationRouter, customerVerificationAdminRouter } from "./customerVerification.js";
import { adminServiceRequestsRouter } from "./adminServiceRequests.js";

import warehouseRouter from "./warehouse";
import inventoryReceiveRouter from "./inventoryReceive";
import inventoryStockRouter from "./inventoryStock";
import inventoryMainRouter from "./inventoryMain";
import customRolesRouter from "./customRoles";
import thaiTeaSuppliesRouter from "./thaiTeaSupplies";
import purchaseWorkflowRouter from "./purchaseWorkflow";
import uomRouter from "./uom";
import orgRouter from "./org";
import approvalWorkflowRouter from "./approvalWorkflow";
import approvalRulesRouter from "./approvalRules";
import productBomRouter from "./productBom";
import auditLogRouter from "./auditLog";
import auditReportsRouter from "./auditReports";

import navPreferencesRouter from "./navPreferences";
import notificationsRouter from "./notifications";

import { vendorMiniFormRouter } from "./vendorMiniForm";
import {
  customerQuoteAdminRouter,
  customerQuotePublicRouter,
  orderTaskPublicRouter,
  customerOrderPublicRouter,
} from "./customerQuoteFlow";

import storageAuditLogRouter from "./storageAuditLog.js";
import { vendorPerformanceRouter } from "./vendorPerformance";
import { internalTasksRouter } from "./internalTasks";
import { podOcrRouter } from "./podOcr";
import { marginRulesRouter } from "./marginRules";
import { adminActionPublicRouter, adminActionAdminRouter } from "./adminAction";
import { vendorFulfillmentPublicRouter } from "./vendorFulfillment";
import { logisticVendorFulfillmentAdminRouter } from "./logisticVendorFulfillmentAdmin.js";
import { driverProgressPublicRouter } from "./driverProgress.js";
import { fulfillmentAdminRouter, fulfillmentPublicRouter } from "./orderFulfillment.js";
import { vendorJobAdminRouter, vendorJobPublicRouter, orderTrackingPublicRouter } from "./vendorJobOrder.js";
import { resolveShortLink } from "../lib/shortLink.js";
import { bankReconciliationRouter } from "./bankReconciliation.js";
import { commodityTemplatesRouter } from "./commodityTemplates.js";
import pushRouter from "./push.js";
import { intelligenceAlertsRouter } from "./intelligenceAlerts.js";
import { aiApprovalsRouter } from "./aiApprovals.js";
import { operationalContextRouter } from "./operationalContext.js";
import { aiDecisionMemoryRouter } from "./aiDecisionMemory.js";
import { productTemplatesRouter } from "./productTemplates.js";
import logisticsUnitsRouter from "./logisticsUnits.js";
import truckingRatesRouter from "./truckingRates.js";
import truckingBookingsRouter from "./truckingBookings.js";
import { enterpriseWorkflowRouter } from "./enterpriseWorkflow.js";
import { customerFeedbackPublicRouter, customerFeedbackAdminRouter } from "./customerFeedback.js";
import { purchaseMiniPublicRouter, purchaseMiniAdminRouter } from "./purchaseMiniFormRoute.js";
import { paymentProofPublicRouter, paymentProofAdminRouter } from "./paymentProof.js";

import { orderAuditTrailRouter } from "./orderAuditTrail.js";
import { serviceTemplatesRouter } from "./serviceTemplates.js";
import { vendorTrackingAdminRouter, vendorTrackingPublicRouter } from "./vendorTracking.js";
import { customerDataFormPublicRouter, customerDataFormAdminRouter } from "./customerDataForm.js";
import { paymentProofRouter } from "./paymentProof.js";

import { exceptionsRouter } from "./exceptions.js";
import { orderExceptionsRouter } from "./orderExceptions.js";
import { waNotificationLogsRouter } from "./waNotificationLogs.js";
import analyticsProfitRouter from "./analyticsProfit.js";
import { vendorRecommendationRouter } from "./vendorRecommendation.js";
import { vendorCommodityIntelligenceRouter } from "./vendorCommodityIntelligence.js";
import productFirstAnalyticsRouter from "./productFirstAnalytics.js";
import productFirstAuditDashboardRouter from "./productFirstAuditDashboard.js";
import { productFirstOverrideRouter } from "./productFirstOverride.js";
import { systemRouter } from "./system.js";
import rbacRouter from "./rbac.js";
import importAdvisorRouter from "./importAdvisor.js";
import { handleAlertSse } from "../lib/alertsBroadcast.js";
import { requireAdmin } from "../lib/requireAdmin.js";
import sportCenterRouter from "../modules/sport-center/routes.js";
import tenantRouter from "../modules/tenant/routes.js";
import airFreightNewRouter from "./airFreight.js";
import airFreightRatesRouter from "./airFreightRates.js";
import airFreightPublicRouter from "./airFreightPublic.js";
import oceanFreightRouter from "./oceanFreight.js";
import oceanFreightRatesRouter from "./oceanFreightRates.js";
import { oceanFreightPublicRouter } from "./oceanFreightPublic.js";
import { oceanFreightVendorFormRouter } from "./oceanFreightVendorForm.js";
import executiveRouter from "./executive.js";
import cashAdvancesRouter from "./cashAdvances.js";
import vendorPaymentsRouter from "./vendorPayments.js";
import vendorInstallmentsRouter from "./vendorInstallments.js";
import bankLoansRouter from "./bankLoans.js";
import fixedAssetsRouter from "./fixedAssets.js";
import expenseApprovalsRouter from "./expenseApprovals.js";
import expenseDashboardRouter from "./expenseDashboard.js";
import expenseTemplatesRouter from "./expenseTemplates.js";
import expenseBudgetsRouter from "./expenseBudgets.js";
// ⛔ DEAD IMPORT — airFreightRouter (named export) diimport tapi TIDAK pernah di-mount.
// Hanya default export (airFreightNewRouter) yang dipakai via router.use("/air-freight", airFreightNewRouter).
// Jangan hapus file airFreight.js, hanya import ini yang di-freeze.
// import { airFreightRouter } from "./airFreight.js"; // FROZEN 2026-06-11
import { airFreightVendorFormRouter } from "./airFreightVendorForm.js";
import { watiRouter } from "./wati.js";
import logisticsRatesRouter from "./logisticsRates.js";
import { marketplaceRouter } from "./marketplace.js";
import { escrowAdminRouter, escrowPublicRouter } from "./escrow.js";
import { vendorCatalogEnginePublicRouter, vendorCatalogEngineAdminRouter } from "./vendorCatalogEngine.js";
import orderCostsRouter from "./orderCosts.js";
import vendorTruckingPricingRouter from "./vendorTruckingPricing.js";
import productMediaRouter from "./productMedia.js";
import oceanFreightMasterRouter from "./oceanFreightMaster.js";
import ppjkRouter from "./ppjk.js";
import qrMenuRouter from "./qrMenu.js";

import type { Request, Response } from "express";

const router: IRouter = Router();

router.get("/", (_req, res) => { res.json({ status: "ok" }); });

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/dashboard", dashboardRouter);
router.use("/ecommerce", ecommerceRouter);
router.use("/trading", tradingRouter);
// logistics.ts (LAMA) dinonaktifkan — lihat komentar import di atas.
// router.use("/logistics", logisticsRouter);
router.use("/logistics", freightRouter);
// pos.ts (LAMA) dinonaktifkan — lihat komentar import di atas.
// router.use("/pos", posRouter);
router.use("/sales", salesRouter);
router.use("/purchase", purchasePublicRouter);
router.use("/purchase", purchaseRouter);
router.use("/reports", reportsRouter);
router.use("/payments", paymentsRouter);
router.use("/accounting", accountingRouter);
router.use("/correspondences", correspondencesRouter);
router.use("/email-correspondences", emailCorrespondencesRouter);
router.use("/scan-document", scanDocumentRouter);
router.use("/expenses", expensesRouter);
router.use("/portal", portalRouter);
router.use("/marketplace", marketplaceRouter);
router.use("/vendor-catalog-engine", vendorCatalogEnginePublicRouter);
router.use("/trading/catalog-engine", vendorCatalogEngineAdminRouter);
// PERHATIAN: logisticRfqRouter dan logisticOrdersRouter keduanya di-mount di /logistic/orders.
// Express akan mencoba logisticRfqRouter dulu; jika tidak ada handler yang cocok, baru logisticOrdersRouter.
// Risiko: jika keduanya mendefinisikan path yang sama (misal GET /), hanya yang pertama yang merespons.
// TODO Step 2: pisahkan sub-path agar tidak ada ambiguitas (misal /logistic/rfq vs /logistic/orders).
router.use("/logistic/orders", logisticRfqRouter);
// Phase 2A: Product-First Flow endpoints (product-rfq, select-product-vendor, dll.)
router.use("/logistic/orders", productFirstFlowRouter);
router.use("/logistic/orders", logisticOrdersRouter);
router.use("/logistic", logisticRfqV2Router);
router.use("/settings", settingsRouter);
router.use("/driver", driverRouter);
router.use("/drivers", driversAdminRouter);
router.use(storageRouter);
router.use(webhooksRouter);
router.use("/ai-agent", aiAgentRouter);
router.use("/portal-product", portalProductOrdersRouter);
router.use(geocodeRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/vendor-response", vendorResponseRouter);
router.use("/media", mediaRouter);
router.use("/product-media", productMediaRouter);

router.use("/warehouse", warehouseRouter);
router.use("/inventory", inventoryMainRouter);
router.use("/inventory/receive", inventoryReceiveRouter);
// CATATAN: inventoryStockRouter di-mount dua kali di path berbeda (by design).
// /inventory/stock      → akses data stok per produk
// /inventory/warehouses → DEPRECATED alias — tidak ada frontend caller aktif (audit Phase 5)
// Jadwal hapus: release berikutnya setelah monitoring 1 sprint
router.use("/inventory/stock", inventoryStockRouter);
router.use(
  "/inventory/warehouses",
  (_req: any, res: any, next: any) => {
    res.setHeader("Deprecation", "true");
    res.setHeader("X-Deprecated-Route", "/inventory/warehouses is deprecated - use /inventory/stock instead");
    next();
  },
  inventoryStockRouter,
);
router.use("/custom-roles", customRolesRouter);
router.use("/thai-tea", thaiTeaSuppliesRouter);
router.use("/purchase-workflow", purchaseWorkflowRouter);
router.use("/uom", uomRouter);
router.use("/org", orgRouter);
router.use("/approvals", approvalWorkflowRouter);
router.use("/approval-rules", approvalRulesRouter);
router.use("/bom", productBomRouter);
router.use("/audit-logs", auditLogRouter);
router.use("/erp-audits", auditReportsRouter);
router.use("/storage-audit", storageAuditLogRouter);

router.use("/notifications", notificationsRouter);
router.use("/nav-preferences", navPreferencesRouter);

router.use("/vendor-form", vendorMiniFormRouter);
router.use("/customer-form", vendorMiniFormRouter);
router.use("/admin-form", vendorMiniFormRouter);
router.use("/logistic", customerQuoteAdminRouter);
router.use("/customer-quote", customerQuotePublicRouter);
router.use("/order-task", orderTaskPublicRouter);
router.use("/customer-order", customerOrderPublicRouter);
router.use("/vendor-performance", vendorPerformanceRouter);
router.use("/internal-tasks", internalTasksRouter);
router.use("/pod-ocr", podOcrRouter);
router.use("/margin-rules", marginRulesRouter);
router.use("/admin-action", adminActionAdminRouter);
router.use("/admin-action", adminActionPublicRouter);
router.use("/vendor-fulfillment", vendorFulfillmentPublicRouter);
router.use("/logistic/vendor-fulfillments", logisticVendorFulfillmentAdminRouter);
router.use("/driver-progress", driverProgressPublicRouter);
router.use("/commodity-templates", commodityTemplatesRouter);
router.use("/logistic", fulfillmentAdminRouter);
router.use("/fulfillment", fulfillmentPublicRouter);
router.use("/logistic", vendorJobAdminRouter);
router.use("/vendor-job", vendorJobPublicRouter);
router.use("/order-track", orderTrackingPublicRouter);
router.use("/push", pushRouter);
router.use("/intelligence-alerts", intelligenceAlertsRouter);
router.use("/ai-approvals", aiApprovalsRouter);
router.use("/operational-context", operationalContextRouter);
router.use("/ai/decision-memory", aiDecisionMemoryRouter);
router.use("/product-templates", productTemplatesRouter);
router.use("/logistics-units", logisticsUnitsRouter);
router.use("/trucking-rates", truckingRatesRouter);
router.use("/logistics-rates", logisticsRatesRouter);
router.use("/trucking/bookings", truckingBookingsRouter);
router.use("/enterprise-workflow", enterpriseWorkflowRouter);
router.use("/customer-feedback", customerFeedbackAdminRouter);
router.use("/customer-feedback", customerFeedbackPublicRouter);
router.use("/purchase-mini", purchaseMiniAdminRouter);
router.use("/purchase-mini", purchaseMiniPublicRouter);

router.use("/customer-invoice", paymentProofPublicRouter);
router.use("/customer-invoice", paymentProofAdminRouter);

router.use("/service-templates", serviceTemplatesRouter);
router.use("/payment-proof", paymentProofRouter);

router.use("/logistic", orderAuditTrailRouter);
router.use("/logistic", orderExceptionsRouter);
router.use("/logistic", vendorTrackingAdminRouter);
router.use("/vendor-tracking", vendorTrackingPublicRouter);
router.use("/customer-data", customerDataFormPublicRouter);
router.use("/logistic", customerDataFormAdminRouter);
router.use("/logistic/orders", productFirstOverrideRouter);
router.use("/logistic/product-first/analytics", productFirstAnalyticsRouter);
router.use("/logistic/product-first/audit", productFirstAuditDashboardRouter);

router.use("/exceptions", exceptionsRouter);
router.use("/wa-notification-logs", waNotificationLogsRouter);
router.use("/analytics/profitability", analyticsProfitRouter);
router.use("/vendor-recommendation", vendorRecommendationRouter);
router.use("/vendor-intelligence", vendorCommodityIntelligenceRouter);
router.use("/order-costs", orderCostsRouter);
router.use("/system", systemRouter);
router.use("/rbac", rbacRouter);
router.use("/import-advisor", importAdvisorRouter);
router.use("/sport-center", sportCenterRouter);
router.use("/tenant", tenantRouter);
router.use("/qr-menu", qrMenuRouter);
router.use("/air-freight", airFreightNewRouter);
router.use("/air-freight", airFreightRatesRouter);
router.use("/air-freight", airFreightPublicRouter);
// Public/rates mounts FIRST — oceanFreightRouter has GET /:id catch-all
// that would intercept /options, /rates, /calculate, /inquiry, etc. if mounted first.
router.use("/ocean-freight", oceanFreightPublicRouter);
router.use("/ocean-freight", oceanFreightRatesRouter);
router.use("/ocean-freight", oceanFreightRouter);
router.use("/ocean-freight/vendor-form", oceanFreightVendorFormRouter);
router.use("/executive", executiveRouter);
router.use("/cash-advances", cashAdvancesRouter);
router.use("/vendor-payments", vendorPaymentsRouter);
router.use("/vendor-installments", vendorInstallmentsRouter);
router.use("/bank-loans", bankLoansRouter);
router.use("/bank-reconciliation", bankReconciliationRouter);
router.use("/fixed-assets", fixedAssetsRouter);
router.use("/expense-approvals", expenseApprovalsRouter);
router.use("/expense-dashboard", expenseDashboardRouter);
router.use("/expense-templates", expenseTemplatesRouter);
router.use("/expense-config", expenseBudgetsRouter);
router.use("/air-freight-form", airFreightVendorFormRouter);
router.use("/ocean-freight-master", oceanFreightMasterRouter);
router.use("/ppjk", ppjkRouter);
router.use("/wati", watiRouter);
router.use("/sales/escrow", escrowPublicRouter);
router.use("/sales/escrow", escrowAdminRouter);
router.use("/vendor-trucking-pricing", vendorTruckingPricingRouter);
router.use("/tax", taxRouter);
router.use("/customer-service-requests", customerServiceRequestsRouter);
router.use("/service-packages", servicePackagesRouter);
router.use("/portal/customer-profile", portalCustomerProfileRouter);
router.use("/customer-verification", customerVerificationRouter);
router.use("/customer-verification/admin", customerVerificationAdminRouter);
router.use("/admin/service-requests", adminServiceRequestsRouter);

router.get("/alerts/stream", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;
  handleAlertSse(req, res);
});

async function handleShortLink(req: Request, res: Response) {
  const code = String(req.params.code ?? "").trim();
  if (!code || !/^[A-Z0-9]{4,32}$/i.test(code)) {
    return res.status(400).json({ error: "Invalid short link" });
  }
  const target = await resolveShortLink(code);
  if (!target) {
    return res.status(404).json({ error: "Link tidak ditemukan atau sudah kedaluwarsa." });
  }
  let targetUrl = target;
  try {
    const parsed = new URL(target);
    targetUrl = parsed.pathname + parsed.search + parsed.hash;
  } catch { /* sudah relative */ }
  return res.json({ targetUrl });
}

router.get("/q/:code", handleShortLink);
router.get("/s/:code", handleShortLink);

export default router;
