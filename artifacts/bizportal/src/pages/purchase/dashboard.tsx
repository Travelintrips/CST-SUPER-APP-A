import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useGetPurchaseSummary,
  useListPurchaseDocuments,
} from "@workspace/api-client-react";
import { ClipboardList, ShoppingBag, FileText, TrendingDown, Plus } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export default function PurchaseDashboardPage() {
  const { data: summary } = useGetPurchaseSummary();
  const { data: recentDocs } = useListPurchaseDocuments();
  const recent = (recentDocs ?? []).slice(0, 8);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Purchase</h1>
            <p className="text-sm text-muted-foreground">Ringkasan pembelian dan dokumen terbaru.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/purchase/rfq">
              <Button variant="outline" data-testid="link-go-rfq">
                <ClipboardList className="mr-2 h-4 w-4" /> RFQ
              </Button>
            </Link>
            <Link href="/purchase/rfq/new">
              <Button data-testid="button-new-rfq">
                <Plus className="mr-2 h-4 w-4" /> New RFQ
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">RFQs</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-rfq">{summary?.rfqCount ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Purchase Orders</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-orders">{summary?.ordersCount ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">To Bill</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-to-bill">{summary?.toBillCount ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-spend">{idr(summary?.totalSpend ?? 0)}</div>
              {summary?.topVendor && (
                <p className="text-xs text-muted-foreground mt-1">Top: {summary.topVendor}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dokumen Terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada dokumen.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((d) => (
                  <Link
                    key={d.id}
                    href={d.kind === "order" ? `/purchase/orders/${d.id}` : `/purchase/rfq/${d.id}`}
                  >
                    <div
                      className="flex items-center justify-between rounded-md border p-3 hover:bg-accent cursor-pointer"
                      data-testid={`recent-doc-${d.id}`}
                    >
                      <div>
                        <div className="font-medium">{d.docNumber}</div>
                        <div className="text-xs text-muted-foreground">{d.supplierName}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="capitalize">{d.kind}</Badge>
                        <Badge variant="secondary" className="capitalize">{d.status}</Badge>
                        <div className="font-medium">{idr(Number(d.totalAmount))}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
