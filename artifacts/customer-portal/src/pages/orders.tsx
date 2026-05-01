import { useState } from "react";
import { useListPortalOrders, useListPortalLogisticOrders, useCancelPortalOrder, useCancelPortalLogisticOrder } from "@workspace/api-client-react";
import { getAuthToken, getAuthHeaders } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Package, Search, Calendar, FileText, ExternalLink, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped:    "bg-purple-100 text-purple-800",
  delivered:  "bg-green-100 text-green-800",
  cancelled:  "bg-red-100 text-red-800",
};

const LOGISTIC_STATUS_MAP: Record<string, string> = {
  "New Order":   "pending",
  "In Progress": "processing",
  "Completed":   "delivered",
};

export default function Orders() {
  const [, setLocation] = useLocation();
  const token = getAuthToken();
  const [search, setSearch] = useState("");
  const [cancellingKey, setCancellingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setLocation("/login");
  }, [token, setLocation]);

  const headers = getAuthHeaders() as Record<string, string>;
  const queryClient = useQueryClient();

  const { data: crmResponse, isLoading: isLoadingCrm } = useListPortalOrders({
    query: { queryKey: ["listPortalOrders", token], enabled: !!token },
    request: { headers },
  });

  const { data: logisticResponse, isLoading: isLoadingLogistic } = useListPortalLogisticOrders({
    query: { queryKey: ["listPortalLogisticOrders", token], enabled: !!token },
    request: { headers },
  });

  const cancelCrmOrder = useCancelPortalOrder({ request: { headers } });
  const cancelLogisticOrder = useCancelPortalLogisticOrder({ request: { headers } });

  if (!token) return null;

  const crmOrders = (Array.isArray(crmResponse) ? crmResponse : []).map((o) => ({
    _key: `crm-${o.id}`,
    _id: o.id,
    _type: "crm" as const,
    _cancellable: o.status === "draft",
    displayNumber: o.docNumber,
    subtitle: "Sales Order",
    status: o.status,
    displayStatus: o.status,
    grandTotal: o.grandTotal,
    createdAt: o.createdAt,
    trackUrl: null as string | null,
  }));

  const logisticOrders = (Array.isArray(logisticResponse) ? logisticResponse : []).map((o) => ({
    _key: `log-${o.id}`,
    _id: o.id,
    _type: "logistic" as const,
    _cancellable: o.status === "New Order",
    displayNumber: o.orderNumber,
    subtitle: `${o.shipmentType} • ${o.origin} → ${o.destination}`,
    status: LOGISTIC_STATUS_MAP[o.status] ?? o.status,
    displayStatus: o.status,
    grandTotal: o.grandTotal,
    createdAt: o.createdAt,
    trackUrl: `/track?order=${encodeURIComponent(o.orderNumber)}`,
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

  const handleCancel = async (order: typeof allOrders[number]) => {
    if (!confirm(`Batalkan pesanan ${order.displayNumber}?`)) return;
    setCancellingKey(order._key);
    try {
      if (order._type === "crm") {
        await cancelCrmOrder.mutateAsync({ id: order._id });
        queryClient.invalidateQueries({ queryKey: ["listPortalOrders", token] });
      } else {
        await cancelLogisticOrder.mutateAsync({ id: order._id });
        queryClient.invalidateQueries({ queryKey: ["listPortalLogisticOrders", token] });
      }
    } catch {
      alert("Gagal membatalkan pesanan. Silakan coba lagi.");
    } finally {
      setCancellingKey(null);
    }
  };

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
                  <th className="px-6 py-4 font-medium w-16"></th>
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
                      <td className="px-6 py-4"></td>
                    </tr>
                  ))
                ) : filtered.length > 0 ? (
                  filtered.map((order) => (
                    <tr
                      key={order._key}
                      className={`transition-colors ${order.trackUrl ? "cursor-pointer hover:bg-blue-50/60" : "hover:bg-gray-50/50"}`}
                      onClick={() => order.trackUrl && setLocation(order.trackUrl)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/5 p-2 rounded-lg">
                            <Package className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-semibold text-primary flex items-center gap-1.5">
                              {order.displayNumber}
                              {order.trackUrl && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                            </div>
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
                          {order.displayStatus}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="font-semibold text-base">
                          {formatCurrency(order.grandTotal)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {order._cancellable && (
                          <button
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="Batalkan pesanan"
                            disabled={cancellingKey === order._key}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleCancel(order);
                            }}
                            data-testid={`btn-cancel-${order._key}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-muted-foreground">
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
