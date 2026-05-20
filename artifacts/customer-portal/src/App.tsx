import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { EditModeProvider } from "@/contexts/EditModeContext";
import { AdminToolbar } from "@/components/AdminToolbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { BackToTopButton } from "@/components/BackToTopButton";
import { CartDrawer } from "@/components/CartDrawer";
import { ScrollToTop } from "@/components/ScrollToTop";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { ChatWidget } from "@/components/ChatWidget";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAndStoreProfile } from "@/lib/auth";

// Portal pages
import Home from "@/pages/home";
import Services from "@/pages/services";
import Products from "@/pages/products";
import Jasa from "@/pages/jasa";
import JasaDetail from "@/pages/jasa-detail";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import VendorDashboard from "@/pages/vendor-dashboard";
import Orders from "@/pages/orders";
import Admin from "@/pages/admin";

// Logistic ordering pages
import LogisticBook from "@/pages/logistic-book";
import LogisticOrderSuccess from "@/pages/logistic-order-success";
import LogisticTrack from "@/pages/logistic-track";
import LogisticAdmin from "@/pages/logistic-admin";
import LogisticAdminOrderDetail from "@/pages/logistic-admin-order-detail";
import FreightForwarding from "@/pages/freight-forwarding";
import Pabean from "@/pages/pabean";
import Calculator from "@/pages/calculator";
import ResetPassword from "@/pages/reset-password";
import ProductOrder from "@/pages/product-order";
import VendorResponsePage from "@/pages/vendor-response";
import VendorProductApprovalPage from "@/pages/vendor-product-approval";
import ApprovePage from "@/pages/approve";
import ConfirmPage from "@/pages/confirm";
import VendorQuoteFormPage from "@/pages/vendor-quote-form";
import VendorConfirmPage from "@/pages/vendor-confirm"; // [TRUCKING-FIX]
import ChooseOptionPage from "@/pages/choose-option"; // [MULTI-MODE]
import KasirLoginPage from "@/pages/kasir-login";
import KasirPage from "@/pages/kasir";
import MenuBoardPage from "@/pages/menu-board";
import OnboardingPage from "@/pages/onboarding";
import PendingApprovalPage from "@/pages/pending-approval";

const queryClient = new QueryClient();

// Redirect bizportal subdomain to main domain /bizportal/
if (typeof window !== "undefined" && window.location.hostname === "bizportal.cstlogistic.co.id") {
  window.location.replace("https://cstlogistic.co.id/bizportal/");
}

// Jika berjalan dalam mode POS Kasir, paksa semua path non-kasir ke /kasir/login
if (typeof window !== "undefined" && import.meta.env.VITE_POS_MODE === "true") {
  const path = window.location.pathname;
  const isKasirPath =
    path.startsWith("/kasir") ||
    path.startsWith("/menu-board") ||
    path.startsWith("/api/");
  if (!isKasirPath) {
    window.location.replace("/kasir/login");
  }
}


const LOGISTIC_ROUTES = ["/book", "/logistic-order-success", "/logistic-admin", "/order-produk"];
const NO_SHELL_PREFIXES = ["/jasa/", "/services/", "/vendor-response", "/approve", "/confirm", "/vendor-quote", "/vendor-confirm", "/choose-option", "/kasir", "/menu-board", "/onboarding", "/pending-approval"]; // [TRUCKING-FIX] [MULTI-MODE]
const NO_SHELL_PREFIXES = ["/jasa/", "/services/", "/vendor-response", "/vendor-product-approval", "/approve", "/confirm", "/vendor-quote", "/vendor-confirm", "/choose-option", "/kasir", "/menu-board"]; // [TRUCKING-FIX] [MULTI-MODE]

const BASE_PREFIX = import.meta.env.BASE_URL.replace(/\/$/, "");

function currentPortalPath() {
  return window.location.pathname.replace(BASE_PREFIX, "") || "/";
}

async function checkOnboardingAndRedirect(
  role: string,
  token: string,
  setLocation: (path: string) => void,
) {
  // Admin never needs onboarding
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
  } catch { /* network error — fall through to normal redirect */ }

  // Profile complete & active
  if (role === "vendor") setLocation("/vendor-dashboard");
  else setLocation("/dashboard");
}

function OAuthRedirectHandler() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!supabase) return;

    // Check existing session immediately on mount (handles refresh after OAuth)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const path = currentPortalPath();
      if (path !== "/" && path !== "/login") return;
      const profile = await fetchAndStoreProfile();
      if (profile) await checkOnboardingAndRedirect(profile.role, session.access_token, setLocation);
    });

    // Also listen for new sign-in events (handles fresh OAuth flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        const path = currentPortalPath();
        if (path !== "/" && path !== "/login") return;
        const profile = await fetchAndStoreProfile();
        if (profile) await checkOnboardingAndRedirect(profile.role, session.access_token, setLocation);
      }
    });
    return () => subscription.unsubscribe();
  }, [setLocation]);
  return null;
}

function AppShell() {
  const [location] = useLocation();
  const isLogisticPage = LOGISTIC_ROUTES.some(
    (p) => location === p || location.startsWith(p + "/") || location.startsWith("/logistic-admin")
  );
  const isNoShellPage = NO_SHELL_PREFIXES.some((p) => location.startsWith(p));

  const routes = (
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
      {/* Logistic ordering routes */}
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
      <Route path="/vendor-confirm" component={VendorConfirmPage} />    {/* [TRUCKING-FIX] */}
      <Route path="/choose-option/:token" component={ChooseOptionPage} />   {/* [MULTI-MODE] */}
      <Route path="/kasir/login" component={KasirLoginPage} />
      <Route path="/kasir" component={KasirPage} />
      <Route path="/menu-board" component={MenuBoardPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/pending-approval" component={PendingApprovalPage} />
      <Route path="/approve/:orderNumber" component={ApprovePage} />
      <Route path="/confirm/:token" component={ConfirmPage} />
      <Route component={NotFound} />
    </Switch>
  );

  if (isLogisticPage || isNoShellPage) {
    return <>{routes}</>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{routes}</main>
      <Footer />
      <AdminToolbar />
      <WhatsAppButton />
      <BackToTopButton />
      <ChatWidget />
      <ScrollToTop />
      <CartDrawer />
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
