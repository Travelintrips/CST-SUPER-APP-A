import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { QrCode, ScanLine, CheckCircle, AlertCircle, Loader2, X } from "lucide-react";

// All form fields that can be populated via scan
export type FreightFormFields = {
  shipperName?: string;
  shipperAddress?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  notifyParty?: string;
  commodity?: string;
  hsCode?: string;
  grossWeight?: string;
  netWeight?: string;
  quantity?: string;
  packingType?: string;
  dimensions?: string;
  marksAndNumbers?: string;
  measurement?: string;
  origin?: string;
  destination?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  vessel?: string;
  voyage?: string;
  notes?: string;
};

const FIELD_LABELS: Record<keyof FreightFormFields, string> = {
  shipperName: "Nama Shipper",
  shipperAddress: "Alamat Shipper",
  consigneeName: "Nama Consignee",
  consigneeAddress: "Alamat Consignee",
  notifyParty: "Notify Party",
  commodity: "Komoditi",
  hsCode: "HS Code",
  grossWeight: "Berat Bruto (kg)",
  netWeight: "Berat Neto (kg)",
  quantity: "Jumlah",
  packingType: "Jenis Packing",
  dimensions: "Dimensi",
  marksAndNumbers: "Marks & Numbers",
  measurement: "Measurement (CBM)",
  origin: "Asal",
  destination: "Tujuan",
  portOfLoading: "Port of Loading",
  portOfDischarge: "Port of Discharge",
  vessel: "Vessel / Nama Kapal",
  voyage: "Voyage No.",
  notes: "Catatan",
};

const VALID_KEYS = Object.keys(FIELD_LABELS) as (keyof FreightFormFields)[];

type ScanState =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "json"; fields: FreightFormFields }
  | { kind: "text"; value: string; targetField: keyof FreightFormFields | "" };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (fields: FreightFormFields) => void;
}

export function FreightScanDialog({ open, onOpenChange, onApply }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readerRef = useRef<any>(null);

  const [scanState, setScanState] = useState<ScanState>({ kind: "idle" });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const stopCamera = useCallback(() => {
    try { readerRef.current?.reset?.(); } catch { /* ignore */ }
    readerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startScanning = useCallback(async () => {
    setCameraError(null);
    setScanState({ kind: "scanning" });
    setApplied(false);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      reader.decodeFromStream(stream, videoRef.current!, (result, err) => {
        if (result) {
          const text = result.getText();
          stopCamera();
          parseResult(text);
        }
        if (err && !(err.message?.includes("No MultiFormat"))) {
          // ignore continuous not-found errors
        }
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal mengakses kamera";
      setCameraError(msg.includes("Permission") ? "Izin kamera ditolak." : msg);
      setScanState({ kind: "idle" });
    }
  }, [stopCamera]);

  function parseResult(text: string) {
    try {
      const obj = JSON.parse(text);
      if (typeof obj === "object" && obj !== null) {
        const fields: FreightFormFields = {};
        let matched = 0;
        for (const key of VALID_KEYS) {
          if (key in obj && obj[key] !== undefined && obj[key] !== null) {
            (fields as Record<string, string>)[key] = String(obj[key]);
            matched++;
          }
        }
        if (matched > 0) {
          setScanState({ kind: "json", fields });
          return;
        }
      }
    } catch {
      // not JSON
    }
    setScanState({ kind: "text", value: text, targetField: "" });
  }

  function handleApplyJson(fields: FreightFormFields) {
    onApply(fields);
    setApplied(true);
    setTimeout(() => {
      onOpenChange(false);
      setScanState({ kind: "idle" });
      setApplied(false);
    }, 1200);
  }

  function handleApplyText() {
    const state = scanState as { kind: "text"; value: string; targetField: keyof FreightFormFields | "" };
    if (!state.targetField) return;
    onApply({ [state.targetField]: state.value } as FreightFormFields);
    setApplied(true);
    setTimeout(() => {
      onOpenChange(false);
      setScanState({ kind: "idle" });
      setApplied(false);
    }, 1200);
  }

  function handleRescan() {
    setScanState({ kind: "idle" });
    setApplied(false);
    startScanning();
  }

  useEffect(() => {
    if (open) {
      startScanning();
    } else {
      stopCamera();
      setScanState({ kind: "idle" });
      setCameraError(null);
      setApplied(false);
    }
    return () => stopCamera();
  }, [open]);

  const isScanningOrIdle = scanState.kind === "idle" || scanState.kind === "scanning";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Scan Dokumen / QR Code
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera view */}
          {isScanningOrIdle && (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
              />
              {scanState.kind === "scanning" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <ScanLine className="h-10 w-10 text-white/80 animate-pulse" />
                  <span className="text-white/80 text-xs mt-2 bg-black/40 px-2 py-1 rounded">
                    Arahkan ke QR code atau barcode
                  </span>
                </div>
              )}
              {scanState.kind === "idle" && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              )}
            </div>
          )}

          {/* Camera error */}
          {cameraError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Tidak dapat mengakses kamera</p>
                <p className="text-xs mt-0.5">{cameraError}</p>
              </div>
            </div>
          )}

          {/* JSON result — multiple fields */}
          {scanState.kind === "json" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                <CheckCircle className="h-4 w-4" />
                QR berhasil dibaca — {Object.keys(scanState.fields).length} field ditemukan
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1.5 rounded-lg border p-3 bg-muted/30">
                {(Object.entries(scanState.fields) as [keyof FreightFormFields, string][]).map(
                  ([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-sm">
                      <Badge variant="secondary" className="shrink-0 text-xs font-normal">
                        {FIELD_LABELS[key]}
                      </Badge>
                      <span className="text-muted-foreground truncate">{value}</span>
                    </div>
                  )
                )}
              </div>
              {applied ? (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  Field berhasil diisi!
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => handleApplyJson(scanState.fields)}>
                    Isi Form Sekarang
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleRescan} title="Scan ulang">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Plain text result — single field picker */}
          {scanState.kind === "text" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                <ScanLine className="h-4 w-4" />
                Hasil scan (teks / barcode)
              </div>
              <div className="rounded-lg border p-3 bg-muted/30 font-mono text-sm break-all">
                {scanState.value}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Masukkan ke field:</Label>
                <Select
                  value={scanState.targetField}
                  onValueChange={(v) =>
                    setScanState((s) => ({
                      ...s,
                      targetField: v as keyof FreightFormFields,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih field tujuan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {VALID_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {FIELD_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {applied ? (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  Field berhasil diisi!
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={!scanState.targetField}
                    onClick={handleApplyText}
                  >
                    Isi Field
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleRescan} title="Scan ulang">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <p className="text-xs text-muted-foreground flex-1">
            QR dengan data JSON akan mengisi semua field sekaligus. Barcode biasa dapat diarahkan ke satu field.
          </p>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
