import { useRef, useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Camera,
  FileText,
  QrCode,
  Trash2,
  Upload,
  X,
  Copy,
  CheckCircle,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import {
  useListFreightAttachments,
  useCreateFreightAttachment,
  useDeleteFreightAttachment,
  getListFreightAttachmentsQueryKey,
} from "@workspace/api-client-react";
import type { FreightAttachment } from "@workspace/api-client-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getServeUrl(objectPath: string) {
  if (objectPath.startsWith("/objects/")) return `/api/storage${objectPath}`;
  return objectPath;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Attachment card ───────────────────────────────────────────────────────────

function AttachmentCard({
  attachment,
  onDelete,
  isDeleting,
}: {
  attachment: FreightAttachment;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}) {
  const url = getServeUrl(attachment.objectPath);
  const isImage = attachment.contentType.startsWith("image/");
  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-background hover:bg-muted/30 transition-colors">
      {isImage ? (
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
          <img
            src={url}
            alt={attachment.fileName}
            className="h-14 w-14 object-cover rounded border"
          />
        </a>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 h-14 w-14 flex items-center justify-center rounded border bg-muted"
        >
          <FileText className="h-6 w-6 text-muted-foreground" />
        </a>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{attachment.label || attachment.fileName}</p>
        <p className="text-xs text-muted-foreground truncate">{attachment.fileName}</p>
        <p className="text-xs text-muted-foreground">{formatDate(attachment.createdAt)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-destructive hover:text-destructive"
        onClick={() => onDelete(attachment.id)}
        disabled={isDeleting}
      >
        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({
  fileType,
  accept,
  capture,
  label,
  icon: Icon,
  shipmentId,
  onUploaded,
}: {
  fileType: "photo" | "document";
  accept: string;
  capture?: "environment" | "user";
  label: string;
  icon: React.ElementType;
  shipmentId: number;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const createAttachment = useCreateFreightAttachment();

  const { uploadFile } = useUpload({
    onError: (err) => {
      toast({ title: `Upload gagal: ${err.message}`, variant: "destructive" });
      setUploading(false);
    },
  });

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setFileLabel(file.name.replace(/\.[^/.]+$/, ""));
    e.target.value = "";
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    const result = await uploadFile(pendingFile);
    if (!result) return;
    createAttachment.mutate(
      {
        shipmentId,
        data: {
          objectPath: result.objectPath,
          fileName: pendingFile.name,
          contentType: pendingFile.type || "application/octet-stream",
          fileType,
          label: fileLabel || pendingFile.name,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `${label} berhasil diunggah` });
          setPendingFile(null);
          setFileLabel("");
          setUploading(false);
          onUploaded();
        },
        onError: () => {
          toast({ title: "Gagal menyimpan metadata", variant: "destructive" });
          setUploading(false);
        },
      }
    );
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        capture={capture}
        className="sr-only"
        onChange={handleFileSelected}
      />

      {pendingFile ? (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{pendingFile.name}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => setPendingFile(null)}
              disabled={uploading}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`label-${fileType}`} className="text-xs">Keterangan (opsional)</Label>
            <Input
              id={`label-${fileType}`}
              value={fileLabel}
              onChange={(e) => setFileLabel(e.target.value)}
              placeholder="Contoh: Foto kondisi sebelum muat"
              className="h-8 text-sm"
              disabled={uploading}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirmUpload}
              disabled={uploading}
              className="flex-1"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Mengunggah...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Unggah</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Ganti File
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full h-20 flex-col gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{label}</span>
        </Button>
      )}
    </div>
  );
}

// ── Barcode Scanner ───────────────────────────────────────────────────────────

