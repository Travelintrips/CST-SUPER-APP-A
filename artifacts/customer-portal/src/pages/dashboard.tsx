import { useState, useEffect, useRef } from "react";
import { useGetPortalMe, useListPortalOrders } from "@workspace/api-client-react";
import { getAuthToken, getAuthHeaders, removeAuthToken } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Package, Truck, ArrowRight, Activity, Calendar, Ship, Plus,
  Plane, Box, Archive, BarChart2, Layers, Navigation,
  ClipboardList, Globe, Anchor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { StatCardManagerPanel } from "@/components/StatCardManager";

const STATUS_BADGE: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped:    "bg-purple-100 text-purple-800",
  delivered:  "bg-green-100 text-green-800",
  cancelled:  "bg-red-100 text-red-800",
};

const ICON_OPTIONS = [
  { key: "Package",       Icon: Package },
  { key: "Box",           Icon: Box },
  { key: "Archive",       Icon: Archive },
  { key: "Layers",        Icon: Layers },
  { key: "ClipboardList", Icon: ClipboardList },
  { key: "BarChart2",     Icon: BarChart2 },
  { key: "Truck",         Icon: Truck },
  { key: "Ship",          Icon: Ship },
  { key: "Plane",         Icon: Plane },
  { key: "Navigation",    Icon: Navigation },
  { key: "Globe",         Icon: Globe },
  { key: "Anchor",        Icon: Anchor },
];

const ICON_MAP = Object.fromEntries(ICON_OPTIONS.map(({ key, Icon }) => [key, Icon]));

function useCardIcon(storageKey: string, defaultIcon: string) {
  const [iconKey, setIconKey] = useState(() => localStorage.getItem(storageKey) || defaultIcon);
  const save = (key: string) => {
    setIconKey(key);
    localStorage.setItem(storageKey, key);
  };
  return [iconKey, save] as const;
}

