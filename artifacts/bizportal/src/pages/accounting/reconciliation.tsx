import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useListAccounts,
  useListAccountingEntryLines,
  getListAccountingEntryLinesQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, CheckCircle2, Circle, GitMerge, Printer, Download } from "lucide-react";
import { exportXlsx, printWindow } from "@/lib/export";
import { Link } from "wouter";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const STORAGE_KEY = (accountId: number, from: string, to: string) =>
  `recon_${accountId}_${from}_${to}`;

function loadReconciled(key: string): Set<number> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch { return new Set(); }
}

function saveReconciled(key: string, set: Set<number>) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

export default function ReconciliationPage() {
  const { data: accounts } = useListAccounts();
  const [accountId, setAccountId] = useState<number | undefined>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bankBalance, setBankBalance] = useState("");
  const [reconciled, setReconciled] = useState<Set<number>>(new Set());

  const bankCashAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.isActive && (a.type === "asset") &&
      (a.code.startsWith("1-1") || a.name.toLowerCase().includes("kas") || a.name.toLowerCase().includes("bank"))
    ),
    [accounts]
  );

  const params = useMemo(() => ({
    ...(accountId ? { accountId } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to + "T23:59:59").toISOString() } : {}),
  }), [accountId, from, to]);

  const { data: lines, isLoading } = useListAccountingEntryLines(params, {
    query: {
      queryKey: getListAccountingEntryLinesQueryKey(params),
      enabled: !!accountId,
    },
  });

  const storageKey = accountId ? STORAGE_KEY(accountId, from, to) : "";

  function toggleReconcile(id: number) {
    setReconciled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (storageKey) saveReconciled(storageKey, next);
      return next;
    });
  }

  function loadFromStorage() {
    if (storageKey) setReconciled(loadReconciled(storageKey));
  }

  const rows = lines ?? [];
  const totalDebit = rows.reduce((s, l) => s + l.debit, 0);
  const totalCredit = rows.reduce((s, l) => s + l.credit, 0);
  const bookBalance = totalDebit - totalCredit;
  const bankBal = parseFloat(bankBalance.replace(/[^0-9.-]/g, "")) || 0;
  const difference = bankBal - bookBalance;

  const reconciledRows = rows.filter((r) => reconciled.has(r.id));
  const unreconciledRows = rows.filter((r) => !reconciled.has(r.id));
  const reconciledDebit = reconciledRows.reduce((s, l) => s + l.debit, 0);
  const reconciledCredit = reconciledRows.reduce((s, l) => s + l.credit, 0);

  const selectedAccount = accounts?.find((a) => a.id === accountId);

  function handleExportXlsx() {
    exportXlsx("Rekonsiliasi_" + (selectedAccount?.code ?? ""),
      ["No. Entry", "Tanggal", "Sumber", "Referensi", "Deskripsi", "Debit", "Kredit", "Status"],
      rows.map((l) => [
      l.entryNumber,
      new Date(l.entryDate).toLocaleDateString("id-ID"),
      l.entrySource,
      l.ref ?? "",
      l.description ?? "",
      l.debit || "",
      l.credit || "",
      reconciled.has(l.id) ? "Reconciled" : "Unreconciled",
    ]));
  }

  function handlePrint() {
    printWindow(
      `Rekonsiliasi — ${selectedAccount?.code ?? ""} ${selectedAccount?.name ?? ""}`,
      ["No. Entry", "Tanggal", "Sumber", "Referensi", "Deskripsi", "Debit", "Kredit", "Status"],
      rows.map((l) => [
        l.entryNumber,
        new Date(l.entryDate).toLocaleDateString("id-ID"),
        l.entrySource,
        l.ref ?? "",
        l.description ?? "",
        l.debit || "",
        l.credit || "",
        reconciled.has(l.id) ? "✓ Reconciled" : "Unreconciled",
      ]),
      [5, 6]
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/accounting"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>

            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitMerge className="h-6 w-6" />
              Rekonsiliasi Bank
            </h1>
            <p className="text-sm text-muted-foreground">
              Cocokkan mutasi buku besar dengan laporan bank
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={rows.length === 0}>
              <Printer className="h-4 w-4 mr-1.5" />Print Preview
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportXlsx} disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-1.5" />Export XLSX
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Label>Akun Bank / Kas</Label>
                <Select
                  value={accountId ? String(accountId) : ""}
                  onValueChange={(v) => {
                    setAccountId(parseInt(v));
                    setTimeout(loadFromStorage, 50);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts ?? [])
                      .filter((a) => a.isActive && a.type === "asset")
                      .map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.code} — {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dari</Label>
                <DatePicker value={from} onChange={setFrom} />
              </div>
              <div>
                <Label>Sampai</Label>
                <DatePicker value={to} onChange={setTo} />
              </div>
            </div>
          </CardContent>
        </Card>

        {accountId && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Saldo Buku (Debit−Kredit)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-2xl font-bold font-mono">{idr(bookBalance)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Saldo Bank (Input Manual)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Input
                    type="number"
                    placeholder="0"
                    value={bankBalance}
                    onChange={(e) => setBankBalance(e.target.value)}
                    className="font-mono text-lg h-9"
                  />
                </CardContent>
              </Card>
              <Card className={difference === 0 && bankBalance ? "border-emerald-500" : difference !== 0 && bankBalance ? "border-rose-500" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Selisih
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className={`text-2xl font-bold font-mono ${difference === 0 && bankBalance ? "text-emerald-600" : difference !== 0 && bankBalance ? "text-rose-600" : ""}`}>
                    {bankBalance ? idr(difference) : "—"}
                  </p>
                  {bankBalance && difference === 0 && (
                    <p className="text-xs text-emerald-600 font-medium mt-0.5">✓ Balance</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Progress Rekonsiliasi
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-2xl font-bold">
                    {reconciled.size}<span className="text-base text-muted-foreground font-normal">/{rows.length}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">transaksi direkonsiliasi</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">Mutasi Buku Besar</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const all = new Set(rows.map((r) => r.id));
                        if (storageKey) saveReconciled(storageKey, all);
                        setReconciled(all);
                      }}
                    >
                      Centang Semua
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const empty = new Set<number>();
                        if (storageKey) saveReconciled(storageKey, empty);
                        setReconciled(empty);
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </div>

                {isLoading ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">Memuat data...</p>
                ) : rows.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    Tidak ada mutasi untuk akun dan periode ini
                  </p>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>No. Entry</TableHead>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Sumber</TableHead>
                          <TableHead>Referensi</TableHead>
                          <TableHead>Deskripsi</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Kredit</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((line) => {
                          const isRec = reconciled.has(line.id);
                          return (
                            <TableRow
                              key={line.id}
                              className={isRec ? "bg-emerald-50/60" : ""}
                            >
                              <TableCell>
                                <button
                                  onClick={() => toggleReconcile(line.id)}
                                  className="text-muted-foreground hover:text-emerald-600 transition-colors"
                                  aria-label="Toggle reconcile"
                                >
                                  {isRec ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                  ) : (
                                    <Circle className="h-5 w-5" />
                                  )}
                                </button>
                              </TableCell>
                              <TableCell className="font-mono text-xs font-semibold">
                                {line.entryNumber}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {new Date(line.entryDate).toLocaleDateString("id-ID")}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">{line.entrySource}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {line.ref ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs max-w-[180px] truncate">
                                {line.description ?? "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {line.debit > 0 && (
                                  <span className="text-blue-700 font-semibold">{idr(line.debit)}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {line.credit > 0 && (
                                  <span className="text-emerald-700 font-semibold">{idr(line.credit)}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {isRec ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                                    ✓ Reconciled
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">
                                    Pending
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="font-bold bg-muted/30 border-t-2">
                          <TableCell colSpan={6} className="text-right text-sm">
                            Total
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-700">
                            {idr(totalDebit)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-emerald-700">
                            {idr(totalCredit)}
                          </TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                        {reconciledRows.length > 0 && (
                          <TableRow className="bg-emerald-50/40">
                            <TableCell colSpan={6} className="text-right text-xs text-emerald-700 font-medium">
                              Reconciled ({reconciledRows.length})
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-emerald-700">
                              {idr(reconciledDebit)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-emerald-700">
                              {idr(reconciledCredit)}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}
                        {unreconciledRows.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-right text-xs text-muted-foreground font-medium">
                              Unreconciled ({unreconciledRows.length})
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {idr(unreconciledRows.reduce((s, l) => s + l.debit, 0))}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {idr(unreconciledRows.reduce((s, l) => s + l.credit, 0))}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!accountId && (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <GitMerge className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Pilih akun untuk memulai rekonsiliasi</p>
              <p className="text-sm mt-1">Pilih akun Bank/Kas di atas, lalu atur periode</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
