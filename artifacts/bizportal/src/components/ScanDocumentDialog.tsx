import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScanLine, Upload, Camera, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export interface ScannedDocumentData {
  docType?: "sales" | "purchase" | "freight";
  partyName?: string | null;
  partyEmail?: string | null;
  partyPhone?: string | null;
  partyAddress?: string | null;
  docDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  shipmentNumber?: string | null;
  origin?: string | null;
  destination?: string | null;
  carrier?: string | null;
  weight?: number | null;
  volume?: number | null;
  estimatedCost?: number | null;
  lines?: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unitPrice: number;
  }>;
}

interface ScanDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataExtracted: (data: ScannedDocumentData) => void;
  title?: string;
}

export function ScanDocumentDialog({ open, onOpenChange, onDataExtracted, title = "Scan Dokumen" }: ScanDocumentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ScannedDocumentData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null);
    setFileName(null);
    setExtracted(null);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setExtracted(null);
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
    } else {
      setPreview(null);
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/scan-document", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any)?.message ?? `Error ${resp.status}`);
      }
      const json = await resp.json() as { data: ScannedDocumentData };
      setExtracted(json.data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses dokumen");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleApply = () => {
    if (!extracted) return;
    onDataExtracted(extracted);
    onOpenChange(false);
    reset();
    toast.success("Data dokumen berhasil diisi otomatis");
  };

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload foto atau PDF dokumen. AI akan mengekstrak data dan mengisi form secara otomatis.
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload File
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => cameraInputRef.current?.click()}
              disabled={loading}
            >
              <Camera className="h-4 w-4 mr-2" />
              Kamera
            </Button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

          {loading && (
            <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Sedang mengekstrak data dokumen...</p>
            </div>
          )}

          {!loading && preview && (
            <div className="rounded-md border overflow-hidden bg-muted">
              <img src={preview} alt="Preview dokumen" className="w-full max-h-48 object-contain" />
            </div>
          )}

          {!loading && !preview && fileName && (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
              <ScanLine className="h-4 w-4 shrink-0" />
              {fileName}
            </div>
          )}

          {!loading && extracted && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Data berhasil diekstrak
              </div>
              {extracted.partyName && <p className="text-xs text-muted-foreground">Pihak: <span className="text-foreground font-medium">{extracted.partyName}</span></p>}
              {extracted.lines && extracted.lines.length > 0 && (
                <p className="text-xs text-muted-foreground">{extracted.lines.length} item ditemukan</p>
              )}
              {extracted.origin && <p className="text-xs text-muted-foreground">Rute: {extracted.origin} → {extracted.destination}</p>}
            </div>
          )}

          {!loading && !extracted && fileName && !preview && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Menunggu hasil ekstraksi...
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Batal</Button>
          <Button onClick={handleApply} disabled={!extracted || loading}>
            Terapkan ke Form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
