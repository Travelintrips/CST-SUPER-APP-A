import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, isPortalAdmin, getAuthHeaders, setAuthToken } from "@/lib/auth";
import { resolveImageUrl } from "@/lib/utils";
import { getProductFallbackImage, getServiceFallbackImage } from "@/lib/categoryImages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Save,
  Upload,
  Loader2,
  Image as ImageIcon,
  FileText,
  Box,
  Settings,
  CheckCircle,
  Plus,
  X,
  Play,
  Trash2,
  Video,
  Truck,
  ToggleLeft,
  ToggleRight,
  GripVertical,
  Tag,
  Ship,
  ExternalLink,
  Link2,
  Copy,
  Layers,
  ChevronRight,
  AlertCircle,
  PackageCheck,
  Search,
  Info,
  Eye,
  LayoutDashboard,
  ShoppingCart,
  Package,
  BookOpen,
  Receipt,
  BarChart2,
  Mail,
  Store,
  Users,
  Building2,
  ClipboardList,
  Wallet,
  ArrowUpRight,
} from "lucide-react";
import { inCodeTemplates } from "@workspace/product-templates";
import type { ProductTemplate } from "@workspace/product-templates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";

const SERVICE_TYPE_OPTIONS = [
  "Import",
  "Export",
  "Domestic",
  "Door to Door",
  "Air Freight",
  "Sea Freight",
  "Trucking",
  "Customs Clearance",
  "Storage",
  "Handling",
];

function ServiceTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  function toggle(opt: string) {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next.join(", "));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full min-h-9 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <span className="flex flex-wrap gap-1 flex-1 text-left">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">Semua jenis order</span>
            ) : (
              selected.map((s) => (
                <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">{s}</Badge>
              ))
            )}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="text-xs text-muted-foreground px-2 pb-2">Pilih tipe layanan vendor ini</p>
        <div className="space-y-1">
          {SERVICE_TYPE_OPTIONS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            className="mt-2 w-full text-xs text-muted-foreground hover:text-destructive text-center py-1"
            onClick={() => onChange("")}
          >
            Hapus semua pilihan
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function useVideoThumbnail(src: string | null) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const vid = document.createElement("video");
    vid.preload = "auto";
    vid.muted = true;
    vid.playsInline = true;
    vid.src = src;
    const captureFrame = () => {
      if (cancelled || vid.videoWidth === 0) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = vid.videoWidth;
        canvas.height = vid.videoHeight;
        canvas.getContext("2d")?.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.7);
        if (data.length > 100) setThumb(data);
      } catch { /* tainted — leave null */ }
    };
    vid.addEventListener("loadeddata", () => { if (!cancelled) captureFrame(); }, { once: true });
    vid.addEventListener("seeked", () => { if (!cancelled) captureFrame(); }, { once: true });
    vid.addEventListener("canplay", () => { if (!cancelled) captureFrame(); }, { once: true });
    vid.load();
    return () => { cancelled = true; vid.src = ""; };
  }, [src]);
  return thumb;
}

function VideoThumbCell({ src }: { src: string }) {
  const thumb = useVideoThumbnail(src);
  return (
    <div className="relative w-full h-full">
      {thumb ? (
        <img src={thumb} alt="video" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
          <Play className="h-6 w-6 text-white fill-white" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
        <Play className="h-4 w-4 text-white fill-white drop-shadow" />
      </div>
    </div>
  );
}

type Service = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  mediaItems?: MediaItem[];
};

type MediaItem = { type: "image" | "video"; url: string };

type Product = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  imageUrl: string | null;
  mediaItems: MediaItem[];
  unit: string;
  unitOptions: string[];
  categories?: string[];
  subcategory?: string | null;
};

type ContentMap = Record<string, string>;

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function validateImageFile(file: File, toast: ReturnType<typeof useToast>["toast"]): boolean {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    toast({ title: "Format file tidak didukung", description: "Hanya JPG, JPEG, PNG, atau WEBP yang diizinkan.", variant: "destructive" });
    return false;
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    toast({ title: "Ukuran file terlalu besar", description: `Maksimum 5MB per file. File ini ${(file.size / 1024 / 1024).toFixed(1)}MB.`, variant: "destructive" });
    return false;
  }
  return true;
}

