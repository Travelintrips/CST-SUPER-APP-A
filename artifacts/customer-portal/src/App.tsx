import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EditModeProvider } from "@/contexts/EditModeContext";
import { AdminToolbar } from "@/components/AdminToolbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { BackToTopButton } from "@/components/BackToTopButton";
import { CartDrawer } from "@/components/CartDrawer";
import { ScrollToTop } from "@/components/ScrollToTop";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { ChatWidget } from "@/components/ChatWidget";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { supabase } from "@/lib/supabase";
import { fetchAndStoreProfile } from "@/lib/auth";

// ── Lazy-loaded pages (each becomes its own JS chunk) ────────────────────────
const Home                      = lazy(() => import("@/pages/home"));
const Services                  = lazy(() => import("@/pages/services"));
const Products                  = lazy(() => import("@/pages/products"));
const Jasa                      = lazy(() => import("@/pages/jasa"));
const JasaDetail                = lazy(() => import("@/pages/jasa-detail"));
const Login                     = lazy(() => import("@/pages/login"));
const Register                  = lazy(() => import("@/pages/register"));
const Dashboard                 = lazy(() => import("@/pages/dashboard"));
const VendorDashboard           = lazy(() => import("@/pages/vendor-dashboard"));
const Orders                    = lazy(() => import("@/pages/orders"));
const Admin                     = lazy(() => import("@/pages/admin"));
const LogisticBook              = lazy(() => import("@/pages/logistic-book"));
const LogisticOrderSuccess      = lazy(() => import("@/pages/logistic-order-success"));
const LogisticTrack             = lazy(() => import("@/pages/logistic-track"));
const LogisticAdmin             = lazy(() => import("@/pages/logistic-admin"));
const LogisticAdminOrderDetail  = lazy(() => import("@/pages/logistic-admin-order-detail"));
const FreightForwarding         = lazy(() => import("@/pages/freight-forwarding"));
const Pabean                    = lazy(() => import("@/pages/pabean"));
const Calculator                = lazy(() => import("@/pages/calculator"));
const ResetPassword             = lazy(() => import("@/pages/reset-password"));
const ProductOrder              = lazy(() => import("@/pages/product-order"));
const VendorResponsePage        = lazy(() => import("@/pages/vendor-response"));
const VendorProductApprovalPage = lazy(() => import("@/pages/vendor-product-approval"));
const ApprovePage               = lazy(() => import("@/pages/approve"));
const ConfirmPage               = lazy(() => import("@/pages/confirm"));
const VendorQuoteFormPage       = lazy(() => import("@/pages/vendor-quote-form"));
const VendorConfirmPage         = lazy(() => import("@/pages/vendor-confirm"));
const VendorFormPage            = lazy(() => import("@/pages/vendor-form"));
const ChooseOptionPage          = lazy(() => import("@/pages/choose-option"));
const OnboardingPage            = lazy(() => import("@/pages/onboarding"));
const PendingApprovalPage       = lazy(() => import("@/pages/pending-approval"));
// Mini form: standalone + lightweight — preload its own tiny chunk immediately
const VendorMiniFormPage        = lazy(() => import("@/pages/vendor-mini-form"));
const CustomerMiniFormPage      = lazy(() => import("@/pages/customer-mini-form"));
const AdminMiniFormPage         = lazy(() => import("@/pages/admin-mini-form"));
const CustomerApprovalPage      = lazy(() => import("@/pages/customer-approval"));
const OpConfirmPage             = lazy(() => import("@/pages/op-confirm"));
const CustomerQuotePage         = lazy(() => import("@/pages/customer-quote"));
const OrderTaskPage             = lazy(() => import("@/pages/order-task"));
const CustomerOrderPage         = lazy(() => import("@/pages/customer-order"));
const AdminActionPage           = lazy(() => import("@/pages/admin-action"));
const VendorFulfillmentPage     = lazy(() => import("@/pages/vendor-fulfillment"));
const ShortLinkRedirect         = lazy(() => import("@/pages/short-link-redirect"));
const FulfillmentFormPage       = lazy(() => import("@/pages/fulfillment-form"));
const PrivacyPolicy             = lazy(() => import("@/pages/privacy-policy"));
const Contact                   = lazy(() => import("@/pages/contact"));
const ShipmentTimeline          = lazy(() => import("@/pages/shipment-timeline"));
const AdminReview               = lazy(() => import("@/pages/admin-review"));
const VendorJobPage             = lazy(() => import("@/pages/vendor-job"));
const OrderTrackPage            = lazy(() => import("@/pages/order-track"));
const CustomerInvoicePage       = lazy(() => import("@/pages/customer-invoice"));
const AccountSecurity           = lazy(() => import("@/pages/account-security"));
const NotFound                  = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

