import React from "react";
import { Switch, Route, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { LanguageProvider } from "@/contexts/LanguageContext";

import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import EcommercePage from "@/pages/ecommerce";
import TradingPage from "@/pages/trading";
import LogisticsPage from "@/pages/logistics";
import LogisticsFreightPage from "@/pages/logistics-freight";
import LogisticsFreightEditorPage from "@/pages/logistics-freight-editor";
import LogisticsFreightDetailPage from "@/pages/logistics-freight-detail";
import LogisticsFreightBLPage from "@/pages/logistics-freight-bl";
import LogisticsPortalOrdersPage from "@/pages/logistics-portal-orders";
import LogisticsPortalOrderDetailPage from "@/pages/logistics-portal-order-detail";
import LogisticsDriversPage from "@/pages/logistics-drivers";
import LogisticsVendorsPage from "@/pages/logistics-vendors";
import PosPage from "@/pages/pos";
import SettingsPage from "@/pages/settings";
import AiChatbotSettingsPage from "@/pages/ai-chatbot-settings";
import AiScanSettingsPage from "@/pages/ai-scan-settings";
import UsersPage from "@/pages/users";
import WelcomePage from "@/pages/welcome";
import SalesDashboardPage from "@/pages/sales/dashboard";
import SalesDocumentsListPage from "@/pages/sales/documents-list";
import SalesDocumentEditorPage from "@/pages/sales/quotation-editor";
import AiDraftsPage from "@/pages/sales/ai-drafts";
import CustomersPage from "@/pages/sales/customers";
import SalesInvoicesPage from "@/pages/sales/invoices";
import SalesItemsPage from "@/pages/sales/items";
import PurchaseDashboardPage from "@/pages/purchase/dashboard";
import PurchaseDocumentsListPage from "@/pages/purchase/documents-list";
import PurchaseDocumentEditorPage from "@/pages/purchase/rfq-editor";
import VendorsPage from "@/pages/purchase/vendors";
import VendorDetailPage from "@/pages/purchase/vendor-detail";
import PurchaseBillsPage from "@/pages/purchase/bills";
import ReportsSalesPage from "@/pages/reports/sales";
import ReportsPurchasePage from "@/pages/reports/purchase";
import ReportsArAgingPage from "@/pages/reports/ar-aging";
import ReportsApAgingPage from "@/pages/reports/ap-aging";
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
import CorrespondencesPage from "@/pages/correspondences";
import EmailInboxPage from "@/pages/email-inbox";
import ExpenseListPage from "@/pages/expense/index";
import ExpenseEditorPage from "@/pages/expense/editor";
import ExpenseCategoriesPage from "@/pages/expense/categories";
import ExpenseReportsPage from "@/pages/expense/reports";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
    </div>
  );
}

