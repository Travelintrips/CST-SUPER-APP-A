import { ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "@/components/layout/Navbar";
import HomePage from "@/pages/home";
import BookPage from "@/pages/book";
import OrderSuccessPage from "@/pages/order-success";
import TrackPage from "@/pages/track";
import AdminPage from "@/pages/admin";
import AdminOrderDetail from "@/pages/admin-order-detail";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">{children}</main>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const isAdmin = location.startsWith("/admin");

  const routes = (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/book" component={BookPage} />
      <Route path="/order-success" component={OrderSuccessPage} />
      <Route path="/track" component={TrackPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/admin/orders/:id" component={AdminOrderDetail} />
      <Route component={NotFound} />
    </Switch>
  );

  if (isAdmin) return routes;
  return <AppShell>{routes}</AppShell>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
