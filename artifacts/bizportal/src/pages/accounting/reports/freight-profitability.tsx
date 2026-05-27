import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useCompany } from "@/contexts/CompanyContext";
import { Ship, Printer, Download, TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";
import { exportXlsx, printWindow } from "@/lib/export";
import { Link } from "wouter";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${n.toFixed(1)}%`;

type FreightProfitItem = {
  soId: number; soNumber: string; soStatus: string;
  customerName: string; orderNumber: string;
  origin: string; destination: string;
  shipmentType: string; transportMode: string | null;
  vendorName: string | null;
  revenue: number; vendorCost: number; margin: number; marginPct: number;
  createdAt: string;
};

type FreightProfitResponse = {
  from: string | null; to: string | null;
  summary: { totalRevenue: number; totalVendorCost: number; totalMargin: number; totalMarginPct: number; count: number };
  items: FreightProfitItem[];
};

function marginBadge(pct: number) {
  if (pct >= 20) return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{pct.toFixed(1)}%</Badge>;
  if (pct >= 10) return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{pct.toFixed(1)}%</Badge>;
  if (pct >= 0)  return <Badge className="bg-orange-100 text-orange-800 border-orange-200">{pct.toFixed(1)}%</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200">{pct.toFixed(1)}%</Badge>;
}

export default function FreightProfitabilityPage() {
  const { activeCompanyId, isConsolidated } = useCompany();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (from) p.from = new Date(from).toISOString();
    if (to)   p.to   = new Date(to + "T23:59:59").toISOString();
    p.company = isConsolidated ? "all" : String(activeCompanyId ?? "");
    return p;
  }, [from, to, activeCompanyId, isConsolidated]);

  const { data, isLoading } = useQuery<FreightProfitResponse>({
    queryKey: ["freight-profitability", params],
    queryFn: async () => {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`/api/accounting/reports/freight-profitability?${qs}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const s = data?.summary;
  const items = data?.items ?? [];

  function buildExportRows() {
    return items.map((r) => [
      r.soNumber, r.orderNumber, r.customerName,
      `${r.origin} → ${r.destination}`,
      r.shipmentType, r.vendorName ?? "-",
      r.revenue, r.vendorCost, r.margin, r.marginPct,
      new Date(r.createdAt).toLocaleDateString("id-ID"),
    ]);
  }

  const exportHeaders = [
    "No SO", "No Order", "Customer", "Rute", "Jenis", "Vendor",
    "Revenue (IDR)", "Biaya Vendor (IDR)", "Margin (IDR)", "Margin (%)", "Tanggal",
  ];

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Ship className="h-6 w-6" />
              Profitabilitas Freight
            </h1>
            <p className="text-sm text-muted-foreground">
              Revenue vs biaya vendor per shipment VMF — margin kotor per pengiriman
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => printWindow("Profitabilitas Freight", exportHeaders, buildExportRows(), [6, 7, 8])}
              disabled={!data}
            >
              <Printer className="h-4 w-4 mr-1.5" />Print Preview
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => exportXlsx("Profitabilitas_Freight", exportHeaders, buildExportRows())}
              disabled={!data}
            >
              <Download className="h-4 w-4 mr-1.5" />Export XLSX
            </Button>
          </div>
        </div>

        {/* Date filters */}
        <Card>
          <CardContent className="p-4 flex gap-4">
            <div className="flex-1">
              <Label>Dari</Label>
              <DatePicker value={from} onChange={setFrom} />
            </div>
            <div className="flex-1">
              <Label>Sampai</Label>
              <DatePicker value={to} onChange={setTo} />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card><CardContent className="p-4 text-muted-foreground">Memuat data...</CardContent></Card>
        ) : !data ? null : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />Total Revenue
                  </div>
                  <div className="text-xl font-bold text-emerald-700">{idr(s?.totalRevenue ?? 0)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s?.count ?? 0} shipment</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <TrendingDown className="h-4 w-4" />Total Biaya Vendor
                  </div>
                  <div className="text-xl font-bold text-rose-700">{idr(s?.totalVendorCost ?? 0)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Harga vendor approved</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4" />Gross Margin
                  </div>
                  <div className={`text-xl font-bold ${(s?.totalMargin ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {idr(s?.totalMargin ?? 0)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Revenue − Biaya Vendor</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Percent className="h-4 w-4" />Margin %
                  </div>
                  <div className={`text-xl font-bold ${(s?.totalMarginPct ?? 0) >= 10 ? "text-emerald-700" : "text-amber-700"}`}>
                    {pct(s?.totalMarginPct ?? 0)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Rata-rata tertimbang</div>
                </CardContent>
              </Card>
            </div>

            {/* Detail table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No SO</TableHead>
                      <TableHead>No Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Rute</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Biaya Vendor</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-center">Margin %</TableHead>
                      <TableHead>Tanggal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          Tidak ada data. Pilih rentang tanggal atau pastikan ada SO dari VMF.
                        </TableCell>
                      </TableRow>
                    ) : items.map((row) => (
                      <TableRow key={row.soId}>
                        <TableCell>
                          <Link href={`/sales/${row.soId}`} className="text-blue-600 hover:underline font-mono text-xs">
                            {row.soNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{row.orderNumber}</TableCell>
                        <TableCell className="font-medium">{row.customerName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.origin} → {row.destination}
                          {row.transportMode && <span className="ml-1 text-[10px] bg-slate-100 px-1 rounded">{row.transportMode}</span>}
                        </TableCell>
                        <TableCell className="text-xs">{row.vendorName ?? <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{idr(row.revenue)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-rose-700">{idr(row.vendorCost)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${row.margin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {idr(row.margin)}
                        </TableCell>
                        <TableCell className="text-center">{marginBadge(row.marginPct)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleDateString("id-ID")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
