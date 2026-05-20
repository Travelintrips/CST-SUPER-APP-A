import React from "react";
import { Switch, Route, Redirect } from "wouter";
import NotFound from "@/pages/not-found";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import DashboardPage from "@/pages/dashboard";
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
import LogisticsDriversPage from "@/pages/logistics-drivers";
import LogisticsDriverPerformancePage from "@/pages/logistics-driver-performance";
import LogisticsQuoteRequestsPage from "@/pages/logistics-quote-requests";
import LogisticsVendorsPage from "@/pages/logistics-vendors";
import LogisticsQuotationReplyPage from "@/pages/logistics-quotation-reply";
import LogisticsVendorQuotePage from "@/pages/logistics-vendor-quote";
import LogisticsMarginRulesPage from "@/pages/logistics-margin-rules";
import PortalProductOrdersPage from "@/pages/portal-product-orders";
// Sales
import SalesDashboardPage from "@/pages/sales/dashboard";
import SalesDocumentsListPage from "@/pages/sales/documents-list";
import SalesDocumentEditorPage from "@/pages/sales/quotation-editor";
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
import { VendorInvoicesListPage, VendorInvoiceEditorPage } from "@/pages/purchase/vendor-invoices";
import { PaymentRequestsListPage, PaymentRequestEditorPage } from "@/pages/purchase/payment-requests";
import { LandedCostsListPage, LandedCostEditorPage } from "@/pages/purchase/landed-costs";
import VendorComparisonPage from "@/pages/purchase/vendor-comparison";
import PurchaseReceivePage from "@/pages/purchase/receive";
import ThaiTeaPurchasePage from "@/pages/purchase/thai-tea";
// Reports
import ReportsSalesPage from "@/pages/reports/sales";
import ReportsPurchasePage from "@/pages/reports/purchase";
import ReportsArAgingPage from "@/pages/reports/ar-aging";
import ReportsApAgingPage from "@/pages/reports/ap-aging";
import ReportsMainPage from "@/pages/reports/main";
import AuditLogPage from "@/pages/reports/audit-log";
import InventoryValuationPage from "@/pages/reports/inventory-valuation";
// Accounting
import AccountingAccountsPage from "@/pages/accounting/accounts";
import AccountingJournalsPage from "@/pages/accounting/journals";
import AccountingTaxesPage from "@/pages/accounting/taxes";
import AccountingEntriesPage from "@/pages/accounting/entries";
import AccountingEntryDetailPage from "@/pages/accounting/entry-detail";
import AccountingJournalItemsPage from "@/pages/accounting/journal-items";
import AccountingPaymentsPage from "@/pages/accounting/payments";
import AccountingSettingsPage from "@/pages/accounting/settings";
import AccountingTrialBalancePage from "@/pages/accounting/reports/trial-balance";
import AccountingGeneralLedgerPage from "@/pages/accounting/reports/general-ledger";
import AccountingProfitLossPage from "@/pages/accounting/reports/profit-loss";
import AccountingBalanceSheetPage from "@/pages/accounting/reports/balance-sheet";
import AccountingReconciliationPage from "@/pages/accounting/reconciliation";
import HoldingPage from "@/pages/HoldingPage";
import HoldingDashboardPage from "@/pages/accounting/holding-dashboard";
import HoldingPLReportPage from "@/pages/accounting/holding-pl-report";
import HoldingCashflowReportPage from "@/pages/accounting/holding-cashflow-report";
// Expenses
import ExpenseListPage from "@/pages/expense/index";
import ExpenseEditorPage from "@/pages/expense/editor";
import ExpenseCategoriesPage from "@/pages/expense/categories";
import ExpenseReportsPage from "@/pages/expense/reports";
// Correspondence
import CorrespondencesPage from "@/pages/correspondences";
import EmailInboxPage from "@/pages/email-inbox";
// Settings & Users
import SettingsPage from "@/pages/settings";
import AiChatbotSettingsPage from "@/pages/ai-chatbot-settings";
import AiChatbotKnowledgePage from "@/pages/ai-chatbot-knowledge";
import AiScanSettingsPage from "@/pages/ai-scan-settings";
import UomPage from "@/pages/settings/uom";
import NavCompanyConfigPage from "@/pages/settings/nav-company-config";
import SettingsRolesPage from "@/pages/settings-roles";
import SettingsApprovalRulesPage from "@/pages/settings-approval-rules";
import UsersPage from "@/pages/users";
import MediaManagerPage from "@/pages/media-manager";
import OrgManagementPage from "@/pages/OrgManagementPage";
// POS
import PosPage from "@/pages/pos";
import PosKasirAdminPage from "@/pages/pos-kasir-admin";
import PosInventoryDashboardPage from "@/pages/pos-inventory-dashboard";
import PosBranchesPage from "@/pages/pos-branches";
import PosWarehousesPage from "@/pages/pos-warehouses";
import PosRacksPage from "@/pages/pos-racks";
import PosInventoryItemsPage from "@/pages/pos-inventory-items";
import PosInventoryStocksPage from "@/pages/pos-inventory-stocks";
import PosRecipesPage from "@/pages/pos-recipes";
import PosStockTransfersPage from "@/pages/pos-stock-transfers";
import PosStockReturnsPage from "@/pages/pos-stock-returns";
import PosStockLossesPage from "@/pages/pos-stock-losses";
import PosStockOpnamePage from "@/pages/pos-stock-opname";
import PosStockMutationsPage from "@/pages/pos-stock-mutations";
import PosQrGeneratorPage from "@/pages/pos-qr-generator";
import PosQrScannerPage from "@/pages/pos-qr-scanner";
// Products
import ProductItemsPage from "@/pages/products/items";
import ProductRecipesPage from "@/pages/products/recipes";
// Thai Tea
import ThaiTeaDashboardPage from "@/pages/thai-tea/dashboard";
import ThaiTeaStockPage from "@/pages/thai-tea/stock";
import ThaiTeaBranchesPage from "@/pages/thai-tea/branches";
import ThaiTeaProductionPage from "@/pages/thai-tea/production";
import ThaiTeaRecipesPage from "@/pages/thai-tea/recipes";
import ThaiTeaReportsPage from "@/pages/thai-tea/reports";
// Sport Center
import SportCenterDashboard from "@/pages/sport-center/index";
import SportCenterBookingsPage from "@/pages/sport-center/bookings";
import SportCenterServicesPage from "@/pages/sport-center/services";
import SportCenterPurchaseRequestsPage from "@/pages/sport-center/purchase-requests";
import SportCenterSchedulePage from "@/pages/sport-center-schedule";
import SportCenterReportPage from "@/pages/sport-center-report";

