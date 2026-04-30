import { useState } from "react";
import { useListPortalOrders, useListPortalLogisticOrders } from "@workspace/api-client-react";
import { getAuthToken, getAuthHeaders } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Package, Search, Calendar, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  pending:       "bg-yellow-100 text-yellow-800",
  processing:    "bg-blue-100 text-blue-800",
  shipped:       "bg-purple-100 text-purple-800",
  delivered:     "bg-green-100 text-green-800",
  cancelled:     "bg-red-100 text-red-800",
  "New Order":   "bg-yellow-100 text-yellow-800",
  "In Progress": "bg-blue-100 text-blue-800",
  "Completed":   "bg-green-100 text-green-800",
};

export default function Orders() {
  const [, setLocation] = useLocation();
  const token = getAuthToken();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  const headers = getAuthHeaders() as any;

  const { data: crmResponse, isLoading: isLoadingCrm } = useListPortalOrders({
    query: { queryKey: ["listPortalOrders", token], enabled: !!token },
    request: { headers },
  });

  const { data: logisticResponse, isLoading: isLoadingLogistic } = useListPortalLogisticOrders({
    query: { queryKey: ["listPortalLogisticOrders", token], enabled: !!token },
    request: { headers },
  });

  if (!token) return null;

  const crmOrders = (Array.isArray(crmResponse) ? crmResponse : []).map((o) => ({
    _key: `crm-${o.id}`,
    displayNumber: o.docNumber,
    subtitle: "Sales Order",
    status: o.status,
    grandTotal: o.grandTotal,
    createdAt: o.createdAt,
  }));

  const logisticOrders = (Array.isArray(logisticResponse) ? logisticResponse : []).map((o) => ({
    _key: `log-${o.id}`,
    displayNumber: o.orderNumber,
    subtitle: `${o.shipmentType} • ${o.origin} → ${o.destination}`,
    status: o.status,
    grandTotal: o.grandTotal,
    createdAt: o.createdAt,
  }));

  const allOrders = [...logisticOrders, ...crmOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const isLoading = isLoadingCrm || isLoadingLogistic;

  const filtered = search.trim()
    ? allOrders.filter(
        (o) =>
          o.displayNumber.toLowerCase().includes(search.toLowerCase()) ||
          o.subtitle.toLowerCase().includes(search.toLowerCase())
      )
    : allOrders;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gray-50 py-8">
      <div className="container px-4 md:px-6">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold mb-2">Order History</h1>
            <p className="text-muted-foreground">
              View and track all your logistics orders and shipments.
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by order number..."
              className="pl-9 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Card className="border-none shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-gray-50 border-b border-border/50">
                <tr>
                  <th className="px-6 py-4 font-medium">Order Details</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 bg-white">
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4"><div className="h-10 bg-gray-100 rounded w-48" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-24" /></td>
                      <td className="px-6 py-4"><div className="h-6 bg-gray-100 rounded-full w-20" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-24 ml-auto" /></td>
                    </tr>
                  ))
                ) : filtered.length > 0 ? (
                  filtered.map((order) => (
                    <tr key={order._key} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/5 p-2 rounded-lg">
                            <Package className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-semibold text-primary">{order.displayNumber}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">
                              {order.subtitle}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {new Date(order.createdAt).toLocaleDateString("id-ID")}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="secondary" className={`${STATUS_COLOR[order.status] ?? "bg-gray-100 text-gray-800"} font-medium border-0`}>
                          {order.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="font-semibold text-base">
                          {formatCurrency(order.grandTotal)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-muted-foreground">
                      <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-lg font-medium text-foreground">
                        {search ? "Tidak ada hasil" : "Belum ada pesanan"}
                      </p>
                      <p>{search ? "Coba kata kunci lain." : "Anda belum membuat pesanan apapun."}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