// Redirect bizportal subdomain to main domain /bizportal/
if (typeof window !== "undefined" && window.location.hostname === "bizportal.cstlogistic.co.id") {
  window.location.replace("https://cstlogistic.co.id/bizportal/");
}

// Routes that show NO navbar/footer shell
const LOGISTIC_ROUTES = ["/book", "/logistic-order-success", "/logistic-admin", "/order-produk"];
const NO_SHELL_PREFIXES = [
  "/jasa/", "/services/", "/vendor-response", "/vendor-product-approval",
  "/approve", "/confirm", "/vendor-quote", "/vendor-confirm", "/vendor-form",
  "/vendor-mini-form", "/customer-mini-form", "/admin-mini-form",
  "/choose-option", "/onboarding", "/pending-approval",
  "/customer-quote", "/order-task", "/customer-order", "/admin-action",
  "/vendor-fulfillment", "/vendor-job", "/order-track",
  "/customer-approval", "/op-confirm", "/customer-invoice",
];

// Routes that should skip the Supabase auth check entirely (public/standalone pages)
const NO_AUTH_CHECK_PREFIXES = [
  "/vendor-mini-form", "/customer-mini-form", "/admin-mini-form",
  "/vendor-form", "/vendor-response", "/vendor-product-approval",
  "/vendor-quote", "/vendor-confirm", "/vendor-fulfillment", "/vendor-job",
  "/approve", "/confirm", "/customer-quote", "/order-task", "/customer-order",
  "/admin-action", "/admin-review", "/order-track", "/fulfillment", "/q/",
  "/privacy-policy", "/contact",
  "/customer-approval", "/op-confirm", "/customer-invoice",
];

const BASE_PREFIX = import.meta.env.BASE_URL.replace(/\/$/, "");

function currentPortalPath() {
  return window.location.pathname.replace(BASE_PREFIX, "") || "/";
}

function isNoAuthRoute(path: string) {
  return NO_AUTH_CHECK_PREFIXES.some((p) => path.startsWith(p));
}

async function checkOnboardingAndRedirect(
  role: string,
  token: string,
  setLocation: (path: string) => void,
) {
  if (role === "admin") { setLocation("/admin"); return; }

  try {
    const res = await fetch("/api/portal/onboarding/status", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = await res.json() as { status: string; accountType?: string };
      if (d.status === "incomplete") { setLocation("/onboarding"); return; }
      if (d.status === "pending" || d.status === "rejected") { setLocation("/pending-approval"); return; }
    }
  } catch { /* network error — fall through */ }

  if (role === "vendor") setLocation("/vendor-dashboard");
  else setLocation("/dashboard");
}

function OAuthRedirectHandler() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!supabase) return;
    const path = currentPortalPath();
    // Skip auth check entirely for public standalone pages
    if (isNoAuthRoute(path)) return;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      if (path !== "/" && path !== "/login") return;
      const profile = await fetchAndStoreProfile();
      if (profile) await checkOnboardingAndRedirect(profile.role, session.access_token, setLocation);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        const p = currentPortalPath();
        if (p !== "/" && p !== "/login") return;
        const profile = await fetchAndStoreProfile();
        if (profile) await checkOnboardingAndRedirect(profile.role, session.access_token, setLocation);
      }
    });
    return () => subscription.unsubscribe();
  }, [setLocation]);
  return null;
}