function BarcodeScanner({ onResult }: { onResult: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readerRef = useRef<import("@zxing/browser").BrowserMultiFormatReader | null>(null);

  const startScan = useCallback(async () => {
    setError(null);
    setResult(null);
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      await reader.decodeFromVideoDevice(undefined, videoRef.current!, (res, err) => {
        if (res) {
          const text = res.getText();
          setResult(text);
          onResult(text);
          setScanning(false);
          reader.reset();
        }
        if (err && !(err instanceof Error && err.message.includes("No MultiFormat Readers"))) {
        }
      });
    } catch (e) {
      setError("Kamera tidak dapat diakses. Pastikan izin kamera sudah diberikan.");
      setScanning(false);
    }
  }, [onResult]);

  const stopScan = useCallback(() => {
    readerRef.current?.reset();
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      readerRef.current?.reset();
    };
  }, []);

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-black overflow-hidden aspect-video relative">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${scanning ? "block" : "hidden"}`}
          muted
          playsInline
        />
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <QrCode className="h-12 w-12 opacity-40" />
            <p className="text-sm opacity-60">Kamera belum aktif</p>
          </div>
        )}
        {scanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-8 border-2 border-white/50 rounded" />
            <div className="absolute top-8 left-8 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl" />
            <div className="absolute top-8 right-8 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr" />
            <div className="absolute bottom-8 left-8 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl" />
            <div className="absolute bottom-8 right-8 w-6 h-6 border-b-4 border-r-4 border-white rounded-br" />
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded p-2">{error}</p>
      )}

      {result ? (
        <div className="rounded-lg border bg-emerald-500/10 border-emerald-500/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm font-medium text-emerald-700">Berhasil discan!</p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono bg-background rounded px-2 py-1 border truncate">
              {result}
            </code>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
              {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => { setResult(null); startScan(); }}>
            Scan Lagi
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          {!scanning ? (
            <Button onClick={startScan} className="flex-1">
              <Camera className="h-4 w-4 mr-2" />
              Mulai Scan Barcode / QR
            </Button>
          ) : (
            <Button onClick={stopScan} variant="outline" className="flex-1">
              <X className="h-4 w-4 mr-2" />
              Hentikan Kamera
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Arahkan kamera ke barcode atau QR code pada paket/dokumen. Hasil scan dapat disalin untuk diisi ke nomor tracking atau AWB.
      </p>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function FreightAttachmentsPanel({
  shipmentId,
  onBarcodeScanned,
}: {
  shipmentId: number;
  onBarcodeScanned?: (value: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: attachments, isLoading } = useListFreightAttachments(shipmentId);
  const deleteAttachment = useDeleteFreightAttachment();

  const photos = attachments?.filter((a) => a.fileType === "photo") ?? [];
  const documents = attachments?.filter((a) => a.fileType === "document") ?? [];

  const refreshAttachments = () => {
    queryClient.invalidateQueries({ queryKey: getListFreightAttachmentsQueryKey(shipmentId) });
  };

  const handleDelete = (id: number) => {
    setDeletingId(id);
    deleteAttachment.mutate(
      { shipmentId, attachmentId: id },
      {
        onSuccess: () => {
          toast({ title: "Lampiran dihapus" });
          refreshAttachments();
        },
        onError: () => toast({ title: "Gagal menghapus lampiran", variant: "destructive" }),
        onSettled: () => setDeletingId(null),
      }
    );
  };

  return (
    <Tabs defaultValue="photos" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="photos" className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" />
          Foto Kargo
          {photos.length > 0 && (
            <span className="ml-1 text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">
              {photos.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="documents" className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Dokumen
          {documents.length > 0 && (
            <span className="ml-1 text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">
              {documents.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="scan" className="flex items-center gap-1.5">
          <QrCode className="h-3.5 w-3.5" />
          Scan
        </TabsTrigger>
      </TabsList>

      {/* ── Photos Tab ── */}
      <TabsContent value="photos" className="space-y-3 mt-3">
        <UploadZone
          fileType="photo"
          accept="image/*"
          capture="environment"
          label="Ambil Foto atau Pilih Gambar"
          icon={Camera}
          shipmentId={shipmentId}
          onUploaded={refreshAttachments}
        />
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Belum ada foto kargo.
          </div>
        ) : (
          <div className="space-y-2">
            {photos.map((a) => (
              <AttachmentCard
                key={a.id}
                attachment={a}
                onDelete={handleDelete}
                isDeleting={deletingId === a.id}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Documents Tab ── */}
      <TabsContent value="documents" className="space-y-3 mt-3">
        <UploadZone
          fileType="document"
          accept="image/*,application/pdf"
          label="Upload Dokumen (PDF / Foto Dokumen)"
          icon={FileText}
          shipmentId={shipmentId}
          onUploaded={refreshAttachments}
        />
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Belum ada dokumen.
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((a) => (
              <AttachmentCard
                key={a.id}
                attachment={a}
                onDelete={handleDelete}
                isDeleting={deletingId === a.id}
              />
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Scan Tab ── */}
      <TabsContent value="scan" className="mt-3">
        <BarcodeScanner
          onResult={(value) => {
            onBarcodeScanned?.(value);
          }}
        />
      </TabsContent>
    </Tabs>
  );
}
