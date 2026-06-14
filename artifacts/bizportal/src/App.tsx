import React from "react";
import { Router as WouterRouter, Switch, Route, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SupabaseAuthProvider, useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { AppRoutes } from "@/routes";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OrderNotificationsProvider } from "@/contexts/OrderNotificationsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import ApprovalsPage from "@/pages/approvals/index";
import DashboardPage from "@/pages/dashboard";
import EcommercePage from "@/pages/ecommerce";
import TradingPage from "@/pages/trading";
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

import SettingsPage from "@/pages/settings";
import NavCompanyConfigPage from "@/pages/settings/nav-company-config";
import AiChatbotSettingsPage from "@/pages/ai-chatbot-settings";
import AiChatbotKnowledgePage from "@/pages/ai-chatbot-knowledge";
import AiScanSettingsPage from "@/pages/ai-scan-settings";
import UsersPage from "@/pages/users";
import MediaManagerPage from "@/pages/media-manager";
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
import POOrdersPage from "@/pages/purchase/po-orders";
import PurchaseDocumentEditorPage from "@/pages/purchase/rfq-editor";
import VendorsPage from "@/pages/purchase/vendors";
import VendorDetailPage from "@/pages/purchase/vendor-detail";
import PurchaseBillsPage from "@/pages/purchase/bills";
import ReportsSalesPage from "@/pages/reports/sales";
import ReportsPurchasePage from "@/pages/reports/purchase";
import ReportsArAgingPage from "@/pages/reports/ar-aging";
import ReportsApAgingPage from "@/pages/reports/ap-aging";
import ReportsMainPage from "@/pages/reports/main";
import AuditLogPage from "@/pages/reports/audit-log";
import AccountingAccountsPage from "@/pages/accounting/accounts";
import AccountingJournalsPage from "@/pages/accounting/journals";
import AccountingTaxesPage from "@/pages/accounting/taxes";
import AccountingEntriesPage from "@/pages/accounting/entries";
import AccountingEntryDetailPage from "@/pages/accounting/entry-detail";
import AccountingJournalItemsPage from "@/pages/accounting/journal-items";
import AccountingPaymentsPage from "@/pages/accounting/payments";
import AccountingSettingsPage from "@/pages/accounting/settings";
import AccountingGSheetPage from "@/pages/accounting/gsheet";
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
import PortalOnboardingApprovalsPage from "@/pages/portal-onboarding-approvals";
import PortalCustomersPage from "@/pages/portal-customers";
import LogisticsQuotationReplyPage from "@/pages/logistics-quotation-reply";
import LogisticsVendorQuotePage from "@/pages/logistics-vendor-quote";
import LogisticsRfqComparisonPage from "@/pages/logistics-rfq-comparison"; // [NEW-RFQ-FLOW]
import LogisticsRfqListPage from "@/pages/logistics-rfq-list"; // [NEW-RFQ-FLOW]
import LogisticsRfqDetailPage from "@/pages/logistics-rfq-detail"; // [NEW-RFQ-FLOW]
import LogisticOrderDetailPage from "@/pages/logistics/order-detail";
import OrderAuditTrailPage from "@/pages/logistics/order-audit-trail";
import HoldingPage from "@/pages/HoldingPage";
import HoldingDashboardPage from "@/pages/accounting/holding-dashboard";
import HoldingPLReportPage from "@/pages/accounting/holding-pl-report";
import HoldingCashflowReportPage from "@/pages/accounting/holding-cashflow-report";
import OrgManagementPage from "@/pages/OrgManagementPage";

import PurchaseReceivePage from "@/pages/purchase/receive";
import ThaiTeaPurchasePage from "@/pages/purchase/thai-tea";
import ThaiTeaDashboardPage from "@/pages/thai-tea/dashboard";
import ThaiTeaRecipesPage from "@/pages/thai-tea/recipes";
import ThaiTeaStockPage from "@/pages/thai-tea/stock";
import ThaiTeaBranchesPage from "@/pages/thai-tea/branches";
import ThaiTeaProductionPage from "@/pages/thai-tea/production";
import ThaiTeaReportsPage from "@/pages/thai-tea/reports";

import ProductItemsPage from "@/pages/products/items";
import ProductRecipesPage from "@/pages/products/recipes";

