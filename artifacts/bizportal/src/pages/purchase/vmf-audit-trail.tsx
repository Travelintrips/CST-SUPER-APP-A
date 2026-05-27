import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ClipboardList, Search, Download, ChevronDown, ChevronRight,
  Link2, Send, FileCheck, Wrench, CheckCircle, XCircle,
  Clock, AlertCircle,
} from "lucide-react";

const BASE = "/api";

async function apiFetch(url: string) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── Action config ─────────────────────────────────────────────────────────────

type ActionConfig = {
  label: string;
  color: string;
  icon: React.ElementType;
  critical?: boolean;
};

const ACTION_CONFIG: Record<string, ActionConfig> = {
  link_generated:  { label: "Link Generated",    color: "bg-blue-100 text-blue-800 border-blue-200",      icon: Link2,       critical: true },
  approval_sent:   { label: "Approval Sent",      color: "bg-violet-100 text-violet-800 border-violet-200", icon: Send,        critical: true },
  so_created:      { label: "SO Created",         color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: FileCheck, critical: true },
  op_confirm_sent: { label: "Op-Confirm Sent",    color: "bg-orange-100 text-orange-800 border-orange-200", icon: Wrench,      critical: true },
  created:         { label: "Created",            color: "bg-sky-100 text-sky-800 border-sky-200",          icon: Clock },
  submitted:       { label: "Submitted",          color: "bg-teal-100 text-teal-800 border-teal-200",       icon: Send },
  resubmitted:     { label: "Resubmitted",        color: "bg-cyan-100 text-cyan-800 border-cyan-200",       icon: Send },
  selected:        { label: "Selected",           color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: CheckCircle },
  approved:        { label: "Approved",           color: "bg-green-100 text-green-800 border-green-200",    icon: CheckCircle },
  rejected:        { label: "Rejected",           color: "bg-red-100 text-red-800 border-red-200",          icon: XCircle },
  op_submitted:    { label: "Op Submitted",       color: "bg-amber-100 text-amber-800 border-amber-200",    icon: Wrench },
  sent_wa:         { label: "WA Sent",            color: "bg-green-50 text-green-700 border-green-100",     icon: Send },
  revision_requested: { label: "Revision",        color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: AlertCircle },
  deleted:         { label: "Deleted",            color: "bg-red-50 text-red-700 border-red-100",           icon: XCircle },
  price_updated:   { label: "Price Updated",      color: "bg-gray-100 text-gray-700 border-gray-200",       icon: Clock },
  bulk_deactivated:{ label: "Bulk Deactivated",   color: "bg-gray-100 text-gray-600 border-gray-200",       icon: Clock },
};

const ENTITY_LABELS: Record<string, string> = {
  link: "Vendor Link",
  submission: "Submission",
  customer_approval: "Customer Approval",
  op_confirm: "Op-Confirm",
  sales_order: "Sales Order",
};

const CRITICAL_ACTIONS = ["link_generated", "approval_sent", "so_created", "op_confirm_sent"];

// ── Components ────────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action] ?? { label: action, color: "bg-gray-100 text-gray-700 border-gray-200", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${cfg.color} ${cfg.critical ? "font-semibold" : ""}`}>
      <Icon size={11} />
      {cfg.label}
      {cfg.critical && <span className="ml-0.5 text-[9px] font-bold opacity-70">★</span>}
    </span>
  );
}

function EntityBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="text-xs font-normal">
      {ENTITY_LABELS[type] ?? type}
    </Badge>
  );
}

