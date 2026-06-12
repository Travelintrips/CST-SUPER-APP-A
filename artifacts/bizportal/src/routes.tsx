import React from "react";
import { Switch, Route, Redirect } from "wouter";
import NotFound from "@/pages/not-found";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AuthCallbackPage from "@/pages/auth-callback";
import DashboardPage from "@/pages/dashboard";
import MasterDataHubPage from "@/pages/master-data/index";
import FinanceHubPage from "@/pages/finance/index";
import AiCenterHubPage from "@/pages/ai-center/index";
import HrHubPage from "@/pages/hr/index";
import EcommercePage from "@/pages/ecommerce";
import TradingPage from "@/pages/trading";
import WelcomePage from "@/pages/welcome";
import ApprovalsPage from "@/pages/approvals/index";
// Logistics
import KatalogTerpaduPage from "@/pages/katalog-terpadu";
import LogisticsPage from "@/pages/logistics";
import LogisticsFreightPage from "@/pages/logistics-freight";
import LogisticsFreightEditorPage from "@/pages/logistics-freight-editor";
import LogisticsFreightDetailPage from "@/pages/logistics-freight-detail";
import LogisticsFreightBLPage from "@/pages/logistics-freight-bl";
import LogisticsPortalOrdersPage from "@/pages/logistics-portal-orders";
import LogisticsPortalOrderDetailPage from "@/pages/logistics-portal-order-detail";
import ServiceRequestsPage from "@/pages/service-requests";
import ServiceRequestDetailPage from "@/pages/service-request-detail";
import LogisticsDriversPage from "@/pages/logistics-drivers";
import LogisticsDriverPerformancePage from "@/pages/logistics-driver-performance";
import DriverAnalyticsDashboardPage from "@/pages/logistics/drivers-analytics";
import TruckingOrdersPage from "@/pages/logistics/trucking-orders";
import LogisticsQuoteRequestsPage from "@/pages/logistics-quote-requests";
import LogisticsVendorsPage from "@/pages/logistics-vendors";
import LogisticsQuotationReplyPage from "@/pages/logistics-quotation-reply";
import LogisticsVendorQuotePage from "@/pages/logistics-vendor-quote";
import LogisticsMarginRulesPage from "@/pages/logistics-margin-rules";
import LogisticsRateManagementPage from "@/pages/logistics/rate-management";
import PortalProductOrdersPage from "@/pages/portal-product-orders";
// Sales
import SalesDashboardPage from "@/pages/sales/dashboard";
import SalesDocumentsListPage from "@/pages/sales/documents-list";
import SalesDocumentEditorPage from "@/pages/sales/quotation-editor";
import SalesDocumentDetailPage from "@/pages/sales/document-detail";
import AiDraftsPage from "@/pages/sales/ai-drafts";
import CustomersPage from "@/pages/sales/customers";
import SalesInvoicesPage from "@/pages/sales/invoices";
import SalesItemsPage from "@/pages/sales/items";
// Purchase
import PurchaseDashboardPage from "@/pages/purchase/dashboard";
import PurchaseDocumentsListPage from "@/pages/purchase/documents-list";
import PurchaseDocumentEditorPage from "@/pages/purchase/rfq-editor";
import PurchaseRequestListPage from "@/pages/purchase/pr-list";
import PurchaseRequestEditorPage from "@/pages/purchase/pr-editor";
import VendorsPage from "@/pages/purchase/vendors";
import VendorDetailPage from "@/pages/purchase/vendor-detail";
import PurchaseBillsPage from "@/pages/purchase/bills";
import GoodsReceiptListPage from "@/pages/purchase/gr-list";
import GoodsReceiptEditorPage from "@/pages/purchase/gr-editor";
import QcListPage from "@/pages/purchase/qc-list";
import QcEditorPage from "@/pages/purchase/qc-editor";
import { PurchaseReturnsListPage, PurchaseReturnEditorPage } from "@/pages/purchase/purchase-returns";
import TaxDashboardPage from "@/pages/tax/dashboard";
import TaxReconciliationPage from "@/pages/tax/reconciliation";
import TaxRulesPage from "@/pages/tax/rules";
import TaxTransactionsPage from "@/pages/tax/transactions";
import TaxPpnPage from "@/pages/tax/ppn";
import TaxPphPage from "@/pages/tax/pph";
import TaxSptPage from "@/pages/tax/spt";
import TaxExportDjpPage from "@/pages/tax/export-djp";
import ProductTemplatesPage from "@/pages/product-templates/index";
import ProductTemplateDetailPage from "@/pages/product-templates/detail";
import { VendorInvoicesListPage, VendorInvoiceEditorPage } from "@/pages/purchase/vendor-invoices";
import { PaymentRequestsListPage, PaymentRequestEditorPage } from "@/pages/purchase/payment-requests";
import { LandedCostsListPage, LandedCostEditorPage } from "@/pages/purchase/landed-costs";
import VendorComparisonPage from "@/pages/purchase/vendor-comparison";
import PurchaseReceivePage from "@/pages/purchase/receive";
import VendorCatalogPage from "@/pages/purchase/vendor-catalog";
import VendorCatalogEnginePage from "@/pages/purchase/vendor-catalog-engine";
import TruckingPricingPage from "@/pages/purchase/trucking-pricing";
import MarketplaceAiImagesPage from "@/pages/marketplace-ai-images";
import MarketplaceAnalyticsPage from "@/pages/purchase/marketplace-analytics";
// Reports
import ReportsIndexPage from "@/pages/reports/index";
import ReportsSalesPage from "@/pages/reports/sales";
import ReportsPurchasePage from "@/pages/reports/purchase";
import ReportsArAgingPage from "@/pages/reports/ar-aging";
import ReportsApAgingPage from "@/pages/reports/ap-aging";
import ReportsMainPage from "@/pages/reports/main";
import AuditLogPage from "@/pages/reports/audit-log";
import InventoryValuationPage from "@/pages/reports/inventory-valuation";
// Accounting
import AccountingDashboardPage from "@/pages/accounting/dashboard";
import AccountingAccountsPage from "@/pages/accounting/accounts";
import AccountingJournalsPage from "@/pages/accounting/journals";
import AccountingTaxesPage from "@/pages/accounting/taxes";
import AccountingEntriesPage from "@/pages/accounting/entries";
import AccountingEntryDetailPage from "@/pages/accounting/entry-detail";
import AccountingJournalItemsPage from "@/pages/accounting/journal-items";
import AccountingPaymentsPage from "@/pages/accounting/payments";
import AccountingPaylabsPage from "@/pages/accounting/paylabs";
import AccountingOtherTransactionsPage from "@/pages/accounting/other-transactions";
import AccountingSettingsPage from "@/pages/accounting/settings";
import CostCentersPage from "@/pages/accounting/cost-centers";
import AccountingTrialBalancePage from "@/pages/accounting/reports/trial-balance";
import AccountingGeneralLedgerPage from "@/pages/accounting/reports/general-ledger";
import AccountingProfitLossPage from "@/pages/accounting/reports/profit-loss";
import AccountingBalanceSheetPage from "@/pages/accounting/reports/balance-sheet";
import AccountingFreightProfitabilityPage from "@/pages/accounting/reports/freight-profitability";
import AccountingReconciliationPage from "@/pages/accounting/reconciliation";
import BankReconciliationPage from "@/pages/accounting/bank-reconciliation";
import AccountingGSheetPage from "@/pages/accounting/gsheet";
import WhtReconciliationPage from "@/pages/accounting/wht-reconciliation";
import TaxReportPage from "@/pages/accounting/tax-report";
import AccountingAuditReportPage from "@/pages/accounting/audit-report";
import TaxMissingCompliancePage from "@/pages/tax/missing-compliance";
import HoldingPage from "@/pages/HoldingPage";
import ExecutiveDashboardPage from "@/pages/executive/dashboard";
import ExecutiveLogisticsDashboardPage from "@/pages/executive/logistics-dashboard";
import HoldingDashboardPage from "@/pages/accounting/holding-dashboard";
import HoldingPLReportPage from "@/pages/accounting/holding-pl-report";
import HoldingCashflowReportPage from "@/pages/accounting/holding-cashflow-report";
import HoldingGroupDetailPage from "@/pages/accounting/holding-group-detail";
// Expenses
import ExpenseListPage from "@/pages/expense/index";
import ExpenseEditorPage from "@/pages/expense/editor";
import ExpenseCategoriesPage from "@/pages/expense/categories";
import ExpenseReportsPage from "@/pages/expense/reports";
import ExpenseRoutinePage from "@/pages/expense/routine";
import KasbonPage from "@/pages/expense/kasbon";
import TalanganPage from "@/pages/expense/talangan";
import VendorInstallmentsPage from "@/pages/expense/vendor-installments";
import BankLoansPage from "@/pages/expense/bank-loans";
import FixedAssetsPage from "@/pages/expense/fixed-assets";
import VendorPaymentsPage from "@/pages/expense/vendor-payments";
import AssetDepreciationPage from "@/pages/expense/asset-depreciation";
import ExpenseApprovalsPage from "@/pages/expense/approvals";
import ExpenseDashboardPage from "@/pages/expense/dashboard";
import ExpenseTemplatesPage from "@/pages/expense/templates";
import ExpenseBudgetPage from "@/pages/expense/budget";
// Correspondence
import CorrespondencesPage from "@/pages/correspondences";
import EmailInboxPage from "@/pages/email-inbox";
// Settings & Users
import SettingsPage from "@/pages/settings";
import AiChatbotSettingsPage from "@/pages/ai-chatbot-settings";
import AiChatbotKnowledgePage from "@/pages/ai-chatbot-knowledge";
import AiScanSettingsPage from "@/pages/ai-scan-settings";
import UomPage from "@/pages/settings/uom";
import ServiceTemplatesSettingsPage from "@/pages/settings/service-templates";
import NavCompanyConfigPage from "@/pages/settings/nav-company-config";
import ShortLinksPage from "@/pages/settings/short-links";
import WaTemplatesPage from "@/pages/settings/wa-templates";
import EnterpriseWaTemplatesPage from "@/pages/settings/enterprise-wa-templates";
import LogisticsUnitsPage from "@/pages/settings/logistics-units";
import TruckingRatesPage from "@/pages/settings/trucking-rates";
import VehicleImagesPage from "@/pages/settings/vehicle-images";
import SettingsRolesPage from "@/pages/settings-roles";
import SettingsApprovalRulesPage from "@/pages/settings-approval-rules";
import UsersPage from "@/pages/users";
import MediaManagerPage from "@/pages/media-manager";
import OrgManagementPage from "@/pages/OrgManagementPage";
import AuditReportListPage from "@/pages/audit/index";
import AuditReportFormPage from "@/pages/audit/form";
import AuditComparePage from "@/pages/audit/compare";
import WaNotificationLogsPage from "@/pages/settings/wa-notification-logs";
import DocumentTemplatesPage from "@/pages/settings/document-templates";
import AppSecretsPage from "@/pages/settings/app-secrets";
import WatiSettingsPage from "@/pages/settings/wati";
import WaGatewaySettingsPage from "@/pages/settings/wa-gateway";
import SystemHealthPage from "@/pages/system-health";