function AuthRouteGuard() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const { data: dbUser, isLoading: dbLoading } = useGetCurrentUser({
    query: {
      enabled: isAuthenticated,
      queryKey: getGetCurrentUserQueryKey(),
      staleTime: Infinity,
      retry: 1,
    }
  });

  if (isLoading || (isAuthenticated && dbLoading)) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    login();
    return <LoadingSpinner />;
  }

  if (dbUser) {
    switch (dbUser.role) {
      case "admin": return <Redirect to="/dashboard" />;
      case "ecommerce": return <Redirect to="/ecommerce" />;
      case "trading": return <Redirect to="/trading" />;
      case "logistics": return <Redirect to="/logistics" />;
      case "pos": return <Redirect to="/pos" />;
      default: return <Redirect to="/welcome" />;
    }
  }

  return <Redirect to="/welcome" />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) return <LoadingSpinner />;

  if (!isAuthenticated) {
    login();
    return <LoadingSpinner />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthRouteGuard} />
      <Route path="/welcome" component={WelcomePage} />

      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>
      <Route path="/ecommerce">
        <ProtectedRoute component={EcommercePage} />
      </Route>
      <Route path="/trading">
        <ProtectedRoute component={TradingPage} />
      </Route>
      <Route path="/logistics">
        <ProtectedRoute component={LogisticsPage} />
      </Route>
      <Route path="/logistics/freight">
        <ProtectedRoute component={LogisticsFreightPage} />
      </Route>
      <Route path="/logistics/freight/new">
        <ProtectedRoute component={LogisticsFreightEditorPage} />
      </Route>
      <Route path="/logistics/freight/edit/:id">
        <ProtectedRoute component={LogisticsFreightEditorPage} />
      </Route>
      <Route path="/logistics/freight/:id/bl">
        <ProtectedRoute component={LogisticsFreightBLPage} />
      </Route>
      <Route path="/logistics/freight/:id">
        <ProtectedRoute component={LogisticsFreightDetailPage} />
      </Route>
      <Route path="/logistics/portal-orders">
        <ProtectedRoute component={LogisticsPortalOrdersPage} />
      </Route>
      <Route path="/logistics/portal-orders/:id">
        <ProtectedRoute component={LogisticsPortalOrderDetailPage} />
      </Route>
      <Route path="/logistics/drivers">
        <ProtectedRoute component={LogisticsDriversPage} />
      </Route>
      <Route path="/logistics/vendors">
        <ProtectedRoute component={LogisticsVendorsPage} />
      </Route>
      <Route path="/pos">
        <ProtectedRoute component={PosPage} />
      </Route>
      <Route path="/settings/ai-chatbot">
        <ProtectedRoute component={AiChatbotSettingsPage} />
      </Route>
      <Route path="/settings/ai-scan">
        <ProtectedRoute component={AiScanSettingsPage} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={UsersPage} />
      </Route>
      <Route path="/correspondences">
        <ProtectedRoute component={CorrespondencesPage} />
      </Route>
      <Route path="/email-inbox">
        <ProtectedRoute component={EmailInboxPage} />
      </Route>

      <Route path="/sales/items">
        <ProtectedRoute component={SalesItemsPage} />
      </Route>
      <Route path="/sales">
        <ProtectedRoute component={SalesDashboardPage} />
      </Route>
      <Route path="/sales/quotations">
        <ProtectedRoute component={() => <SalesDocumentsListPage kind="quote" />} />
      </Route>
      <Route path="/sales/quotations/new">
        <ProtectedRoute component={SalesDocumentEditorPage} />
      </Route>
      <Route path="/sales/quotations/:id">
        <ProtectedRoute component={SalesDocumentEditorPage} />
      </Route>
      <Route path="/sales/orders">
        <ProtectedRoute component={() => <SalesDocumentsListPage kind="order" />} />
      </Route>
      <Route path="/sales/orders/:id">
        <ProtectedRoute component={SalesDocumentEditorPage} />
      </Route>
      <Route path="/sales/customers">
        <ProtectedRoute component={CustomersPage} />
      </Route>
      <Route path="/sales/ai-drafts">
        <ProtectedRoute component={AiDraftsPage} />
      </Route>
      <Route path="/sales/invoices">
        <ProtectedRoute component={SalesInvoicesPage} />
      </Route>

      <Route path="/purchase">
        <ProtectedRoute component={PurchaseDashboardPage} />
      </Route>
      <Route path="/purchase/rfq">
        <ProtectedRoute component={() => <PurchaseDocumentsListPage kind="rfq" />} />
      </Route>
      <Route path="/purchase/rfq/new">
        <ProtectedRoute component={PurchaseDocumentEditorPage} />
      </Route>
      <Route path="/purchase/rfq/:id">
        <ProtectedRoute component={PurchaseDocumentEditorPage} />
      </Route>
      <Route path="/purchase/orders">
        <ProtectedRoute component={() => <PurchaseDocumentsListPage kind="order" />} />
      </Route>
      <Route path="/purchase/orders/:id">
        <ProtectedRoute component={PurchaseDocumentEditorPage} />
      </Route>
      <Route path="/purchase/vendors">
        <ProtectedRoute component={VendorsPage} />
      </Route>
      <Route path="/purchase/vendors/:id">
        <ProtectedRoute component={VendorDetailPage} />
      </Route>
      <Route path="/purchase/bills">
        <ProtectedRoute component={PurchaseBillsPage} />
      </Route>

      <Route path="/reports/sales">
        <ProtectedRoute component={ReportsSalesPage} />
      </Route>
      <Route path="/reports/purchase">
        <ProtectedRoute component={ReportsPurchasePage} />
      </Route>
      <Route path="/reports/ar-aging">
        <ProtectedRoute component={ReportsArAgingPage} />
      </Route>
      <Route path="/reports/ap-aging">
        <ProtectedRoute component={ReportsApAgingPage} />
      </Route>

      <Route path="/accounting/accounts">
        <ProtectedRoute component={AccountingAccountsPage} />
      </Route>
      <Route path="/accounting/journals">
        <ProtectedRoute component={AccountingJournalsPage} />
      </Route>
      <Route path="/accounting/taxes">
        <ProtectedRoute component={AccountingTaxesPage} />
      </Route>
      <Route path="/accounting/entries">
        <ProtectedRoute component={AccountingEntriesPage} />
      </Route>
      <Route path="/accounting/entries/:id">
        <ProtectedRoute component={AccountingEntryDetailPage} />
      </Route>
      <Route path="/accounting/journal-items">
        <ProtectedRoute component={AccountingJournalItemsPage} />
      </Route>
      <Route path="/accounting/payments">
        <ProtectedRoute component={AccountingPaymentsPage} />
      </Route>
      <Route path="/accounting/settings">
        <ProtectedRoute component={AccountingSettingsPage} />
      </Route>
      <Route path="/accounting/reports/trial-balance">
        <ProtectedRoute component={AccountingTrialBalancePage} />
      </Route>
      <Route path="/accounting/reports/general-ledger">
        <ProtectedRoute component={AccountingGeneralLedgerPage} />
      </Route>
      <Route path="/accounting/reports/profit-loss">
        <ProtectedRoute component={AccountingProfitLossPage} />
      </Route>
      <Route path="/accounting/reports/balance-sheet">
        <ProtectedRoute component={AccountingBalanceSheetPage} />
      </Route>
      <Route path="/accounting/reconciliation">
        <ProtectedRoute component={AccountingReconciliationPage} />
      </Route>

      <Route path="/expense/categories">
        <ProtectedRoute component={ExpenseCategoriesPage} />
      </Route>
      <Route path="/expense/reports">
        <ProtectedRoute component={ExpenseReportsPage} />
      </Route>
      <Route path="/expense/new">
        <ProtectedRoute component={ExpenseEditorPage} />
      </Route>
      <Route path="/expense/:id">
        <ProtectedRoute component={ExpenseEditorPage} />
      </Route>
      <Route path="/expense">
        <ProtectedRoute component={ExpenseListPage} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
