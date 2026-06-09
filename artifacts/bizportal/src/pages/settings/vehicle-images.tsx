import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, X, ImageIcon, Loader2, Truck, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

const VEHICLES = [
  { id: "mobil",          name: "Mobil",         color: "#94a3b8" },
  { id: "mobil-xl",       name: "Mobil XL",      color: "#93c5fd" },
  { id: "van",            name: "Van",            color: "#a5b4fc" },
  { id: "pickup-kecil",   name: "Pickup Kecil",  color: "#fbbf24" },
  { id: "box-kecil",      name: "Box Kecil",     color: "#86efac" },
  { id: "engkel",         name: "Engkel",         color: "#fb923c" },
  { id: "double-engkel",  name: "Double Engkel", color: "#f87171" },
  { id: "cdd-long",       name: "CDD Long",      color: "#60a5fa" },
  { id: "fuso",           name: "Fuso",           color: "#34d399" },
  { id: "tronton",        name: "Tronton",        color: "#a78bfa" },
  { id: "truk-trailer",   name: "Truk Trailer",  color: "#64748b" },
  { id: "truk-reefer",    name: "Truk Reefer",   color: "#38bdf8" },
];

const apiFetch = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, { credentials: "include", ...init });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { error?: string; message?: string }).error ?? (j as { message?: string }).message ?? `HTTP ${r.status}`);
  }
  return r.json();
};

function VehicleImageCard({
  vehicle,
  imageUrl,
  onUpload,
  onRemove,
}: {
  vehicle: typeof VEHICLES[0];
  imageUrl: string | null;
  onUpload: (vehicleId: string, file: File) => void;
  onRemove: (vehicleId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      await onUpload(vehicle.id, file);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div
        className="h-36 flex items-center justify-center relative"
        style={{ background: imageUrl ? undefined : `${vehicle.color}22` }}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={vehicle.name}
              className="h-full w-full object-contain p-2"
            />
            <button
              onClick={() => onRemove(vehicle.id)}
              className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-slate-500 hover:text-red-500 transition-colors"
              title="Hapus gambar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="absolute bottom-2 left-2">
              <Badge variant="secondary" className="text-[10px] gap-1 bg-white/90">
                <CheckCircle2 className="w-3 h-3 text-green-500" /> Gambar terpasang
              </Badge>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <ImageIcon className="w-10 h-10" style={{ color: vehicle.color }} />
            <span className="text-xs">Belum ada gambar</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: vehicle.color }} />
          <span className="font-semibold text-sm text-slate-800">{vehicle.name}</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs gap-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengupload…</>
          ) : (
            <><Upload className="w-3.5 h-3.5" /> {imageUrl ? "Ganti Gambar" : "Upload Gambar"}</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function VehicleImagesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: images = {}, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings/vehicle-images"],
    queryFn: () => apiFetch("/api/settings/vehicle-images"),
  });

  const saveMut = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiFetch("/api/settings/vehicle-images", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings/vehicle-images"] });
    },
    onError: (e: Error) => toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" }),
  });

  async function handleUpload(vehicleId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    let url: string;
    try {
      const res = await fetch("/api/settings/vehicle-images/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      url = data.url;
    } catch (err) {
      toast({ title: "Gagal upload", description: String(err), variant: "destructive" });
      return;
    }

    const updated = { ...images, [vehicleId]: url };
    await saveMut.mutateAsync(updated);
    toast({ title: `Gambar ${VEHICLES.find(v => v.id === vehicleId)?.name} berhasil disimpan` });
  }

  async function handleRemove(vehicleId: string) {
    const updated = { ...images };
    delete updated[vehicleId];
    await saveMut.mutateAsync(updated);
    toast({ title: `Gambar ${VEHICLES.find(v => v.id === vehicleId)?.name} dihapus` });
    qc.invalidateQueries({ queryKey: ["/api/settings/vehicle-images"] });
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/bizportal/settings">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-500" /> Gambar Armada Trucking
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload foto/ilustrasi per jenis kendaraan. Tampil di halaman Trucking Customer Portal.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {VEHICLES.map(v => (
              <Card key={v.id} className="animate-pulse h-52 bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2.5">
              <ImageIcon className="w-4 h-4 shrink-0" />
              <span>
                {Object.keys(images).length} dari {VEHICLES.length} kendaraan sudah punya gambar.
                Kendaraan yang belum diupload akan tetap menampilkan ilustrasi SVG bawaan.
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {VEHICLES.map(v => (
                <VehicleImageCard
                  key={v.id}
                  vehicle={v}
                  imageUrl={images[v.id] ?? null}
                  onUpload={handleUpload}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