function ImageUploader({
  currentUrl,
  onUpload,
}: {
  currentUrl: string | null;
  onUpload: (url: string) => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(resolveImageUrl(currentUrl));

  useEffect(() => {
    setPreview(resolveImageUrl(currentUrl));
  }, [currentUrl]);

  async function handleFile(file: File) {
    if (!validateImageFile(file, toast)) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/portal/admin/upload", {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json() as { url: string };
      setPreview(url);
      onUpload(url);
      toast({ title: "Gambar berhasil diunggah" });
    } catch (err) {
      toast({ title: "Gagal mengunggah gambar", description: String(err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      {preview && (
        <div className="relative rounded-lg overflow-hidden border border-border bg-muted h-40 flex items-center justify-center">
          <img src={preview} alt="preview" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <button
            type="button"
            onClick={() => { setPreview(null); onUpload(""); }}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {!preview && (
        <div className="rounded-lg border-2 border-dashed border-border h-40 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <ImageIcon className="h-8 w-8" />
          <span className="text-sm">Belum ada gambar</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Mengunggah..." : "Unggah Gambar"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Format: JPG, PNG, WEBP. Maks. 5MB.</p>
    </div>
  );
}

function ContentTab() {
  const { toast } = useToast();
  const [content, setContent] = useState<ContentMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState<ContentMap>({});

  const FIELDS: Array<{ key: string; label: string; multi?: boolean }> = [
    { key: "hero_title", label: "Judul Hero" },
    { key: "hero_subtitle", label: "Subjudul Hero", multi: true },
    { key: "hero_cta", label: "Teks Tombol CTA Hero" },
    { key: "about_title", label: "Judul Tentang Kami" },
    { key: "about_body", label: "Deskripsi Tentang Kami", multi: true },
    { key: "contact_phone", label: "Nomor Telepon" },
    { key: "contact_email", label: "Email Kontak" },
    { key: "contact_address", label: "Alamat", multi: true },
    { key: "footer_tagline", label: "Tagline Footer" },
  ];

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiGet<ContentMap>("/api/portal/content");
        setContent(data);
      } catch {
        toast({ title: "Gagal memuat konten", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleChange(key: string, value: string) {
    setChanged((prev) => ({ ...prev, [key]: value }));
    setContent((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (Object.keys(changed).length === 0) return;
    setSaving(true);
    try {
      await apiPut("/api/portal/admin/content", changed);
      setChanged({});
      toast({ title: "Konten berhasil disimpan", description: "Perubahan akan segera tampil di website." });
    } catch (err) {
      toast({ title: "Gagal menyimpan", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const TESTIMONIAL_PHOTOS = [
    { key: "testimonials.t1Photo", label: "Foto Testimoni 1", nameKey: "testimonials.t1Name", defaultName: "Testimoni 1" },
    { key: "testimonials.t2Photo", label: "Foto Testimoni 2", nameKey: "testimonials.t2Name", defaultName: "Testimoni 2" },
    { key: "testimonials.t3Photo", label: "Foto Testimoni 3", nameKey: "testimonials.t3Name", defaultName: "Testimoni 3" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-sm font-medium">{f.label}</Label>
            {f.multi ? (
              <Textarea
                value={content[f.key] ?? ""}
                onChange={(e) => handleChange(f.key, e.target.value)}
                rows={3}
                placeholder={`Masukkan ${f.label.toLowerCase()}...`}
              />
            ) : (
              <Input
                value={content[f.key] ?? ""}
                onChange={(e) => handleChange(f.key, e.target.value)}
                placeholder={`Masukkan ${f.label.toLowerCase()}...`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold">Foto Testimonial</p>
          <p className="text-xs text-muted-foreground mt-0.5">Upload foto untuk setiap pemberi testimoni. Foto akan tampil sebagai avatar bulat di halaman utama.</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {TESTIMONIAL_PHOTOS.map((t) => (
            <div key={t.key} className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {content[t.nameKey] || t.defaultName}
              </Label>
              <ImageUploader
                currentUrl={content[t.key] ?? null}
                onUpload={(url) => handleChange(t.key, url)}
              />
            </div>
          ))}
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || Object.keys(changed).length === 0} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "Menyimpan..." : `Simpan Perubahan${Object.keys(changed).length > 0 ? ` (${Object.keys(changed).length})` : ""}`}
      </Button>
    </div>
  );
}

function MediaUploader({
  mediaItems,
  onChange,
  fallbackSrc,
}: {
  mediaItems: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  fallbackSrc?: string | null;
}) {
  const { toast } = useToast();
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  async function uploadFiles(files: File[], type: "image" | "video") {
    if (type === "image") {
      for (const file of files) {
        if (!validateImageFile(file, toast)) return;
      }
    }
    setUploading(true);
    const newItems: MediaItem[] = [];
    try {
      for (const file of files) {
        const { uploadURL, objectPath } = await apiPost<{ uploadURL: string; objectPath: string }>(
          "/api/portal/admin/upload-url",
          { contentType: file.type }
        );
        await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        newItems.push({ type, url: `/api/storage${objectPath}` });
      }
      onChange([...mediaItems, ...newItems]);
      toast({
        title: `${newItems.length} ${type === "image" ? "gambar" : "video"} berhasil diunggah`,
      });
    } catch (err) {
      if (newItems.length > 0) onChange([...mediaItems, ...newItems]);
      toast({ title: "Sebagian gagal diunggah", description: String(err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function addUrlItem() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    try { new URL(trimmed); } catch {
      toast({ title: "URL tidak valid", description: "Masukkan URL gambar yang lengkap (diawali https://)", variant: "destructive" });
      return;
    }
    onChange([...mediaItems, { type: "image", url: trimmed }]);
    setUrlInput("");
    setShowUrlInput(false);
  }

  function remove(idx: number) {
    onChange(mediaItems.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      {/* Existing media grid */}
      {mediaItems.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {mediaItems.map((m, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group">
              {m.type === "video" ? (
                <VideoThumbCell src={resolveImageUrl(m.url) ?? m.url} />
              ) : (
                <img src={resolveImageUrl(m.url) ?? ""} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <button
                onClick={() => remove(i)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
              {i === 0 && (
                <span className="absolute bottom-1 left-1 bg-primary text-primary-foreground text-[9px] px-1 rounded">Cover</span>
              )}
            </div>
          ))}
        </div>
      )}
      {mediaItems.length === 0 && (
        fallbackSrc ? (
          <div className="relative rounded-lg overflow-hidden border border-dashed border-amber-300 bg-amber-50">
            <img
              src={fallbackSrc}
              alt="Gambar otomatis"
              className="w-full h-32 object-cover opacity-60"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/20">
              <span className="text-xs font-medium text-white bg-amber-500/90 px-2 py-0.5 rounded-full">
                Gambar otomatis — belum ada foto asli
              </span>
              <span className="text-[10px] text-white/80">Ini yang tampil di halaman produk saat ini</span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-border h-28 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ImageIcon className="h-7 w-7" />
            <span className="text-xs">Belum ada media</span>
          </div>
        )
      )}

      {/* Upload buttons */}
      <input ref={imgRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void uploadFiles(files, "image");
          e.target.value = "";
        }}
      />
      <input ref={vidRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void uploadFiles(files, "video");
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5 flex-1" disabled={uploading}
          onClick={() => imgRef.current?.click()}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          Tambah Foto
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 flex-1" disabled={uploading}
          onClick={() => vidRef.current?.click()}>
          <Video className="h-3.5 w-3.5" />
          Tambah Video
        </Button>
      </div>
      {showUrlInput ? (
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrlItem(); } }}
            placeholder="https://example.com/gambar.jpg"
            className="flex-1 h-8 rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
          <Button type="button" size="sm" onClick={addUrlItem} className="h-8">Tambah</Button>
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => { setShowUrlInput(false); setUrlInput(""); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <button type="button" onClick={() => setShowUrlInput(true)} className="text-xs text-primary hover:underline underline-offset-2">
          atau masukkan URL gambar secara manual
        </button>
      )}
      <p className="text-xs text-muted-foreground">Foto pertama jadi cover. Format: JPG, PNG, WEBP. Maks. 5MB.</p>
    </div>
  );
}

function ItemEditCard({
  item,
  onSave,
  type,
  allCategories,
}: {
  item: Service | Product;
  onSave: (id: number, data: Partial<Service & Product & { mediaItems: MediaItem[]; categories: string[] }>) => Promise<void>;
  type: "services" | "products";
  allCategories?: string[];
}) {
  const { toast } = useToast();
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState(String(item.price));
  const existingMedia = (item as Service | Product).mediaItems ?? [];
  const firstMediaImage = existingMedia.find((m) => m.type === "image")?.url ?? null;
  const [imageUrl, setImageUrl] = useState<string | null>(item.imageUrl ?? firstMediaImage);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(() => {
    if (existingMedia.length > 0) return existingMedia;
    if (item.imageUrl) return [{ type: "image" as const, url: item.imageUrl }];
    return [];
  });
  const [unit, setUnit] = useState(type === "products" ? (item as Product).unit ?? "pcs" : "pcs");
  const [unitOptionsRaw, setUnitOptionsRaw] = useState(
    type === "products" ? ((item as Product).unitOptions ?? []).join(", ") : ""
  );
  const [stock, setStock] = useState(type === "products" ? String((item as Product).stock ?? 0) : "0");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    type === "products" ? ((item as Product).categories ?? []) : []
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleCategory(name: string) {
    setSelectedCategories((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const coverImage = mediaItems.find((m) => m.type === "image")?.url ?? imageUrl;
      const payload: Partial<Service & Product & { mediaItems: MediaItem[]; categories: string[] }> = {
        name,
        description: description || null,
        price: parseFloat(price) || 0,
        imageUrl: mediaItems.length > 0 ? coverImage : imageUrl,
        mediaItems,
      };
      if (type === "products") {
        payload.unit = unit.trim() || "pcs";
        payload.unitOptions = unitOptionsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        payload.stock = Math.max(0, parseInt(stock, 10) || 0);
        payload.categories = selectedCategories;
      }
      await onSave(item.id, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast({ title: `${type === "services" ? "Layanan" : "Produk"} berhasil diperbarui` });
    } catch (err) {
      toast({ title: "Gagal menyimpan", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{item.name}</CardTitle>
          <Badge variant="outline" className="text-xs">ID #{item.id}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Deskripsi</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Deskripsi singkat..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Harga (0 = Negosiasi)</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
            {type === "products" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Stok</Label>
                  <Input
                    type="number"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Satuan Utama</Label>
                  <Input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="pcs, kg, dus, karton..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Pilihan Satuan Lain <span className="text-muted-foreground font-normal">(pisahkan dengan koma)</span></Label>
                  <Input
                    value={unitOptionsRaw}
                    onChange={(e) => setUnitOptionsRaw(e.target.value)}
                    placeholder="cth: pcs, dus, karton"
                  />
                </div>
                {allCategories && allCategories.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Kategori</Label>
                    <div className="border rounded-md p-3 max-h-36 overflow-y-auto space-y-2">
                      {allCategories.map((cat) => (
                        <div key={cat} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`cat-edit-${item.id}-${cat}`}
                            checked={selectedCategories.includes(cat)}
                            onChange={() => toggleCategory(cat)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <label htmlFor={`cat-edit-${item.id}-${cat}`} className="text-sm cursor-pointer">{cat}</label>
                        </div>
                      ))}
                    </div>
                    {selectedCategories.length === 0 && (
                      <p className="text-xs text-amber-600">Pilih minimal 1 kategori agar produk muncul di filter BizPortal</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">
              {type === "products" ? "Foto & Video Produk" : "Foto Layanan"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">(tampil di website publik)</span>
            </Label>
            <MediaUploader
              mediaItems={mediaItems}
              onChange={(items) => {
                setMediaItems(items);
                const cover = items.find((m) => m.type === "image")?.url ?? null;
                if (cover) setImageUrl(cover);
              }}
              fallbackSrc={type === "products" ? getProductFallbackImage(
                (item as Product).categories ?? [],
                item.name,
                (item as Product).subcategory ?? null
              ) : getServiceFallbackImage([], item.name)}
            />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ServicesTab() {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchServices = async () => {
    try {
      const data = await apiGet<Service[]>("/api/portal/services");
      setServices(data);
    } catch {
      toast({ title: "Gagal memuat layanan", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchServices(); }, []);

  async function handleSave(id: number, data: Partial<Service & Product & { mediaItems: MediaItem[] }>) {
    await apiPut(`/api/portal/admin/services/${id}`, data);
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
  }

  async function handleAdd() {
    if (!newName.trim()) {
      toast({ title: "Nama layanan harus diisi", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const created = await apiPost<Service>("/api/portal/admin/services", {
        name: newName.trim(),
        description: newDesc.trim() || null,
        price: parseFloat(newPrice) || 0,
      });
      setServices((prev) => [created, ...prev]);
      setShowAdd(false);
      setNewName(""); setNewDesc(""); setNewPrice("");
      toast({ title: "Layanan berhasil ditambahkan" });
    } catch (err) {
      toast({ title: "Gagal menambahkan layanan", description: String(err), variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/portal/admin/services/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setServices((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: "Layanan dihapus" });
    } catch {
      toast({ title: "Gagal menghapus layanan", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Kelola {services.length} layanan yang tampil di halaman Layanan.
        </p>
        <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Tambah Layanan
        </Button>
      </div>

      {/* Form tambah layanan */}
      {showAdd && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Layanan Baru</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama Layanan *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="cth: Jasa Freight Udara"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Deskripsi singkat layanan (opsional)"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Harga (0 = Negosiasi)</Label>
              <Input
                type="number"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleAdd} disabled={adding} className="gap-2">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {adding ? "Menyimpan..." : "Tambah"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNewName(""); setNewDesc(""); setNewPrice(""); }}>
                Batal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {services.map((s) => (
        <div key={s.id} className="relative">
          <ItemEditCard item={s} onSave={handleSave} type="services" />
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-3 right-3 h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteTarget(s)}
            title="Hapus layanan"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {services.length === 0 && !showAdd && (
        <div className="text-center py-12 text-muted-foreground">
          Belum ada layanan. Klik "Tambah Layanan" untuk menambahkan.
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Layanan?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Layanan <strong>{deleteTarget?.name}</strong> akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Ya, Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductsTab() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newUnit, setNewUnit] = useState("pcs");
  const [newUnitOptions, setNewUnitOptions] = useState("");
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  const [newCategories, setNewCategories] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [data, cats] = await Promise.all([
          apiGet<Product[]>("/api/portal/admin/products"),
          apiGet<{ id: number; name: string }[]>("/api/portal/admin/product-categories"),
        ]);
        setProducts(data);
        setAllCategories(cats.map((c) => c.name));
      } catch {
        toast({ title: "Gagal memuat produk", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(id: number, data: Partial<Service & Product & { mediaItems: MediaItem[]; categories: string[] }>) {
    const result = await apiPut<Product & { categories?: string[] }>(`/api/portal/admin/products/${id}`, data);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data, categories: result.categories ?? data.categories ?? p.categories } : p)));
  }

  function toggleNewCategory(name: string) {
    setNewCategories((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  async function handleAdd() {
    if (!newName.trim()) {
      toast({ title: "Nama produk harus diisi", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const parsedUnitOptions = newUnitOptions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const created = await apiPost<Product>("/api/portal/admin/products", {
        name: newName.trim(),
        description: newDesc.trim() || null,
        price: parseFloat(newPrice) || 0,
        imageUrl: newImageUrl,
        unit: newUnit.trim() || "pcs",
        unitOptions: parsedUnitOptions,
        categories: newCategories,
      });
      setProducts((prev) => [created, ...prev]);
      setShowAdd(false);
      setNewName("");
      setNewDesc("");
      setNewPrice("");
      setNewUnit("pcs");
      setNewUnitOptions("");
      setNewImageUrl(null);
      setNewCategories([]);
      toast({ title: "Produk berhasil ditambahkan" });
    } catch (err) {
      toast({ title: "Gagal menambahkan produk", description: String(err), variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/portal/admin/products/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: "Produk dihapus" });
    } catch {
      toast({ title: "Gagal menghapus produk", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Kelola {products.length} produk yang tampil di halaman Produk.
        </p>
        <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Tambah Produk
        </Button>
      </div>

      {products.map((p) => (
        <div key={p.id} className="relative">
          <ItemEditCard item={p} onSave={handleSave} type="products" allCategories={allCategories} />
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-3 right-3 h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteTarget(p)}
            title="Hapus produk"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {products.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Belum ada produk. Klik "Tambah Produk" untuk menambahkan produk baru.
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Produk?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Produk <strong>{deleteTarget?.name}</strong> akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Ya, Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Tambah Produk Baru
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nama Produk <span className="text-destructive">*</span></Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nama produk..." />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3} placeholder="Deskripsi singkat produk..." />
            </div>
            <div className="space-y-1.5">
              <Label>Harga (0 = Negosiasi)</Label>
              <Input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0" min="0" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Satuan Utama</Label>
                <Input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="pcs, kg, dus..." />
              </div>
              <div className="space-y-1.5">
                <Label>Pilihan Satuan Lain</Label>
                <Input value={newUnitOptions} onChange={(e) => setNewUnitOptions(e.target.value)} placeholder="pcs, dus, karton" />
              </div>
            </div>
            {allCategories.length > 0 && (
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <div className="border rounded-md p-3 max-h-36 overflow-y-auto space-y-2">
                  {allCategories.map((cat) => (
                    <div key={cat} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`new-cat-${cat}`}
                        checked={newCategories.includes(cat)}
                        onChange={() => toggleNewCategory(cat)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label htmlFor={`new-cat-${cat}`} className="text-sm cursor-pointer">{cat}</label>
                    </div>
                  ))}
                </div>
                {newCategories.length === 0 && (
                  <p className="text-xs text-amber-600">Pilih minimal 1 kategori agar produk muncul di filter BizPortal</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Gambar Produk</Label>
              <ImageUploader currentUrl={newImageUrl} onUpload={(url) => setNewImageUrl(url)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={adding}>
              <X className="h-4 w-4 mr-1" /> Batal
            </Button>
            <Button onClick={handleAdd} disabled={adding} className="gap-2">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {adding ? "Menyimpan..." : "Tambah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type DeliveryVendor = {
  id: number;
  name: string;
  logo: string;
  eta: string;
  fee: number;
  note: string | null;
  isActive: boolean;
  sortOrder: number;
  phone: string | null;
  email: string | null;
  serviceType: string | null;
};

function DeliveryVendorsTab() {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<DeliveryVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLogo, setNewLogo] = useState("📦");
  const [newEta, setNewEta] = useState("2-3 hari");
  const [newFee, setNewFee] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newServiceType, setNewServiceType] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<DeliveryVendor>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await apiGet<DeliveryVendor[]>("/api/portal/admin/delivery-vendors");
      setVendors(data);
    } catch {
      toast({ title: "Gagal memuat data kurir", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd() {
    if (!newName.trim()) {
      toast({ title: "Nama vendor harus diisi", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const created = await apiPost<DeliveryVendor>("/api/portal/admin/delivery-vendors", {
        name: newName.trim(),
        logo: newLogo.trim() || "📦",
        eta: newEta.trim() || "2-3 hari",
        fee: parseFloat(newFee) || 0,
        note: newNote.trim() || null,
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
        serviceType: newServiceType.trim() || null,
      });
      setVendors((prev) => [...prev, created]);
      setShowAdd(false);
      setNewName(""); setNewLogo("📦"); setNewEta("2-3 hari"); setNewFee(""); setNewNote("");
      setNewPhone(""); setNewEmail(""); setNewServiceType("");
      toast({ title: "Kurir berhasil ditambahkan" });
    } catch (err) {
      toast({ title: "Gagal menambahkan kurir", description: String(err), variant: "destructive" });
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id: number, isActive: boolean) {
    try {
      await apiPut(`/api/portal/admin/delivery-vendors/${id}`, { isActive });
      setVendors((prev) => prev.map((v) => v.id === id ? { ...v, isActive } : v));
    } catch {
      toast({ title: "Gagal mengubah status", variant: "destructive" });
    }
  }

  async function handleSaveEdit(id: number) {
    setSaving(true);
    try {
      const updated = await apiPut<DeliveryVendor>(`/api/portal/admin/delivery-vendors/${id}`, editData);
      setVendors((prev) => prev.map((v) => v.id === id ? updated : v));
      setEditId(null);
      setEditData({});
      toast({ title: "Kurir berhasil diperbarui" });
    } catch {
      toast({ title: "Gagal menyimpan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Hapus vendor "${name}"?`)) return;
    try {
      await fetch(`/api/portal/admin/delivery-vendors/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setVendors((prev) => prev.filter((v) => v.id !== id));
      toast({ title: "Kurir berhasil dihapus" });
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Kelola {vendors.length} vendor kurir/pengiriman. Aktifkan atau nonaktifkan yang ditampilkan ke pelanggan.
        </p>
        <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Tambah Kurir
        </Button>
      </div>

      {/* Vendor list */}
      <div className="space-y-2">
        {vendors.map((v) => (
          <div key={v.id} className={`rounded-xl border p-4 transition-all ${v.isActive ? "bg-white border-border" : "bg-gray-50 border-dashed border-gray-200 opacity-60"}`}>
            {editId === v.id ? (
              /* Edit mode */
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nama</Label>
                    <Input value={editData.name ?? v.name} onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Logo/Emoji</Label>
                    <Input value={editData.logo ?? v.logo} onChange={(e) => setEditData((d) => ({ ...d, logo: e.target.value }))} placeholder="📦" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Estimasi (ETA)</Label>
                    <Input value={editData.eta ?? v.eta} onChange={(e) => setEditData((d) => ({ ...d, eta: e.target.value }))} placeholder="2-3 hari" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ongkir (0 = Nego)</Label>
                    <Input type="number" value={editData.fee ?? v.fee} onChange={(e) => setEditData((d) => ({ ...d, fee: parseFloat(e.target.value) || 0 }))} min="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">No. WhatsApp Vendor</Label>
                    <Input value={editData.phone ?? v.phone ?? ""} onChange={(e) => setEditData((d) => ({ ...d, phone: e.target.value || null }))} placeholder="628xxxxxxxxxx" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email Vendor</Label>
                    <Input type="email" value={editData.email ?? v.email ?? ""} onChange={(e) => setEditData((d) => ({ ...d, email: e.target.value || null }))} placeholder="vendor@email.com" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Tipe Layanan (untuk notifikasi order)</Label>
                    <ServiceTypeSelect
                      value={editData.serviceType ?? v.serviceType ?? ""}
                      onChange={(val) => setEditData((d) => ({ ...d, serviceType: val || null }))}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Catatan (opsional)</Label>
                    <Input value={editData.note ?? v.note ?? ""} onChange={(e) => setEditData((d) => ({ ...d, note: e.target.value || null }))} placeholder="Harga nego, dll." />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleSaveEdit(v.id)} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Simpan
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(null); setEditData({}); }}>Batal</Button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div className="flex items-center gap-4">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab" />
                <span className="text-2xl shrink-0">{v.logo}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{v.name}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">⏱ {v.eta}</span>
                    <span className="text-xs font-medium text-primary">
                      {v.fee > 0 ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v.fee) : v.note ?? "Nego"}
                    </span>
                    {v.serviceType && <Badge variant="outline" className="text-[10px] px-1.5">{v.serviceType}</Badge>}
                    {v.phone && <span className="text-xs text-muted-foreground">📱 {v.phone}</span>}
                    {v.email && <span className="text-xs text-muted-foreground">✉ {v.email}</span>}
                    {!v.isActive && <Badge variant="secondary" className="text-[10px] px-1">Nonaktif</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    {v.isActive ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                    <Switch
                      checked={v.isActive}
                      onCheckedChange={(checked) => void handleToggle(v.id, checked)}
                    />
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditId(v.id); setEditData({}); }}>
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => void handleDelete(v.id, v.name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {vendors.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Belum ada kurir. Klik "Tambah Kurir" untuk menambahkan.
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Vendor Kurir</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nama Vendor *</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="PT. Vendor Logistics" />
              </div>
              <div className="space-y-1">
                <Label>Logo/Emoji</Label>
                <Input value={newLogo} onChange={(e) => setNewLogo(e.target.value)} placeholder="📦" />
              </div>
              <div className="space-y-1">
                <Label>Estimasi Waktu</Label>
                <Input value={newEta} onChange={(e) => setNewEta(e.target.value)} placeholder="2-3 hari" />
              </div>
              <div className="space-y-1">
                <Label>Ongkir (Rp, 0 = Nego)</Label>
                <Input type="number" value={newFee} onChange={(e) => setNewFee(e.target.value)} placeholder="0" min="0" />
              </div>
              <div className="space-y-1">
                <Label>Catatan</Label>
                <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Harga nego, dll." />
              </div>
              <div className="space-y-1">
                <Label>No. WhatsApp</Label>
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="628xxxxxxxxxx" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="vendor@email.com" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Tipe Layanan</Label>
                <ServiceTypeSelect
                  value={newServiceType}
                  onChange={setNewServiceType}
                />
                <p className="text-[11px] text-muted-foreground">Kosongkan jika vendor menerima semua jenis order.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Batal</Button>
            <Button onClick={() => void handleAdd()} disabled={adding} className="gap-2">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type TruckingRates = Record<string, { ratePerKm: number; loadingFee: number }>;
type FreightRates = {
  seaLcl:          { ratePerCbm: number; label: string };
  seaFcl20:        { flatRate: number; label: string };
  seaFcl40:        { flatRate: number; label: string };
  air:             { ratePerKg: number; label: string };
  customClearance: { flatRate: number; label: string };
};

function PricingTab() {
  const { toast } = useToast();

  const [, setTrucking] = useState<TruckingRates>({});
  const [truckingEdit, setTruckingEdit] = useState<TruckingRates>({});
  const [truckingLoading, setTruckingLoading] = useState(true);
  const [truckingSaving, setTruckingSaving] = useState(false);

  const [freight, setFreight] = useState<FreightRates | null>(null);
  const [freightEdit, setFreightEdit] = useState<Partial<FreightRates>>({});
  const [freightLoading, setFreightLoading] = useState(true);
  const [freightSaving, setFreightSaving] = useState(false);

  const [newVehicle, setNewVehicle] = useState("");
  const [newRatePerKm, setNewRatePerKm] = useState("");
  const [newLoadingFee, setNewLoadingFee] = useState("");
  const [addingVehicle, setAddingVehicle] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiGet<TruckingRates>("/api/portal/admin/trucking-rates");
        setTrucking(data);
        setTruckingEdit(JSON.parse(JSON.stringify(data)) as TruckingRates);
      } catch {
        toast({ title: "Gagal memuat tarif trucking", variant: "destructive" });
      } finally { setTruckingLoading(false); }
    })();
    void (async () => {
      try {
        const data = await apiGet<FreightRates>("/api/portal/admin/freight-rates");
        setFreight(data);
        setFreightEdit(JSON.parse(JSON.stringify(data)) as FreightRates);
      } catch {
        toast({ title: "Gagal memuat tarif freight", variant: "destructive" });
      } finally { setFreightLoading(false); }
    })();
  }, []);

  const parse = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 0;

  async function saveTrucking() {
    setTruckingSaving(true);
    try {
      await apiPut("/api/portal/admin/trucking-rates", truckingEdit);
      setTrucking(JSON.parse(JSON.stringify(truckingEdit)) as TruckingRates);
      toast({ title: "Tarif trucking berhasil disimpan" });
    } catch {
      toast({ title: "Gagal menyimpan tarif trucking", variant: "destructive" });
    } finally { setTruckingSaving(false); }
  }

  async function saveFreight() {
    setFreightSaving(true);
    try {
      await apiPut("/api/portal/admin/freight-rates", freightEdit);
      setFreight(JSON.parse(JSON.stringify(freightEdit)) as FreightRates);
      toast({ title: "Tarif freight berhasil disimpan" });
    } catch {
      toast({ title: "Gagal menyimpan tarif freight", variant: "destructive" });
    } finally { setFreightSaving(false); }
  }

  async function addVehicle() {
    const name = newVehicle.trim();
    if (!name) { toast({ title: "Nama kendaraan harus diisi", variant: "destructive" }); return; }
    setAddingVehicle(true);
    const updated = {
      ...truckingEdit,
      [name]: { ratePerKm: parse(newRatePerKm), loadingFee: parse(newLoadingFee) },
    };
    try {
      await apiPut("/api/portal/admin/trucking-rates", updated);
      setTrucking(updated);
      setTruckingEdit(JSON.parse(JSON.stringify(updated)) as TruckingRates);
      setNewVehicle(""); setNewRatePerKm(""); setNewLoadingFee("");
      toast({ title: `Kendaraan "${name}" ditambahkan` });
    } catch {
      toast({ title: "Gagal menambah kendaraan", variant: "destructive" });
    } finally { setAddingVehicle(false); }
  }

  async function deleteVehicle(key: string) {
    if (!confirm(`Hapus kendaraan "${key}"?`)) return;
    const updated = { ...truckingEdit };
    delete updated[key];
    try {
      await apiPut("/api/portal/admin/trucking-rates", updated);
      setTrucking(updated);
      setTruckingEdit(JSON.parse(JSON.stringify(updated)) as TruckingRates);
      toast({ title: `Kendaraan "${key}" dihapus` });
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
    }
  }

  const FREIGHT_FIELDS: Array<{
    key: keyof FreightRates;
    label: string;
    icon: string;
    field: string;
    unit: string;
  }> = [
    { key: "seaLcl",          label: "Sea Freight LCL",   icon: "🚢", field: "ratePerCbm", unit: "per CBM" },
    { key: "seaFcl20",        label: "Sea Freight FCL 20ft", icon: "📦", field: "flatRate",   unit: "flat" },
    { key: "seaFcl40",        label: "Sea Freight FCL 40ft", icon: "📦", field: "flatRate",   unit: "flat" },
    { key: "air",             label: "Air Freight",        icon: "✈️", field: "ratePerKg",  unit: "per kg" },
    { key: "customClearance", label: "Custom Clearance",   icon: "📋", field: "flatRate",   unit: "flat" },
  ];

  return (
    <div className="space-y-8">
      {/* ---- Trucking Rates ---- */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b">
          <Truck className="h-5 w-5 text-sky-600" />
          <h3 className="font-semibold text-base">Tarif Trucking</h3>
          <span className="text-xs text-muted-foreground ml-1">— Rate per km + biaya muat</span>
        </div>

        {truckingLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Kendaraan</th>
                    <th className="text-right px-4 py-2.5 font-medium">Rate/km (Rp)</th>
                    <th className="text-right px-4 py-2.5 font-medium">Biaya Muat (Rp)</th>
                    <th className="px-3 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(truckingEdit).map(([key, val]) => (
                    <tr key={key} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{key}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          type="number"
                          className="text-right h-8 w-32 ml-auto"
                          value={val.ratePerKm}
                          min={0}
                          onChange={(e) => setTruckingEdit((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], ratePerKm: parseFloat(e.target.value) || 0 },
                          }))}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Input
                          type="number"
                          className="text-right h-8 w-36 ml-auto"
                          value={val.loadingFee}
                          min={0}
                          onChange={(e) => setTruckingEdit((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], loadingFee: parseFloat(e.target.value) || 0 },
                          }))}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => void deleteVehicle(key)}
                          className="text-destructive hover:text-destructive/70 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-end gap-2 pt-1">
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Nama Kendaraan</Label>
                <Input value={newVehicle} onChange={(e) => setNewVehicle(e.target.value)} placeholder="cth: Engkel" className="h-8" />
              </div>
              <div className="space-y-1 w-32">
                <Label className="text-xs">Rate/km</Label>
                <Input type="number" value={newRatePerKm} onChange={(e) => setNewRatePerKm(e.target.value)} placeholder="5000" className="h-8" />
              </div>
              <div className="space-y-1 w-36">
                <Label className="text-xs">Biaya Muat</Label>
                <Input type="number" value={newLoadingFee} onChange={(e) => setNewLoadingFee(e.target.value)} placeholder="500000" className="h-8" />
              </div>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 shrink-0" onClick={() => void addVehicle()} disabled={addingVehicle}>
                {addingVehicle ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Tambah
              </Button>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
              <p>💡 Tarif ini digunakan untuk kalkulator harga pada halaman pemesanan logistik.</p>
              <p>Estimasi biaya = (jarak km × rate/km) + biaya muat</p>
              <a
                href="/jasa/15"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium mt-1"
              >
                <ExternalLink className="h-3 w-3" />
                Lihat Kalkulator Trucking
              </a>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                {Object.keys(truckingEdit).length} jenis kendaraan terdaftar
              </p>
              <Button size="sm" onClick={() => void saveTrucking()} disabled={truckingSaving} className="gap-2">
                {truckingSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Simpan Tarif Trucking
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Freight Rates ---- */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b">
          <Ship className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-base">Tarif Freight (Sea & Air)</h3>
          <span className="text-xs text-muted-foreground ml-1">— Harga pengiriman internasional</span>
        </div>

        {freightLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : freight ? (
          <div className="space-y-3">
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Jenis Layanan</th>
                    <th className="text-left px-4 py-2.5 font-medium">Satuan</th>
                    <th className="text-right px-4 py-2.5 font-medium">Tarif (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {FREIGHT_FIELDS.map(({ key, label, icon, field, unit }) => {
                    const row = (freightEdit as Record<string, Record<string, number | string>>)[key] ?? {};
                    const currentVal = (row[field] as number) ?? 0;
                    return (
                      <tr key={key} className="border-t hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="mr-2">{icon}</span>
                          <span className="font-medium">{label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{unit}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Input
                            type="number"
                            className="text-right h-8 w-40 ml-auto"
                            value={currentVal}
                            min={0}
                            onChange={(e) => setFreightEdit((prev) => ({
                              ...prev,
                              [key]: {
                                ...(((prev as Record<string, Record<string, number | string>>)[key]) ?? {}),
                                [field]: parseFloat(e.target.value) || 0,
                              },
                            }))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1">
              <p>💡 Tarif ini ditampilkan di halaman pemesanan logistik dan kalkulator biaya untuk pelanggan.</p>
              <p>LCL = Less than Container Load (dihitung per CBM). FCL = Full Container Load (harga flat per container).</p>
            </div>

            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={() => void saveFreight()} disabled={freightSaving} className="gap-2">
                {freightSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Simpan Tarif Freight
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const PORTAL_COMMODITY_EMOJIS: Record<string, string> = {
  coal: "⛏️", iron_steel: "🔩", coffee: "☕", electronics: "💻",
  palm_oil: "🌴", nickel: "⚙️", copper: "🔶", rice: "🌾",
  sugar: "🍬", rubber: "🧤", cocoa: "🍫", timber: "🪵",
  fertilizer: "🌱", cement: "🏗️", textile: "🧵", medical_device: "💊",
  general: "📦",
};

const FIELD_TYPE_LABELS_PORTAL: Record<string, string> = {
  text: "Teks", number: "Angka", select: "Pilihan", textarea: "Teks Panjang", date: "Tanggal",
};

function PortalTemplateDetailDialog({
  template, open, onOpenChange,
}: { template: ProductTemplate | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [section, setSection] = useState<"fields" | "docs" | "checklist" | "packaging">("fields");
  if (!template) return null;
  const emoji = PORTAL_COMMODITY_EMOJIS[template.category] ?? "📦";
  const reqDocs = template.requiredDocuments.filter(d => d.required);
  const optDocs = template.requiredDocuments.filter(d => !d.required);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="text-2xl">{emoji}</span>
            <div>
              <span>{template.label}</span>
              <p className="text-xs font-normal text-muted-foreground font-mono mt-0.5">{template.category} · v{template.version}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1.5 flex-wrap">
          {(["fields", "docs", "checklist", "packaging"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                section === s
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-background text-muted-foreground border-border hover:border-indigo-300 hover:text-indigo-700"
              }`}
            >
              {s === "fields" ? `📋 ${template.customFields.length} Custom Fields` :
               s === "docs" ? `📎 ${template.requiredDocuments.length} Dokumen` :
               s === "checklist" ? `✅ ${template.checklist.length} Checklist` :
               "📦 Pengemasan"}
            </button>
          ))}
        </div>

        <div className="space-y-3 mt-2">
          {section === "fields" && (
            <>
              {template.customFields.length === 0
                ? <p className="text-sm text-muted-foreground italic">Tidak ada custom field</p>
                : template.customFields.map(f => (
                  <div key={f.key} className={`border rounded-lg p-3 ${f.required ? "border-indigo-200 bg-indigo-50/30" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm">{f.label}</span>
                          {f.required && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">WAJIB</span>}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">key: {f.key}</p>
                        {f.options && f.options.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {f.options.map(o => <span key={o} className="text-xs bg-muted px-1.5 py-0.5 rounded">{o}</span>)}
                          </div>
                        )}
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                        {FIELD_TYPE_LABELS_PORTAL[f.type] ?? f.type}
                      </span>
                    </div>
                  </div>
                ))
              }
              {template.conditionalRules.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1"><Info className="h-3.5 w-3.5" /> Aturan Kondisional</p>
                  {template.conditionalRules.map((r, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      Jika <span className="font-mono bg-amber-100 px-1 rounded">{r.fieldKey}</span> = <span className="font-mono bg-amber-100 px-1 rounded">"{r.condition.value}"</span> → tampilkan: {r.show.join(", ")}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}

          {section === "docs" && (
            <>
              {reqDocs.length > 0 && (
                <><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dokumen Wajib</p>
                {reqDocs.map(d => (
                  <div key={d.key} className="flex items-center gap-3 border border-red-200 bg-red-50/30 rounded-lg p-3">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{d.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">key: {d.key}</p>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0">WAJIB</span>
                  </div>
                ))}</>
              )}
              {optDocs.length > 0 && (
                <><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mt-1">Opsional</p>
                {optDocs.map(d => (
                  <div key={d.key} className="flex items-center gap-3 border border-border rounded-lg p-3">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{d.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">key: {d.key}</p>
                    </div>
                  </div>
                ))}</>
              )}
              {template.requiredDocuments.length === 0 && <p className="text-sm text-muted-foreground italic">Tidak ada dokumen</p>}
            </>
          )}

          {section === "checklist" && (
            <>
              {template.checklist.length === 0
                ? <p className="text-sm text-muted-foreground italic">Tidak ada checklist</p>
                : template.checklist.map(c => (
                  <div key={c.key} className="flex items-center gap-3 border border-border rounded-lg p-3">
                    <div className="w-4 h-4 rounded border-2 border-muted-foreground/30 shrink-0" />
                    <div>
                      <p className="text-sm">{c.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">key: {c.key}</p>
                    </div>
                  </div>
                ))
              }
            </>
          )}

          {section === "packaging" && (
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <PackageCheck className="h-4 w-4 text-emerald-600" />
                <p className="text-xs font-semibold text-emerald-700">Instruksi Pengemasan & Pengiriman</p>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{template.packagingInstructions}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TemplateMiniFormLink = {
  id: number;
  token: string;
  serviceType: string;
  title: string | null;
  notes: string | null;
  adminNotes: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  vendorName: string | null;
};

function PortalProductTemplateEngine() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProductTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [linkTemplate, setLinkTemplate] = useState<ProductTemplate | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkCreating, setLinkCreating] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkNotes, setLinkNotes] = useState("");
  const [linkExpires, setLinkExpires] = useState("7");
  const [linkCopied, setLinkCopied] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [links, setLinks] = useState<TemplateMiniFormLink[]>([]);
  const [submissions, setSubmissions] = useState<MiniFormSubmission[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const allTemplates = Object.values(inCodeTemplates);

  const filtered = allTemplates.filter(t => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
  });

  const loadLinks = async () => {
    try {
      const [l, s] = await Promise.all([
        apiGet<TemplateMiniFormLink[]>("/api/portal/admin/vendor-form/links?formTarget=vendor"),
        apiGet<MiniFormSubmission[]>("/api/portal/admin/vendor-form/submissions"),
      ]);
      setLinks(l.filter(lk => typeof lk.adminNotes === "string" && /productCategory:\w+/.test(lk.adminNotes)));
      setSubmissions(s);
    } catch {
      /* silent */
    } finally {
      setLinksLoading(false);
    }
  };

  useEffect(() => { void loadLinks(); }, []);

  function openLinkDialog(e: React.MouseEvent, t: ProductTemplate) {
    e.stopPropagation();
    setLinkTemplate(t);
    setLinkTitle(`Form Template — ${t.label}`);
    setLinkNotes("");
    setLinkExpires("7");
    setCreatedToken(null);
    setLinkCopied(false);
    setLinkDialogOpen(true);
  }

  async function handleCreateLink() {
    if (!linkTemplate) return;
    setLinkCreating(true);
    try {
      const res = await fetch("/api/portal/admin/vendor-form/links", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          serviceType: "vendor_product_template",
          title: linkTitle.trim() || `Form Template — ${linkTemplate.label}`,
          notes: linkNotes.trim() || undefined,
          adminNotes: `productCategory:${linkTemplate.category}`,
          expiresInDays: linkExpires ? Number(linkExpires) : undefined,
          mode: "rate_collection",
          formTarget: "vendor",
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { token: string };
      setCreatedToken(data.token);
      toast({ title: "Link berhasil dibuat" });
      void loadLinks();
    } catch {
      toast({ title: "Gagal membuat link", variant: "destructive" });
    } finally {
      setLinkCreating(false);
    }
  }

  function copyCreatedLink() {
    if (!createdToken) return;
    const url = `${window.location.origin}/vendor-mini-form/${createdToken}`;
    void navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function copyLink(token: string, id: number) {
    const url = `${window.location.origin}/vendor-mini-form/${token}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  async function handleToggleLink(link: TemplateMiniFormLink) {
    try {
      const res = await fetch(`/api/portal/admin/vendor-form/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ isActive: !link.isActive }),
      });
      if (!res.ok) throw new Error();
      void loadLinks();
    } catch {
      toast({ title: "Gagal update status", variant: "destructive" });
    }
  }

  async function handleDeleteLink(id: number) {
    try {
      const res = await fetch(`/api/portal/admin/vendor-form/links/${id}`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error();
      toast({ title: "Link dihapus" });
      void loadLinks();
    } catch {
      toast({ title: "Gagal hapus link", variant: "destructive" });
    }
  }

  function getCategoryFromAdminNotes(adminNotes: string | null): string | null {
    if (!adminNotes) return null;
    const m = /productCategory:(\w+)/.exec(adminNotes);
    return m ? m[1] : null;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-base">Product Template Engine</h3>
            <p className="text-xs text-indigo-100 mt-0.5">
              Template komoditas untuk form vendor — custom fields, dokumen, checklist, dan instruksi pengemasan per jenis barang.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Komoditas", value: allTemplates.length },
            { label: "Custom Fields", value: allTemplates.reduce((s, t) => s + t.customFields.length, 0) },
            { label: "Dok Terkonfigurasi", value: allTemplates.reduce((s, t) => s + t.requiredDocuments.length, 0) },
          ].map(s => (
            <div key={s.label} className="bg-white/15 rounded-lg p-2.5 text-center">
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[10px] text-indigo-100">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="Cari komoditas..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(t => {
          const emoji = PORTAL_COMMODITY_EMOJIS[t.category] ?? "📦";
          const reqDocs = t.requiredDocuments.filter(d => d.required).length;
          return (
            <div
              key={t.category}
              className="border border-border bg-card rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all group"
            >
              <button
                className="w-full text-left"
                onClick={() => { setSelected(t); setDialogOpen(true); }}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg border border-border bg-muted/50 flex items-center justify-center text-lg shrink-0 group-hover:bg-indigo-50 group-hover:border-indigo-200 transition-colors">
                    {emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground group-hover:text-indigo-700 transition-colors">{t.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{t.category}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-indigo-500 shrink-0 mt-0.5 transition-colors" />
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-muted/50 rounded-lg p-1.5">
                    <p className="text-sm font-bold text-indigo-600">{t.customFields.length}</p>
                    <p className="text-[10px] text-muted-foreground">Fields</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-1.5">
                    <p className={`text-sm font-bold ${reqDocs > 0 ? "text-red-500" : "text-muted-foreground"}`}>{reqDocs}</p>
                    <p className="text-[10px] text-muted-foreground">Dok Wajib</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-1.5">
                    <p className="text-sm font-bold text-emerald-600">{t.checklist.length}</p>
                    <p className="text-[10px] text-muted-foreground">Checklist</p>
                  </div>
                </div>
                {t.requiredDocuments.filter(d => d.required).slice(0, 1).map(d => (
                  <div key={d.key} className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                    <span className="truncate">{d.label}</span>
                  </div>
                ))}
                {reqDocs > 1 && <p className="text-xs text-muted-foreground mt-1">+{reqDocs - 1} dokumen wajib lainnya</p>}
              </button>

              <div className="mt-3 pt-3 border-t border-border flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs gap-1"
                  onClick={() => { setSelected(t); setDialogOpen(true); }}
                >
                  <Eye className="h-3 w-3" />
                  Detail
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  onClick={e => openLinkDialog(e, t)}
                >
                  <Link2 className="h-3 w-3" />
                  Buat Link
                </Button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center py-12 text-muted-foreground gap-2">
            <Layers className="h-8 w-8 opacity-20" />
            <p className="text-sm">Tidak ada hasil untuk pencarian ini</p>
          </div>
        )}
      </div>

      {/* ── Daftar Form Link dari Template ─────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4 text-indigo-500" />
            Form Link dari Template
            {links.length > 0 && (
              <span className="text-xs font-normal bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
                {links.length}
              </span>
            )}
          </h3>
          <span className="text-xs text-muted-foreground">
            {links.filter(l => l.isActive).length} aktif · {links.filter(l => l.expiresAt && new Date(l.expiresAt) < new Date()).length} expired
          </span>
        </div>

        {linksLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground gap-2 rounded-xl border border-dashed border-border">
            <Link2 className="h-7 w-7 opacity-20" />
            <p className="text-sm">Belum ada form link dari template.</p>
            <p className="text-xs">Klik "Buat Link" pada kartu komoditas di atas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {links.map(link => {
              const cat = getCategoryFromAdminNotes(link.adminNotes);
              const tmpl = cat ? inCodeTemplates[cat] : null;
              const emoji = cat ? (PORTAL_COMMODITY_EMOJIS[cat] ?? "📦") : "📦";
              const expired = link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
              const isActive = link.isActive && !expired;
              const subCount = submissions.filter(s => s.linkId === link.id).length;
              return (
                <div
                  key={link.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors"
                >
                  <div className="text-xl shrink-0">{emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {link.title ?? (tmpl ? `Form Template — ${tmpl.label}` : "Form Vendor")}
                      </span>
                      <Badge
                        variant={isActive ? "default" : "secondary"}
                        className={`text-[10px] shrink-0 ${isActive ? "bg-emerald-100 text-emerald-700 border-emerald-200" : ""}`}
                      >
                        {isActive ? "Aktif" : expired ? "Expired" : "Nonaktif"}
                      </Badge>
                      {subCount > 0 && (
                        <Badge variant="outline" className="text-[10px] shrink-0 text-indigo-600 border-indigo-300">
                          {subCount} submission
                        </Badge>
                      )}
                      {tmpl && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {tmpl.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                      {`${window.location.origin}/vendor-mini-form/${link.token}`}
                    </p>
                    {link.expiresAt && (
                      <p className={`text-[10px] mt-0.5 ${expired ? "text-red-500" : "text-muted-foreground"}`}>
                        {expired ? "Expired" : "Kadaluarsa"}: {new Date(link.expiresAt).toLocaleDateString("id-ID")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="Salin link"
                      onClick={() => copyLink(link.token, link.id)}
                    >
                      {copiedId === link.id
                        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                        : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <a href={`${window.location.origin}/vendor-mini-form/${link.token}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Buka form">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title={link.isActive ? "Nonaktifkan" : "Aktifkan"}
                      onClick={() => void handleToggleLink(link)}
                    >
                      {link.isActive
                        ? <ToggleRight className="h-4 w-4 text-emerald-500" />
                        : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Hapus"
                      onClick={() => void handleDeleteLink(link.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <PortalTemplateDetailDialog
        template={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <Dialog open={linkDialogOpen} onOpenChange={v => { setLinkDialogOpen(v); if (!v) setCreatedToken(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{linkTemplate ? (PORTAL_COMMODITY_EMOJIS[linkTemplate.category] ?? "📦") : "📦"}</span>
              Buat Form Link — {linkTemplate?.label}
            </DialogTitle>
          </DialogHeader>

          {createdToken ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
                <p className="text-sm font-semibold text-emerald-700 mb-1">Link berhasil dibuat!</p>
                <p className="text-xs text-emerald-600">Salin dan kirim ke vendor</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs break-all text-muted-foreground">
                {`${window.location.origin}/vendor-mini-form/${createdToken}`}
              </div>
              <Button className="w-full gap-2" onClick={copyCreatedLink}>
                <Copy className="h-4 w-4" />
                {linkCopied ? "Tersalin!" : "Salin Link"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { setLinkDialogOpen(false); setCreatedToken(null); }}>
                Tutup
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label>Judul Form</Label>
                  <Input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder={`Form Template — ${linkTemplate?.label ?? ""}`} />
                </div>
                <div className="space-y-1.5">
                  <Label>Instruksi untuk Vendor (opsional)</Label>
                  <Textarea value={linkNotes} onChange={e => setLinkNotes(e.target.value)} rows={2} placeholder="Instruksi khusus..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Kadaluarsa (hari)</Label>
                  <Input type="number" value={linkExpires} onChange={e => setLinkExpires(e.target.value)} placeholder="Kosong = no limit" />
                </div>
                {linkTemplate && (
                  <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-xs space-y-1">
                    <p className="font-medium text-indigo-700">Template akan disertakan:</p>
                    <p className="text-indigo-600">{linkTemplate.customFields.length} custom field · {linkTemplate.requiredDocuments.filter(d => d.required).length} dok wajib · {linkTemplate.checklist.length} checklist</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Batal</Button>
                <Button onClick={() => void handleCreateLink()} disabled={linkCreating}>
                  {linkCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                  {linkCreating ? "Membuat..." : "Buat Link"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClaimAdminTab() {
  const { toast } = useToast();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const alreadyAdmin = isPortalAdmin();

  async function handleClaim() {
    setLoading(true);
    try {
      const result = await apiPost<{ token: string; role: string }>("/api/portal/admin/claim", { key });
      setAuthToken(result.token);
      toast({ title: "Berhasil! Anda sekarang adalah admin.", description: "Halaman akan dimuat ulang." });
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      toast({ title: "Kunci admin tidak valid", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (alreadyAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <CheckCircle className="h-12 w-12 text-green-500" />
        <p className="text-lg font-semibold">Anda sudah menjadi Admin</p>
        <p className="text-muted-foreground text-sm">Semua fitur admin telah aktif.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">
        Masukkan kunci rahasia admin untuk mengaktifkan akses admin pada akun Anda.
        Kunci ini diatur oleh administrator sistem.
      </p>
      <div className="space-y-1.5">
        <Label>Kunci Admin</Label>
        <Input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Masukkan kunci admin..."
          onKeyDown={(e) => { if (e.key === "Enter") void handleClaim(); }}
        />
      </div>
      <Button onClick={handleClaim} disabled={loading || !key} className="gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        {loading ? "Memverifikasi..." : "Aktifkan Admin"}
      </Button>
    </div>
  );
}

const MINI_FORM_SERVICE_META: Record<string, { label: string; emoji: string }> = {
  // Vendor schemas
  product: { label: "Produk", emoji: "📦" },
  trucking: { label: "Trucking", emoji: "🚛" },
  sea_freight: { label: "Sea Freight", emoji: "🚢" },
  air_freight: { label: "Air Freight", emoji: "✈️" },
  ppjk: { label: "PPJK / Customs Clearance", emoji: "📋" },
  handling: { label: "Handling / Warehouse", emoji: "🏭" },
  document: { label: "Document / Additional", emoji: "📄" },
  exim_service: { label: "Exim Service", emoji: "🌐" },
  // Customer schemas
  customer_shipment: { label: "Permintaan Pengiriman", emoji: "📦" },
  customer_quote: { label: "Permintaan Penawaran Harga", emoji: "💼" },
  customer_document: { label: "Pengiriman Dokumen", emoji: "📋" },
  customer_complaint: { label: "Keluhan / Klaim", emoji: "⚠️" },
  customer_product: { label: "Pemesanan Produk", emoji: "🛒" },
  // Admin / Internal schemas
  admin_checklist: { label: "Checklist Proses", emoji: "✅" },
  admin_handover: { label: "Serah Terima Pekerjaan", emoji: "🤝" },
  admin_inspection: { label: "Laporan Inspeksi", emoji: "🔍" },
  admin_rfq_forward: { label: "Forward RFQ Customer ke Vendor", emoji: "📨" },
};

type SchemaField = {
  key: string; label: string; type: string;
  options?: string[]; required?: boolean; placeholder?: string;
  section?: "quotation" | "operational" | "both";
};
type ServiceSchemas = Record<string, { label: string; emoji: string; fields: SchemaField[] }>;

type MiniFormLink = {
  id: number;
  token: string;
  serviceType: string;
  title: string | null;
  notes: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  vendorName: string | null;
};

type MiniFormSubmission = {
  id: number;
  linkId: number | null;
  serviceType: string;
  vendorName: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  formData: Record<string, unknown>;
  submittedAt: string;
};

function MiniFormTab({ formTarget }: { formTarget: "vendor" | "customer" | "admin" }) {
  const { toast } = useToast();
  const [links, setLinks] = useState<MiniFormLink[]>([]);
  const [submissions, setSubmissions] = useState<MiniFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newServiceType, setNewServiceType] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newExpires, setNewExpires] = useState("");
  const [newMode, setNewMode] = useState<"rate_collection" | "operational_update">("rate_collection");
  const [newVendorName, setNewVendorName] = useState("");
  const [newMaxSubs, setNewMaxSubs] = useState("");
  const [selectedLink, setSelectedLink] = useState<MiniFormLink | null>(null);
  const [schemas, setSchemas] = useState<ServiceSchemas>({});

  const load = async () => {
    try {
      const [l, s, sc] = await Promise.all([
        apiGet<MiniFormLink[]>(`/api/portal/admin/vendor-form/links?formTarget=${formTarget}`),
        apiGet<MiniFormSubmission[]>("/api/portal/admin/vendor-form/submissions"),
        apiGet<ServiceSchemas>("/api/portal/admin/vendor-form/schemas").catch(() => ({} as ServiceSchemas)),
      ]);
      setLinks(l);
      setSubmissions(s);
      setSchemas(sc);
    } catch {
      toast({ title: "Gagal memuat data mini form", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const previewFields = (() => {
    const sc = schemas[newServiceType];
    if (!sc) return [] as SchemaField[];
    return sc.fields.filter(f => {
      const sec = f.section ?? "quotation";
      if (newMode === "rate_collection") return sec === "quotation" || sec === "both";
      return sec === "operational" || sec === "both";
    });
  })();

  const handleCreate = async () => {
    if (!newServiceType) { toast({ title: "Pilih service type dulu", variant: "destructive" }); return; }
    setCreating(true);
    try {
      await apiPost("/api/portal/admin/vendor-form/links", {
        serviceType: newServiceType,
        title: newTitle.trim() || undefined,
        notes: newNotes.trim() || undefined,
        expiresInDays: newExpires ? Number(newExpires) : undefined,
        mode: newMode,
        vendorName: newVendorName.trim() || undefined,
        maxSubmissions: newMaxSubs ? Number(newMaxSubs) : undefined,
        formTarget,
      });
      toast({ title: "Link berhasil dibuat" });
      setShowCreate(false);
      setNewServiceType(""); setNewTitle(""); setNewNotes(""); setNewExpires("");
      setNewMode("rate_collection"); setNewVendorName(""); setNewMaxSubs("");
      void load();
    } catch {
      toast({ title: "Gagal membuat link", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (link: MiniFormLink) => {
    try {
      const res = await fetch(`/api/portal/admin/vendor-form/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ isActive: !link.isActive }),
      });
      if (!res.ok) throw new Error();
      void load();
    } catch {
      toast({ title: "Gagal update status", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/portal/admin/vendor-form/links/${id}`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error();
      toast({ title: "Link dihapus" });
      if (selectedLink?.id === id) setSelectedLink(null);
      void load();
    } catch {
      toast({ title: "Gagal hapus link", variant: "destructive" });
    }
  };

  const formPath = formTarget === "customer" ? "customer-mini-form" : formTarget === "admin" ? "admin-mini-form" : "vendor-mini-form";

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/${formPath}/${token}`;
    void navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link disalin ke clipboard" });
    });
  };

  const buildUrl = (token: string) => `${window.location.origin}/${formPath}/${token}`;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  const linkSubs = selectedLink ? submissions.filter(s => s.linkId === selectedLink.id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{links.length}</strong> total link</span>
          <span><strong className="text-green-600">{links.filter(l => l.isActive).length}</strong> aktif</span>
          <span><strong className="text-indigo-500">{submissions.length}</strong> submission</span>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Buat Link Form
        </Button>
      </div>

      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Link2 className="h-12 w-12 opacity-20" />
          <p className="text-sm">Belum ada link mini form.</p>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Buat Link Pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {links.map(link => {
            const meta = MINI_FORM_SERVICE_META[link.serviceType];
            const expired = link.expiresAt && new Date(link.expiresAt) < new Date();
            const isActive = link.isActive && !expired;
            const linkSubs = submissions.filter(s => s.linkId === link.id).length;
            return (
              <div
                key={link.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors"
              >
                <div className="text-xl shrink-0">{meta?.emoji ?? "📄"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {link.title ?? `Form ${meta?.label ?? link.serviceType}`}
                    </span>
                    <Badge variant={isActive ? "default" : "secondary"} className="text-[10px] shrink-0">
                      {isActive ? "Aktif" : expired ? "Kadaluarsa" : "Nonaktif"}
                    </Badge>
                    {linkSubs > 0 && (
                      <Badge variant="outline" className="text-[10px] shrink-0 text-indigo-600 border-indigo-300">
                        {linkSubs} submission
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                    {buildUrl(link.token)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Salin link"
                    onClick={() => copyLink(link.token)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <a href={buildUrl(link.token)} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Buka form">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={link.isActive ? "Nonaktifkan" : "Aktifkan"}
                    onClick={() => void handleToggle(link)}
                  >
                    {link.isActive
                      ? <ToggleRight className="h-4 w-4 text-green-500" />
                      : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Hapus"
                    onClick={() => void handleDelete(link.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {submissions.filter(s => s.linkId === link.id).length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => setSelectedLink(selectedLink?.id === link.id ? null : link)}
                    >
                      Lihat Submission
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedLink && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Submission — {selectedLink.title ?? selectedLink.serviceType} ({linkSubs.length})
            </h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedLink(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {linkSubs.map(sub => (
              <div key={sub.id} className="border border-border rounded-lg p-3 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{sub.vendorName ?? "—"}</span>
                    {sub.contactPerson && <span className="text-muted-foreground">· {sub.contactPerson}</span>}
                    {sub.contactPhone && <span className="text-muted-foreground">· {sub.contactPhone}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(sub.submittedAt).toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(sub.formData ?? {})
                    .filter(([, v]) => v !== "" && v !== null && v !== undefined)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs border-b border-border/50 py-1">
                        <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                        <span className="font-medium text-right">{String(v)}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={v => { setShowCreate(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Link Form Baru</DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-2 gap-4 py-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Service Type <span className="text-red-500">*</span></Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newServiceType}
                  onChange={e => setNewServiceType(e.target.value)}
                >
                  <option value="">Pilih tipe layanan...</option>
                  {Object.entries(MINI_FORM_SERVICE_META)
                    .filter(([k]) => {
                      if (formTarget === "customer") return k.startsWith("customer_");
                      if (formTarget === "admin") return k.startsWith("admin_");
                      return !k.startsWith("customer_") && !k.startsWith("admin_");
                    })
                    .map(([k, v]) => (
                      <option key={k} value={k}>{v.emoji} {v.label}</option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Mode Form <span className="text-red-500">*</span></Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newMode}
                  onChange={e => setNewMode(e.target.value as "rate_collection" | "operational_update")}
                >
                  <option value="rate_collection">Rate Collection (penawaran harga)</option>
                  <option value="operational_update">Operational Update (update data lapangan)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {newMode === "rate_collection"
                    ? "Vendor mengisi data penawaran/quotation."
                    : "Vendor mengisi data operasional setelah order jalan."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Judul Form (opsional)</Label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Contoh: Penawaran Rate Trucking Q3 2025" />
              </div>
              <div className="space-y-1.5">
                <Label>Nama Vendor (opsional)</Label>
                <Input value={newVendorName} onChange={e => setNewVendorName(e.target.value)} placeholder="Pre-fill nama vendor di form" />
              </div>
              <div className="space-y-1.5">
                <Label>Instruksi untuk Vendor</Label>
                <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={3} placeholder="Instruksi khusus untuk vendor..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Kadaluarsa (hari)</Label>
                  <Input type="number" value={newExpires} onChange={e => setNewExpires(e.target.value)} placeholder="Kosong = no limit" />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Submission</Label>
                  <Input type="number" value={newMaxSubs} onChange={e => setNewMaxSubs(e.target.value)} placeholder="Kosong = unlimited" />
                </div>
              </div>
            </div>
            <div className="space-y-2 md:border-l md:pl-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Preview Field yang Akan Diisi
              </Label>
              {!newServiceType ? (
                <div className="text-sm text-muted-foreground italic py-8 text-center">
                  Pilih service type untuk lihat field
                </div>
              ) : previewFields.length === 0 ? (
                <div className="text-sm text-muted-foreground italic py-8 text-center">
                  Schema belum ter-load atau service type tidak punya field untuk mode ini
                </div>
              ) : (
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2">
                  {previewFields.map(f => (
                    <div key={f.key} className="flex items-start justify-between text-xs border-b border-border/40 py-1.5 gap-2">
                      <div className="flex-1">
                        <div className="font-medium">
                          {f.label}
                          {f.required && <span className="text-red-500 ml-1">*</span>}
                        </div>
                        {f.options && f.options.length > 0 && (
                          <div className="text-muted-foreground text-[10px] mt-0.5">
                            {f.options.slice(0, 4).join(" · ")}{f.options.length > 4 ? " · …" : ""}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        {f.type}
                      </span>
                    </div>
                  ))}
                  <div className="text-[11px] text-muted-foreground pt-2">
                    Total: {previewFields.length} field
                    {previewFields.filter(f => f.required).length > 0 && (
                      <> · {previewFields.filter(f => f.required).length} wajib</>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {creating ? "Membuat..." : "Buat Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ErpStats = {
  portalOrdersThisMonth: number;
  activeCustomers: number;
  pendingRfqs: number;
  salesRevenueThisMonth: number;
  activeFreightShipments: number;
  inTransitShipments: number;
};

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [erpStats, setErpStats] = useState<ErpStats | null>(null);
  const [erpStatsLoading, setErpStatsLoading] = useState(false);

  function fetchErpStats() {
    if (!isPortalAdmin()) return;
    setErpStatsLoading(true);
    fetch("/api/portal/admin/erp-stats", { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() as Promise<ErpStats> : null)
      .then((d) => { if (d) setErpStats(d); })
      .catch(() => {})
      .finally(() => setErpStatsLoading(false));
  }

  useEffect(() => {
    if (!isAuthenticated()) {
      setLocation("/login");
    }
  }, []);

  useEffect(() => {
    fetchErpStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isAuthenticated()) return null;

  const isAdmin = isPortalAdmin();

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <div className="bg-background border-b border-border">
        <div className="container mx-auto px-4 md:px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 text-amber-700 p-2.5 rounded-lg">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
              <p className="text-muted-foreground text-sm">
                Kelola konten website PT. Cahaya Sejati Teknologi
              </p>
            </div>
            {isAdmin && (
              <Badge className="ml-auto bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                Admin Aktif
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-8">
        <Tabs defaultValue={isAdmin ? "content" : "claim"}>
          <TabsList className="mb-6">
            {isAdmin && (
              <>
                <TabsTrigger value="content" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Konten Website
                </TabsTrigger>
                <TabsTrigger value="services" className="gap-2">
                  <Settings className="h-4 w-4" />
                  Kelola Layanan
                </TabsTrigger>
                <TabsTrigger value="products" className="gap-2">
                  <Box className="h-4 w-4" />
                  Kelola Produk
                </TabsTrigger>
                <TabsTrigger value="couriers" className="gap-2">
                  <Truck className="h-4 w-4" />
                  Kurir
                </TabsTrigger>
                <TabsTrigger value="pricing" className="gap-2">
                  <Tag className="h-4 w-4" />
                  Kelola Harga
                </TabsTrigger>
                <TabsTrigger value="mini-forms" className="gap-2">
                  <Link2 className="h-4 w-4" />
                  Mini Form
                </TabsTrigger>
                <TabsTrigger value="product-templates" className="gap-2">
                  <Layers className="h-4 w-4" />
                  Product Templates
                </TabsTrigger>
                <TabsTrigger value="bizportal-erp" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  BizPortal ERP
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="claim" className="gap-2">
              <Shield className="h-4 w-4" />
              Aktivasi Admin
            </TabsTrigger>
          </TabsList>

          {isAdmin && (
            <>
              <TabsContent value="content">
                <Card>
                  <CardHeader>
                    <CardTitle>Konten Website</CardTitle>
                    <CardDescription>
                      Edit teks yang tampil di berbagai bagian website publik.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ContentTab />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="services">
                <Card>
                  <CardHeader>
                    <CardTitle>Kelola Layanan</CardTitle>
                    <CardDescription>
                      Edit nama, deskripsi, harga, dan gambar untuk setiap layanan.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ServicesTab />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="products">
                <Card>
                  <CardHeader>
                    <CardTitle>Kelola Produk</CardTitle>
                    <CardDescription>
                      Edit nama, deskripsi, harga, dan gambar untuk setiap produk.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ProductsTab />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="couriers">
                <Card>
                  <CardHeader>
                    <CardTitle>Vendor Kurir & Pengiriman</CardTitle>
                    <CardDescription>
                      Kelola daftar kurir yang ditampilkan ke pelanggan saat memilih pengiriman produk. Aktifkan/nonaktifkan, edit ongkir, atau tambah vendor baru.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DeliveryVendorsTab />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pricing">
                <Card>
                  <CardHeader>
                    <CardTitle>Kelola Harga Trucking & Freight</CardTitle>
                    <CardDescription>
                      Atur tarif trucking (per km + biaya muat) dan tarif freight internasional (Sea LCL/FCL, Air, Custom Clearance). Harga ini akan ditampilkan di kalkulator dan form pemesanan logistik.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PricingTab />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="mini-forms">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-indigo-500" />
                      Mini Form
                    </CardTitle>
                    <CardDescription>
                      Buat dan kelola link form dinamis. Bagikan ke penerima — mereka cukup membuka link dan mengisi form tanpa perlu login.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="vendor">
                      <TabsList className="mb-4">
                        <TabsTrigger value="vendor">🚛 Vendor</TabsTrigger>
                        <TabsTrigger value="customer">👤 Customer</TabsTrigger>
                        <TabsTrigger value="admin">🔐 Internal</TabsTrigger>
                      </TabsList>
                      <TabsContent value="vendor">
                        <MiniFormTab formTarget="vendor" />
                      </TabsContent>
                      <TabsContent value="customer">
                        <MiniFormTab formTarget="customer" />
                      </TabsContent>
                      <TabsContent value="admin">
                        <MiniFormTab formTarget="admin" />
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="product-templates">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="h-5 w-5 text-indigo-500" />
                      Product Template Engine
                    </CardTitle>
                    <CardDescription>
                      Referensi template komoditas multi-jenis — custom fields, dokumen wajib, checklist operasional, dan instruksi pengemasan per kategori barang.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PortalProductTemplateEngine />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bizportal-erp">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">BizPortal ERP</h2>
                      <p className="text-sm text-muted-foreground mt-1">Akses cepat ke semua modul ERP internal. Klik modul untuk membuka BizPortal.</p>
                    </div>
                    <a
                      href="/bizportal/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
                    >
                      <Building2 className="h-4 w-4" />
                      Buka BizPortal
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>

                  {/* Quick Stats */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Statistik Real-time</p>
                    <button
                      onClick={fetchErpStats}
                      disabled={erpStatsLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <Loader2 className={`h-3.5 w-3.5 ${erpStatsLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      {
                        label: "Order Portal (bulan ini)",
                        value: erpStats?.portalOrdersThisMonth,
                        icon: ClipboardList,
                        color: "text-blue-600",
                        bg: "bg-blue-50",
                        href: "/bizportal/logistics/portal-orders",
                      },
                      {
                        label: "Freight Aktif",
                        value: erpStats?.activeFreightShipments,
                        icon: Ship,
                        color: "text-indigo-600",
                        bg: "bg-indigo-50",
                        href: "/bizportal/logistics/freight",
                      },
                      {
                        label: "Dalam Pengiriman",
                        value: erpStats?.inTransitShipments,
                        icon: Truck,
                        color: "text-cyan-600",
                        bg: "bg-cyan-50",
                        href: "/bizportal/logistics/freight",
                      },
                      {
                        label: "RFQ Pending",
                        value: erpStats?.pendingRfqs,
                        icon: FileText,
                        color: "text-orange-600",
                        bg: "bg-orange-50",
                        href: "/bizportal/logistics/rfq",
                      },
                      {
                        label: "Revenue Bulan Ini",
                        value: erpStats?.salesRevenueThisMonth,
                        isRupiah: true,
                        icon: BarChart2,
                        color: "text-green-600",
                        bg: "bg-green-50",
                        href: "/bizportal/reports/sales",
                      },
                      {
                        label: "Pelanggan Portal",
                        value: erpStats?.activeCustomers,
                        icon: Users,
                        color: "text-purple-600",
                        bg: "bg-purple-50",
                        href: "/bizportal/portal/customers",
                      },
                    ].map(({ label, value, isRupiah, icon: Icon, color, bg, href }) => (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col gap-2 p-4 rounded-xl border bg-white hover:shadow-md transition-all group"
                      >
                        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                          <Icon className={`h-4 w-4 ${color}`} />
                        </div>
                        <div>
                          {erpStatsLoading ? (
                            <div className="h-6 w-12 bg-muted animate-pulse rounded" />
                          ) : (
                            <p className="text-xl font-bold text-gray-900">
                              {value === undefined ? "—" : isRupiah
                                ? new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(value)
                                : value.toLocaleString("id-ID")}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground leading-tight mt-0.5">{label}</p>
                        </div>
                      </a>
                    ))}
                  </div>

                  {[
                    {
                      label: "Dashboard & Utama",
                      color: "bg-slate-50 border-slate-200",
                      iconColor: "text-slate-600",
                      items: [
                        { icon: LayoutDashboard, label: "Dashboard", path: "/bizportal/dashboard" },
                        { icon: ClipboardList, label: "Approvals", path: "/bizportal/approvals" },
                        { icon: Building2, label: "Holding / Grup", path: "/bizportal/holding" },
                      ],
                    },
                    {
                      label: "Logistik",
                      color: "bg-blue-50 border-blue-200",
                      iconColor: "text-blue-600",
                      items: [
                        { icon: Ship, label: "Freight Shipments", path: "/bizportal/logistics/freight" },
                        { icon: ClipboardList, label: "Portal Orders", path: "/bizportal/logistics/portal-orders" },
                        { icon: Truck, label: "Drivers", path: "/bizportal/logistics/drivers" },
                        { icon: FileText, label: "RFQ Logistik", path: "/bizportal/logistics/rfq" },
                        { icon: Tag, label: "Quote Requests", path: "/bizportal/logistics/quote-requests" },
                        { icon: BarChart2, label: "Margin Rules", path: "/bizportal/logistics/margin-rules" },
                      ],
                    },
                    {
                      label: "Sales",
                      color: "bg-green-50 border-green-200",
                      iconColor: "text-green-600",
                      items: [
                        { icon: FileText, label: "Quotations", path: "/bizportal/sales/quotations" },
                        { icon: ShoppingCart, label: "Sales Orders", path: "/bizportal/sales/orders" },
                        { icon: Receipt, label: "Invoices", path: "/bizportal/sales/documents" },
                        { icon: Users, label: "Pelanggan Portal", path: "/bizportal/portal/customers" },
                        { icon: Store, label: "E-commerce", path: "/bizportal/ecommerce" },
                        { icon: Package, label: "Portal Product Orders", path: "/bizportal/portal-product-orders" },
                      ],
                    },
                    {
                      label: "Purchase",
                      color: "bg-orange-50 border-orange-200",
                      iconColor: "text-orange-600",
                      items: [
                        { icon: ClipboardList, label: "Purchase Requests", path: "/bizportal/purchase/pr" },
                        { icon: FileText, label: "RFQ Purchase", path: "/bizportal/purchase/rfq" },
                        { icon: ShoppingCart, label: "Purchase Orders", path: "/bizportal/purchase/orders" },
                        { icon: PackageCheck, label: "Goods Receipt", path: "/bizportal/purchase/gr" },
                        { icon: Users, label: "Vendors", path: "/bizportal/purchase/vendors" },
                        { icon: Receipt, label: "Bills", path: "/bizportal/purchase/bills" },
                      ],
                    },
                    {
                      label: "Accounting",
                      color: "bg-purple-50 border-purple-200",
                      iconColor: "text-purple-600",
                      items: [
                        { icon: BookOpen, label: "Chart of Accounts", path: "/bizportal/accounting/accounts" },
                        { icon: FileText, label: "Journal Entries", path: "/bizportal/accounting/entries" },
                        { icon: Wallet, label: "Payments", path: "/bizportal/accounting/payments" },
                        { icon: BarChart2, label: "Trial Balance", path: "/bizportal/accounting/reports/trial-balance" },
                        { icon: BarChart2, label: "Profit & Loss", path: "/bizportal/accounting/reports/profit-loss" },
                        { icon: BarChart2, label: "Balance Sheet", path: "/bizportal/accounting/reports/balance-sheet" },
                      ],
                    },
                    {
                      label: "Expenses & Reports",
                      color: "bg-rose-50 border-rose-200",
                      iconColor: "text-rose-600",
                      items: [
                        { icon: Receipt, label: "Expense", path: "/bizportal/expense" },
                        { icon: BarChart2, label: "Laporan Sales", path: "/bizportal/reports/sales" },
                        { icon: BarChart2, label: "Laporan Purchase", path: "/bizportal/reports/purchase" },
                        { icon: BarChart2, label: "AR Aging", path: "/bizportal/reports/ar-aging" },
                        { icon: BarChart2, label: "AP Aging", path: "/bizportal/reports/ap-aging" },
                        { icon: ClipboardList, label: "Audit Log", path: "/bizportal/reports/audit-log" },
                      ],
                    },
                    {
                      label: "Lainnya",
                      color: "bg-amber-50 border-amber-200",
                      iconColor: "text-amber-600",
                      items: [
                        { icon: Mail, label: "Correspondences", path: "/bizportal/correspondences" },
                        { icon: Package, label: "Trading", path: "/bizportal/trading" },
                        { icon: Store, label: "Katalog Terpadu", path: "/bizportal/katalog-terpadu" },
                        { icon: Settings, label: "Org & HR", path: "/bizportal/org" },
                      ],
                    },
                  ].map((section) => (
                    <div key={section.label} className={`rounded-xl border p-4 ${section.color}`}>
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{section.label}</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {section.items.map(({ icon: Icon, label, path }) => (
                          <a
                            key={path}
                            href={path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-white border border-white/80 hover:border-indigo-200 hover:shadow-sm transition-all group cursor-pointer"
                          >
                            <Icon className={`h-5 w-5 ${section.iconColor} group-hover:scale-110 transition-transform`} />
                            <span className="text-xs text-center font-medium text-gray-700 leading-tight">{label}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </>
          )}

          <TabsContent value="claim">
            <Card>
              <CardHeader>
                <CardTitle>Aktivasi Admin</CardTitle>
                <CardDescription>
                  Aktifkan hak akses admin menggunakan kunci rahasia.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ClaimAdminTab />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
