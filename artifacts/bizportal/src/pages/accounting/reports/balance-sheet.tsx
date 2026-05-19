import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useGetBalanceSheet, getGetBalanceSheetQueryKey } from "@workspace/api-client-react";
import { useCompany } from "@/contexts/CompanyContext";
import { Wallet, Printer, Download } from "lucide-react";
import { exportXlsx, printWindow } from "@/lib/export";

const idr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

export default function BalanceSheetPage() {
  const { activeCompanyId, isConsolidated } = useCompany();
  const [asOf, setAsOf] = useState("");
  const params = useMemo(() => ({
    ...(asOf ? { to: new Date(asOf + "T23:59:59").toISOString() } : {}),
    ...(isConsolidated ? {} : { company: activeCompanyId }),
  }), [asOf, activeCompanyId, isConsolidated]);
  const { data, isLoading } = useGetBalanceSheet(params, { query: { queryKey: getGetBalanceSheetQueryKey(params) } });

  function buildExportRows() {
    if (!data) return [];
    return [
      ["=== AKTIVA (ASSETS) ===", "", ""],
      ...(data.assets.map((r) => [r.code, r.name, r.amount])),
      ["", "Total Aktiva", data.totalAssets],
      ["", "", ""],
      ["=== LIABILITAS ===", "", ""],
      ...(data.liabilities.map((r) => [r.code, r.name, r.amount])),
      ["", "Total Liabilitas", data.totalLiabilities],
      ["", "", ""],
      ["=== EKUITAS ===", "", ""],
      ...(data.equity.map((r) => [r.code, r.name, r.amount])),
      ["", "Laba Berjalan (YTD)", data.netIncomeYTD],
      ["", "Total Ekuitas", data.totalEquity],
      ["", "", ""],
      ["", "Total Liabilitas + Ekuitas", data.totalLiabilitiesAndEquity],
    ] as (string | number | null | undefined)[][];
  }

  const headers = ["Kode", "Nama", "Jumlah"];
  const hasData = !!data;

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" />Neraca (Balance Sheet)</h1>
            <p className="text-sm text-muted-foreground">Posisi keuangan per tanggal</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => printWindow("Neraca (Balance Sheet)", headers, buildExportRows(), [2])} disabled={!hasData}>
              <Printer className="h-4 w-4 mr-1.5" />Print Preview
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportXlsx("Neraca", headers, buildExportRows())} disabled={!hasData}>
              <Download className="h-4 w-4 mr-1.5" />Export XLSX
            </Button>
          </div>
        </div>

        <Card><CardContent className="p-4 flex gap-4 items-end">
          <div className="flex-1"><Label>Per Tanggal</Label><DatePicker value={asOf} onChange={setAsOf} data-testid="input-asof" /></div>
          {data && <div className="text-sm text-muted-foreground">{new Date(data.asOf).toLocaleDateString("id-ID")}</div>}
        </CardContent></Card>

        {isLoading ? <Card><CardContent className="p-4">Memuat...</CardContent></Card> : !data ? null : (
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-4">
                <div className="font-semibold mb-2 text-blue-700 text-lg">Aktiva (Assets)</div>
                <Table>
                  <TableBody>
                    {data.assets.length === 0 ? (
                      <TableRow><TableCell className="text-muted-foreground">Tidak ada</TableCell></TableRow>
                    ) : data.assets.map((r) => (
                      <TableRow key={r.accountId}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell>{r.name}</TableCell><TableCell className="text-right font-mono">{idr(r.amount)}</TableCell></TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2 bg-muted/30"><TableCell colSpan={2}>Total Aktiva</TableCell><TableCell className="text-right font-mono" data-testid="text-total-assets">{idr(data.totalAssets)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2 text-orange-700 text-lg">Liabilitas</div>
                  <Table>
                    <TableBody>
                      {data.liabilities.length === 0 ? (
                        <TableRow><TableCell className="text-muted-foreground">Tidak ada</TableCell></TableRow>
                      ) : data.liabilities.map((r) => (
                        <TableRow key={r.accountId}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell>{r.name}</TableCell><TableCell className="text-right font-mono">{idr(r.amount)}</TableCell></TableRow>
                      ))}
                      <TableRow className="font-semibold border-t bg-muted/30"><TableCell colSpan={2}>Total Liabilitas</TableCell><TableCell className="text-right font-mono">{idr(data.totalLiabilities)}</TableCell></TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="font-semibold mb-2 text-emerald-700 text-lg">Ekuitas</div>
                  <Table>
                    <TableBody>
                      {data.equity.map((r) => (
                        <TableRow key={r.accountId}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell>{r.name}</TableCell><TableCell className="text-right font-mono">{idr(r.amount)}</TableCell></TableRow>
                      ))}
                      <TableRow><TableCell></TableCell><TableCell>Laba Berjalan (YTD)</TableCell><TableCell className="text-right font-mono">{idr(data.netIncomeYTD)}</TableCell></TableRow>
                      <TableRow className="font-semibold border-t bg-muted/30"><TableCell colSpan={2}>Total Ekuitas</TableCell><TableCell className="text-right font-mono">{idr(data.totalEquity)}</TableCell></TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 flex justify-between items-center">
                  <div className="font-bold">Total Liabilitas + Ekuitas</div>
                  <div className="text-xl font-bold font-mono" data-testid="text-total-le">{idr(data.totalLiabilitiesAndEquity)}</div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