// Products
import ProductItemsPage from "@/pages/products/items";
import ProductRecipesPage from "@/pages/products/recipes";
// Portal
import PortalCustomersPage from "@/pages/portal-customers";
import PortalOnboardingApprovalsPage from "@/pages/portal-onboarding-approvals";
import PortalCustomerVerificationPage from "@/pages/portal-customer-verification";
// Logistics RFQ + Order detail
import LogisticsRfqListPage from "@/pages/logistics-rfq-list";
import LogisticsRfqDetailPage from "@/pages/logistics-rfq-detail";
import LogisticsRfqComparisonPage from "@/pages/logistics-rfq-comparison";
import LogisticOrderDetailPage from "@/pages/logistics/order-detail";
import OrderAuditTrailPage from "@/pages/logistics/order-audit-trail";
import VendorPerformancePage from "@/pages/logistics/vendor-performance";
import VendorRecommendationPage from "@/pages/logistics/vendor-recommendation";
import VendorCommodityIntelligencePage from "@/pages/logistics/vendor-commodity-intelligence";
import InternalTasksPage from "@/pages/logistics/internal-tasks";
import LogisticsVendorFulfillmentsPage from "@/pages/logistics-vendor-fulfillments";
import LogisticsVendorFulfillmentDetailPage from "@/pages/logistics-vendor-fulfillment-detail";
import ProductFirstAnalyticsPage from "@/pages/logistics/product-first-analytics";
import ProductFirstAuditPage from "@/pages/logistics/product-first-audit";
import LogisticsImportAssistantPage from "@/pages/logistics-import-assistant";
import AirFreightVendorFormPage from "@/pages/air-freight-vendor-form";
import OceanFreightOrdersPage from "@/pages/logistics/ocean-freight-orders";
import OceanFreightOrderDetailPage from "@/pages/logistics/ocean-freight-order-detail";
import OceanFreightRatesPage from "@/pages/logistics/ocean-freight-rates";
import OceanFreightMasterDataPage from "@/pages/logistics/ocean-freight-master-data";
import ExceptionsPage from "@/pages/exceptions/index";
// Misc
import NotificationsPage from "@/pages/notifications";
import IntelligenceAlertsPage from "@/pages/intelligence-alerts";
import AiApprovalsPage from "@/pages/ai-approvals";
import OperationalContextPage from "@/pages/operational-context";
import AiDecisionMemoryPage from "@/pages/ai-decision-memory";
import WaNotificationHistoryPage from "@/pages/wa-notification-history";
import VendorLeaderboardPage from "@/pages/vendor-leaderboard";
import AnalyticsDashboardPage from "@/pages/analytics-dashboard";
import ProfitabilityAnalyticsPage from "@/pages/analytics/profitability";
import RouteProfitabilityPage from "@/pages/analytics/route-profitability";
import CommodityProfitabilityPage from "@/pages/analytics/commodity-profitability";
import CeoDashboardPage from "@/pages/ceo-dashboard";
import EnterpriseDashboardPage from "@/pages/enterprise-dashboard";
import OperationalDashboardPage from "@/pages/operational-dashboard";
import POOrdersPage from "@/pages/purchase/po-orders";
import VendorFormsPage from "@/pages/purchase/vendor-forms";
import VmfAuditTrailPage from "@/pages/purchase/vmf-audit-trail";

