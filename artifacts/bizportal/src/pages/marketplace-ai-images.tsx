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
  ThumbsUp, ThumbsDown, ShieldCheck, Timer, Store,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: number;
  name: string;
  templateKind: "product" | "service";
  isPublished: boolean;
  vendorName: string | null;
  mediaCount: number;
  vendorCount: number;
  aiCount: number;
  pendingCount: number;
  approvedCount: number;
  primaryImageUrl: string | null;
  lastGeneratedAt: string | null;
  hasVendorImage: boolean;
  hasApprovedImage: boolean;
  hasPending: boolean;
}

interface GenerationStats {
  total: number;
  withImage: number;
  withoutImage: number;
  pendingApproval: number;
}

interface PendingImage {
  id: number;
  fileUrl: string;
  aiImageStatus: string;
  generationPrompt: string | null;
  isPrimary: boolean;
  createdAt: string;
}

interface QueueItem {
  itemId: number;
  itemName: string;
  templateKind: string;
  isPublished: boolean;
  serviceType: string | null;
  vendorName: string | null;
  images: PendingImage[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  return kind === "product" ? (
    <Badge variant="outline" className="gap-1 text-blue-600 border-blue-200 text-[10px]">
      <Package className="h-2.5 w-2.5" /> Produk
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-purple-600 border-purple-200 text-[10px]">
      <Wrench className="h-2.5 w-2.5" /> Layanan
    </Badge>
  );
}

function ItemStatusBadge({ item }: { item: CatalogItem }) {
  if (item.hasVendorImage) {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1 text-[10px]">
        <Store className="h-2.5 w-2.5" /> Vendor Photo
      </Badge>
    );
  }
  if (item.hasApprovedImage) {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-[10px]">
        <ShieldCheck className="h-2.5 w-2.5" /> AI Approved
      </Badge>
    );
  }
  if (item.hasPending) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 text-[10px]">
        <Timer className="h-2.5 w-2.5" /> Menunggu Review
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-slate-500 border-slate-200 gap-1 text-[10px]">
      <AlertCircle className="h-2.5 w-2.5" /> Belum ada
    </Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MarketplaceAiImagesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [onlyPublished, setOnlyPublished] = useState(true);
  const [previewImg, setPreviewImg] = useState<{ url: string; name: string; prompt?: string | null } | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkReport, setBulkReport] = useState<{ summary: any; results: any[] } | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery<{
    items: CatalogItem[];
    stats: GenerationStats;
  }>({
    queryKey: ["marketplace-generation-status"],
    queryFn: () => fetch("/api/product-media/generation-status").then((r) => r.json()),
  });

  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } = useQuery<{
    queue: QueueItem[];
    totalItems: number;
    totalImages: number;
  }>({
    queryKey: ["marketplace-approval-queue"],
    queryFn: () => fetch("/api/product-media/approval-queue").then((r) => r.json()),
    refetchInterval: 15000,
  });

  const items = statusData?.items ?? [];
  const stats = statusData?.stats ?? { total: 0, withImage: 0, withoutImage: 0, pendingApproval: 0 };
  const queue = queueData?.queue ?? [];
  const displayItems = onlyPublished ? items.filter((i) => i.isPublished) : items;
  const needsGeneration = displayItems.filter((i) => !i.hasVendorImage && !i.hasApprovedImage && !i.hasPending);

  function refetchAll() {
    refetchStatus();
    refetchQueue();
  }

  // ── Approve single image ──────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: async (imageId: number) => {
      const r = await fetch(`/api/product-media/${imageId}/approve`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-approval-queue"] });
      qc.invalidateQueries({ queryKey: ["marketplace-generation-status"] });
      setApprovingId(null);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal approve", description: e.message, variant: "destructive" });
      setApprovingId(null);
    },
  });

  // ── Reject single image ───────────────────────────────────────────────────
  const rejectMutation = useMutation({
    mutationFn: async (imageId: number) => {
      const r = await fetch(`/api/product-media/${imageId}/reject`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-approval-queue"] });
      qc.invalidateQueries({ queryKey: ["marketplace-generation-status"] });
      setRejectingId(null);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal reject", description: e.message, variant: "destructive" });
      setRejectingId(null);
    },
  });

  // ── Approve all for item ──────────────────────────────────────────────────
  const approveAllMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const r = await fetch(`/api/product-media/${itemId}/approve-all`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Semua gambar disetujui" });
      qc.invalidateQueries({ queryKey: ["marketplace-approval-queue"] });
      qc.invalidateQueries({ queryKey: ["marketplace-generation-status"] });
    },
    onError: (e: Error) => toast({ title: "Gagal approve all", description: e.message, variant: "destructive" }),
  });

  // ── Set primary ───────────────────────────────────────────────────────────
  const setPrimaryMutation = useMutation({
    mutationFn: async (imageId: number) => {
      const r = await fetch(`/api/product-media/${imageId}/set-primary`, { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Foto utama diubah" });
      qc.invalidateQueries({ queryKey: ["marketplace-approval-queue"] });
      qc.invalidateQueries({ queryKey: ["marketplace-generation-status"] });
    },
  });

  // ── Regenerate item ───────────────────────────────────────────────────────
  async function handleRegenerate(itemId: number) {
    setGeneratingId(itemId);
    try {
      const r = await fetch(`/api/product-media/regenerate-ai/${itemId}`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal");
      toast({ title: `${data.generated} gambar baru dibuat`, description: "Menunggu persetujuan admin." });
      refetchAll();
    } catch (e: any) {
      toast({ title: "Gagal regenerate", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingId(null);
    }
  }

  // ── Bulk generate ─────────────────────────────────────────────────────────
  async function handleBulkGenerate() {
    if (needsGeneration.length === 0) {
      toast({ title: "Tidak ada item yang perlu diproses" });
      return;
    }
    setIsBulkRunning(true);
    setBulkReport(null);
    try {
      const r = await fetch("/api/product-media/bulk-generate-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlyPublished, itemIds: needsGeneration.map((i) => i.id) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Gagal");
      setBulkReport(data);
      toast({
        title: `Generate selesai — ${data.summary.totalGenerated} gambar dibuat`,
        description: `${data.summary.totalItems} item diproses. Menunggu persetujuan admin.`,
      });
      refetchAll();
    } catch (e: any) {
      toast({ title: "Bulk generate gagal", description: e.message, variant: "destructive" });
    } finally {
      setIsBulkRunning(false);
    }
  }

  const coveragePct = stats.total > 0
    ? Math.round(((stats.withImage) / stats.total) * 100) : 0;

  return (
    <AppShell>
      <TooltipProvider>
        <div className="p-6 max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-purple-500" />
                AI Image Generator
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Generate, review, dan publish gambar AI untuk Marketplace
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={refetchAll} disabled={statusLoading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${statusLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                onClick={handleBulkGenerate}
                disabled={isBulkRunning || needsGeneration.length === 0}
                className="gap-1.5 bg-purple-600 hover:bg-purple-700"
              >
                {isBulkRunning
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Sparkles className="h-4 w-4" />}
                {isBulkRunning ? "Generating…" : `Generate ${needsGeneration.length} Item`}
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
                <div className="text-xs text-muted-foreground mt-0.5">Gambar Live</div>
                <Progress value={coveragePct} className="h-1.5 mt-2" />
              </CardContent>
            </Card>
            <Card className={stats.pendingApproval > 0 ? "border-amber-300" : ""}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${stats.pendingApproval > 0 ? "text-amber-500" : ""}`}>
                  {stats.pendingApproval}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Menunggu Approval</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-slate-500">{stats.withoutImage}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Belum Ada Gambar</div>
              </CardContent>
            </Card>
          </div>

          {/* Bulk generating indicator */}
          {isBulkRunning && (
            <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/10">
              <CardContent className="pt-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-purple-600 animate-spin flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-purple-700">
                    Sedang generate gambar… proses ini memakan beberapa menit.
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Setiap item mendapat 4 gambar AI. Setelah selesai, review di tab Antrian Approval.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs defaultValue="queue">
            <TabsList>
              <TabsTrigger value="queue" className="gap-1.5">
                <Timer className="h-3.5 w-3.5" />
                Antrian Approval
                {(queueData?.totalItems ?? 0) > 0 && (
                  <Badge className="ml-1 h-4 min-w-4 rounded-full px-1 text-[10px] bg-amber-500 text-white">
                    {queueData!.totalItems}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Semua Item
              </TabsTrigger>
            </TabsList>

            {/* ── Tab: Approval Queue ─────────────────────────────────── */}
            <TabsContent value="queue" className="mt-4">
              {queueLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : queue.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <ShieldCheck className="h-10 w-10 text-green-400 mx-auto mb-3" />
                    <div className="font-medium text-muted-foreground">
                      Tidak ada gambar yang menunggu approval
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Generate gambar baru, lalu review di sini sebelum tayang di marketplace.
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {queue.map((qItem) => (
                    <Card key={qItem.itemId} className="border-amber-200/60">
                      <CardHeader className="pb-2 pt-4">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-base font-semibold">{qItem.itemName}</CardTitle>
                            <KindBadge kind={qItem.templateKind} />
                            {qItem.isPublished && (
                              <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-[10px]">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Published
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">{qItem.vendorName}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 text-slate-600"
                              onClick={() => handleRegenerate(qItem.itemId)}
                              disabled={generatingId === qItem.itemId}
                            >
                              {generatingId === qItem.itemId
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <RefreshCw className="h-3 w-3" />}
                              Regenerate
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
                              onClick={() => approveAllMutation.mutate(qItem.itemId)}
                              disabled={approveAllMutation.isPending}
                            >
                              <ThumbsUp className="h-3 w-3" />
                              Approve Semua
                            </Button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {qItem.images.length} gambar menunggu review
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {qItem.images.map((img, idx) => (
                            <div key={img.id} className="relative group rounded-xl overflow-hidden border bg-muted">
                              {img.fileUrl ? (
                                <img
                                  src={img.fileUrl}
                                  alt={`${qItem.itemName} #${idx + 1}`}
                                  className="w-full aspect-square object-cover cursor-pointer"
                                  onClick={() => setPreviewImg({ url: img.fileUrl, name: qItem.itemName, prompt: img.generationPrompt })}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              ) : (
                                <div className="w-full aspect-square flex items-center justify-center">
                                  <Image className="h-8 w-8 text-muted-foreground/40" />
                                </div>
                              )}

                              {/* Overlay controls */}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      className="h-7 w-7 bg-white/90 hover:bg-white text-slate-800 rounded-full"
                                      onClick={() => setPreviewImg({ url: img.fileUrl, name: qItem.itemName, prompt: img.generationPrompt })}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Preview</TooltipContent>
                                </Tooltip>
                                <div className="flex gap-1.5">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        className="h-7 w-7 bg-red-500/90 hover:bg-red-500 text-white rounded-full"
                                        disabled={rejectingId === img.id}
                                        onClick={() => {
                                          setRejectingId(img.id);
                                          rejectMutation.mutate(img.id);
                                        }}
                                      >
                                        {rejectingId === img.id
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <ThumbsDown className="h-3.5 w-3.5" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Tolak gambar ini</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        className="h-7 w-7 bg-green-500/90 hover:bg-green-500 text-white rounded-full"
                                        disabled={approvingId === img.id}
                                        onClick={() => {
                                          setApprovingId(img.id);
                                          approveMutation.mutate(img.id);
                                        }}
                                      >
                                        {approvingId === img.id
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          : <ThumbsUp className="h-3.5 w-3.5" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Setujui gambar ini</TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>

                              {/* Cover badge */}
                              <div className="absolute top-1.5 left-1.5">
                                <span className="text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded-md">
                                  #{idx + 1}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Set cover hint */}
                        {qItem.images.length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-2">
                            Hover gambar untuk Approve / Reject. Approve akan mempublikasikan gambar ke marketplace.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Tab: Semua Item ─────────────────────────────────────── */}
            <TabsContent value="all" className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  id="only-published"
                  checked={onlyPublished}
                  onCheckedChange={setOnlyPublished}
                />
                <Label htmlFor="only-published" className="text-sm cursor-pointer">
                  Hanya item yang dipublish
                </Label>
                <span className="text-xs text-muted-foreground ml-auto">
                  {displayItems.length} item
                </span>
              </div>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Foto</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="w-20">Tipe</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead className="w-36">Status</TableHead>
                        <TableHead className="w-32 text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statusLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-10">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : displayItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                            Tidak ada item
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayItems.map((item) => (
                          <TableRow
                            key={item.id}
                            className={
                              !item.hasVendorImage && !item.hasApprovedImage && !item.hasPending
                                ? "bg-slate-50/50 dark:bg-slate-900/20"
                                : ""
                            }
                          >
                            <TableCell>
                              <div
                                className="w-10 h-10 rounded-lg overflow-hidden border bg-muted flex items-center justify-center cursor-pointer"
                                onClick={() => item.primaryImageUrl && setPreviewImg({ url: item.primaryImageUrl, name: item.name })}
                              >
                                {item.primaryImageUrl ? (
                                  <img
                                    src={item.primaryImageUrl}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                  />
                                ) : (
                                  <Image className="h-4 w-4 text-muted-foreground/40" />
                                )}
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="font-medium text-sm leading-tight">{item.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.isPublished && (
                                  <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                                    <CheckCircle2 className="h-2.5 w-2.5" /> Published
                                  </span>
                                )}
                                {item.lastGeneratedAt && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Clock className="h-2.5 w-2.5" />
                                    {new Date(item.lastGeneratedAt).toLocaleDateString("id-ID")}
                                  </span>
                                )}
                              </div>
                              {item.pendingCount > 0 && (
                                <span className="text-[10px] text-amber-600">
                                  {item.pendingCount} gambar menunggu review
                                </span>
                              )}
                            </TableCell>

                            <TableCell>
                              <KindBadge kind={item.templateKind} />
                            </TableCell>

                            <TableCell className="text-sm text-muted-foreground">
                              {item.vendorName ?? "—"}
                            </TableCell>

                            <TableCell>
                              <ItemStatusBadge item={item} />
                            </TableCell>

                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant={item.hasVendorImage || item.hasApprovedImage ? "outline" : "default"}
                                className={`h-7 gap-1 text-xs ${!item.hasVendorImage && !item.hasApprovedImage && !item.hasPending ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}`}
                                onClick={() => handleRegenerate(item.id)}
                                disabled={generatingId === item.id || isBulkRunning || item.hasVendorImage}
                              >
                                {generatingId === item.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : item.hasPending || item.hasApprovedImage ? (
                                  <RefreshCw className="h-3 w-3" />
                                ) : (
                                  <Sparkles className="h-3 w-3" />
                                )}
                                {item.hasVendorImage ? "Vendor Photo" : item.hasPending || item.hasApprovedImage ? "Regenerate" : "Generate"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Bulk report */}
          {bulkReport && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Laporan Generate Terakhir
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div>
                  Total item: <b>{bulkReport.summary.totalItems}</b> &nbsp;|&nbsp;
                  Gambar dibuat: <b>{bulkReport.summary.totalGenerated}</b> &nbsp;|&nbsp;
                  {bulkReport.summary.totalFailed > 0 && (
                    <span className="text-red-500">Gagal: <b>{bulkReport.summary.totalFailed}</b></span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Gambar menunggu review di tab <b>Antrian Approval</b>.
                </div>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Preview Dialog */}
        <Dialog open={!!previewImg} onOpenChange={() => setPreviewImg(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">{previewImg?.name}</DialogTitle>
            </DialogHeader>
            {previewImg?.url && (
              <div className="rounded-lg overflow-hidden">
                <img src={previewImg.url} alt={previewImg.name} className="w-full aspect-square object-cover" />
              </div>
            )}
            {previewImg?.prompt && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium mb-1">Lihat prompt yang digunakan</summary>
                <p className="bg-muted p-2 rounded text-[11px] leading-relaxed">{previewImg.prompt}</p>
              </details>
            )}
            <Button variant="outline" onClick={() => setPreviewImg(null)}>Tutup</Button>
          </DialogContent>
        </Dialog>

      </TooltipProvider>
    </AppShell>
  );
}
