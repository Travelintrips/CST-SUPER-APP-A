import React from "react";
import { Router as WouterRouter, Switch, Route, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import {
  SupabaseAuthProvider,
  useSupabaseAuth,
} from "@/contexts/SupabaseAuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

const ROLE_CACHE_KEY = "biz_user_role_v1";
function readRoleCache(): string | null {
  try {
    return sessionStorage.getItem(ROLE_CACHE_KEY);
  } catch {
    return null;
  }
}
function writeRoleCache(role: string | null) {
  try {
    if (role) sessionStorage.setItem(ROLE_CACHE_KEY, role);
    else sessionStorage.removeItem(ROLE_CACHE_KEY);
  } catch {}
}

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
import LogisticsDriverPerformancePage from "@/pages/logistics-driver-performance";
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
import PortalProductOrdersPage from "@/pages/portal-product-orders";
import LogisticsQuotationReplyPage from "@/pages/logistics-quotation-reply";
import LogisticsVendorQuotePage from "@/pages/logistics-vendor-quote";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
    </div>
  );
}

const IS_DEV = import.meta.env.DEV;

function LoginScreen() {
  const { signInWithGoogle } = useSupabaseAuth();
  const [devEmail, setDevEmail] = React.useState("elmiraratuabadi@gmail.com");
  const [devError, setDevError] = React.useState("");
  const [devLoading, setDevLoading] = React.useState(false);

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    setDevError("");
    setDevLoading(true);
    try {
      const res = await fetch("/api/dev-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: devEmail }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setDevError(data.error || "Login gagal");
      } else {
        window.location.reload();
      }
    } catch {
      setDevError("Tidak bisa terhubung ke server");
    } finally {
      setDevLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold shadow-lg">
          B
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">BizPortal</h1>
        <p className="text-sm text-slate-400">
          Sistem ERP Internal CST Logistics
        </p>
      </div>
      <div className="flex flex-col gap-3 w-72">
        <button
          onClick={signInWithGoogle}
          className="flex items-center justify-center gap-3 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-slate-800 shadow hover:bg-slate-100 active:scale-95 transition-all"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Masuk dengan Google
        </button>

        {IS_DEV && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-700" />
              <span className="text-xs text-amber-400 font-mono">DEV ONLY</span>
              <div className="flex-1 h-px bg-slate-700" />
            </div>
            <form onSubmit={handleDevLogin} className="flex flex-col gap-2">
              <input
                type="email"
                placeholder="Email (dev bypass)"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                required
                className="rounded-lg bg-slate-800 border border-amber-600/40 px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {devError && <p className="text-xs text-red-400">{devError}</p>}
              <button
                type="submit"
                disabled={devLoading}
                className="rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white shadow hover:bg-amber-500 active:scale-95 transition-all disabled:opacity-60"
              >
                {devLoading ? "Masuk..." : "Dev Login (tanpa Google)"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function roleToPath(role: string | null | undefined): string {
  switch (role) {
    case "admin":
      return "/dashboard";
    case "ecommerce":
      return "/ecommerce";
    case "trading":
      return "/trading";
    case "logistics":
      return "/logistics";
    case "pos":
      return "/pos";
    default:
      return "/welcome";
  }
}

function AuthRouteGuard() {
  const { isAuthenticated, isLoading } = useSupabaseAuth();
  const cachedRole = readRoleCache();

  const { data: dbUser, isLoading: dbLoading } = useGetCurrentUser({
    query: {
      enabled: isAuthenticated,
      queryKey: getGetCurrentUserQueryKey(),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  });

  // Persist fetched role for next visit
  React.useEffect(() => {
    if (dbUser?.role) writeRoleCache(dbUser.role);
  }, [dbUser?.role]);

  // Auth state loading
  if (isLoading) return <LoadingSpinner />;

  if (!isAuthenticated) {
    writeRoleCache(null);
    return <LoginScreen />;
  }

  if (dbLoading) return <LoadingSpinner />;

  const role = dbUser?.role ?? cachedRole;
  const defaultPath = roleToPath(role);

  return <Redirect to={defaultPath} />;
}

function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { isAuthenticated, isLoading } = useSupabaseAuth();

  if (isLoading) return <LoadingSpinner />;

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <Component />;
}

function Router() {
  return (
    <WouterRouter base={basePath}>
      <Switch>
        <Route path="/" component={AuthRouteGuard} />
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
        <Route path="/ecommerce" component={() => <ProtectedRoute component={EcommercePage} />} />
        <Route path="/trading" component={() => <ProtectedRoute component={TradingPage} />} />
