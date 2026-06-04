import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  Database,
  MessageCircle,
  Mail,
  Server,
  Activity,
  Wifi,
} from "lucide-react";
import { Link } from "wouter";

interface HealthResponse {
  status: "ok" | "degraded" | "error";
  uptimeSeconds: number;
  version: string;
  services: {
    db: "ok" | "error" | "unconfigured";
    whatsapp: "ok" | "error" | "unconfigured";
    whatsappLatencyMs: number | null;
    smtp: "ok" | "error" | "unconfigured";
    smtpLatencyMs: number | null;
  };
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}d`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}d`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}h ${h % 24}j`;
}

type StatusVal = "ok" | "error" | "unconfigured" | "loading";

function StatusBadge({ status }: { status: StatusVal }) {
  if (status === "loading") return <Badge variant="secondary" className="text-xs gap-1"><RefreshCw size={10} className="animate-spin" />Loading</Badge>;
  if (status === "ok") return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs gap-1"><CheckCircle2 size={10} />OK</Badge>;
  if (status === "error") return <Badge variant="destructive" className="text-xs gap-1"><XCircle size={10} />Error</Badge>;
  return <Badge variant="outline" className="text-xs gap-1 text-muted-foreground"><AlertCircle size={10} />Tidak dikonfigurasi</Badge>;
}

function LatencyChip({ ms }: { ms: number | null }) {
  if (ms === null) return null;
  const color = ms < 100 ? "text-emerald-400" : ms < 500 ? "text-yellow-400" : "text-red-400";
  return <span className={`text-xs font-mono ${color}`}>{ms}ms</span>;
}

function ServiceRow({
  icon: Icon,
  label,
  status,
  latencyMs,
  detail,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  status: StatusVal;
  latencyMs?: number | null;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0 border-border/50">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded bg-muted">
          <Icon size={15} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {latencyMs !== undefined && <LatencyChip ms={latencyMs ?? null} />}
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

async function fetchHealth(): Promise<HealthResponse> {
  const r = await fetch("/api/healthz", { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default function SystemHealthPage() {
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery<HealthResponse>({
    queryKey: ["system", "health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    retry: 1,
  });

  const overallStatus: StatusVal = isLoading ? "loading"
    : isError ? "error"
    : data?.status === "ok" ? "ok"
    : data?.status === "degraded" ? "unconfigured"
    : "error";

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "-";

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>

            <h1 className="text-2xl font-bold">Status Sistem</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kondisi real-time semua layanan BizPortal
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>

        {/* Overall Status Banner */}
        <Card className={
          overallStatus === "ok" ? "border-emerald-600/40 bg-emerald-950/20"
          : overallStatus === "error" ? "border-red-600/40 bg-red-950/20"
          : "border-yellow-600/40 bg-yellow-950/20"
        }>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              {overallStatus === "ok" && <CheckCircle2 size={36} className="text-emerald-400 shrink-0" />}
              {overallStatus === "error" && <XCircle size={36} className="text-red-400 shrink-0" />}
              {(overallStatus === "unconfigured" || overallStatus === "loading") && <AlertCircle size={36} className="text-yellow-400 shrink-0" />}
              <div>
                <p className="font-semibold text-lg">
                  {overallStatus === "ok" && "Semua Layanan Normal"}
                  {overallStatus === "error" && (isError ? "Gagal Memuat Status" : "Ada Layanan Bermasalah")}
                  {overallStatus === "unconfigured" && "Beberapa Layanan Tidak Dikonfigurasi"}
                  {overallStatus === "loading" && "Memuat status..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isError
                    ? String(error)
                    : `Diperbarui: ${lastUpdated} · Auto-refresh setiap 30 detik`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Cards */}
        {data && (
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Uptime</span>
                </div>
                <p className="text-2xl font-bold font-mono">{formatUptime(data.uptimeSeconds)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-2 mb-1">
                  <Server size={14} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Versi</span>
                </div>
                <p className="text-2xl font-bold font-mono">{data.version}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Services */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity size={16} />
              Layanan Internal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceRow
              icon={Server}
              label="API Server"
              status={isLoading ? "loading" : isError ? "error" : "ok"}
              detail="Express 5 · Port 8080"
              latencyMs={data?.services.db !== undefined ? undefined : undefined}
            />
            <ServiceRow
              icon={Wifi}
              label="Gateway"
              status={isLoading ? "loading" : isError ? "error" : "ok"}
              detail="Reverse proxy · Port 5000"
            />
            <ServiceRow
              icon={Server}
              label="BizPortal"
              status={isLoading ? "loading" : isError ? "error" : "ok"}
              detail="Vite · Port 18442"
            />
            <ServiceRow
              icon={Server}
              label="Customer Portal"
              status={isLoading ? "loading" : isError ? "error" : "ok"}
              detail="Vite · Port 5174"
            />
          </CardContent>
        </Card>

        {/* External Dependencies */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi size={16} />
              Dependensi Eksternal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceRow
              icon={Database}
              label="Database (PostgreSQL)"
              status={isLoading ? "loading" : (data?.services.db ?? "unconfigured") as StatusVal}
              latencyMs={null}
              detail="Supabase · Drizzle ORM"
            />
            <ServiceRow
              icon={MessageCircle}
              label="WhatsApp (Fonnte)"
              status={isLoading ? "loading" : (data?.services.whatsapp ?? "unconfigured") as StatusVal}
              latencyMs={data?.services.whatsappLatencyMs}
              detail="Notifikasi order & driver"
            />
            <ServiceRow
              icon={Mail}
              label="Email (SMTP)"
              status={isLoading ? "loading" : (data?.services.smtp ?? "unconfigured") as StatusVal}
              latencyMs={data?.services.smtpLatencyMs}
              detail="Pengiriman email dokumen"
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