import SportCenterDashboard from "@/pages/sport-center/dashboard";
import SportCenterBookings from "@/pages/sport-center/bookings";
import SportCenterFacilities from "@/pages/sport-center/facilities";
import SportCenterCustomers from "@/pages/sport-center/customers";
import SportCenterMembers from "@/pages/sport-center/members";
import SportCenterPricingRules from "@/pages/sport-center/pricing-rules";
import SportCenterPayments from "@/pages/sport-center/payments";
import SportCenterCompanyInvoices from "@/pages/sport-center/company-invoices";
import SportCenterReports from "@/pages/sport-center/reports";
import SportCenterSettings from "@/pages/sport-center/settings";
import SportCenterProfitability from "@/pages/sport-center/profitability";
import TenantDashboard from "@/pages/tenant/dashboard";
import TenantList from "@/pages/tenant/tenants";
import TenantUnits from "@/pages/tenant/units";
import TenantBookings from "@/pages/tenant/bookings";
import TenantPayments from "@/pages/tenant/payments";
import TenantInvoices from "@/pages/tenant/invoices";
import AirFreightNewOrdersPage from "@/pages/air-freight/orders";
import AirFreightRatesPage from "@/pages/air-freight/rates";
import AirFreightNewOrderDetailPage from "@/pages/air-freight/order-detail";
import AirFreightApprovalPage from "@/pages/air-freight/approval";
import AirFreightTrackPage from "@/pages/air-freight/track";
import PpjkPage from "@/pages/logistics/ppjk";
import PpjkDetailPage from "@/pages/logistics/ppjk-detail";
import UnifiedShipmentsPage from "@/pages/logistics/shipments";

const PR = (C: React.ComponentType) => () => <ProtectedRoute component={C} />;

