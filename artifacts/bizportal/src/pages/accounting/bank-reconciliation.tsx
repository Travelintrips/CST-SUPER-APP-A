import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight, Search, Filter, Trash2, Info,
} from "lucide-react";

const idr = (n: number | string) =>
  new Intl.NumberFormat("id-ID").format(Number(n) || 0);

const fmtDate = (d: string) => {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("id-ID"); } catch { return d; }
};

type MutationStatus = "unmatched" | "matched" | "duplicate_need_review" | "approved" | "rejected";

interface Candidate {
  id: number;
  mutation_id: number;
  candidate_type: string;
  candidate_id: number;
  match_score: number;
  match_reason: string;
  amount_match: boolean;
  date_match: boolean;
  name_match: boolean;
  order_id_match: boolean;
  proof_match: boolean;
  status: string;
}

interface BankMutation {
  id: number;
  transaction_date: string;
  description: string;
  credit_amount: string;
  debit_amount: string;
  amount: string;
  direction: "IN" | "OUT";
  mutation_key: string;
  normalized_description: string;
  provider_name: string | null;
  provider_order_id: string | null;
  status: MutationStatus;
  matched_payment_id: number | null;
  matched_order_id: number | null;
  candidates: Candidate[] | null;
}

const STATUS_COLORS: Record<MutationStatus | string, string> = {
  unmatched:             "bg-yellow-100 text-yellow-800 border-yellow-200",
  matched:               "bg-blue-100 text-blue-800 border-blue-200",
  duplicate_need_review: "bg-orange-100 text-orange-800 border-orange-200",
  approved:              "bg-green-100 text-green-800 border-green-200",
  rejected:              "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  unmatched:             "Unmatched",
  matched:               "Match Ditemukan",
  duplicate_need_review: "Duplikat - Review",
  approved:              "Approved",
  rejected:              "Rejected",
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 95 ? "bg-green-500" : score >= 80 ? "bg-blue-500" : score >= 60 ? "bg-yellow-500" : "bg-red-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-white text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}

export default function BankReconciliationPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus]     = useState("all");
  const [filterDir, setFilterDir]           = useState("all");
  const [filterProvider, setFilterProvider] = useState("all");
  const [filterFrom, setFilterFrom]         = useState("");
  const [filterTo, setFilterTo]             = useState("");
  const [filterSearch, setFilterSearch]     = useState("");
  const [page, setPage]                     = useState(0);
  const PAGE_SIZE = 50;

  // ── Expand rows ────────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Approve/Reject dialog ──────────────────────────────────────────────────
  const [actionDialog, setActionDialog] = useState<{ mutation: BankMutation; mode: "approve" | "reject" } | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);

  // ── Query: mutations ───────────────────────────────────────────────────────
  const queryKey = ["bank-reconciliation", filterStatus, filterDir, filterProvider, filterFrom, filterTo, filterSearch, page];
  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (filterStatus !== "all")   params.set("status", filterStatus);
      if (filterDir !== "all")      params.set("direction", filterDir);
      if (filterProvider !== "all") params.set("provider", filterProvider);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo)   params.set("to", filterTo);
      if (filterSearch) params.set("search", filterSearch);
      const r = await fetch(`/api/bank-reconciliation/mutations?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ mutations: BankMutation[]; total: number }>;
    },
  });

  // ── Query: summary ─────────────────────────────────────────────────────────
  const { data: summary } = useQuery({
    queryKey: ["bank-reconciliation-summary"],
    queryFn: async () => {
      const r = await fetch("/api/bank-reconciliation/summary", { credentials: "include" });
      return r.json() as Promise<{ summary: { status: string; count: string; total_amount: string }[] }>;
    },
  });

  // ── Mutation: import file ──────────────────────────────────────────────────
  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/bank-reconciliation/import", { method: "POST", credentials: "include", body: fd });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (d) => {
      toast({ title: `Import selesai: ${d.imported} baris, ${d.duplicates} duplikat` });
      qc.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["bank-reconciliation-summary"] });
    },
    onError: (e: Error) => toast({ title: "Gagal import", description: e.message, variant: "destructive" }),
  });

  // ── Mutation: run matching ─────────────────────────────────────────────────
  const matchMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/bank-reconciliation/run-matching", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (d) => {
      toast({ title: `Matching selesai: ${d.processed} mutasi diproses` });
      qc.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["bank-reconciliation-summary"] });
    },
    onError: (e: Error) => toast({ title: "Gagal matching", description: e.message, variant: "destructive" }),
  });

  // ── Mutation: approve ──────────────────────────────────────────────────────
  const approveMut = useMutation({
    mutationFn: async ({ mutId, matchId, candidateType, candidateId }: { mutId: number; matchId?: number; candidateType?: string; candidateId?: number }) => {
      const r = await fetch(`/api/bank-reconciliation/${mutId}/approve`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, candidate_type: candidateType, candidate_id: candidateId }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Approved" });
      setActionDialog(null);
      qc.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["bank-reconciliation-summary"] });
    },
    onError: (e: Error) => toast({ title: "Gagal approve", description: e.message, variant: "destructive" }),
  });

  // ── Mutation: reject ───────────────────────────────────────────────────────
  const rejectMut = useMutation({
    mutationFn: async (mutId: number) => {
      const r = await fetch(`/api/bank-reconciliation/${mutId}/reject`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected" });
      setActionDialog(null);
      qc.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["bank-reconciliation-summary"] });
    },
    onError: (e: Error) => toast({ title: "Gagal reject", description: e.message, variant: "destructive" }),
  });

  // ── Mutation: delete ───────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: async (mutId: number) => {
      const r = await fetch(`/api/bank-reconciliation/${mutId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Mutasi dihapus" });
      qc.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["bank-reconciliation-summary"] });
    },
    onError: (e: Error) => toast({ title: "Gagal hapus", description: e.message, variant: "destructive" }),
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importMut.mutate(file);
    e.target.value = "";
  }, [importMut]);

  const mutations = data?.mutations ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const summaryMap: Record<string, { count: number; amount: number }> = {};
  for (const s of summary?.summary ?? []) {
    summaryMap[s.status] = { count: Number(s.count), amount: Number(s.total_amount) };
  }

  // ── Dialog: approve/reject ─────────────────────────────────────────────────
  const handleOpenApprove = (m: BankMutation) => {
    setSelectedCandidateId(null);
    setActionDialog({ mutation: m, mode: "approve" });
  };
  const handleOpenReject = (m: BankMutation) => setActionDialog({ mutation: m, mode: "reject" });

  const handleConfirmApprove = () => {
    if (!actionDialog) return;
    const m = actionDialog.mutation;
    const cands = m.candidates ?? [];
    const chosen = cands.find((c) => c.id === selectedCandidateId);
    approveMut.mutate({
      mutId: m.id,
      matchId: chosen?.id,
      candidateType: chosen?.candidate_type,
      candidateId: chosen?.candidate_id,
    });
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Rekonsiliasi Bank</h1>
            <p className="text-sm text-muted-foreground">Cocokkan mutasi rekening dengan transaksi di sistem</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <label>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
              <Button variant="outline" size="sm" asChild>
                <span className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  {importMut.isPending ? "Importing..." : "Import Excel / CSV"}
                </span>
              </Button>
            </label>
            <Button size="sm" onClick={() => matchMut.mutate()} disabled={matchMut.isPending}>
              <Play className="w-4 h-4 mr-2" />
              {matchMut.isPending ? "Mencocokkan..." : "Run Matching"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { key: "unmatched",             label: "Unmatched",      icon: AlertTriangle, color: "text-yellow-600" },
            { key: "matched",               label: "Match Ditemukan", icon: Info,          color: "text-blue-600"   },
            { key: "duplicate_need_review", label: "Duplikat",        icon: AlertTriangle, color: "text-orange-600" },
            { key: "approved",              label: "Approved",        icon: CheckCircle2,  color: "text-green-600"  },
            { key: "rejected",              label: "Rejected",        icon: XCircle,       color: "text-red-500"    },
          ].map(({ key, label, icon: Icon, color }) => (
            <Card
              key={key}
              className={`cursor-pointer transition-all hover:shadow-md ${filterStatus === key ? "ring-2 ring-primary" : ""}`}
              onClick={() => { setFilterStatus((prev) => prev === key ? "all" : key); setPage(0); }}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <div className="text-2xl font-bold">{summaryMap[key]?.count ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Rp {idr(summaryMap[key]?.amount ?? 0)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari keterangan, mutation key, order ID..."
                    className="pl-9"
                    value={filterSearch}
                    onChange={(e) => { setFilterSearch(e.target.value); setPage(0); }}
                  />
                </div>
              </div>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(0); }}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="unmatched">Unmatched</SelectItem>
                  <SelectItem value="matched">Matched</SelectItem>
                  <SelectItem value="duplicate_need_review">Duplikat</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterDir} onValueChange={(v) => { setFilterDir(v); setPage(0); }}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="Arah" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Arah</SelectItem>
                  <SelectItem value="IN">IN (Masuk)</SelectItem>
                  <SelectItem value="OUT">OUT (Keluar)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterProvider} onValueChange={(v) => { setFilterProvider(v); setPage(0); }}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Provider" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Provider</SelectItem>
                  <SelectItem value="GOPAY">GoPay / DAB</SelectItem>
                  <SelectItem value="OVO">OVO</SelectItem>
                  <SelectItem value="DANA">DANA</SelectItem>
                  <SelectItem value="QRIS">QRIS</SelectItem>
                  <SelectItem value="SHOPEEPAY">ShopeePay</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input type="date" className="w-[140px]" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setPage(0); }} placeholder="Dari" />
                <span className="text-muted-foreground text-sm">–</span>
                <Input type="date" className="w-[140px]" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setPage(0); }} placeholder="Sampai" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("all"); setFilterDir("all"); setFilterProvider("all"); setFilterFrom(""); setFilterTo(""); setFilterSearch(""); setPage(0); }}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">Memuat data...</div>
            ) : mutations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Filter className="w-10 h-10 opacity-30" />
                <p>Tidak ada data. Import mutasi bank terlebih dahulu.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Keterangan</TableHead>
                      <TableHead className="text-right">Kredit</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead>Arah</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Mutation Key</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kandidat</TableHead>
                      <TableHead>Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mutations.map((m) => {
                      const cands = m.candidates ?? [];
                      const bestCandidate = cands[0];
                      const isExpanded = expanded.has(m.id);
                      return (
                        <>
                          <TableRow key={m.id} className="group hover:bg-muted/30">
                            <TableCell>
                              {cands.length > 0 && (
                                <button onClick={() => toggleExpand(m.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{fmtDate(m.transaction_date)}</TableCell>
                            <TableCell className="max-w-[240px]">
                              <div className="truncate text-sm" title={m.description}>{m.description}</div>
                              {m.provider_order_id && (
                                <div className="text-xs text-muted-foreground font-mono mt-0.5">{m.provider_order_id}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm text-green-700 font-medium">
                              {Number(m.credit_amount) > 0 ? idr(m.credit_amount) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm text-red-600 font-medium">
                              {Number(m.debit_amount) > 0 ? idr(m.debit_amount) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={m.direction === "IN" ? "text-green-700 border-green-300" : "text-red-600 border-red-300"}>
                                {m.direction}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {m.provider_name ? <Badge variant="secondary" className="text-xs">{m.provider_name}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs text-muted-foreground">{m.mutation_key}</span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[m.status] ?? ""}`}>
                                {STATUS_LABELS[m.status] ?? m.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              {cands.length > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <ScoreBadge score={bestCandidate.match_score} />
                                  <span className="text-xs text-muted-foreground">{bestCandidate.candidate_type}</span>
                                  {cands.length > 1 && <span className="text-xs text-muted-foreground">+{cands.length - 1}</span>}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {m.status !== "approved" && m.status !== "rejected" && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleOpenApprove(m)} title="Approve">
                                      <CheckCircle2 className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleOpenReject(m)} title="Reject">
                                      <XCircle className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm("Hapus mutasi ini?")) deleteMut.mutate(m.id); }} title="Hapus">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Expanded: show all candidates */}
                          {isExpanded && cands.map((c) => (
                            <TableRow key={`${m.id}-cand-${c.id}`} className="bg-muted/20 border-l-4 border-l-primary/30">
                              <TableCell />
                              <TableCell colSpan={3}>
                                <div className="flex items-center gap-2 text-sm py-1">
                                  <Badge variant="outline" className="text-xs capitalize">{c.candidate_type} #{c.candidate_id}</Badge>
                                  <ScoreBadge score={c.match_score} />
                                  <span className="text-muted-foreground text-xs">{c.match_reason}</span>
                                </div>
                              </TableCell>
                              <TableCell colSpan={5}>
                                <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
                                  {c.amount_match   && <span className="text-green-600">✓ Nominal</span>}
                                  {c.date_match     && <span className="text-green-600">✓ Tanggal</span>}
                                  {c.name_match     && <span className="text-green-600">✓ Nama</span>}
                                  {c.order_id_match && <span className="text-green-600">✓ Order ID</span>}
                                  {c.proof_match    && <span className="text-green-600">✓ Bukti</span>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs capitalize">{c.status}</Badge>
                              </TableCell>
                              <TableCell>
                                {c.status === "candidate" && m.status !== "approved" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => approveMut.mutate({ mutId: m.id, matchId: c.id, candidateType: c.candidate_type, candidateId: c.candidate_id })}
                                  >
                                    Pilih ini
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Total: {total} mutasi</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <span className="flex items-center px-2">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Approve Dialog */}
      <Dialog open={actionDialog?.mode === "approve"} onOpenChange={(o) => !o && setActionDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve Mutasi</DialogTitle>
          </DialogHeader>
          {actionDialog && (
            <div className="space-y-4">
              <div className="text-sm bg-muted rounded p-3 space-y-1">
                <div className="font-medium">{actionDialog.mutation.description}</div>
                <div className="text-muted-foreground">
                  {fmtDate(actionDialog.mutation.transaction_date)} · Rp {idr(actionDialog.mutation.amount)} · {actionDialog.mutation.direction}
                </div>
                <div className="font-mono text-xs text-muted-foreground">{actionDialog.mutation.mutation_key}</div>
              </div>

              {(actionDialog.mutation.candidates ?? []).length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Pilih kandidat yang cocok:</div>
                  {(actionDialog.mutation.candidates ?? []).map((c) => (
                    <div
                      key={c.id}
                      className={`border rounded p-3 cursor-pointer transition-all ${selectedCandidateId === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                      onClick={() => setSelectedCandidateId(c.id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium capitalize">{c.candidate_type} #{c.candidate_id}</span>
                        <ScoreBadge score={c.match_score} />
                      </div>
                      <div className="text-xs text-muted-foreground">{c.match_reason}</div>
                      <div className="flex gap-2 mt-1 text-xs flex-wrap">
                        {c.amount_match   && <span className="text-green-600">✓ Nominal</span>}
                        {c.date_match     && <span className="text-green-600">✓ Tanggal</span>}
                        {c.name_match     && <span className="text-green-600">✓ Nama</span>}
                        {c.order_id_match && <span className="text-green-600">✓ Order ID</span>}
                        {c.proof_match    && <span className="text-green-600">✓ Bukti</span>}
                      </div>
                    </div>
                  ))}
                  <Separator />
                  <div
                    className={`border rounded p-3 cursor-pointer transition-all ${selectedCandidateId === -1 ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                    onClick={() => setSelectedCandidateId(-1)}
                  >
                    <span className="text-sm text-muted-foreground">Approve tanpa pilih kandidat (manual)</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 rounded p-3">
                  Tidak ada kandidat. Mutasi akan di-approve tanpa cocokkan ke transaksi.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Batal</Button>
            <Button
              onClick={handleConfirmApprove}
              disabled={approveMut.isPending || ((actionDialog?.mutation.candidates ?? []).length > 0 && selectedCandidateId === null)}
            >
              {approveMut.isPending ? "Menyimpan..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={actionDialog?.mode === "reject"} onOpenChange={(o) => !o && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Mutasi</DialogTitle>
          </DialogHeader>
          {actionDialog && (
            <div className="text-sm bg-muted rounded p-3 space-y-1">
              <div className="font-medium">{actionDialog.mutation.description}</div>
              <div className="text-muted-foreground">
                {fmtDate(actionDialog.mutation.transaction_date)} · Rp {idr(actionDialog.mutation.amount)} · {actionDialog.mutation.direction}
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">Mutasi ini akan ditandai sebagai Rejected. Semua kandidat match akan diabaikan.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => actionDialog && rejectMut.mutate(actionDialog.mutation.id)} disabled={rejectMut.isPending}>
              {rejectMut.isPending ? "Menyimpan..." : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
