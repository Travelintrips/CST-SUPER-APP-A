import { useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ImageIcon, Upload, Copy, Trash2, Search, Loader2, CheckCheck, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MediaAsset {
  id: number;
  originalName: string;
  contentType: string;
  sizeBytes: number | null;
  url: string;
  objectPath: string;
  uploadedBy: string | null;
  createdAt: string;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(val: string) {
  return new Date(val).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getAbsoluteUrl(url: string) {
  return url.startsWith("http") ? url : `${window.location.origin}/api${url}`;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error("fetch error");
  return res.json();
}

export default function MediaManagerPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);

  const { data, isLoading } = useQuery<{ items: MediaAsset[] }>({
    queryKey: ["media-assets"],
    queryFn: () => apiFetch("/api/media"),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/media/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-assets"] });
      setDeleteTarget(null);
      toast({ title: "Gambar dihapus dari daftar" });
    },
    onError: () => toast({ title: "Gagal menghapus", variant: "destructive" }),
  });

  const items = data?.items ?? [];
  const filtered = items.filter((a) =>
    !search.trim() || a.originalName.toLowerCase().includes(search.toLowerCase())
  );

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) {
      toast({ title: "Hanya file gambar yang didukung", variant: "destructive" });
      return;
    }
    setUploading(true);
    let successCount = 0;
    for (const file of arr) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/media/upload", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (res.ok) successCount++;
      } catch {
        // lanjut ke file berikutnya
      }
    }
    setUploading(false);
    qc.invalidateQueries({ queryKey: ["media-assets"] });
    toast({ title: `${successCount} gambar berhasil diunggah dan dikompres` });
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) uploadFiles(e.target.files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
  }

  async function copyUrl(asset: MediaAsset) {
    const url = getAbsoluteUrl(asset.url);
    await navigator.clipboard.writeText(url);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "URL disalin ke clipboard!" });
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ImageIcon className="w-6 h-6 text-primary" />
              Image Manager
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Unggah gambar, kompres otomatis, dan dapatkan URL publik langsung
            </p>
          </div>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Upload className="w-4 h-4 mr-2" />}
            Unggah Gambar
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-medium">Mengunggah dan mengompres...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="w-8 h-8" />
              <p className="text-sm font-medium">Seret gambar ke sini, atau klik untuk pilih file</p>
              <p className="text-xs">JPG, PNG, WebP, GIF — maks 20 MB per file, dikompres otomatis</p>
            </div>
          )}
        </div>

        {/* Search & stats */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama file..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <span className="text-sm text-muted-foreground ml-auto">
            {filtered.length} gambar
          </span>
        </div>

        {/* Grid gambar */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">
              {search ? "Tidak ada gambar yang cocok dengan pencarian." : "Belum ada gambar yang diunggah."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((asset) => (
              <Card key={asset.id} className="group overflow-hidden border hover:shadow-md transition-shadow">
                <div className="relative aspect-square bg-muted/40">
                  <img
                    src={`/api${asset.url}`}
                    alt={asset.originalName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='1.5'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";
                    }}
                  />
                  {/* Overlay actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      title="Salin URL"
                      onClick={() => copyUrl(asset)}
                    >
                      {copiedId === asset.id
                        ? <CheckCheck className="w-4 h-4 text-emerald-500" />
                        : <Copy className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      title="Buka di tab baru"
                      onClick={() => window.open(`/api${asset.url}`, "_blank")}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-8 w-8"
                      title="Hapus"
                      onClick={() => setDeleteTarget(asset)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <CardContent className="p-2 space-y-1">
                  <p className="text-xs font-medium truncate" title={asset.originalName}>
                    {asset.originalName}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatBytes(asset.sizeBytes)}</p>
                  {/* URL copy row */}
                  <button
                    onClick={() => copyUrl(asset)}
                    className="w-full flex items-center gap-1.5 mt-1 px-2 py-1 rounded bg-muted hover:bg-primary/10 transition-colors text-left"
                    title="Klik untuk salin URL"
                  >
                    {copiedId === asset.id
                      ? <CheckCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                      : <Copy className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span className="text-xs text-muted-foreground truncate font-mono">
                      {getAbsoluteUrl(asset.url).replace(window.location.origin, "")}
                    </span>
                  </button>
                  <p className="text-xs text-muted-foreground">{fmtDate(asset.createdAt)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus gambar ini?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.originalName}</strong> akan dihapus dari daftar.
              File yang sudah digunakan di tempat lain mungkin tidak bisa ditampilkan lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