// Minimal fallback for page transitions
function PageFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="h-7 w-7 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppShell() {
  const [location] = useLocation();
  const isLogisticPage = LOGISTIC_ROUTES.some(
    (p) => location === p || location.startsWith(p + "/") || location.startsWith("/logistic-admin")
  );
  const isNoShellPage = NO_SHELL_PREFIXES.some((p) => location.startsWith(p));
  const isNoAuth = isNoAuthRoute(location);

  const routes = (
    <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/services" component={Services} />
        <Route path="/products" component={Products} />
        <Route path="/jasa" component={Jasa} />
        <Route path="/jasa/:id" component={JasaDetail} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/vendor-dashboard" component={VendorDashboard} />
        <Route path="/orders" component={Orders} />
        <Route path="/admin" component={Admin} />
        <Route path="/freight-forwarding" component={FreightForwarding} />
        <Route path="/pabean" component={Pabean} />
        <Route path="/book" component={LogisticBook} />
        <Route path="/logistic-order-success" component={LogisticOrderSuccess} />
        <Route path="/track" component={LogisticTrack} />
        <Route path="/logistic-admin" component={LogisticAdmin} />
        <Route path="/logistic-admin/orders/:id" component={LogisticAdminOrderDetail} />
        <Route path="/calculator" component={Calculator} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/order-produk" component={ProductOrder} />
        <Route path="/vendor-response/:orderNumber" component={VendorResponsePage} />
        <Route path="/vendor-product-approval/:orderNumber" component={VendorProductApprovalPage} />
        <Route path="/vendor-quote" component={VendorQuoteFormPage} />
        <Route path="/vendor-confirm" component={VendorConfirmPage} />
        <Route path="/vendor-form/:token" component={VendorFormPage} />
        <Route path="/choose-option/:token" component={ChooseOptionPage} />
        <Route path="/onboarding" component={OnboardingPage} />
        <Route path="/pending-approval" component={PendingApprovalPage} />
        <Route path="/vendor-mini-form/:token" component={VendorMiniFormPage} />
        <Route path="/customer-mini-form/:token" component={CustomerMiniFormPage} />
        <Route path="/admin-mini-form/:token" component={AdminMiniFormPage} />
        <Route path="/customer-approval/:token" component={CustomerApprovalPage} />
        <Route path="/op-confirm/:token" component={OpConfirmPage} />
        <Route path="/approve/:orderNumber" component={ApprovePage} />
        <Route path="/confirm/:token" component={ConfirmPage} />
        <Route path="/customer-quote/:token" component={CustomerQuotePage} />
        <Route path="/order-task/:token" component={OrderTaskPage} />
        <Route path="/customer-order/:token" component={CustomerOrderPage} />
        <Route path="/admin-action/:token" component={AdminActionPage} />
        <Route path="/vendor-fulfillment/:token" component={VendorFulfillmentPage} />
        <Route path="/q/:code" component={ShortLinkRedirect} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/contact" component={Contact} />
        <Route path="/shipment-timeline" component={ShipmentTimeline} />
        <Route path="/fulfillment/:token" component={FulfillmentFormPage} />
        <Route path="/admin-review/:token" component={AdminReview} />
        <Route path="/vendor-job/:token" component={VendorJobPage} />
        <Route path="/order-track/:trackToken" component={OrderTrackPage} />
        <Route path="/customer-invoice/:token" component={CustomerInvoicePage} />
        <Route path="/account-security" component={AccountSecurity} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );

  if (isLogisticPage || isNoShellPage) {
    return <>{routes}</>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{routes}</main>
      <Footer />
      {!isNoAuth && (
        <>
          <AdminToolbar />
          <WhatsAppButton />
          <BackToTopButton />
          <ChatWidget />
          <CartDrawer />
        </>
      )}
      <ScrollToTop />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <EditModeProvider>
              <OAuthRedirectHandler />
              <AppShell />
            </EditModeProvider>
          </WouterRouter>
          <Toaster />
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