export function AppRoutes({ rootGuard }: { rootGuard?: React.ComponentType }) {
  return (
    <Switch>
      {rootGuard && <Route path="/" component={rootGuard} />}

      {/* ── Auth callback (Supabase OAuth popup) ───────────────────────── */}
      <Route path="/auth/callback" component={AuthCallbackPage} />

      {/* ── Welcome / Dashboard ────────────────────────────────────────── */}
      <Route path="/welcome" component={WelcomePage} />
      <Route path="/dashboard" component={PR(DashboardPage)} />
      <Route path="/ceo-dashboard" component={PR(CeoDashboardPage)} />
      <Route path="/ai/decision-memory" component={PR(AiDecisionMemoryPage)} />
      <Route path="/approvals" component={PR(ApprovalsPage)} />
      <Route path="/ecommerce" component={PR(EcommercePage)} />
      <Route path="/trading" component={PR(TradingPage)} />

      {/* ── Logistics ──────────────────────────────────────────────────── */}
      <Route path="/katalog-terpadu" component={PR(KatalogTerpaduPage)} />
      <Route path="/products/items" component={PR(ProductItemsPage)} />
      <Route path="/products/recipes" component={PR(ProductRecipesPage)} />
      <Route path="/logistics" component={PR(LogisticsPage)} />
      <Route path="/logistics/freight/new" component={PR(LogisticsFreightEditorPage)} />
      <Route path="/logistics/freight/:id/bl" component={PR(LogisticsFreightBLPage)} />
      <Route path="/logistics/freight/:id/edit" component={PR(LogisticsFreightEditorPage)} />
      <Route path="/logistics/freight/:id" component={PR(LogisticsFreightDetailPage)} />
      <Route path="/logistics/freight" component={PR(LogisticsFreightPage)} />
      <Route path="/logistics/service-requests/:id" component={PR(ServiceRequestDetailPage)} />
      <Route path="/logistics/service-requests" component={PR(ServiceRequestsPage)} />
      <Route path="/logistics/portal-orders/:id" component={PR(LogisticsPortalOrderDetailPage)} />
      <Route path="/logistics/portal-orders" component={PR(LogisticsPortalOrdersPage)} />
      <Route path="/logistics/trucking-orders" component={PR(TruckingOrdersPage)} />
      <Route path="/logistics/drivers/analytics" component={PR(DriverAnalyticsDashboardPage)} />
      <Route path="/logistics/drivers/:id/performance" component={PR(LogisticsDriverPerformancePage)} />
      <Route path="/logistics/drivers" component={PR(LogisticsDriversPage)} />
      <Route path="/logistics/driver-performance" component={PR(LogisticsDriverPerformancePage)} />
      <Route path="/logistics/quote-requests" component={PR(LogisticsQuoteRequestsPage)} />
      <Route path="/logistics/vendor-quote/:token" component={LogisticsVendorQuotePage} />
      <Route path="/logistics/quotation-reply" component={PR(LogisticsQuotationReplyPage)} />
      <Route path="/logistics/quotation-reply/:token" component={LogisticsQuotationReplyPage} />
      <Route path="/logistics/rate-management" component={PR(LogisticsRateManagementPage)} />
      <Route path="/logistics/margin-rules" component={PR(LogisticsMarginRulesPage)} />
      <Route path="/logistics/rfq/:rfqId/comparison" component={PR(LogisticsRfqComparisonPage)} />
      <Route path="/logistics/rfq/:rfqId/detail" component={PR(LogisticsRfqDetailPage)} />
      <Route path="/logistics/rfq" component={PR(LogisticsRfqListPage)} />
      <Route path="/logistics/orders/:orderId/audit-trail" component={PR(OrderAuditTrailPage)} />
      <Route path="/logistics/orders/:orderId" component={PR(LogisticOrderDetailPage)} />
      <Route path="/logistics/vendor-performance" component={PR(VendorPerformancePage)} />
      <Route path="/logistics/vendor-recommendation" component={PR(VendorRecommendationPage)} />
      <Route path="/logistics/vendor-commodity-intelligence" component={PR(VendorCommodityIntelligencePage)} />
      <Route path="/logistics/vendor-fulfillments/:id" component={PR(LogisticsVendorFulfillmentDetailPage)} />
      <Route path="/logistics/vendor-fulfillments" component={PR(LogisticsVendorFulfillmentsPage)} />
      <Route path="/logistics/internal-tasks" component={PR(InternalTasksPage)} />
      <Route path="/logistics/product-first/analytics" component={PR(ProductFirstAnalyticsPage)} />
      <Route path="/logistics/product-first/audit" component={PR(ProductFirstAuditPage)} />
      <Route path="/logistics/import-assistant" component={PR(LogisticsImportAssistantPage)} />
      <Route path="/air-freight-form/:token" component={AirFreightVendorFormPage} />

      {/* ── Logistics clean-URL aliases ────────────────────────────────── */}
      <Route path="/logistics/dashboard" component={PR(OperationalDashboardPage)} />
      <Route path="/logistics/shipments" component={PR(LogisticsPage)} />
      <Route path="/logistics/trucking" component={PR(TruckingOrdersPage)} />
      <Route path="/logistics/air-freight" component={PR(AirFreightNewOrdersPage)} />
      <Route path="/logistics/ocean-freight" component={PR(OceanFreightOrdersPage)} />
      <Route path="/logistics/ppjk" component={PR(LogisticsFreightPage)} />
      <Route path="/logistics/vendor-fulfillment" component={PR(LogisticsVendorFulfillmentsPage)} />
      <Route path="/logistics/profitability" component={PR(AccountingFreightProfitabilityPage)} />
      <Route path="/logistics/settings" component={PR(LogisticsMarginRulesPage)} />

      <Route path="/portal-product-orders" component={PR(PortalProductOrdersPage)} />
      <Route path="/portal/customers" component={PR(PortalCustomersPage)} />
      <Route path="/portal/onboarding-approvals" component={PR(PortalOnboardingApprovalsPage)} />
      <Route path="/portal/customer-verification/:id" component={PR(PortalCustomerVerificationPage)} />
      <Route path="/portal/customer-verification" component={PR(PortalCustomerVerificationPage)} />

      {/* ── Sales ──────────────────────────────────────────────────────── */}
      <Route path="/sales/documents/new" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/documents/:id/edit" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/documents/:id" component={PR(SalesDocumentDetailPage)} />
      <Route path="/sales/documents" component={PR(SalesDocumentsListPage)} />
      <Route path="/sales/quotations/new" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/quotations/:id/edit" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/quotations/:id" component={PR(SalesDocumentDetailPage)} />
      <Route path="/sales/quotations" component={PR(SalesDocumentsListPage)} />
      <Route path="/sales/orders/new" component={() => <ProtectedRoute component={() => <SalesDocumentEditorPage kind="order" />} />} />
      <Route path="/sales/orders/:id" component={PR(SalesDocumentDetailPage)} />
      <Route path="/sales/orders" component={() => <ProtectedRoute component={() => <SalesDocumentsListPage kind="order" />} />} />
      <Route path="/sales/ai-drafts" component={PR(AiDraftsPage)} />
      <Route path="/sales/customers" component={PR(CustomersPage)} />
      <Route path="/sales/invoices" component={PR(SalesInvoicesPage)} />
      <Route path="/sales/items" component={PR(SalesItemsPage)} />
      <Route path="/sales" component={PR(SalesDashboardPage)} />

      {/* ── Purchase ───────────────────────────────────────────────────── */}
      <Route path="/purchase/pr/new" component={PR(PurchaseRequestEditorPage)} />
      <Route path="/purchase/pr/:id" component={PR(PurchaseRequestEditorPage)} />
      <Route path="/purchase/pr" component={PR(PurchaseRequestListPage)} />
      <Route path="/purchase/documents/new" component={PR(PurchaseDocumentEditorPage)} />
      <Route path="/purchase/documents/:id/edit" component={PR(PurchaseDocumentEditorPage)} />
      <Route path="/purchase/documents/:id" component={PR(PurchaseDocumentEditorPage)} />
      <Route path="/purchase/documents" component={PR(PurchaseDocumentsListPage)} />
      <Route path="/purchase/rfq/new" component={PR(PurchaseDocumentEditorPage)} />
      <Route path="/purchase/rfq/:rfqId/compare" component={PR(VendorComparisonPage)} />
      <Route path="/purchase/rfq/:id" component={PR(PurchaseDocumentEditorPage)} />
      <Route path="/purchase/rfq" component={() => <ProtectedRoute component={() => <PurchaseDocumentsListPage kind="rfq" />} />} />
      <Route path="/purchase/orders/:id" component={PR(PurchaseDocumentEditorPage)} />
      <Route path="/purchase/orders" component={PR(POOrdersPage)} />
      <Route path="/purchase/vendor-forms" component={PR(VendorFormsPage)} />
      <Route path="/purchase/vmf-audit-trail" component={PR(VmfAuditTrailPage)} />
      <Route path="/purchase/vendors/:id" component={PR(VendorDetailPage)} />
      <Route path="/purchase/vendors" component={PR(VendorsPage)} />
      <Route path="/purchase/bills" component={PR(PurchaseBillsPage)} />
      <Route path="/purchase/gr/new" component={PR(GoodsReceiptEditorPage)} />
      <Route path="/purchase/gr/:id" component={PR(GoodsReceiptEditorPage)} />
      <Route path="/purchase/gr" component={PR(GoodsReceiptListPage)} />
      <Route path="/purchase/qc/new" component={PR(QcEditorPage)} />
      <Route path="/purchase/qc/:id" component={PR(QcEditorPage)} />
      <Route path="/purchase/qc" component={PR(QcListPage)} />
      <Route path="/purchase/returns/new" component={PR(PurchaseReturnEditorPage)} />
      <Route path="/purchase/returns/:id" component={PR(PurchaseReturnEditorPage)} />
      <Route path="/purchase/returns" component={PR(PurchaseReturnsListPage)} />
      <Route path="/purchase/vendor-invoices/new" component={PR(VendorInvoiceEditorPage)} />
      <Route path="/purchase/vendor-invoices/:id" component={PR(VendorInvoiceEditorPage)} />
      <Route path="/purchase/vendor-invoices" component={PR(VendorInvoicesListPage)} />
      <Route path="/purchase/payment-requests/new" component={PR(PaymentRequestEditorPage)} />
      <Route path="/purchase/payment-requests/:id" component={PR(PaymentRequestEditorPage)} />
      <Route path="/purchase/payment-requests" component={PR(PaymentRequestsListPage)} />
      <Route path="/purchase/landed-costs/new" component={PR(LandedCostEditorPage)} />
      <Route path="/purchase/landed-costs/:id" component={PR(LandedCostEditorPage)} />
      <Route path="/purchase/landed-costs" component={PR(LandedCostsListPage)} />
      <Route path="/purchase/receive" component={PR(PurchaseReceivePage)} />
      <Route path="/purchase/vendor-catalog" component={PR(VendorCatalogPage)} />
      <Route path="/purchase/vendor-catalog-engine" component={PR(VendorCatalogEnginePage)} />
      <Route path="/purchase/trucking-pricing" component={PR(TruckingPricingPage)} />
      <Route path="/purchase/marketplace-analytics" component={PR(MarketplaceAnalyticsPage)} />
      <Route path="/marketplace/ai-images" component={PR(MarketplaceAiImagesPage)} />
      <Route path="/purchase" component={PR(PurchaseDashboardPage)} />

      {/* ── Reports ────────────────────────────────────────────────────── */}
      <Route path="/reports" component={PR(ReportsIndexPage)} />
      <Route path="/reports/sales" component={PR(ReportsSalesPage)} />
      <Route path="/reports/purchase" component={PR(ReportsPurchasePage)} />
      <Route path="/reports/ar-aging" component={PR(ReportsArAgingPage)} />
      <Route path="/reports/ap-aging" component={PR(ReportsApAgingPage)} />
      <Route path="/reports/operasional" component={PR(ReportsMainPage)} />
      <Route path="/reports/audit-log" component={PR(AuditLogPage)} />
      <Route path="/reports/inventory-valuation" component={PR(InventoryValuationPage)} />

      {/* ── Accounting ─────────────────────────────────────────────────── */}
      <Route path="/accounting"><Redirect to="/accounting/dashboard" /></Route>
      <Route path="/accounting/dashboard" component={PR(AccountingDashboardPage)} />
      <Route path="/accounting/accounts" component={PR(AccountingAccountsPage)} />
      <Route path="/accounting/journals" component={PR(AccountingJournalsPage)} />
      <Route path="/accounting/taxes" component={PR(AccountingTaxesPage)} />
      <Route path="/accounting/entries/:id" component={PR(AccountingEntryDetailPage)} />
      <Route path="/accounting/entries" component={PR(AccountingEntriesPage)} />
      <Route path="/accounting/journal-items" component={PR(AccountingJournalItemsPage)} />
      <Route path="/accounting/payments" component={PR(AccountingPaymentsPage)} />
      <Route path="/accounting/paylabs" component={PR(AccountingPaylabsPage)} />
      <Route path="/accounting/other-transactions" component={PR(AccountingOtherTransactionsPage)} />
      <Route path="/accounting/settings" component={PR(AccountingSettingsPage)} />
      <Route path="/accounting/cost-centers" component={PR(CostCentersPage)} />
      <Route path="/accounting/reconciliation" component={PR(AccountingReconciliationPage)} />
      <Route path="/accounting/bank-reconciliation" component={PR(BankReconciliationPage)} />
      <Route path="/accounting/wht-reconciliation" component={PR(WhtReconciliationPage)} />
      <Route path="/accounting/gsheet" component={PR(AccountingGSheetPage)} />
      <Route path="/accounting/tax-report" component={PR(TaxReportPage)} />
      <Route path="/accounting/audit-report" component={PR(AccountingAuditReportPage)} />
      <Route path="/accounting/reports/trial-balance" component={PR(AccountingTrialBalancePage)} />
      <Route path="/accounting/reports/general-ledger" component={PR(AccountingGeneralLedgerPage)} />
      <Route path="/accounting/reports/profit-loss" component={PR(AccountingProfitLossPage)} />
      <Route path="/accounting/reports/balance-sheet" component={PR(AccountingBalanceSheetPage)} />
      <Route path="/accounting/reports/freight-profitability" component={PR(AccountingFreightProfitabilityPage)} />
      <Route path="/executive/logistics" component={PR(ExecutiveLogisticsDashboardPage)} />
      <Route path="/executive" component={PR(ExecutiveDashboardPage)} />
      <Route path="/holding/groups/:id" component={PR(HoldingGroupDetailPage)} />
      <Route path="/holding/dashboard" component={PR(HoldingDashboardPage)} />
      <Route path="/holding/pl-report" component={PR(HoldingPLReportPage)} />
      <Route path="/holding/cashflow-report" component={PR(HoldingCashflowReportPage)} />
      <Route path="/holding" component={PR(HoldingPage)} />

      {/* ── Expenses ───────────────────────────────────────────────────── */}
      <Route path="/expense/new" component={PR(ExpenseEditorPage)} />
      <Route path="/expense/categories" component={PR(ExpenseCategoriesPage)} />
      <Route path="/expense/reports" component={PR(ExpenseReportsPage)} />
      <Route path="/expense/routine" component={PR(ExpenseRoutinePage)} />
      <Route path="/expense/kasbon" component={PR(KasbonPage)} />
      <Route path="/expense/talangan" component={PR(TalanganPage)} />
      <Route path="/expense/vendor-installments" component={PR(VendorInstallmentsPage)} />
      <Route path="/expense/bank-loans" component={PR(BankLoansPage)} />
      <Route path="/expense/fixed-assets" component={PR(FixedAssetsPage)} />
      <Route path="/expense/vendor-payments" component={PR(VendorPaymentsPage)} />
      <Route path="/expense/asset-depreciation" component={PR(AssetDepreciationPage)} />
      <Route path="/expense/approvals" component={PR(ExpenseApprovalsPage)} />
      <Route path="/expense/dashboard" component={PR(ExpenseDashboardPage)} />
      <Route path="/expense/templates" component={PR(ExpenseTemplatesPage)} />
      <Route path="/expense/budget" component={PR(ExpenseBudgetPage)} />
      <Route path="/expense/:id/edit" component={PR(ExpenseEditorPage)} />
      <Route path="/expense/:id" component={PR(ExpenseEditorPage)} />
      <Route path="/expense" component={PR(ExpenseListPage)} />

      {/* ── Correspondence ─────────────────────────────────────────────── */}
      <Route path="/correspondences" component={PR(CorrespondencesPage)} />
      <Route path="/email-inbox" component={PR(EmailInboxPage)} />
      <Route path="/notification-history" component={PR(WaNotificationHistoryPage)} />

      {/* ── Settings ───────────────────────────────────────────────────── */}
      <Route path="/settings/nav-company-config" component={PR(NavCompanyConfigPage)} />
      <Route path="/settings/uom" component={PR(UomPage)} />
      <Route path="/settings/short-links" component={PR(ShortLinksPage)} />
      <Route path="/settings/wa-templates" component={PR(WaTemplatesPage)} />
      <Route path="/settings/enterprise-wa-templates" component={PR(EnterpriseWaTemplatesPage)} />
      <Route path="/settings/logistics-units" component={PR(LogisticsUnitsPage)} />
      <Route path="/settings/trucking-rates" component={PR(TruckingRatesPage)} />
      <Route path="/settings/vehicle-images" component={PR(VehicleImagesPage)} />
      <Route path="/settings/ai-chatbot/knowledge" component={PR(AiChatbotKnowledgePage)} />
      <Route path="/settings/ai-chatbot" component={PR(AiChatbotSettingsPage)} />
      <Route path="/settings/ai-scan" component={PR(AiScanSettingsPage)} />
      <Route path="/settings/roles" component={PR(SettingsRolesPage)} />
      <Route path="/settings/approval-rules" component={PR(SettingsApprovalRulesPage)} />
      <Route path="/settings/product-templates" component={PR(ProductTemplatesPage)} />
      <Route path="/settings/service-templates" component={PR(ServiceTemplatesSettingsPage)} />
      <Route path="/settings/wati" component={PR(WatiSettingsPage)} />
      <Route path="/settings/wa-gateway" component={PR(WaGatewaySettingsPage)} />
      <Route path="/settings" component={PR(SettingsPage)} />

      {/* ── Users & Org ────────────────────────────────────────────────── */}
      <Route path="/users" component={PR(UsersPage)} />
      <Route path="/media" component={PR(MediaManagerPage)} />
      <Route path="/org" component={PR(OrgManagementPage)} />


      {/* ── Products ───────────────────────────────────────────────────── */}
      <Route path="/products/items" component={PR(ProductItemsPage)} />
      <Route path="/products/recipes" component={PR(ProductRecipesPage)} />

      {/* ── Product Template Engine ─────────────────────────────────────── */}
      <Route path="/product-templates/:id" component={PR(ProductTemplateDetailPage)} />
      <Route path="/product-templates" component={PR(ProductTemplatesPage)} />



      {/* ── Vendor Leaderboard ─────────────────────────────────────────── */}
      <Route path="/vendors" component={PR(VendorLeaderboardPage)} />

      {/* ── WA Monitoring ──────────────────────────────────────────────── */}
      <Route path="/settings/wa-notification-logs" component={PR(WaNotificationLogsPage)} />
      <Route path="/settings/document-templates" component={PR(DocumentTemplatesPage)} />
      <Route path="/settings/secrets" component={PR(AppSecretsPage)} />

      {/* ── System Health ──────────────────────────────────────────────── */}
      <Route path="/system-health" component={PR(SystemHealthPage)} />

      {/* ── Notifications & Analytics ──────────────────────────────────── */}
      <Route path="/notifications" component={PR(NotificationsPage)} />
      <Route path="/exceptions" component={PR(ExceptionsPage)} />
      <Route path="/intelligence-alerts" component={PR(IntelligenceAlertsPage)} />
      <Route path="/ai-approvals" component={PR(AiApprovalsPage)} />
      <Route path="/operational-context" component={PR(OperationalContextPage)} />
      <Route path="/analytics" component={PR(AnalyticsDashboardPage)} />
      <Route path="/analytics/profitability" component={PR(ProfitabilityAnalyticsPage)} />
      <Route path="/analytics/route-profitability" component={PR(RouteProfitabilityPage)} />
      <Route path="/analytics/commodity-profitability" component={PR(CommodityProfitabilityPage)} />
      <Route path="/enterprise-dashboard" component={PR(EnterpriseDashboardPage)} />
      <Route path="/operational-dashboard" component={PR(OperationalDashboardPage)} />

      {/* ── Audit ERP ──────────────────────────────────────────────────── */}
      <Route path="/audit/compare" component={PR(AuditComparePage)} />
      <Route path="/audit/:id" component={PR(AuditReportFormPage)} />
      <Route path="/audit" component={PR(AuditReportListPage)} />

      {/* ── Sport Center ───────────────────────────────────────────────── */}
      <Route path="/sport-center/dashboard" component={PR(SportCenterDashboard)} />
      <Route path="/sport-center/bookings" component={PR(SportCenterBookings)} />
      <Route path="/sport-center/facilities" component={PR(SportCenterFacilities)} />
      <Route path="/sport-center/customers" component={PR(SportCenterCustomers)} />
      <Route path="/sport-center/members" component={PR(SportCenterMembers)} />
      <Route path="/sport-center/pricing-rules" component={PR(SportCenterPricingRules)} />
      <Route path="/sport-center/payments" component={PR(SportCenterPayments)} />
      <Route path="/sport-center/company-invoices" component={PR(SportCenterCompanyInvoices)} />
      <Route path="/sport-center/reports" component={PR(SportCenterReports)} />
      <Route path="/sport-center/profitability" component={PR(SportCenterProfitability)} />
      <Route path="/sport-center/settings" component={PR(SportCenterSettings)} />
      <Route path="/sport-center" component={PR(SportCenterDashboard)} />
      <Route path="/tenant/dashboard" component={PR(TenantDashboard)} />
      <Route path="/tenant/tenants" component={PR(TenantList)} />
      <Route path="/tenant/units" component={PR(TenantUnits)} />
      <Route path="/tenant/bookings" component={PR(TenantBookings)} />
      <Route path="/tenant/payments" component={PR(TenantPayments)} />
      <Route path="/tenant/invoices" component={PR(TenantInvoices)} />
      <Route path="/tenant" component={PR(TenantDashboard)} />

      {/* ── Ocean Freight ───────────────────────────────────────────────── */}
      <Route path="/logistics/ocean-freight-orders" component={PR(OceanFreightOrdersPage)} />
      <Route path="/logistics/ocean-freight/:id" component={PR(OceanFreightOrderDetailPage)} />
      <Route path="/logistics/ocean-freight-rates" component={PR(OceanFreightRatesPage)} />
      <Route path="/ocean-freight-master-data" component={PR(OceanFreightMasterDataPage)} />
      {/* Legacy redirects — canonical path is /logistics/ocean-freight-* */}
      <Route path="/ocean-freight/orders/:id" component={({ params }: { params: { id: string } }) => <Redirect to={`/logistics/ocean-freight/${params.id}`} />} />
      <Route path="/ocean-freight/orders" component={() => <Redirect to="/logistics/ocean-freight-orders" />} />
      <Route path="/ocean-freight/rates" component={() => <Redirect to="/logistics/ocean-freight-rates" />} />

      {/* ── Air Freight ─────────────────────────────────────────────────── */}
      {/* Canonical: /air-freight/orders (newer, more complete) */}
      <Route path="/air-freight/orders/:id" component={PR(AirFreightNewOrderDetailPage)} />
      <Route path="/air-freight/orders" component={PR(AirFreightNewOrdersPage)} />
      <Route path="/air-freight/rates" component={PR(AirFreightRatesPage)} />
      {/* public — no auth */}
      <Route path="/air-freight/approval/:token" component={AirFreightApprovalPage} />
      <Route path="/air-freight/track/:orderNumber" component={AirFreightTrackPage} />
      {/* Legacy redirect — /logistics/air-freight → /air-freight/orders */}
      <Route path="/logistics/air-freight/:id" component={({ params }: { params: { id: string } }) => <Redirect to={`/air-freight/orders/${params.id}`} />} />
      <Route path="/logistics/air-freight" component={() => <Redirect to="/air-freight/orders" />} />

      {/* ── PPJK — Dokumen Kepabeanan ────────────────────────────────────── */}
      <Route path="/logistics/ppjk/:id" component={PR(PpjkDetailPage)} />
      <Route path="/logistics/ppjk" component={PR(PpjkPage)} />

      {/* ── Unified Shipments ────────────────────────────────────────────── */}
      <Route path="/logistics/shipments" component={PR(UnifiedShipmentsPage)} />

      {/* ── Tax Management ─────────────────────────────────────────────── */}
      <Route path="/tax/dashboard" component={PR(TaxDashboardPage)} />
      <Route path="/tax/rules" component={PR(TaxRulesPage)} />
      <Route path="/tax/transactions" component={PR(TaxTransactionsPage)} />
      <Route path="/tax/ppn" component={PR(TaxPpnPage)} />
      <Route path="/tax/pph" component={PR(TaxPphPage)} />
      <Route path="/tax/spt" component={PR(TaxSptPage)} />
      <Route path="/tax/export-djp" component={PR(TaxExportDjpPage)} />
      <Route path="/tax/reconciliation" component={PR(TaxReconciliationPage)} />
      <Route path="/tax/missing-compliance" component={PR(TaxMissingCompliancePage)} />
      <Route path="/tax" component={PR(TaxDashboardPage)} />

      {/* ── Module Hub Pages ───────────────────────────────────────────── */}
      <Route path="/master-data" component={PR(MasterDataHubPage)} />
      <Route path="/finance" component={PR(FinanceHubPage)} />
      <Route path="/ai-center" component={PR(AiCenterHubPage)} />
      <Route path="/hr" component={PR(HrHubPage)} />

      {/* ── Legacy redirects ───────────────────────────────────────────── */}
      <Route path="/expenses/new" component={() => <Redirect to="/expense/new" />} />
      <Route path="/expenses/categories" component={() => <Redirect to="/expense/categories" />} />
      <Route path="/expenses/reports" component={() => <Redirect to="/expense/reports" />} />
      <Route path="/expenses/:id" component={({ params }: { params: { id: string } }) => <Redirect to={`/expense/${params.id}/edit`} />} />
      <Route path="/expenses" component={() => <Redirect to="/expense" />} />
      <Route path="/logistics/vendors" component={() => <Redirect to="/purchase/vendors" />} />

      <Route component={NotFound} />
    </Switch>
  );
}
