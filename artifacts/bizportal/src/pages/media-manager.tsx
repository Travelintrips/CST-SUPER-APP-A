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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ImageIcon, Upload, Copy, Trash2, Search, Loader2, CheckCheck,
  ExternalLink, FolderOpen, FolderPlus, FolderIcon, MoreVertical,
  ArrowRightLeft, ChevronRight, Images,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface MediaAsset {
  id: number;
  originalName: string;
  contentType: string;
  sizeBytes: number | null;
  url: string;
  objectPath: string;
  uploadedBy: string | null;
  folder: string;
  createdAt: string;
}

interface FolderStat {
  folder: string;
  count: number;
}

const FOLDER_COLORS: Record<string, string> = {
  "Umum": "text-slate-500",
  "Foto Produk": "text-blue-500",
  "Banner Website": "text-purple-500",
  "Logo Vendor": "text-amber-500",
};

function folderColor(name: string) {
  return FOLDER_COLORS[name] ?? "text-emerald-500";
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

const ALL_FOLDER = "__all__";

export default function MediaManagerPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>(ALL_FOLDER);

  // Dialog buat folder baru
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Dialog pindah folder
  const [moveTarget, setMoveTarget] = useState<MediaAsset | null>(null);
  const [moveFolder, setMoveFolder] = useState("");

  const { data: foldersData, isLoading: foldersLoading } = useQuery<{ folders: FolderStat[] }>({
    queryKey: ["media-folders"],
    queryFn: () => apiFetch("/api/media/folders"),
    staleTime: 15_000,
  });

  const { data, isLoading } = useQuery<{ items: MediaAsset[] }>({
    queryKey: ["media-assets", activeFolder],
    queryFn: () =>
      activeFolder === ALL_FOLDER
        ? apiFetch("/api/media")
        : apiFetch(`/api/media?folder=${encodeURIComponent(activeFolder)}`),
    staleTime: 15_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/media/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-assets"] });
      qc.invalidateQueries({ queryKey: ["media-folders"] });
      setDeleteTarget(null);
      toast({ title: "Gambar dihapus dari daftar" });
    },
    onError: () => toast({ title: "Gagal menghapus", variant: "destructive" }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, folder }: { id: number; folder: string }) =>
      apiFetch(`/api/media/${id}/folder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media-assets"] });
      qc.invalidateQueries({ queryKey: ["media-folders"] });
      setMoveTarget(null);
      toast({ title: "Gambar dipindahkan ke folder lain" });
    },
    onError: () => toast({ title: "Gagal memindahkan gambar", variant: "destructive" }),
  });

  const folders = foldersData?.folders ?? [];
  const allFolderNames = folders.map((f) => f.folder);
  const totalCount = folders.reduce((sum, f) => sum + f.count, 0);

  const items = data?.items ?? [];
  const filtered = items.filter((a) =>
    !search.trim() || a.originalName.toLowerCase().includes(search.toLowerCase())
  );

  const currentFolder = activeFolder === ALL_FOLDER ? "Semua Folder" : activeFolder;

  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) {
      toast({ title: "Hanya file gambar yang didukung", variant: "destructive" });
      return;
    }
    setUploading(true);
    let successCount = 0;
    const targetFolder = activeFolder === ALL_FOLDER ? "Umum" : activeFolder;
    for (const file of arr) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", targetFolder);
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
    qc.invalidateQueries({ queryKey: ["media-folders"] });
    toast({
      title: `${successCount} gambar diunggah ke folder "${targetFolder}"`,
    });
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

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    // Folder dibuat otomatis saat ada gambar yang diupload ke sana.
    // Kita cukup pindah ke folder baru tersebut.
    setActiveFolder(name);
    setNewFolderOpen(false);
    setNewFolderName("");
    toast({
      title: `Folder "${name}" siap`,
      description: "Unggah gambar untuk mengisi folder ini.",
    });
  }

  function openMoveDialog(asset: MediaAsset) {
    setMoveTarget(asset);
    setMoveFolder(asset.folder);
  }

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* ── Sidebar Folder ── */}
        <aside className="w-56 shrink-0 border-r bg-muted/20 flex flex-col">
          <div className="p-4 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Folder</p>
          </div>

          {/* Semua gambar */}
          <button
            onClick={() => setActiveFolder(ALL_FOLDER)}
            className={`flex items-center gap-2.5 px-4 py-2.5 text-sm w-full text-left transition-colors ${
              activeFolder === ALL_FOLDER
                ? "bg-primary/10 text-primary font-semibold"
                : "hover:bg-muted/50 text-foreground"
            }`}
          >
            <Images className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">Semua Gambar</span>
            <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">{totalCount}</Badge>
          </button>

          <div className="flex-1 overflow-y-auto py-1">
            {foldersLoading ? (
              <div className="px-4 py-2 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
              </div>
            ) : (
              folders.map((f) => (
                <button
                  key={f.folder}
                  onClick={() => setActiveFolder(f.folder)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm w-full text-left transition-colors ${
                    activeFolder === f.folder
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-muted/50 text-foreground"
                  }`}
                >
                  <FolderIcon className={`w-4 h-4 shrink-0 ${folderColor(f.folder)}`} />
                  <span className="flex-1 truncate">{f.folder}</span>
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">{f.count}</Badge>
                </button>
              ))
            )}
          </div>

          {/* Buat folder baru */}
          <div className="p-3 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs"
              onClick={() => setNewFolderOpen(true)}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Folder Baru
            </Button>
          </div>
        </aside>

        {/* ── Konten Utama ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <ImageIcon className="w-6 h-6 text-primary" />
                  Image Manager
                </h1>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{currentFolder}</span>
                  {activeFolder !== ALL_FOLDER && (
                    <>
                      <ChevronRight className="w-3 h-3" />
                      <span>{filtered.length} gambar</span>
                    </>
                  )}
                </p>
              </div>
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Upload className="w-4 h-4 mr-2" />}
                Unggah ke {activeFolder === ALL_FOLDER ? '"Umum"' : `"${activeFolder}"`}
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
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
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
                  <Upload className="w-7 h-7" />
                  <p className="text-sm font-medium">
                    Seret gambar ke sini — akan masuk ke folder{" "}
                    <strong>{activeFolder === ALL_FOLDER ? "Umum" : activeFolder}</strong>
                  </p>
                  <p className="text-xs">JPG, PNG, WebP, GIF — maks 20 MB per file, dikompres otomatis</p>
                </div>
              )}
            </div>

            {/* Search */}
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

            {/* Grid */}
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">
                  {search ? "Tidak ada gambar yang cocok." : "Folder ini masih kosong."}
                </p>
                {!search && (
                  <p className="text-xs">Unggah gambar atau seret file ke area di atas.</p>
                )}
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
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7"
                          title="Salin URL"
                          onClick={() => copyUrl(asset)}
                        >
                          {copiedId === asset.id
                            ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                            : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7"
                          title="Buka di tab baru"
                          onClick={() => window.open(`/api${asset.url}`, "_blank")}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="secondary" className="h-7 w-7" title="Lainnya">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-xs">Aksi</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openMoveDialog(asset)}>
                              <ArrowRightLeft className="w-3.5 h-3.5 mr-2" />
                              Pindah Folder
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(asset)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Hapus
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Badge folder (hanya saat lihat semua) */}
                      {activeFolder === ALL_FOLDER && (
                        <div className="absolute bottom-1 left-1">
                          <Badge
                            variant="secondary"
                            className="text-[10px] py-0 px-1.5 h-4 bg-black/60 text-white border-0"
                          >
                            {asset.folder}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <CardContent className="p-2 space-y-1">
                      <p className="text-xs font-medium truncate" title={asset.originalName}>
                        {asset.originalName}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatBytes(asset.sizeBytes)}</p>
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
        </div>
      </div>

      {/* ── Dialog: Buat Folder Baru ── */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4" />
              Buat Folder Baru
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Contoh: Banner Website, Logo Vendor..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Folder akan muncul otomatis setelah Anda mengunggah gambar ke dalamnya.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Batal</Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Buat & Buka Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Pindah Folder ── */}
      <Dialog open={!!moveTarget} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Pindah ke Folder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground truncate">
              <strong>{moveTarget?.originalName}</strong>
            </p>
            <div className="space-y-1.5">
              {/* Daftar folder yang sudah ada */}
              {allFolderNames.map((name) => (
                <button
                  key={name}
                  onClick={() => setMoveFolder(name)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors border ${
                    moveFolder === name
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <FolderIcon className={`w-4 h-4 shrink-0 ${folderColor(name)}`} />
                  {name}
                  {name === moveTarget?.folder && (
                    <span className="ml-auto text-xs text-muted-foreground">(saat ini)</span>
                  )}
                </button>
              ))}
              {/* Atau ketik folder baru */}
              <div className="pt-1">
                <p className="text-xs text-muted-foreground mb-1">Atau ketik nama folder baru:</p>
                <Input
                  placeholder="Nama folder baru..."
                  value={allFolderNames.includes(moveFolder) ? "" : moveFolder}
                  onChange={(e) => setMoveFolder(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>Batal</Button>
            <Button
              disabled={!moveFolder.trim() || moveFolder === moveTarget?.folder || moveMutation.isPending}
              onClick={() => moveTarget && moveMutation.mutate({ id: moveTarget.id, folder: moveFolder })}
            >
              {moveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Pindahkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Konfirmasi Hapus ── */}
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
