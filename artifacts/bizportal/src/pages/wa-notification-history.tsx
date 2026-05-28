import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Search,
  X,
  MessageCircle,
  Mail,
  CheckCircle2,
  XCircle,
  Copy,
  ChevronLeft,
  ChevronRight,
  Eye,
  Send,
  TrendingDown,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
const PAGE_SIZE = 50;

interface NotifLog {
  id: number;
  channel: "wa" | "email";
  recipient: string;
  subject: string | null;
  status: "sent" | "failed" | "deduped";
  context: string | null;
  refType: string | null;
  refId: string | null;
  errorMsg: string | null;
  createdAt: string;
}

interface NotifLogFull extends NotifLog {
  message: string | null;
}

interface LogsResponse {
  total: number;
  limit: number;
  offset: number;
  rows: NotifLog[];
}

interface NotifStats {
  waSent: number;
  waFailed: number;
  waDeduped: number;
  emailSent: number;
  emailFailed: number;
}

interface StatsResponse {
  allTime: NotifStats;
  today: NotifStats;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  sent:    { label: "Terkirim",  cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: <CheckCircle2 className="h-3 w-3" /> },
  failed:  { label: "Gagal",    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",                 icon: <XCircle className="h-3 w-3" />    },
  deduped: { label: "Dilewati", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",     icon: <Copy className="h-3 w-3" />       },
};

const CHANNEL_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  wa:    { label: "WhatsApp", icon: <MessageCircle className="h-3.5 w-3.5 text-green-600" /> },
  email: { label: "Email",    icon: <Mail className="h-3.5 w-3.5 text-blue-600" />           },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

async function fetchLogs(params: URLSearchParams): Promise<LogsResponse> {
  const res = await fetch(`${BASE_URL}/api/whatsapp/notification-logs?${params.toString()}`);
  if (!res.ok) throw new Error("Gagal memuat log notifikasi");
  return res.json();
}

async function fetchLogDetail(id: number): Promise<NotifLogFull> {
  const res = await fetch(`${BASE_URL}/api/whatsapp/notification-logs/${id}`);
  if (!res.ok) throw new Error("Log tidak ditemukan");
  return res.json();
}

export default function WaNotificationHistoryPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [channel, setChannel]     = useState<string>("__all__");
  const [status, setStatus]       = useState<string>("__all__");
  const [context, setContext]     = useState("");
  const [refId, setRefId]         = useState("");
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");
  const [offset, setOffset]       = useState(0);
  const [detail, setDetail]       = useState<NotifLogFull | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["notif-stats"],
    queryFn: async () => {
      const r = await fetch(`${BASE_URL}/api/whatsapp/notification-logs/stats`);
      if (!r.ok) throw new Error("Gagal memuat stats");
      return r.json();
    },
    staleTime: 60_000,
  });

  const params = useCallback(() => {
    const p = new URLSearchParams();
    if (channel !== "__all__") p.set("channel", channel);
    if (status  !== "__all__") p.set("status",  status);
    if (context.trim())        p.set("context", context.trim());
    if (refId.trim())          p.set("refId",   refId.trim());
    if (from)                  p.set("from",    from);
    if (to)                    p.set("to",      to);
    p.set("limit",  String(PAGE_SIZE));
    p.set("offset", String(offset));
    return p;
  }, [channel, status, context, refId, from, to, offset]);

  const { data, isLoading, isFetching, refetch } = useQuery<LogsResponse>({
    queryKey: ["notif-logs", channel, status, context, refId, from, to, offset],
    queryFn: () => fetchLogs(params()),
    staleTime: 30_000,
  });

  function resetFilters() {
    setChannel("__all__"); setStatus("__all__");
    setContext(""); setRefId(""); setFrom(""); setTo(""); setOffset(0);
  }

  async function openDetail(id: number) {
    setLoadingDetail(true);
    try {
      const row = await fetchLogDetail(id);
      setDetail(row);
    } catch {
      toast({ title: "Gagal memuat detail", variant: "destructive" });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function resend(row: NotifLog) {
    if (row.channel !== "wa") {
      toast({ title: "Resend hanya tersedia untuk channel WA", variant: "destructive" });
      return;
    }
    if (!detail?.message) {
      toast({ title: "Buka detail terlebih dahulu untuk resend", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/api/whatsapp/send-quotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: row.recipient,
          message: detail.message,
          context: row.context ?? undefined,
          refType: row.refType ?? undefined,
          refId:   row.refId   ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("Gagal");
      toast({ title: "Pesan dikirim ulang" });
      qc.invalidateQueries({ queryKey: ["notif-logs"] });
      setDetail(null);
    } catch {
      toast({ title: "Gagal kirim ulang", variant: "destructive" });
    }
  }

  const total  = data?.total ?? 0;
  const rows   = data?.rows  ?? [];
  const pages  = Math.ceil(total / PAGE_SIZE);
  const curPage = Math.floor(offset / PAGE_SIZE) + 1;

  const hasFilters = channel !== "__all__" || status !== "__all__" ||
    context.trim() || refId.trim() || from || to;

  const todayWaSuccessRate = stats
    ? stats.today.waSent + stats.today.waFailed > 0
      ? Math.round((stats.today.waSent / (stats.today.waSent + stats.today.waFailed)) * 100)
      : 100
    : null;

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">Riwayat Notifikasi</h1>
            <p className="text-sm text-muted-foreground">Log pengiriman WA & email — terkirim, gagal, dan duplikat</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs text-muted-foreground">WA Hari Ini</span>
              </div>
              <p className="text-2xl font-bold text-green-700">{stats?.today.waSent ?? "—"}</p>
              {stats && stats.today.waFailed > 0 && (
                <p className="text-xs text-red-500 flex items-center gap-0.5 mt-0.5">
                  <TrendingDown className="h-3 w-3" /> {stats.today.waFailed} gagal
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs text-muted-foreground">Success Rate WA</span>
              </div>
              <p className={`text-2xl font-bold ${todayWaSuccessRate !== null && todayWaSuccessRate < 80 ? "text-red-600" : "text-blue-700"}`}>
                {todayWaSuccessRate !== null ? `${todayWaSuccessRate}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">dari {(stats?.today.waSent ?? 0) + (stats?.today.waFailed ?? 0)} terkirim</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Mail className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs text-muted-foreground">Email Hari Ini</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{stats?.today.emailSent ?? "—"}</p>
              {stats && stats.today.emailFailed > 0 && (
                <p className="text-xs text-red-500 flex items-center gap-0.5 mt-0.5">
                  <TrendingDown className="h-3 w-3" /> {stats.today.emailFailed} gagal
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Copy className="h-3.5 w-3.5 text-yellow-600" />
                <span className="text-xs text-muted-foreground">All-Time WA</span>
              </div>
              <p className="text-2xl font-bold">{((stats?.allTime.waSent ?? 0) + (stats?.allTime.waFailed ?? 0)).toLocaleString("id-ID")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stats?.allTime.waDeduped ?? 0} dilewati (dedup)</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {/* Channel */}
              <Select value={channel} onValueChange={(v) => { setChannel(v); setOffset(0); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua channel</SelectItem>
                  <SelectItem value="wa">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>

              {/* Status */}
              <Select value={status} onValueChange={(v) => { setStatus(v); setOffset(0); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua status</SelectItem>
                  <SelectItem value="sent">Terkirim</SelectItem>
                  <SelectItem value="failed">Gagal</SelectItem>
                  <SelectItem value="deduped">Dilewati (dedup)</SelectItem>
                </SelectContent>
              </Select>

              {/* Context */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-6"
                  placeholder="Context..."
                  value={context}
                  onChange={(e) => { setContext(e.target.value); setOffset(0); }}
                />
              </div>

              {/* Ref ID */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-6"
                  placeholder="Ref ID..."
                  value={refId}
                  onChange={(e) => { setRefId(e.target.value); setOffset(0); }}
                />
              </div>

              {/* From */}
              <Input
                type="date"
                className="h-8 text-xs"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setOffset(0); }}
              />

              {/* To */}
              <div className="flex gap-1">
                <Input
                  type="date"
                  className="h-8 text-xs flex-1"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setOffset(0); }}
                />
                {hasFilters && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={resetFilters}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isLoading ? "Memuat…" : `${total.toLocaleString("id-ID")} log ditemukan`}
            </CardTitle>
            {pages > 1 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                Hal {curPage} / {pages}
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-center">#</TableHead>
                    <TableHead className="w-20">Channel</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Penerima</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Ref ID</TableHead>
                    <TableHead className="w-36">Waktu</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))}

                  {!isLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                        Tidak ada log ditemukan
                      </TableCell>
                    </TableRow>
                  )}

                  {!isLoading && rows.map((row) => {
                    const st = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.sent;
                    const ch = CHANNEL_CONFIG[row.channel] ?? CHANNEL_CONFIG.wa;
                    return (
                      <TableRow key={row.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(row.id)}>
                        <TableCell className="text-center text-xs text-muted-foreground">{row.id}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5 text-xs font-medium">
                            {ch.icon} {ch.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`gap-1 text-xs font-medium border-0 ${st.cls}`}>
                            {st.icon} {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono max-w-[140px] truncate" title={row.recipient}>
                          {row.recipient}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={row.context ?? ""}>
                          {row.context ?? <span className="italic opacity-50">—</span>}
                        </TableCell>
                        <TableCell className="text-xs font-mono max-w-[120px] truncate" title={row.refId ?? ""}>
                          {row.refId ?? <span className="italic opacity-50">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {fmt(row.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); openDetail(row.id); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Pagination (bottom) */}
        {pages > 1 && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Sebelumnya
            </Button>
            <span className="flex items-center text-sm text-muted-foreground px-2">
              Hal {curPage} / {pages}
            </span>
            <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}>
              Berikutnya <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detail || loadingDetail} onOpenChange={(v) => { if (!v) setDetail(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Detail Notifikasi #{detail?.id}</DialogTitle>
          </DialogHeader>

          {loadingDetail && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          )}

          {detail && !loadingDetail && (
            <div className="space-y-3 text-sm">
              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs bg-muted/40 rounded-lg p-3">
                <div className="text-muted-foreground">Channel</div>
                <div className="font-medium capitalize">{detail.channel}</div>

                <div className="text-muted-foreground">Status</div>
                <div>
                  <Badge className={`gap-1 text-xs border-0 ${STATUS_CONFIG[detail.status]?.cls}`}>
                    {STATUS_CONFIG[detail.status]?.icon} {STATUS_CONFIG[detail.status]?.label}
                  </Badge>
                </div>

                <div className="text-muted-foreground">Penerima</div>
                <div className="font-mono break-all">{detail.recipient}</div>

                {detail.subject && <>
                  <div className="text-muted-foreground">Subjek</div>
                  <div>{detail.subject}</div>
                </>}

                <div className="text-muted-foreground">Context</div>
                <div className="font-mono">{detail.context ?? <span className="italic text-muted-foreground">—</span>}</div>

                <div className="text-muted-foreground">Ref Type</div>
                <div className="font-mono">{detail.refType ?? <span className="italic text-muted-foreground">—</span>}</div>

                <div className="text-muted-foreground">Ref ID</div>
                <div className="font-mono">{detail.refId ?? <span className="italic text-muted-foreground">—</span>}</div>

                <div className="text-muted-foreground">Waktu</div>
                <div>{fmt(detail.createdAt)}</div>

                {detail.errorMsg && <>
                  <div className="text-muted-foreground">Keterangan</div>
                  <div className="text-red-600 dark:text-red-400 break-all">{detail.errorMsg}</div>
                </>}
              </div>

              {/* Message body */}
              {detail.message && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Isi Pesan</p>
                  <pre className="text-xs whitespace-pre-wrap break-words bg-muted/40 rounded-lg p-3 max-h-60 overflow-y-auto font-sans">
                    {detail.message}
                  </pre>
                </div>
              )}

              {/* Resend button — only for failed WA */}
              {detail.status === "failed" && detail.channel === "wa" && detail.message && (
                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={() => resend(detail)}>
                    <Send className="h-3.5 w-3.5 mr-1.5" /> Kirim Ulang
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
