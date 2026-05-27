import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert, RefreshCw, Bell } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface IntelligenceAlert {
  id: number;
  alertType: string;
  entityType: string;
  entityId?: number;
  entityRef?: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  status: "open" | "acknowledged" | "resolved";
  isRead: boolean;
  acknowledgedBy?: string;
  resolvedBy?: string;
  triggeredAt: string;
  createdAt: string;
}

interface AlertsResponse {
  alerts: IntelligenceAlert[];
  total: number;
}

interface AlertSummary {
  total: number;
  open: { critical: number; warning: number; info: number };
  acknowledged: { critical: number; warning: number; info: number };
}

const SEVERITY_CONFIG = {
  critical: { label: "Kritis", color: "destructive" as const, icon: ShieldAlert, bg: "bg-red-50 border-red-200" },
  warning:  { label: "Peringatan", color: "secondary" as const, icon: AlertTriangle, bg: "bg-yellow-50 border-yellow-200" },
  info:     { label: "Info", color: "outline" as const, icon: Bell, bg: "bg-blue-50 border-blue-200" },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  rfq_no_response:     "RFQ Tidak Ada Response",
  quote_expired:       "Quote Expired",
  order_eta_breach:    "ETA Terlewat",
  margin_below_minimum:"Margin Terlalu Kecil",
  missing_required_doc:"Dokumen Kurang",
  stage_stalled:       "Order Stuck",
  duplicate_order:     "Duplicate Order",
};

async function fetchAlerts(status: string): Promise<AlertsResponse> {
  const params = new URLSearchParams({ status, limit: "100" });
  const res = await fetch(`/api/intelligence-alerts?${params}`);
  if (!res.ok) throw new Error("Gagal memuat alerts");
  return res.json();
}

async function fetchSummary(): Promise<AlertSummary> {
  const res = await fetch("/api/intelligence-alerts/summary");
  if (!res.ok) throw new Error("Gagal memuat summary");
  return res.json();
}

async function acknowledgeAlert(id: number): Promise<void> {
  const res = await fetch(`/api/intelligence-alerts/${id}/acknowledge`, { method: "PUT" });
  if (!res.ok) throw new Error("Gagal acknowledge");
}

async function resolveAlert(id: number): Promise<void> {
  const res = await fetch(`/api/intelligence-alerts/${id}/resolve`, { method: "PUT" });
  if (!res.ok) throw new Error("Gagal resolve");
}

async function bulkAcknowledge(ids: number[]): Promise<void> {
  const res = await fetch("/api/intelligence-alerts/bulk-acknowledge", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Gagal bulk acknowledge");
}

function AlertCard({ alert, onAcknowledge, onResolve }: {
  alert: IntelligenceAlert;
  onAcknowledge: (id: number) => void;
  onResolve: (id: number) => void;
}) {
  const cfg = SEVERITY_CONFIG[alert.severity];
  const SeverityIcon = cfg.icon;
  const timeAgo = formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true, locale: idLocale });

  return (
    <div className={`rounded-lg border p-4 ${cfg.bg} space-y-2`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <SeverityIcon className={`h-4 w-4 mt-0.5 shrink-0 ${alert.severity === "critical" ? "text-red-600" : alert.severity === "warning" ? "text-yellow-600" : "text-blue-600"}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{alert.title}</span>
              <Badge variant={cfg.color} className="text-[10px] px-1.5 py-0">{cfg.label}</Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white">
                {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
            {alert.entityRef && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">Ref: {alert.entityRef}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo}</span>
          {alert.status === "open" && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-6 text-xs px-2 bg-white"
                onClick={() => onAcknowledge(alert.id)}>
                Ack
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-xs px-2 bg-white text-green-700 border-green-300"
                onClick={() => onResolve(alert.id)}>
                Resolve
              </Button>
            </div>
          )}
          {alert.status === "acknowledged" && (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="h-6 text-xs px-2 bg-white text-green-700 border-green-300"
                onClick={() => onResolve(alert.id)}>
                Resolve
              </Button>
            </div>
          )}
          {alert.status === "resolved" && (
            <span className="text-[11px] text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Resolved
            </span>
          )}
        </div>
      </div>
      {(alert.acknowledgedBy || alert.resolvedBy) && (
        <p className="text-[11px] text-muted-foreground/60 pl-7">
          {alert.resolvedBy ? `Resolved oleh: ${alert.resolvedBy}` : `Acknowledged oleh: ${alert.acknowledgedBy}`}
        </p>
      )}
    </div>
  );
}

export default function IntelligenceAlertsPage() {
  const [tab, setTab] = useState<"open" | "acknowledged" | "resolved">("open");
  const qc = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["intelligence-alerts-summary"],
    queryFn: fetchSummary,
    refetchInterval: 60_000,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["intelligence-alerts", tab],
    queryFn: () => fetchAlerts(tab),
    refetchInterval: 30_000,
  });

  const ackMut = useMutation({
    mutationFn: acknowledgeAlert,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["intelligence-alerts"] }); qc.invalidateQueries({ queryKey: ["intelligence-alerts-summary"] }); },
  });

  const resMut = useMutation({
    mutationFn: resolveAlert,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["intelligence-alerts"] }); qc.invalidateQueries({ queryKey: ["intelligence-alerts-summary"] }); },
  });

  const bulkAckMut = useMutation({
    mutationFn: bulkAcknowledge,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["intelligence-alerts"] }); qc.invalidateQueries({ queryKey: ["intelligence-alerts-summary"] }); },
  });

  const openAlerts = data?.alerts ?? [];
  const criticalCount = summary?.open.critical ?? 0;
  const warningCount = summary?.open.warning ?? 0;
  const totalOpen = criticalCount + warningCount + (summary?.open.info ?? 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Intelligence Alerts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoring otomatis untuk bottleneck operasional, RFQ, dan order.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-2">
                <ShieldAlert className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{criticalCount}</p>
                <p className="text-xs text-muted-foreground">Kritis (Open)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-yellow-100 p-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{warningCount}</p>
                <p className="text-xs text-muted-foreground">Peringatan (Open)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-gray-100 p-2">
                <Clock className="h-4 w-4 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalOpen}</p>
                <p className="text-xs text-muted-foreground">Total Open</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Daftar Alert</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="open">
                  Open {totalOpen > 0 && <span className="ml-1.5 rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5">{totalOpen}</span>}
                </TabsTrigger>
                <TabsTrigger value="acknowledged">Acknowledged</TabsTrigger>
                <TabsTrigger value="resolved">Resolved</TabsTrigger>
              </TabsList>
              {tab === "open" && openAlerts.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => bulkAckMut.mutate(openAlerts.map(a => a.id))}
                  disabled={bulkAckMut.isPending}
                >
                  Acknowledge Semua
                </Button>
              )}
            </div>

            {(["open", "acknowledged", "resolved"] as const).map(t => (
              <TabsContent key={t} value={t} className="space-y-2 mt-0">
                {isLoading && <p className="text-sm text-muted-foreground py-4 text-center">Memuat...</p>}
                {!isLoading && openAlerts.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-400" />
                    <p className="text-sm">Tidak ada alert {t === "open" ? "aktif" : t}.</p>
                  </div>
                )}
                {openAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledge={(id) => ackMut.mutate(id)}
                    onResolve={(id) => resMut.mutate(id)}
                  />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