import SettingsRolesPage from "@/pages/settings-roles";
import SettingsApprovalRulesPage from "@/pages/settings-approval-rules";
import ProductTemplatesPage from "@/pages/product-templates";
import PurchaseRequestListPage from "@/pages/purchase/pr-list";
import PurchaseRequestEditorPage from "@/pages/purchase/pr-editor";
import GoodsReceiptListPage from "@/pages/purchase/gr-list";
import GoodsReceiptEditorPage from "@/pages/purchase/gr-editor";
import QcListPage from "@/pages/purchase/qc-list";
import QcEditorPage from "@/pages/purchase/qc-editor";
import { VendorInvoicesListPage, VendorInvoiceEditorPage } from "@/pages/purchase/vendor-invoices";
import { PaymentRequestsListPage, PaymentRequestEditorPage } from "@/pages/purchase/payment-requests";
import { PurchaseReturnsListPage, PurchaseReturnEditorPage } from "@/pages/purchase/purchase-returns";
import { LandedCostsListPage, LandedCostEditorPage } from "@/pages/purchase/landed-costs";
import VendorComparisonPage from "@/pages/purchase/vendor-comparison";
import InventoryValuationPage from "@/pages/reports/inventory-valuation";
import NotificationsPage from "@/pages/notifications";
import VendorFormsPage from "@/pages/purchase/vendor-forms";
import AnalyticsDashboardPage from "@/pages/analytics-dashboard";
import VendorPerformancePage from "@/pages/logistics/vendor-performance";
import InternalTasksPage from "@/pages/logistics/internal-tasks";
import ProductFirstAnalyticsPage from "@/pages/logistics/product-first-analytics";
import ProductFirstAuditPage from "@/pages/logistics/product-first-audit";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const ROLE_CACHE_KEY = "biz_user_role_v1";
function readRoleCache() {
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

function roleToPath(role?: string | null) {
  switch (role) {
    case "admin":
      return "/dashboard";
    case "ecommerce":
      return "/ecommerce";
    case "trading":
      return "/trading";
    case "logistics":
      return "/logistics";
    default:
      return "/welcome";
  }
}
function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
    </div>
  );
}

const IS_DEV = import.meta.env.DEV;

type DevUser = { id: string; email: string; firstName: string | null; lastName: string | null; role: string | null };

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  ecommerce: "Ecommerce",
  trading: "Trading",
  logistics: "Logistics",
};

