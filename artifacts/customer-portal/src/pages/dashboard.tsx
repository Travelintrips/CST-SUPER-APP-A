import { useGetPortalMe, useListPortalOrders } from "@workspace/api-client-react";
import { getAuthToken, getAuthHeaders, removeAuthToken } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Package, Truck, FileText, ArrowRight, Activity, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const token = getAuthToken();

  useEffect(() => {
    if (!token) {
      setLocation("/login");
    }
  }, [token, setLocation]);

  const headers = getAuthHeaders() as any;

  const { data: userResponse, isLoading: isLoadingUser, error: userError } = useGetPortalMe({
    query: { 
      queryKey: ["getPortalMe", token], 
      enabled: !!token,
      retry: 1
    },
    request: { headers }
  });

  const { data: ordersResponse, isLoading: isLoadingOrders } = useListPortalOrders({
    query: { 
      queryKey: ["listPortalOrders", token], 
      enabled: !!token 
    },
    request: { headers }
  });

  // Handle auth error by redirecting
  useEffect(() => {
    if (userError) {
      removeAuthToken();
      setLocation("/login");
    }
  }, [userError, setLocation]);

  if (!token) return null;

  const customer = userResponse;
  const orders = Array.isArray(ordersResponse) ? ordersResponse : [];
  const recentOrders = orders.slice(0, 5);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "processing": return "bg-blue-100 text-blue-800";
      case "shipped": return "bg-purple-100 text-purple-800";
      case "delivered": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 py-8">
      <div className="container px-4 md:px-6">
        
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold">
            Welcome back, {isLoadingUser ? "..." : customer?.name?.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground mt-2">
            Here's an overview of your logistics and shipping activities.
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{isLoadingOrders ? "-" : orders.length}</div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Shipments</CardTitle>
              <Truck className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {isLoadingOrders ? "-" : orders.filter(o => o.status === 'processing' || o.status === 'shipped').length}
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Documents Pending</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">0</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Recent Orders List */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
                <div>
                  <CardTitle>Recent Orders</CardTitle>
                  <CardDescription>Your most recent logistics requests</CardDescription>
                </div>
                <Link href="/orders">
                  <Button variant="ghost" size="sm" className="gap-2">
                    View All <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-6">
                {isLoadingOrders ? (
                  <div className="space-y-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : recentOrders.length > 0 ? (
                  <div className="space-y-4">
                    {recentOrders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="bg-primary/5 p-3 rounded-full">
                            <Package className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{order.docNumber}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(order.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="secondary" className={getStatusColor(order.status)}>
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </Badge>
                          <span className="font-semibold text-sm">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(order.grandTotal)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium">No orders yet</h3>
                    <p className="text-muted-foreground mb-6">You haven't created any orders or shipments.</p>
                    <Link href="/services">
                      <Button>Browse Services</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Profile Sidebar */}
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

            <Card className="border-none shadow-sm bg-accent text-accent-foreground">
              <CardHeader>
                <CardTitle>Need Support?</CardTitle>
                <CardDescription className="text-accent-foreground/80">Our logistics team is available 24/7</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" className="w-full bg-white text-accent hover:bg-gray-100">
                  Contact Support
                </Button>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