const PR = (C: React.ComponentType) => () => <ProtectedRoute component={C} />;

export function AppRoutes({ rootGuard }: { rootGuard?: React.ComponentType }) {
  return (
    <Switch>
      {rootGuard && <Route path="/" component={rootGuard} />}

      {/* ── Welcome / Dashboard ────────────────────────────────────────── */}
      <Route path="/welcome" component={WelcomePage} />
      <Route path="/dashboard" component={PR(DashboardPage)} />
      <Route path="/approvals" component={PR(ApprovalsPage)} />
      <Route path="/ecommerce" component={PR(EcommercePage)} />
      <Route path="/trading" component={PR(TradingPage)} />

      {/* ── Logistics ──────────────────────────────────────────────────── */}
      <Route path="/katalog-terpadu" component={PR(KatalogTerpaduPage)} />
      <Route path="/pos" component={PR(PosPage)} />
      <Route path="/pos-kasir" component={PR(PosKasirAdminPage)} />
      <Route path="/pos-inventory/branches" component={PR(PosBranchesPage)} />
      <Route path="/pos-inventory/warehouses" component={PR(PosWarehousesPage)} />
      <Route path="/pos-inventory/racks" component={PR(PosRacksPage)} />
      <Route path="/pos-inventory/items" component={PR(PosInventoryItemsPage)} />
      <Route path="/pos-inventory/stocks" component={PR(PosInventoryStocksPage)} />
      <Route path="/pos-inventory/recipes" component={PR(PosRecipesPage)} />
      <Route path="/products/items" component={PR(ProductItemsPage)} />
      <Route path="/products/recipes" component={PR(ProductRecipesPage)} />
      <Route path="/pos-inventory/transfers" component={PR(PosStockTransfersPage)} />
      <Route path="/pos-inventory/returns" component={PR(PosStockReturnsPage)} />
      <Route path="/pos-inventory/losses" component={PR(PosStockLossesPage)} />
      <Route path="/pos-inventory/opname" component={PR(PosStockOpnamePage)} />
      <Route path="/pos-inventory/mutations" component={PR(PosStockMutationsPage)} />
      <Route path="/pos-inventory/dashboard" component={PR(PosInventoryDashboardPage)} />
      <Route path="/pos-inventory/qr-generator" component={PR(PosQrGeneratorPage)} />
      <Route path="/pos-inventory/qr-scanner" component={PR(PosQrScannerPage)} />
      <Route path="/logistics" component={PR(LogisticsPage)} />
      <Route path="/logistics/freight/new" component={PR(LogisticsFreightEditorPage)} />
      <Route path="/logistics/freight/:id/bl" component={PR(LogisticsFreightBLPage)} />
      <Route path="/logistics/freight/:id/edit" component={PR(LogisticsFreightEditorPage)} />
      <Route path="/logistics/freight/:id" component={PR(LogisticsFreightDetailPage)} />
      <Route path="/logistics/freight" component={PR(LogisticsFreightPage)} />
      <Route path="/logistics/portal-orders/:id" component={PR(LogisticsPortalOrderDetailPage)} />
      <Route path="/logistics/portal-orders" component={PR(LogisticsPortalOrdersPage)} />
      <Route path="/logistics/drivers/:id/performance" component={PR(LogisticsDriverPerformancePage)} />
      <Route path="/logistics/drivers" component={PR(LogisticsDriversPage)} />
      <Route path="/logistics/driver-performance" component={PR(LogisticsDriverPerformancePage)} />
      <Route path="/logistics/quote-requests" component={PR(LogisticsQuoteRequestsPage)} />
      <Route path="/logistics/vendor-quote/:token" component={LogisticsVendorQuotePage} />
      <Route path="/logistics/quotation-reply/:token" component={LogisticsQuotationReplyPage} />
      <Route path="/logistics/margin-rules" component={PR(LogisticsMarginRulesPage)} />
      <Route path="/portal-product-orders" component={PR(PortalProductOrdersPage)} />

      {/* ── Sales ──────────────────────────────────────────────────────── */}
      <Route path="/sales/documents/new" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/documents/:id/edit" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/documents/:id" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/documents" component={PR(SalesDocumentsListPage)} />
      <Route path="/sales/quotations/new" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/quotations/:id/edit" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/quotations/:id" component={PR(SalesDocumentEditorPage)} />
      <Route path="/sales/quotations" component={PR(SalesDocumentsListPage)} />
      <Route path="/sales/orders/new" component={() => <ProtectedRoute component={() => <SalesDocumentEditorPage kind="order" />} />} />
      <Route path="/sales/orders/:id" component={() => <ProtectedRoute component={() => <SalesDocumentEditorPage kind="order" />} />} />
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
      <Route path="/purchase/orders" component={() => <ProtectedRoute component={() => <PurchaseDocumentsListPage kind="order" />} />} />
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
      <Route path="/purchase/thai-tea" component={PR(ThaiTeaPurchasePage)} />
      <Route path="/purchase" component={PR(PurchaseDashboardPage)} />

      {/* ── Reports ────────────────────────────────────────────────────── */}
      <Route path="/reports/sales" component={PR(ReportsSalesPage)} />
      <Route path="/reports/purchase" component={PR(ReportsPurchasePage)} />
      <Route path="/reports/ar-aging" component={PR(ReportsArAgingPage)} />
      <Route path="/reports/ap-aging" component={PR(ReportsApAgingPage)} />
      <Route path="/reports/operasional" component={PR(ReportsMainPage)} />
      <Route path="/reports/audit-log" component={PR(AuditLogPage)} />
      <Route path="/reports/inventory-valuation" component={PR(InventoryValuationPage)} />

      {/* ── Accounting ─────────────────────────────────────────────────── */}
      <Route path="/accounting/accounts" component={PR(AccountingAccountsPage)} />
      <Route path="/accounting/journals" component={PR(AccountingJournalsPage)} />
      <Route path="/accounting/taxes" component={PR(AccountingTaxesPage)} />
      <Route path="/accounting/entries/:id" component={PR(AccountingEntryDetailPage)} />
      <Route path="/accounting/entries" component={PR(AccountingEntriesPage)} />
      <Route path="/accounting/journal-items" component={PR(AccountingJournalItemsPage)} />
      <Route path="/accounting/payments" component={PR(AccountingPaymentsPage)} />
      <Route path="/accounting/settings" component={PR(AccountingSettingsPage)} />
      <Route path="/accounting/reconciliation" component={PR(AccountingReconciliationPage)} />
      <Route path="/accounting/reports/trial-balance" component={PR(AccountingTrialBalancePage)} />
      <Route path="/accounting/reports/general-ledger" component={PR(AccountingGeneralLedgerPage)} />
      <Route path="/accounting/reports/profit-loss" component={PR(AccountingProfitLossPage)} />
      <Route path="/accounting/reports/balance-sheet" component={PR(AccountingBalanceSheetPage)} />
      <Route path="/holding/dashboard" component={PR(HoldingDashboardPage)} />
      <Route path="/holding/pl-report" component={PR(HoldingPLReportPage)} />
      <Route path="/holding/cashflow-report" component={PR(HoldingCashflowReportPage)} />
      <Route path="/holding" component={PR(HoldingPage)} />

      {/* ── Expenses ───────────────────────────────────────────────────── */}
      <Route path="/expense/new" component={PR(ExpenseEditorPage)} />
      <Route path="/expense/categories" component={PR(ExpenseCategoriesPage)} />
      <Route path="/expense/reports" component={PR(ExpenseReportsPage)} />
      <Route path="/expense/:id/edit" component={PR(ExpenseEditorPage)} />
      <Route path="/expense/:id" component={PR(ExpenseEditorPage)} />
      <Route path="/expense" component={PR(ExpenseListPage)} />

      {/* ── Correspondence ─────────────────────────────────────────────── */}
      <Route path="/correspondences" component={PR(CorrespondencesPage)} />
      <Route path="/email-inbox" component={PR(EmailInboxPage)} />

      {/* ── Settings ───────────────────────────────────────────────────── */}
      <Route path="/settings/nav-company-config" component={PR(NavCompanyConfigPage)} />
      <Route path="/settings/uom" component={PR(UomPage)} />
      <Route path="/settings/ai-chatbot/knowledge" component={PR(AiChatbotKnowledgePage)} />
      <Route path="/settings/ai-chatbot" component={PR(AiChatbotSettingsPage)} />
      <Route path="/settings/ai-scan" component={PR(AiScanSettingsPage)} />
      <Route path="/settings/roles" component={PR(SettingsRolesPage)} />
      <Route path="/settings/approval-rules" component={PR(SettingsApprovalRulesPage)} />
      <Route path="/settings" component={PR(SettingsPage)} />

      {/* ── Users & Org ────────────────────────────────────────────────── */}
      <Route path="/users" component={PR(UsersPage)} />
      <Route path="/media" component={PR(MediaManagerPage)} />
      <Route path="/org" component={PR(OrgManagementPage)} />

      {/* ── POS ────────────────────────────────────────────────────────── */}
      <Route path="/pos" component={PR(PosPage)} />
      <Route path="/pos-kasir" component={PR(PosKasirAdminPage)} />
      <Route path="/pos-inventory/dashboard" component={PR(PosInventoryDashboardPage)} />
      <Route path="/pos-inventory/branches" component={PR(PosBranchesPage)} />
      <Route path="/pos-inventory/warehouses" component={PR(PosWarehousesPage)} />
      <Route path="/pos-inventory/racks" component={PR(PosRacksPage)} />
      <Route path="/pos-inventory/items" component={PR(PosInventoryItemsPage)} />
      <Route path="/pos-inventory/stocks" component={PR(PosInventoryStocksPage)} />
      <Route path="/pos-inventory/recipes" component={PR(PosRecipesPage)} />
      <Route path="/pos-inventory/transfers" component={PR(PosStockTransfersPage)} />
      <Route path="/pos-inventory/returns" component={PR(PosStockReturnsPage)} />
      <Route path="/pos-inventory/losses" component={PR(PosStockLossesPage)} />
      <Route path="/pos-inventory/opname" component={PR(PosStockOpnamePage)} />
      <Route path="/pos-inventory/mutations" component={PR(PosStockMutationsPage)} />
      <Route path="/pos-inventory/qr-generator" component={PR(PosQrGeneratorPage)} />
      <Route path="/pos-inventory/qr-scanner" component={PR(PosQrScannerPage)} />

      {/* ── Products ───────────────────────────────────────────────────── */}
      <Route path="/products/items" component={PR(ProductItemsPage)} />
      <Route path="/products/recipes" component={PR(ProductRecipesPage)} />

      {/* ── Thai Tea ───────────────────────────────────────────────────── */}
      <Route path="/thai-tea/dashboard" component={PR(ThaiTeaDashboardPage)} />
      <Route path="/thai-tea/stock" component={PR(ThaiTeaStockPage)} />
      <Route path="/thai-tea/branches" component={PR(ThaiTeaBranchesPage)} />
      <Route path="/thai-tea/production" component={PR(ThaiTeaProductionPage)} />
      <Route path="/thai-tea/recipes" component={PR(ThaiTeaRecipesPage)} />
      <Route path="/thai-tea/reports" component={PR(ThaiTeaReportsPage)} />
      <Route path="/thai-tea" component={PR(ThaiTeaDashboardPage)} />

      {/* ── Sport Center ───────────────────────────────────────────────── */}
      <Route path="/sport-center/bookings" component={PR(SportCenterBookingsPage)} />
      <Route path="/sport-center/schedule" component={PR(SportCenterSchedulePage)} />
      <Route path="/sport-center/services" component={PR(SportCenterServicesPage)} />
      <Route path="/sport-center/purchase-requests" component={PR(SportCenterPurchaseRequestsPage)} />
      <Route path="/sport-center/reports" component={PR(SportCenterReportPage)} />
      <Route path="/sport-center" component={PR(SportCenterDashboard)} />

      {/* ── Legacy redirects ───────────────────────────────────────────── */}
      <Route path="/expenses/new" component={() => <Redirect to="/expense/new" />} />
      <Route path="/expenses/categories" component={() => <Redirect to="/expense/categories" />} />
      <Route path="/expenses/reports" component={() => <Redirect to="/expense/reports" />} />
      <Route path="/expenses/:id" component={({ params }: { params: { id: string } }) => <Redirect to={`/expense/${params.id}/edit`} />} />
      <Route path="/expenses" component={() => <Redirect to="/expense" />} />
      <Route path="/warehouse/stock" component={() => <Redirect to="/pos-inventory/stocks" />} />
      <Route path="/warehouse/movements" component={() => <Redirect to="/pos-inventory/mutations" />} />
      <Route path="/warehouse/transfers" component={() => <Redirect to="/pos-inventory/transfers" />} />
      <Route path="/warehouse/damage" component={() => <Redirect to="/pos-inventory/losses" />} />
      <Route path="/warehouse/returns" component={() => <Redirect to="/pos-inventory/returns" />} />
      <Route path="/warehouse/recipes" component={() => <Redirect to="/pos-inventory/recipes" />} />
      <Route path="/warehouse/opname" component={() => <Redirect to="/pos-inventory/opname" />} />
      <Route path="/inventory/warehouses" component={() => <Redirect to="/pos-inventory/warehouses" />} />
      <Route path="/inventory/racks" component={() => <Redirect to="/pos-inventory/racks" />} />
      <Route path="/inventory/stock" component={() => <Redirect to="/pos-inventory/stocks" />} />
      <Route path="/inventory/transfers" component={() => <Redirect to="/pos-inventory/transfers" />} />
      <Route path="/inventory/returns" component={() => <Redirect to="/pos-inventory/returns" />} />
      <Route path="/inventory/damage" component={() => <Redirect to="/pos-inventory/losses" />} />
      <Route path="/inventory/opname" component={() => <Redirect to="/pos-inventory/opname" />} />
      <Route path="/inventory/movements" component={() => <Redirect to="/pos-inventory/mutations" />} />
      <Route path="/logistics/vendors" component={() => <Redirect to="/purchase/vendors" />} />

      <Route component={NotFound} />
    </Switch>
  );
}
