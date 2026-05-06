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

const queryClient = new QueryClient();

const LOGISTIC_ROUTES = ["/book", "/logistic-order-success", "/logistic-admin"];
const NO_SHELL_PREFIXES = ["/jasa/"];

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