function DataCell({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  if (!data || (typeof data === "object" && Object.keys(data as object).length === 0)) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  const str = JSON.stringify(data, null, 2);
  const preview = str.length > 50 ? str.slice(0, 50) + "…" : str;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <code className="text-gray-500 text-[11px]">{!open && preview}</code>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 text-[11px] bg-gray-50 rounded p-2 max-h-36 overflow-auto border whitespace-pre-wrap">{str}</pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Timeline view for a single order ─────────────────────────────────────────

type LogRow = {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  actor: string | null;
  note: string | null;
  data: unknown;
  createdAt: string;
};

function OrderTimeline({ orderNumber, rows }: { orderNumber: string; rows: LogRow[] }) {
  const [open, setOpen] = useState(false);
  const criticalHit = CRITICAL_ACTIONS.filter(a => rows.some(r => r.action === a));
  const missingCritical = CRITICAL_ACTIONS.filter(a => !rows.some(r => r.action === a));
  const sorted = [...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-left"
      >
        {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
        <span className="font-mono text-sm font-semibold text-gray-800">{orderNumber}</span>
        <span className="text-xs text-gray-400">{rows.length} event</span>
        <div className="flex gap-1 flex-wrap">
          {criticalHit.map(a => {
            const cfg = ACTION_CONFIG[a];
            const Icon = cfg?.icon ?? Clock;
            return (
              <span key={a} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cfg?.color}`}>
                <Icon size={9} />{cfg?.label}
              </span>
            );
          })}
          {missingCritical.map(a => (
            <span key={a} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] text-gray-400 border-gray-200 bg-gray-50">
              <AlertCircle size={9} /> {ACTION_CONFIG[a]?.label ?? a}?
            </span>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-gray-400 shrink-0">
          {new Date(sorted[0]?.createdAt ?? "").toLocaleDateString("id-ID")}
        </span>
      </button>

      {open && (
        <div className="border-t bg-gray-50 px-4 py-3">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-gray-200" />
            <div className="space-y-3">
              {sorted.map((row, i) => {
                const cfg = ACTION_CONFIG[row.action] ?? { label: row.action, color: "bg-gray-100 text-gray-700", icon: Clock, critical: false };
                const Icon = cfg.icon;
                return (
                  <div key={row.id} className="relative flex gap-3">
                    <div className={`relative z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${cfg.critical ? "border-white shadow-sm bg-white" : "bg-white border-gray-200"}`}>
                      <Icon size={12} className={cfg.critical ? "text-blue-600" : "text-gray-400"} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ActionBadge action={row.action} />
                        <EntityBadge type={row.entityType} />
                        {row.entityId > 0 && <span className="text-[10px] text-gray-400 font-mono">ID:{row.entityId}</span>}
                        <span className="text-[10px] text-gray-400 ml-auto shrink-0">
                          {new Date(row.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" })}
                        </span>
                      </div>
                      {row.note && <p className="text-xs text-gray-600 mt-0.5">{row.note}</p>}
                      <div className="mt-1"><DataCell data={row.data} /></div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        actor: <span className="font-mono">{row.actor ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function CriticalStat({ action, count, total }: { action: string; count: number; total: number }) {
  const cfg = ACTION_CONFIG[action];
  const Icon = cfg?.icon ?? Clock;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gray-500" />
        <span className="text-xs text-gray-500">{cfg?.label ?? action}</span>
      </div>
      <div className="text-2xl font-bold">{count}</div>
      <div className="text-xs text-gray-400">{pct}% dari total</div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ENTITY_TYPES = ["", "link", "submission", "customer_approval", "op_confirm", "sales_order"];
const ALL_ACTIONS = [
  "", "link_generated", "approval_sent", "so_created", "op_confirm_sent",
  "created", "submitted", "resubmitted", "selected", "approved", "rejected",
  "op_submitted", "sent_wa", "revision_requested", "deleted", "price_updated",
];

export default function VmfAuditTrailPage() {
  const today = new Date().toISOString().split("T")[0]!;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [actor, setActor] = useState("");
  const [viewMode, setViewMode] = useState<"timeline" | "table">("timeline");
  const [page, setPage] = useState(0);
  const limit = 100;

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(page * limit),
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
    ...(orderNumber.trim() ? { orderNumber: orderNumber.trim() } : {}),
    ...(actor.trim() ? { actor: actor.trim() } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["vmf-audit-trail", entityType, action, orderNumber, actor, from, to, page],
    queryFn: () => apiFetch(`${BASE}/vendor-form/admin/activity-log?${params}`),
  });

  const rows: LogRow[] = data?.rows ?? [];
  const total: number = data?.total ?? 0;

  // Group by orderNumber for timeline view
  const grouped = new Map<string, LogRow[]>();
  for (const row of rows) {
    const key = (row.data as Record<string, unknown>)?.orderNumber as string | undefined ?? `entity:${row.entityType}#${row.entityId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  // Stats by critical action
  const actionCounts = CRITICAL_ACTIONS.map(a => ({
    action: a,
    count: rows.filter(r => r.action === a).length,
  }));

  function exportCsv() {
    if (!rows.length) return;
    const cols = ["id", "createdAt", "entityType", "entityId", "action", "actor", "note"];
    const header = cols.join(",");
    const body = rows.map(r =>
      cols.map(c => JSON.stringify((r as Record<string, unknown>)[c] ?? "")).join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vmf-audit-trail-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ClipboardList className="text-blue-600" size={22} />
        <h1 className="text-xl font-bold">Audit Trail VMF</h1>
        <span className="text-sm text-gray-500 ml-2">Rekam jejak alur Vendor Mini Form</span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm" variant={viewMode === "timeline" ? "default" : "outline"}
            onClick={() => setViewMode("timeline")}
          >Timeline</Button>
          <Button
            size="sm" variant={viewMode === "table" ? "default" : "outline"}
            onClick={() => setViewMode("table")}
          >Tabel</Button>
        </div>
      </div>

      {/* Critical steps legend */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 font-medium">4 Step Kritis:</span>
        {CRITICAL_ACTIONS.map(a => <ActionBadge key={a} action={a} />)}
        <span className="text-xs text-gray-400 ml-1">★ = step kritis tercatat</span>
        <span className="text-xs text-gray-400">? = step kritis belum tercatat di filter saat ini</span>
      </div>

      {/* Stats */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {actionCounts.map(({ action: a, count }) => (
            <CriticalStat key={a} action={a} count={count} total={rows.length} />
          ))}
        </div>
      )}

      {/* Filter */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">Filter</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs">Dari</Label>
              <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Sampai</Label>
              <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); }} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Tipe Entity</Label>
              <Select value={entityType || "_all"} onValueChange={v => { setEntityType(v === "_all" ? "" : v); setPage(0); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Semua" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Semua</SelectItem>
                  {ENTITY_TYPES.filter(Boolean).map(t => (
                    <SelectItem key={t} value={t}>{ENTITY_LABELS[t] ?? t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Aksi</Label>
              <Select value={action || "_all"} onValueChange={v => { setAction(v === "_all" ? "" : v); setPage(0); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Semua aksi" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Semua aksi</SelectItem>
                  {ALL_ACTIONS.filter(Boolean).map(a => (
                    <SelectItem key={a} value={a}>
                      {ACTION_CONFIG[a]?.label ?? a}
                      {CRITICAL_ACTIONS.includes(a) ? " ★" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">No. Order</Label>
              <Input
                value={orderNumber}
                onChange={e => { setOrderNumber(e.target.value); setPage(0); }}
                placeholder="ORD/2025/..."
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Actor</Label>
              <Input
                value={actor}
                onChange={e => { setActor(e.target.value); setPage(0); }}
                placeholder="admin / vendor / customer"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => refetch()} className="gap-1"><Search size={14} /> Cari</Button>
            <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1"><Download size={14} /> Export CSV</Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading / Error */}
      {isLoading && <div className="p-10 text-center text-gray-400 text-sm">Memuat data audit trail…</div>}
      {error && <div className="p-8 text-center text-red-500 text-sm">{String(error)}</div>}

      {!isLoading && !error && (
        <>
          <div className="text-xs text-gray-400 px-1">
            {total} entri ditemukan{page > 0 ? ` · halaman ${page + 1}` : ""}
          </div>

          {/* ── Timeline view ── */}
          {viewMode === "timeline" && (
            <div className="space-y-2">
              {grouped.size === 0 && (
                <div className="text-center text-gray-400 text-sm py-12 border rounded-lg bg-white">
                  Tidak ada data untuk filter ini
                </div>
              )}
              {[...grouped.entries()].map(([key, orderRows]) => (
                <OrderTimeline key={key} orderNumber={key} rows={orderRows} />
              ))}
            </div>
          )}

          {/* ── Table view ── */}
          {viewMode === "table" && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Aksi</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead>Entity ID</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Catatan</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-gray-400 text-sm py-10">
                            Tidak ada data untuk filter ini
                          </TableCell>
                        </TableRow>
                      )}
                      {rows.map(row => (
                        <TableRow
                          key={row.id}
                          className={`text-xs align-top ${CRITICAL_ACTIONS.includes(row.action) ? "bg-blue-50/40" : ""}`}
                        >
                          <TableCell className="text-gray-400 font-mono">{row.id}</TableCell>
                          <TableCell className="whitespace-nowrap text-gray-600">
                            {new Date(row.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "medium" })}
                          </TableCell>
                          <TableCell><ActionBadge action={row.action} /></TableCell>
                          <TableCell><EntityBadge type={row.entityType} /></TableCell>
                          <TableCell className="font-mono text-gray-500">{row.entityId || "—"}</TableCell>
                          <TableCell>
                            <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                              row.actor === "system" ? "bg-gray-100 text-gray-500"
                              : row.actor === "customer" ? "bg-purple-50 text-purple-700"
                              : row.actor === "vendor" ? "bg-teal-50 text-teal-700"
                              : "bg-blue-50 text-blue-700"
                            }`}>
                              {row.actor ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <p className="text-xs text-gray-600 leading-snug line-clamp-2">{row.note ?? "—"}</p>
                          </TableCell>
                          <TableCell className="min-w-[160px]">
                            <DataCell data={row.data} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pagination */}
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next →</Button>
          </div>
        </>
      )}
    </div>
  );
}
