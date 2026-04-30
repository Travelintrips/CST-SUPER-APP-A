import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CartProvider } from "@/lib/cart";
import { CartDrawer } from "@/components/CartDrawer";

// Portal pages
import Home from "@/pages/home";
import Services from "@/pages/services";
import Products from "@/pages/products";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import Admin from "@/pages/admin";

// Logistic ordering pages
import LogisticBook from "@/pages/logistic-book";
import LogisticOrderSuccess from "@/pages/logistic-order-success";
import LogisticTrack from "@/pages/logistic-track";
import LogisticAdmin from "@/pages/logistic-admin";
import LogisticAdminOrderDetail from "@/pages/logistic-admin-order-detail";

const queryClient = new QueryClient();

const LOGISTIC_ROUTES = ["/book", "/logistic-order-success", "/track", "/logistic-admin"];

function AppShell() {
  const [location] = useLocation();
  const isLogisticPage = LOGISTIC_ROUTES.some(
    (p) => location === p || location.startsWith(p + "/") || location.startsWith("/logistic-admin")
  );

  const routes = (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/services" component={Services} />
      <Route path="/products" component={Products} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/orders" component={Orders} />
      <Route path="/admin" component={Admin} />
      {/* Logistic ordering routes */}
      <Route path="/book" component={LogisticBook} />
      <Route path="/logistic-order-success" component={LogisticOrderSuccess} />
      <Route path="/track" component={LogisticTrack} />
      <Route path="/logistic-admin" component={LogisticAdmin} />
      <Route path="/logistic-admin/orders/:id" component={LogisticAdminOrderDetail} />
      <Route component={NotFound} />
    </Switch>
  );

  if (isLogisticPage) {
    return <>{routes}</>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{routes}</main>
      <Footer />
      <CartDrawer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CartProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppShell />
          </WouterRouter>
        </CartProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
