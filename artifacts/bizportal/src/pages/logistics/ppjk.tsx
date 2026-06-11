import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, RefreshCw, Search, Globe } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Link } from "wouter";

const DOC_TYPE_BADGE_COLOR: Record<string, string> = {
  PIB: "bg-blue-100 text-blue-800",
  PEB: "bg-green-100 text-green-800",
  SPPB: "bg-purple-100 text-purple-800",
  NPE: "bg-yellow-100 text-yellow-800",
  BC23: "bg-orange-100 text-orange-800",
  PP: "bg-gray-100 text-gray-800",
  SPTNP: "bg-red-100 text-red-800",
  other: "bg-zinc-100 text-zinc-800",
};

const MODULE_LABELS: Record<string, string> = {
  general: "General Freight",
  air_freight: "Air Freight",
  ocean_freight: "Ocean Freight",
  unified: "Unified Shipment",
};

const CUSTOMS_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  completed: "bg-emerald-100 text-emerald-700",
};

const CUSTOMS_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  processing: "Diproses",
  approved: "Disetujui",
  rejected: "Ditolak",
  completed: "Selesai",
};

interface CustomsDoc {
  id: number;
  shipmentId: number | null;
  sourceModule: string | null;
  sourceOrderId: number | null;
  docType: string;
  nomorAju: string | null;
  nomorDokumen: string | null;
  tanggalDokumen: string | null;
  customsStatus: string | null;
  data: Record<string, unknown>;
  scanSource: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function PpjkStandalonePage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [docTypeFilter, setDocTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: docs = [], isLoading, refetch } = useQuery<CustomsDoc[]>({
    queryKey: ["ppjk-all-docs"],
    queryFn: async () => {
      const res = await fetch("/api/logistics/customs-docs", { credentials: "include" });
      if (!res.ok) throw new Error("Gagal mengambil data");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const filtered = docs.filter((d) => {
    if (moduleFilter !== "all" && d.sourceModule !== moduleFilter) return false;
    if (docTypeFilter !== "all" && d.docType !== docTypeFilter) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "no_status" && d.customsStatus) return false;
      if (statusFilter !== "no_status" && d.customsStatus !== statusFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const match =
        d.nomorDokumen?.toLowerCase().includes(q) ||
        d.nomorAju?.toLowerCase().includes(q) ||
        d.docType.toLowerCase().includes(q) ||
        String(d.sourceOrderId ?? "").includes(q) ||
        (d.data?.namaPerusahaan as string)?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const stats = {
    total: docs.length,
    air: docs.filter((d) => d.sourceModule === "air_freight").length,
    ocean: docs.filter((d) => d.sourceModule === "ocean_freight").length,
    general: docs.filter((d) => d.sourceModule === "general" || !d.sourceModule).length,
  };

  function getLinkForDoc(doc: CustomsDoc): string | null {
    if (doc.sourceModule === "air_freight" && doc.sourceOrderId) return `/air-freight/orders/${doc.sourceOrderId}`;
    if (doc.sourceModule === "ocean_freight" && doc.sourceOrderId) return `/logistics/ocean-freight/${doc.sourceOrderId}`;
    if (doc.sourceModule === "general" && doc.shipmentId) return `/logistics/freight/${doc.shipmentId}`;
    return null;
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Globe className="w-6 h-6 text-blue-600" />
              PPJK — Dokumen Kepabeanan
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Semua dokumen kepabeanan lintas modul: Air Freight, Ocean Freight, General Freight
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Dokumen", value: stats.total, color: "bg-slate-50 border-slate-200" },
            { label: "Air Freight", value: stats.air, color: "bg-sky-50 border-sky-200" },
            { label: "Ocean Freight", value: stats.ocean, color: "bg-blue-50 border-blue-200" },
            { label: "General Freight", value: stats.general, color: "bg-gray-50 border-gray-200" },
          ].map((s) => (
            <Card key={s.label} className={`border ${s.color}`}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-48">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Cari nomor dokumen, aju, perusahaan..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8"
                />
              </div>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Semua Modul" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Modul</SelectItem>
                  <SelectItem value="air_freight">Air Freight</SelectItem>
                  <SelectItem value="ocean_freight">Ocean Freight</SelectItem>
                  <SelectItem value="general">General Freight</SelectItem>
                </SelectContent>
              </Select>
              <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                <SelectTrigger className="w-36 h-8"><SelectValue placeholder="Jenis Dokumen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Jenis</SelectItem>
                  {["PIB","PEB","SPPB","NPE","BC23","PP","SPTNP","other"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-8"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="no_status">Tanpa Status</SelectItem>
                  {Object.entries(CUSTOMS_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Daftar Dokumen Kepabeanan ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" /> Memuat data...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Tidak ada dokumen kepabeanan</p>
                {(search || moduleFilter !== "all" || docTypeFilter !== "all" || statusFilter !== "all") && (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setSearch(""); setModuleFilter("all"); setDocTypeFilter("all"); setStatusFilter("all"); }}>
                    Reset Filter
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {["Jenis", "Nomor Dokumen", "Nomor Aju", "Tanggal", "Status", "Modul", "Order ID", "Scan", "Dibuat", ""].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((doc) => {
                      const link = getLinkForDoc(doc);
                      return (
                        <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${DOC_TYPE_BADGE_COLOR[doc.docType] ?? DOC_TYPE_BADGE_COLOR.other}`}>
                              {doc.docType}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-medium">
                            {doc.nomorDokumen || <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {doc.nomorAju || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {doc.tanggalDokumen || "—"}
                          </td>
                          <td className="px-4 py-3">
                            {doc.customsStatus ? (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CUSTOMS_STATUS_COLORS[doc.customsStatus] ?? "bg-gray-100 text-gray-700"}`}>
                                {CUSTOMS_STATUS_LABELS[doc.customsStatus] ?? doc.customsStatus}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {MODULE_LABELS[doc.sourceModule ?? ""] ?? doc.sourceModule ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">
                            {doc.sourceOrderId ?? doc.shipmentId ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {doc.scanSource === "ai_scan" && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">AI Scan</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true, locale: idLocale })}
                          </td>
                          <td className="px-4 py-3">
                            {link && (
                              <Link href={link}>
                                <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                                  Buka Order
                                </Button>
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
