import React, { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, RedirectToSignIn, useAuth, useUser } from "@clerk/react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";

import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import EcommercePage from "@/pages/ecommerce";
import TradingPage from "@/pages/trading";
import LogisticsPage from "@/pages/logistics";
import PosPage from "@/pages/pos";
import SettingsPage from "@/pages/settings";
import UsersPage from "@/pages/users";
import WelcomePage from "@/pages/welcome";
import SalesDashboardPage from "@/pages/sales/dashboard";
import SalesDocumentsListPage from "@/pages/sales/documents-list";
import SalesDocumentEditorPage from "@/pages/sales/quotation-editor";
import CustomersPage from "@/pages/sales/customers";
import SalesInvoicesPage from "@/pages/sales/invoices";
import PurchaseDashboardPage from "@/pages/purchase/dashboard";
import PurchaseDocumentsListPage from "@/pages/purchase/documents-list";
import PurchaseDocumentEditorPage from "@/pages/purchase/rfq-editor";
import VendorsPage from "@/pages/purchase/vendors";
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
import AccountingSettingsPage from "@/pages/accounting/settings";
import AccountingTrialBalancePage from "@/pages/accounting/reports/trial-balance";
import AccountingGeneralLedgerPage from "@/pages/accounting/reports/general-ledger";
import AccountingProfitLossPage from "@/pages/accounting/reports/profit-loss";
import AccountingBalanceSheetPage from "@/pages/accounting/reports/balance-sheet";

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} appearance={{
          elements: {
            cardBox: "w-full max-w-full",
            card: "rounded-xl border border-slate-800 bg-slate-900 shadow-xl",
            headerTitle: "text-slate-50",
            headerSubtitle: "text-slate-400",
            socialButtonsBlockButton: "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700",
            socialButtonsBlockButtonText: "text-slate-200 font-medium",
            formButtonPrimary: "bg-indigo-600 hover:bg-indigo-700 text-white font-medium",
            formFieldLabel: "text-slate-300 font-medium",
            formFieldInput: "bg-slate-950 border-slate-800 text-slate-100 focus:border-indigo-500",
            footerActionLink: "text-indigo-400 hover:text-indigo-300",
            footerActionText: "text-slate-400",
            dividerText: "text-slate-500 bg-slate-900 px-2",
            dividerLine: "bg-slate-800",
          }
        }} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} appearance={{
          elements: {
             cardBox: "w-full max-w-full",
             card: "rounded-xl border border-slate-800 bg-slate-900 shadow-xl",
             headerTitle: "text-slate-50",
             headerSubtitle: "text-slate-400",
             socialButtonsBlockButton: "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700",
             socialButtonsBlockButtonText: "text-slate-200 font-medium",
             formButtonPrimary: "bg-indigo-600 hover:bg-indigo-700 text-white font-medium",
             formFieldLabel: "text-slate-300 font-medium",
             formFieldInput: "bg-slate-950 border-slate-800 text-slate-100 focus:border-indigo-500",
             footerActionLink: "text-indigo-400 hover:text-indigo-300",
             footerActionText: "text-slate-400",
             dividerText: "text-slate-500 bg-slate-900 px-2",
             dividerLine: "bg-slate-800",
          }
        }} />
      </div>
    </div>
  );
}

function AuthRouteGuard() {
  const { user, isLoaded } = useUser();
  const { data: dbUser, isLoading: dbLoading } = useGetCurrentUser({
    query: {
      enabled: isLoaded && !!user,
      queryKey: getGetCurrentUserQueryKey(),
      staleTime: Infinity,
    }
  });

  if (!isLoaded || (user && dbLoading)) {
    return <div className="flex h-screen items-center justify-center bg-slate-950"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /></div>;
  }

  if (!user) {
    return <Redirect to="/sign-in" />;
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
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) {
    return <div className="flex h-screen items-center justify-center bg-slate-950"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /></div>;
  }
  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthRouteGuard} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
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
      <Route path="/pos">
        <ProtectedRoute component={PosPage} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={UsersPage} />
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

      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const clerkWindow = window as typeof window & { Clerk?: { addListener?: (cb: (ev: { user?: { id?: string | null } | null }) => void) => () => void } };
  const { addListener } = clerkWindow.Clerk || {};
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!addListener) return;
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function App() {
  const [location, setLocation] = useLocation();

  return (
    <QueryClientProvider client={queryClient}>
      <ClerkProvider
        publishableKey={clerkPubKey}
        routerPush={(to) => setLocation(stripBase(to))}
        routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      >
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ClerkProvider>
    </QueryClientProvider>
  );
}

export default App;
