import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, isPortalAdmin, getAuthHeaders, setAuthToken } from "@/lib/auth";
import { resolveImageUrl } from "@/lib/utils";
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
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

function useVideoThumbnail(src: string | null) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.muted = true;
    vid.playsInline = true;
    vid.src = src;
    vid.addEventListener("loadedmetadata", () => { vid.currentTime = 0.1; });
    vid.addEventListener("seeked", () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = vid.videoWidth || 320;
        canvas.height = vid.videoHeight || 240;
        canvas.getContext("2d")?.drawImage(vid, 0, 0, canvas.width, canvas.height);
        setThumb(canvas.toDataURL("image/jpeg", 0.7));
      } catch { /* tainted — leave null */ }
    }, { once: true });
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
};

type MediaItem = { type: "image" | "video"; url: string };

type Product = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  mediaItems: MediaItem[];
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
    if (!file.type.startsWith("image/")) {
      toast({ title: "Hanya file gambar", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { uploadURL, objectPath } = await apiPost<{ uploadURL: string; objectPath: string }>(
        "/api/portal/admin/upload-url",
        { contentType: file.type }
      );
      await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const publicUrl = `/api/storage${objectPath}`;
      setPreview(publicUrl);
      onUpload(publicUrl);
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
          <img src={preview} alt="preview" className="h-full w-full object-cover" />
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
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
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
}: {
  mediaItems: MediaItem[];
  onChange: (items: MediaItem[]) => void;
}) {
  const { toast } = useToast();
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: File[], type: "image" | "video") {
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
                <img src={resolveImageUrl(m.url) ?? ""} alt="" className="w-full h-full object-cover" />
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
        <div className="rounded-lg border-2 border-dashed border-border h-28 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <ImageIcon className="h-7 w-7" />
          <span className="text-xs">Belum ada media</span>
        </div>
      )}

      {/* Upload buttons */}
      <input ref={imgRef} type="file" accept="image/*" multiple className="hidden"
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
      <p className="text-xs text-muted-foreground">Foto pertama jadi cover. Foto bisa lebih dari satu.</p>
    </div>
  );
}

function ItemEditCard({
  item,
  onSave,
  type,
}: {
  item: Service | Product;
  onSave: (id: number, data: Partial<Service & { mediaItems: MediaItem[] }>) => Promise<void>;
  type: "services" | "products";
}) {
  const { toast } = useToast();
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState(String(item.price));
  const [imageUrl, setImageUrl] = useState<string | null>(item.imageUrl);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(
    type === "products" ? (item as Product).mediaItems ?? [] : []
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Partial<Service & { mediaItems: MediaItem[] }> = {
        name,
        description: description || null,
        price: parseFloat(price) || 0,
        imageUrl: type === "products" && mediaItems.length > 0
          ? (mediaItems.find((m) => m.type === "image")?.url ?? imageUrl)
          : imageUrl,
      };
      if (type === "products") payload.mediaItems = mediaItems;
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
          </div>
          <div className="space-y-1.5">
            {type === "products" ? (
              <>
                <Label className="text-sm">Foto & Video Produk</Label>
                <MediaUploader mediaItems={mediaItems} onChange={setMediaItems} />
              </>
            ) : (
              <>
                <Label className="text-sm">Gambar</Label>
                <ImageUploader currentUrl={imageUrl} onUpload={(url) => setImageUrl(url)} />
              </>
            )}
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

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiGet<Service[]>("/api/portal/services");
        setServices(data);
      } catch {
        toast({ title: "Gagal memuat layanan", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(id: number, data: Partial<Service & { mediaItems: MediaItem[] }>) {
    await apiPut(`/api/portal/admin/services/${id}`, data);
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
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
      <p className="text-sm text-muted-foreground">
        Kelola {services.length} layanan yang tampil di halaman Layanan.
      </p>
      {services.map((s) => (
        <ItemEditCard key={s.id} item={s} onSave={handleSave} type="services" />
      ))}
      {services.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Belum ada layanan. Tambahkan layanan melalui BizPortal.
        </div>
      )}
    </div>
  );
}

function ProductsTab() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiGet<Product[]>("/api/portal/products");
        setProducts(data);
      } catch {
        toast({ title: "Gagal memuat produk", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(id: number, data: Partial<Product & { mediaItems: MediaItem[] }>) {
    await apiPut(`/api/portal/admin/products/${id}`, data);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
  }

  async function handleAdd() {
    if (!newName.trim()) {
      toast({ title: "Nama produk harus diisi", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const created = await apiPost<Product>("/api/portal/admin/products", {
        name: newName.trim(),
        description: newDesc.trim() || null,
        price: parseFloat(newPrice) || 0,
        imageUrl: newImageUrl,
      });
      setProducts((prev) => [created, ...prev]);
      setShowAdd(false);
      setNewName("");
      setNewDesc("");
      setNewPrice("");
      setNewImageUrl(null);
      toast({ title: "Produk berhasil ditambahkan" });
    } catch (err) {
      toast({ title: "Gagal menambahkan produk", description: String(err), variant: "destructive" });
    } finally {
      setAdding(false);
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
        <ItemEditCard key={p.id} item={p} onSave={handleSave} type="products" />
      ))}
      {products.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Belum ada produk. Klik "Tambah Produk" untuk menambahkan produk baru.
        </div>
      )}

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
      });
      setVendors((prev) => [...prev, created]);
      setShowAdd(false);
      setNewName(""); setNewLogo("📦"); setNewEta("2-3 hari"); setNewFee(""); setNewNote("");
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
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">⏱ {v.eta}</span>
                    <span className="text-xs font-medium text-primary">
                      {v.fee > 0 ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v.fee) : v.note ?? "Nego"}
                    </span>
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
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="JNE REG" />
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
                <Input type="number" value={newFee} onChange={(e) => setNewFee(e.target.value)} placeholder="15000" min="0" />
              </div>
              <div className="space-y-1">
                <Label>Catatan</Label>
                <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Harga nego, dll." />
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

export default function AdminPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated()) {
      setLocation("/login");
    }
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
