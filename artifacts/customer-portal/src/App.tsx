import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CartProvider } from "@/lib/cart";
import { CartDrawer } from "@/components/CartDrawer";
import { EditModeProvider } from "@/contexts/EditModeContext";
import { AdminToolbar } from "@/components/AdminToolbar";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { BackToTopButton } from "@/components/BackToTopButton";
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
import ApprovePage from "@/pages/approve";
import ConfirmPage from "@/pages/confirm";
import VendorQuoteFormPage from "@/pages/vendor-quote-form";
import VendorConfirmPage from "@/pages/vendor-confirm"; // [TRUCKING-FIX]
import ChooseOptionPage from "@/pages/choose-option"; // [MULTI-MODE]

const queryClient = new QueryClient();

// Redirect bizportal subdomain to main domain /bizportal/
if (typeof window !== "undefined" && window.location.hostname === "bizportal.cstlogistic.co.id") {
  window.location.replace("https://cstlogistic.co.id/bizportal/");
}


const LOGISTIC_ROUTES = ["/book", "/logistic-order-success", "/logistic-admin", "/order-produk"];
const NO_SHELL_PREFIXES = ["/jasa/", "/services/", "/vendor-response", "/approve", "/confirm", "/vendor-quote", "/vendor-confirm", "/choose-option"]; // [TRUCKING-FIX] [MULTI-MODE]
const NO_SHELL_PREFIXES = ["/services/", "/vendor-response", "/approve", "/confirm"];

const BASE_PREFIX = import.meta.env.BASE_URL.replace(/\/$/, "");

function currentPortalPath() {
  return window.location.pathname.replace(BASE_PREFIX, "") || "/";
}

function redirectByRole(role: string, setLocation: (path: string) => void) {
  if (role === "admin") setLocation("/admin");
  else if (role === "vendor") setLocation("/vendor-dashboard");
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
      if (profile) redirectByRole(profile.role, setLocation);
    });

    // Also listen for new sign-in events (handles fresh OAuth flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        const path = currentPortalPath();
        if (path !== "/" && path !== "/login") return;
        const profile = await fetchAndStoreProfile();
        if (profile) redirectByRole(profile.role, setLocation);
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
      <Route path="/vendor-quote" component={VendorQuoteFormPage} />
      <Route path="/vendor-confirm" component={VendorConfirmPage} />    {/* [TRUCKING-FIX] */}
      <Route path="/choose-option/:token" component={ChooseOptionPage} />   {/* [MULTI-MODE] */}
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
      <CartDrawer />
      <AdminToolbar />
      <WhatsAppButton />
      <BackToTopButton />
      <ChatWidget />
      <ScrollToTop />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <CartProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <EditModeProvider>
                <OAuthRedirectHandler />
                <AppShell />
              </EditModeProvider>
            </WouterRouter>
          </CartProvider>
          <Toaster />
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
