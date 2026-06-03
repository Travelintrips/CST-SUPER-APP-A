import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetProfitLoss, getGetProfitLossQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { TrendingUp, Printer, Download } from "lucide-react";
import { exportXlsx, printWindow } from "@/lib/export";

const idr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

interface CostCenter {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export default function ProfitLossPage() {
  const { activeCompanyId, isConsolidated } = useCompany();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [costCenterId, setCostCenterId] = useState<string>("all");

  const { data: costCenters } = useQuery<CostCenter[]>({
    queryKey: ["accounting-cost-centers", activeCompanyId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!isConsolidated && activeCompanyId) params.set("company", String(activeCompanyId));
      const res = await fetch(`/api/accounting/cost-centers?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const params = useMemo(() => ({
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to + "T23:59:59").toISOString() } : {}),
    company: (isConsolidated ? "all" : activeCompanyId) as unknown as number,
    ...(costCenterId !== "all" ? { cost_center_id: Number(costCenterId) as unknown as number } : {}),
  }), [from, to, activeCompanyId, isConsolidated, costCenterId]);

  const { data, isLoading } = useGetProfitLoss(params, { query: { queryKey: getGetProfitLossQueryKey(params) } });

  const selectedCCName = costCenterId === "all"
    ? "Semua Cost Center"
    : costCenters?.find((c) => String(c.id) === costCenterId)?.name ?? costCenterId;

  function buildExportRows() {
    if (!data) return [];
    const rows: (string | number | null | undefined)[][] = [
      ["=== PENDAPATAN ===", "", ""],
      ...(data.revenues.map((r) => [r.code, r.name, r.amount])),
      ["", "Total Pendapatan", data.totalRevenue],
      ["", "", ""],
      ["=== BEBAN ===", "", ""],
      ...(data.expenses.map((r) => [r.code, r.name, r.amount])),
      ["", "Total Beban", data.totalExpense],
      ["", "", ""],
      ["", "LABA (RUGI) BERSIH", data.netIncome],
    ];
    return rows;
  }

  const headers = ["Kode", "Nama", "Jumlah"];
  const hasData = !!data;

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-6 w-6" />Laporan Laba Rugi</h1>
            <p className="text-sm text-muted-foreground">
              Pendapatan dikurangi beban dalam periode terpilih
              {costCenterId !== "all" && <span className="ml-2 font-medium text-primary">· {selectedCCName}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => printWindow("Laporan Laba Rugi", headers, buildExportRows(), [2])} disabled={!hasData}>
              <Printer className="h-4 w-4 mr-1.5" />Print Preview
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportXlsx("Laba_Rugi", headers, buildExportRows())} disabled={!hasData}>
              <Download className="h-4 w-4 mr-1.5" />Export XLSX
            </Button>
          </div>
        </div>

        <Card><CardContent className="p-4 flex flex-wrap gap-4">
          <div className="flex-1 min-w-[140px]"><Label>Dari</Label><DatePicker value={from} onChange={setFrom} data-testid="input-from" /></div>
          <div className="flex-1 min-w-[140px]"><Label>Sampai</Label><DatePicker value={to} onChange={setTo} data-testid="input-to" /></div>
          <div className="flex-1 min-w-[180px]">
            <Label>Cost Center</Label>
            <Select value={costCenterId} onValueChange={setCostCenterId}>
              <SelectTrigger>
                <SelectValue placeholder="Semua Cost Center" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Cost Center</SelectItem>
                {(costCenters ?? []).filter((c) => c.isActive).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent></Card>

        {isLoading ? <Card><CardContent className="p-4">Memuat...</CardContent></Card> : !data ? null : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="font-semibold mb-2 text-emerald-700">Pendapatan</div>
                <Table>
                  <TableBody>
                    {data.revenues.length === 0 ? (
                      <TableRow><TableCell className="text-muted-foreground text-center" colSpan={3}>Tidak ada</TableCell></TableRow>
                    ) : data.revenues.map((r) => (
                      <TableRow key={r.accountId}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right font-mono">{idr(r.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold border-t bg-muted/30">
                      <TableCell colSpan={2}>Total Pendapatan</TableCell>
                      <TableCell className="text-right font-mono">{idr(data.totalRevenue)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="font-semibold mb-2 text-rose-700">Beban</div>
                <Table>
                  <TableBody>
                    {data.expenses.length === 0 ? (
                      <TableRow><TableCell className="text-muted-foreground text-center" colSpan={3}>Tidak ada</TableCell></TableRow>
                    ) : data.expenses.map((r) => (
                      <TableRow key={r.accountId}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right font-mono">{idr(r.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold border-t bg-muted/30">
                      <TableCell colSpan={2}>Total Beban</TableCell>
                      <TableCell className="text-right font-mono">{idr(data.totalExpense)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex justify-between items-center">
                <div className="text-lg font-bold">Laba (Rugi) Bersih</div>
                <div className={`text-2xl font-bold font-mono ${data.netIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`} data-testid="text-net-income">{idr(data.netIncome)}</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