function IconPicker({ currentKey, onSelect, className }: {
  currentKey: string;
  onSelect: (key: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const IconComp = ICON_MAP[currentKey] ?? Package;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        title="Klik untuk ganti ikon"
        className={`opacity-20 hover:opacity-50 transition-opacity cursor-pointer ${className ?? ""}`}
      >
        <IconComp className="w-10 h-10" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 bg-white rounded-xl shadow-xl border border-border p-3 grid grid-cols-4 gap-1.5 w-52">
          <p className="col-span-4 text-xs text-muted-foreground font-medium mb-1 px-1">Pilih ikon</p>
          {ICON_OPTIONS.map(({ key, Icon }) => (
            <button
              key={key}
              onClick={() => { onSelect(key); setOpen(false); }}
              className={`p-2 rounded-lg flex items-center justify-center transition-colors hover:bg-primary/10 ${
                currentKey === key ? "bg-primary/20 text-primary" : "text-muted-foreground"
              }`}
              title={key}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [card1Icon, setCard1Icon] = useCardIcon("dash_card1_icon", "Package");
  const [card2Icon, setCard2Icon] = useCardIcon("dash_card2_icon", "Truck");
  const token = getAuthToken();

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  const headers = getAuthHeaders() as any;

  const { data: userResponse, isLoading: isLoadingUser, error: userError } = useGetPortalMe({
    query: { queryKey: ["getPortalMe", token], enabled: !!token, retry: 1 },
    request: { headers }
  });

  const { data: ordersResponse, isLoading: isLoadingOrders } = useListPortalOrders({
    query: { queryKey: ["listPortalOrders", token], enabled: !!token },
    request: { headers }
  });

  useEffect(() => {
    if (userError) { removeAuthToken(); setLocation("/login"); }
  }, [userError, setLocation]);

  if (!token) return null;

  const customer = userResponse;
  const orders = Array.isArray(ordersResponse) ? ordersResponse : [];
  const activeOrders = orders.filter((o) => o.status === "processing" || o.status === "shipped");

  function filterByMetric(metric: string) {
    if (!metric || metric === "total") return orders;
    if (metric === "active") return activeOrders;
    return orders.filter((o) => o.status === metric);
  }

  const filteredOrders = filterByMetric(statusFilter);
  const displayOrders = filteredOrders.slice(0, 8);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 py-8">
      <div className="container px-4 md:px-6">

        {/* Welcome */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">
              Welcome back, {isLoadingUser ? "..." : customer?.name?.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-1">Here's an overview of your logistics activities.</p>
          </div>
          <Link href="/book">
            <Button className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
              <Plus className="h-4 w-4" /> Buat Pesanan Baru
            </Button>
          </Link>
        </div>

        {/* Hero stat cards */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-primary text-primary-foreground rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-primary-foreground/60 mb-1">Total Orders</p>
              <p className="text-4xl font-bold">{isLoadingOrders ? "-" : orders.length}</p>
            </div>
            <IconPicker currentKey={card1Icon} onSelect={setCard1Icon} />
          </div>
          <div className="bg-accent text-accent-foreground rounded-xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-accent-foreground/70 mb-1">Active Shipments</p>
              <p className="text-4xl font-bold">{isLoadingOrders ? "-" : activeOrders.length}</p>
            </div>
            <IconPicker currentKey={card2Icon} onSelect={setCard2Icon} />
          </div>
        </div>

        {/* Status filter cards — managed via admin edit mode */}
        {!isLoadingOrders && (
          <StatCardManagerPanel
            orders={orders}
            statusFilter={statusFilter}
            onFilterChange={setStatusFilter}
          />
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Orders list */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
                <div>
                  <CardTitle>
                    {statusFilter ? `${statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} Orders` : "Recent Orders"}
                  </CardTitle>
                  <CardDescription>
                    {statusFilter ? `Showing ${filteredOrders.length} orders` : "Your most recent logistics requests"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {statusFilter && (
                    <Button variant="ghost" size="sm" onClick={() => setStatusFilter("")} className="text-xs">
                      Clear filter
                    </Button>
                  )}
                  <Link href="/orders">
                    <Button variant="ghost" size="sm" className="gap-2">
                      View All <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {isLoadingOrders ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : displayOrders.length > 0 ? (
                  <div className="space-y-4">
                    {displayOrders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="bg-primary/5 p-3 rounded-full">
                            <Package className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{order.docNumber}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(order.createdAt).toLocaleDateString("id-ID")}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge
                            variant="secondary"
                            className={STATUS_BADGE[order.status] || "bg-gray-100 text-gray-800"}
                          >
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </Badge>
                          <span className="font-semibold text-sm">
                            {formatCurrency(order.grandTotal)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium">
                      {statusFilter ? `No ${statusFilter} orders` : "No orders yet"}
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      {statusFilter ? "Try another status filter." : "You haven't created any orders."}
                    </p>
                    {!statusFilter && (
                      <Link href="/book">
                        <Button>Buat Pesanan Logistik</Button>
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Profile Details</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingUser ? (
                  <div className="space-y-4">
                    <div className="h-4 bg-gray-100 rounded w-full animate-pulse" />
                    <div className="h-4 bg-gray-100 rounded w-2/3 animate-pulse" />
                  </div>
                ) : customer ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Company</p>
                      <p className="font-medium">{customer.company || "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{customer.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{customer.phone || "Not provided"}</p>
                    </div>
                    <div className="pt-4 border-t border-border/40">
                      <Button variant="outline" className="w-full">Edit Profile</Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-primary text-primary-foreground">
              <CardHeader>
                <CardTitle>Logistic Ordering</CardTitle>
                <CardDescription className="text-primary-foreground/70">Book export, import & freight services</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/book">
                  <Button variant="secondary" className="w-full bg-white text-primary hover:bg-gray-100 gap-2">
                    <Ship className="h-4 w-4" /> Buat Pesanan
                  </Button>
                </Link>
                <Link href="/track">
                  <Button variant="ghost" className="w-full text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-2">
                    Lacak Pesanan
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
