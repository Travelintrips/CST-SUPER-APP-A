import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ImagePlus, RefreshCw, Sparkles, CheckCircle2, XCircle, Clock,
  Package, Wrench, Loader2, Image, BarChart3, AlertCircle, Eye,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: number;
  name: string;
  templateKind: "product" | "service";
  description: string | null;
  specValues: Record<string, unknown> | null;
  kategori: string | null;
  serviceType: string | null;
  origin: string | null;
  isPublished: boolean;
  vendorId: number | null;
  vendorName: string | null;
  mediaCount: number;
  primaryImageUrl: string | null;
  lastGeneratedAt: string | null;
  hasImage: boolean;
}

interface GenerationStats {
  total: number;
  withImage: number;
  withoutImage: number;
}

interface BulkResult {
  id: number;
  name: string;
  success: boolean;
  imageUrl?: string;
  error?: string;
}

interface BulkReport {
  summary: { total: number; succeeded: number; failed: number };
  results: BulkResult[];
  succeeded: BulkResult[];
  failed: BulkResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ item }: { item: CatalogItem }) {
  if (item.hasImage) {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Ada Gambar
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
      <AlertCircle className="h-3 w-3" /> Belum ada
    </Badge>
  );
}

function KindBadge({ kind }: { kind: string }) {
  return kind === "product" ? (
    <Badge variant="outline" className="gap-1 text-blue-600 border-blue-200">
      <Package className="h-3 w-3" /> Produk
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-purple-600 border-purple-200">
      <Wrench className="h-3 w-3" /> Layanan
    </Badge>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketplaceAiImagesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [onlyPublished, setOnlyPublished] = useState(true);
  const [previewItem, setPreviewItem] = useState<CatalogItem | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [bulkReport, setBulkReport] = useState<BulkReport | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [isBulkRunning, setIsBulkRunning] = useState(false);

  // ── Fetch status ──────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery<{ items: CatalogItem[]; stats: GenerationStats }>({
    queryKey: ["marketplace-generation-status"],
    queryFn: () =>
      fetch("/api/product-media/generation-status").then((r) => {
        if (!r.ok) throw new Error("Gagal memuat data");
        return r.json();
      }),
  });

  const items = data?.items ?? [];
  const stats = data?.stats ?? { total: 0, withImage: 0, withoutImage: 0 };

  const withoutImage = items.filter((i) => !i.hasImage && (!onlyPublished || i.isPublished));
  const displayItems = onlyPublished ? items.filter((i) => i.isPublished) : items;

  // ── Single regenerate ─────────────────────────────────────────────────────
  const regenerateMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const r = await fetch(`/api/product-media/regenerate-ai/${itemId}`, { method: "POST" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Gagal generate");
      }
      return r.json();
    },
    onSuccess: (_, itemId) => {
      toast({ title: "Gambar berhasil dibuat", description: "Gambar AI telah disimpan ke marketplace." });
      queryClient.invalidateQueries({ queryKey: ["marketplace-generation-status"] });
      setGeneratingId(null);
    },
    onError: (e: Error, itemId) => {
      toast({ title: "Gagal generate gambar", description: e.message, variant: "destructive" });
      setGeneratingId(null);
    },
  });

  function handleRegenerate(item: CatalogItem) {
    setGeneratingId(item.id);
    regenerateMutation.mutate(item.id);
  }

  // ── Bulk generate ─────────────────────────────────────────────────────────
  async function handleBulkGenerate() {
    const targets = withoutImage;
    if (targets.length === 0) {
      toast({ title: "Semua item sudah memiliki gambar", description: "Tidak ada yang perlu diproses." });
      return;
    }

    setIsBulkRunning(true);
    setBulkReport(null);
    setBulkProgress({ current: 0, total: targets.length });

    try {
      const r = await fetch("/api/product-media/bulk-generate-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onlyPublished,
          itemIds: targets.map((i) => i.id),
        }),
      });

      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error ?? "Bulk generate gagal");
      }

      const report: BulkReport = await r.json();
      setBulkReport(report);
      setBulkProgress({ current: report.summary.total, total: report.summary.total });
      queryClient.invalidateQueries({ queryKey: ["marketplace-generation-status"] });

      toast({
        title: `Selesai: ${report.summary.succeeded}/${report.summary.total} berhasil`,
        description: report.summary.failed > 0 ? `${report.summary.failed} item gagal.` : "Semua gambar berhasil dibuat.",
        variant: report.summary.failed > 0 ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ title: "Bulk generate gagal", description: e.message, variant: "destructive" });
    } finally {
      setIsBulkRunning(false);
    }
  }

  const coveragePct = stats.total > 0 ? Math.round((stats.withImage / stats.total) * 100) : 0;

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-purple-500" />
              AI Image Generator — Marketplace
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Generate gambar AI otomatis untuk semua produk & layanan di Marketplace
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              onClick={handleBulkGenerate}
              disabled={isBulkRunning || withoutImage.length === 0}
              className="gap-1.5 bg-purple-600 hover:bg-purple-700"
            >
              {isBulkRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isBulkRunning ? "Generating…" : `Generate ${withoutImage.length} Item`}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Item</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.withImage}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Sudah Ada Gambar</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-amber-500">{stats.withoutImage}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Belum Ada Gambar</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-600">{coveragePct}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">Coverage</div>
              <Progress value={coveragePct} className="h-1.5 mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Bulk Progress */}
        {isBulkRunning && bulkProgress && (
          <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/10">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-purple-600 animate-spin flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-purple-700">
                    Sedang memproses… {bulkProgress.current}/{bulkProgress.total} item
                  </div>
                  <Progress
                    value={(bulkProgress.current / Math.max(bulkProgress.total, 1)) * 100}
                    className="h-2 mt-2"
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Proses ini membutuhkan waktu beberapa menit. Jangan tutup halaman ini.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk Report */}
        {bulkReport && (
          <Card className={bulkReport.summary.failed > 0 ? "border-amber-200" : "border-green-200"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Laporan Generate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="text-muted-foreground">Total diproses: <b>{bulkReport.summary.total}</b></span>
                <span className="text-green-600">Berhasil: <b>{bulkReport.summary.succeeded}</b></span>
                {bulkReport.summary.failed > 0 && (
                  <span className="text-red-500">Gagal: <b>{bulkReport.summary.failed}</b></span>
                )}
              </div>

              {/* Sample succeeded */}
              {bulkReport.succeeded.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Contoh 5 item berhasil:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {bulkReport.succeeded.slice(0, 5).map((r) => (
                      <div key={r.id} className="rounded-lg overflow-hidden border bg-muted">
                        {r.imageUrl ? (
                          <img
                            src={r.imageUrl}
                            alt={r.name}
                            className="w-full aspect-square object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3C/svg%3E";
                            }}
                          />
                        ) : (
                          <div className="w-full aspect-square bg-muted flex items-center justify-center">
                            <Image className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="p-1.5">
                          <div className="text-xs font-medium truncate">{r.name}</div>
                          <div className="flex items-center gap-0.5 mt-0.5">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            <span className="text-[10px] text-green-600">OK</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed list */}
              {bulkReport.failed.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-red-500 mb-1">Item gagal:</div>
                  {bulkReport.failed.map((r) => (
                    <div key={r.id} className="text-xs flex items-center gap-2 py-1 border-b last:border-0">
                      <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground">{r.error}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Switch
            id="only-published"
            checked={onlyPublished}
            onCheckedChange={setOnlyPublished}
          />
          <Label htmlFor="only-published" className="text-sm cursor-pointer">
            Hanya item yang dipublish di Marketplace
          </Label>
          <span className="text-xs text-muted-foreground ml-auto">
            {displayItems.length} item ditampilkan
          </span>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Gambar</TableHead>
                  <TableHead>Nama Item</TableHead>
                  <TableHead className="w-24">Tipe</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-36 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : displayItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      Tidak ada item
                    </TableCell>
                  </TableRow>
                ) : (
                  displayItems.map((item) => (
                    <TableRow key={item.id} className={!item.hasImage ? "bg-amber-50/30 dark:bg-amber-900/5" : ""}>
                      {/* Thumbnail */}
                      <TableCell>
                        <div className="w-12 h-12 rounded-md overflow-hidden border bg-muted flex items-center justify-center">
                          {item.primaryImageUrl ? (
                            <img
                              src={item.primaryImageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <Image className="h-5 w-5 text-muted-foreground/40" />
                          )}
                        </div>
                      </TableCell>

                      {/* Name */}
                      <TableCell>
                        <div className="font-medium text-sm leading-tight">{item.name}</div>
                        {item.isPublished && (
                          <span className="text-[10px] text-green-600 flex items-center gap-0.5 mt-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Published
                          </span>
                        )}
                        {item.lastGeneratedAt && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {new Date(item.lastGeneratedAt).toLocaleDateString("id-ID")}
                          </span>
                        )}
                      </TableCell>

                      {/* Kind */}
                      <TableCell>
                        <KindBadge kind={item.templateKind} />
                      </TableCell>

                      {/* Vendor */}
                      <TableCell className="text-sm text-muted-foreground">
                        {item.vendorName ?? "-"}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusBadge item={item} />
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.primaryImageUrl && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setPreviewItem(item)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={item.hasImage ? "outline" : "default"}
                            className={`h-7 gap-1 text-xs ${!item.hasImage ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}`}
                            onClick={() => handleRegenerate(item)}
                            disabled={generatingId === item.id || isBulkRunning}
                          >
                            {generatingId === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : item.hasImage ? (
                              <RefreshCw className="h-3 w-3" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            {item.hasImage ? "Regenerate" : "Generate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Preview Dialog */}
        <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">{previewItem?.name}</DialogTitle>
            </DialogHeader>
            {previewItem?.primaryImageUrl && (
              <div className="rounded-lg overflow-hidden">
                <img
                  src={previewItem.primaryImageUrl}
                  alt={previewItem.name}
                  className="w-full aspect-square object-cover"
                />
              </div>
            )}
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Vendor: {previewItem?.vendorName ?? "-"}</div>
              {previewItem?.origin && <div>Asal: {previewItem.origin}</div>}
              {previewItem?.description && (
                <div className="line-clamp-3">{previewItem.description}</div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 gap-1.5 bg-purple-600 hover:bg-purple-700"
                onClick={() => {
                  if (previewItem) {
                    handleRegenerate(previewItem);
                    setPreviewItem(null);
                  }
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate Gambar
              </Button>
              <Button variant="outline" onClick={() => setPreviewItem(null)}>
                Tutup
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </AppShell>
  );
}