function DevLoginSection() {
  const [users, setUsers] = React.useState<DevUser[]>([]);
  const [devEmail, setDevEmail] = React.useState("");
  const [mode, setMode] = React.useState<"pick" | "manual">("pick");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/dev-users", { credentials: "include" })
      .then((r) => r.ok ? r.json() : { users: [] })
      .then((d: { users: DevUser[] }) => {
        setUsers(d.users ?? []);
        if (d.users?.length > 0) {
          setDevEmail(d.users[0].email ?? "");
        }
      })
      .catch(() => setMode("manual"));
  }, []);

  const grouped = React.useMemo(() => {
    const map: Record<string, DevUser[]> = {};
    for (const u of users) {
      const r = u.role ?? "other";
      if (!map[r]) map[r] = [];
      map[r].push(u);
    }
    return map;
  }, [users]);

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!devEmail || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `email=${encodeURIComponent(devEmail)}`,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? `Login gagal (${res.status})`);
        return;
      }
      window.location.href = "/bizportal/";
    } catch (err) {
      setError("Gagal terhubung ke server. Pastikan API Server berjalan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-700" />
        <span className="text-xs text-amber-400 font-mono">DEV ONLY</span>
        <div className="flex-1 h-px bg-slate-700" />
      </div>
      <form onSubmit={handleDevLogin} className="flex flex-col gap-2">
        {mode === "pick" && users.length > 0 ? (
          <>
            <select
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              className="rounded-lg bg-slate-800 border border-amber-600/40 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
            >
              {Object.entries(grouped).map(([role, roleUsers]) => (
                <optgroup key={role} label={`— ${ROLE_LABELS[role] ?? role} —`}>
                  {roleUsers.map((u) => {
                    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
                    return (
                      <option key={u.id} value={u.email ?? ""}>
                        {name} ({u.email})
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className="text-xs text-slate-500 hover:text-slate-400 text-right -mt-1"
            >
              + email lain
            </button>
          </>
        ) : (
          <>
            <input
              type="email"
              placeholder="Email (dev bypass)"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              required
              className="rounded-lg bg-slate-800 border border-amber-600/40 px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {users.length > 0 && (
              <button
                type="button"
                onClick={() => { setMode("pick"); setDevEmail(users[0].email ?? ""); }}
                className="text-xs text-slate-500 hover:text-slate-400 text-right -mt-1"
              >
                ← pilih dari daftar
              </button>
            )}
          </>
        )}
        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white shadow hover:bg-amber-500 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Logging in…" : "Dev Login (tanpa Google)"}
        </button>
      </form>
    </>
  );
}

function WaLoginSection() {
  const { loginWithWA } = useSupabaseAuth();
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [countdown, setCountdown] = React.useState(0);

  React.useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function sendOtp() {
    if (!phone || loading) return;
    setLoading(true);
    setError(null);
    setDevCode(null);
    try {
      const res = await fetch("/api/auth/wa-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; _dev_code?: string };
      if (!res.ok) { setError(data.message ?? "Gagal mengirim OTP"); return; }
      setOtpSent(true);
      setCountdown(60);
      if (data._dev_code) setDevCode(data._dev_code);
    } catch {
      setError("Gagal terhubung ke server");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!code || loading) return;
    setLoading(true);
    setError(null);
    const result = await loginWithWA(phone, code);
    if (result.error) { setError(result.error); setLoading(false); return; }
    window.location.href = "/bizportal/";
  }

  return (
    <div className="flex flex-col gap-3">
      {!otpSent ? (
        <div className="flex gap-2">
          <input
            type="tel"
            placeholder="No. WhatsApp (cth: 08123456789)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={sendOtp}
            disabled={loading || !phone}
            className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? "..." : "Kirim OTP"}
          </button>
        </div>
      ) : (
        <form onSubmit={verifyOtp} className="flex flex-col gap-2">
          <p className="text-xs text-slate-400 text-center">
            Kode OTP dikirim ke WhatsApp <span className="text-white font-mono">{phone}</span>
          </p>
          {devCode && (
            <p className="text-xs text-amber-400 text-center font-mono bg-amber-900/20 rounded p-1">
              DEV: kode = {devCode}
            </p>
          )}
          <input
            type="text"
            inputMode="numeric"
            placeholder="Masukkan 6 digit kode OTP"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            autoFocus
            className="rounded-lg bg-slate-800 border border-green-600/40 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-center tracking-widest font-mono text-lg"
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white shadow hover:bg-green-500 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? "Memverifikasi..." : "Masuk"}
          </button>
          <div className="flex justify-between text-xs text-slate-500">
            <button type="button" onClick={() => { setOtpSent(false); setCode(""); setError(null); }} className="hover:text-slate-300">
              ← Ganti nomor
            </button>
            {countdown > 0 ? (
              <span>Kirim ulang ({countdown}s)</span>
            ) : (
              <button type="button" onClick={sendOtp} disabled={loading} className="hover:text-slate-300">
                Kirim ulang OTP
              </button>
            )}
          </div>
        </form>
      )}
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  );
}

function LoginScreen() {
  const { signInWithGoogle } = useSupabaseAuth();
  const [loginMode, setLoginMode] = React.useState<"google" | "wa">("wa");

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

      {/* Tab switcher */}
      <div className="flex rounded-lg bg-slate-800 p-1 gap-1 w-72">
        <button
          onClick={() => setLoginMode("wa")}
          className={`flex-1 rounded-md py-2 text-xs font-medium transition-all ${loginMode === "wa" ? "bg-green-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
        >
          📱 WhatsApp OTP
        </button>
        <button
          onClick={() => setLoginMode("google")}
          className={`flex-1 rounded-md py-2 text-xs font-medium transition-all ${loginMode === "google" ? "bg-white text-slate-800 shadow" : "text-slate-400 hover:text-white"}`}
        >
          Google
        </button>
      </div>

      <div className="flex flex-col gap-3 w-72">
        {loginMode === "wa" ? (
          <WaLoginSection />
        ) : (
          <button
            onClick={signInWithGoogle}
            className="flex items-center justify-center gap-3 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-slate-800 shadow hover:bg-slate-100 active:scale-95 transition-all"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Masuk dengan Google
          </button>
        )}
        {IS_DEV && <DevLoginSection />}
      </div>
    </div>
  );
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
  React.useEffect(() => {
    if (dbUser?.role) writeRoleCache(dbUser.role);
  }, [dbUser?.role]);
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) {
    writeRoleCache(null);
    return <LoginScreen />;
  }
  if (dbLoading) return <LoadingSpinner />;
  return <Redirect to={roleToPath(dbUser?.role ?? cachedRole)} />;
}

function Router() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes rootGuard={AuthRouteGuard} />
    </WouterRouter>
  );
}

export default function App() {
  return (
    <ErrorBoundary label="App">
      <QueryClientProvider client={queryClient}>
        <SupabaseAuthProvider>
          <LanguageProvider>
            <CompanyProvider>
            <OrderNotificationsProvider>
              <TooltipProvider>
                <Router />
                <Toaster />
              </TooltipProvider>
            </OrderNotificationsProvider>
            </CompanyProvider>
          </LanguageProvider>
        </SupabaseAuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
