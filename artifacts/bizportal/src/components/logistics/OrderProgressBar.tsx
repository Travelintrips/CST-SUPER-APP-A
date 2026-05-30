import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

const STEPS = [
  { key: "Order Received",    label: "Order Diterima" },
  { key: "Admin Review",      label: "Review Admin" },
  { key: "RFQ Sent",          label: "RFQ Terkirim" },
  { key: "Quote Received",    label: "Penawaran Masuk" },
  { key: "Customer Approval", label: "Persetujuan" },
  { key: "Vendor Confirmed",  label: "Vendor Konfirmasi" },
  { key: "In Progress",       label: "Diproses" },
  { key: "Pickup",            label: "Penjemputan" },
  { key: "In Transit",        label: "Dalam Perjalanan" },
  { key: "Arrived",           label: "Tiba" },
  { key: "Delivered",         label: "Terkirim" },
  { key: "POD Uploaded",      label: "POD Upload" },
  { key: "Invoice Issued",    label: "Invoice" },
  { key: "Payment Received",  label: "Pembayaran" },
  { key: "Completed",         label: "Selesai" },
];

const STATUS_RANK: Record<string, number> = Object.fromEntries(
  STEPS.map((s, i) => [s.key, i])
);

export function OrderProgressBar({ status }: { status: string }) {
  const isCancelled = status === "Cancelled";
  const current = STATUS_RANK[status] ?? -1;

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
        <span className="text-red-600 font-semibold text-sm">❌ Order Dibatalkan</span>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex items-start min-w-max gap-0 px-1">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={step.key} className="flex items-start">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1 w-[62px]">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center border-2 text-[10px] font-bold transition-all flex-shrink-0",
                  done   ? "bg-green-500 border-green-500 text-white" :
                  active ? "bg-primary border-primary text-primary-foreground shadow ring-2 ring-primary/20" :
                           "bg-white border-border text-muted-foreground"
                )}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
                </div>
                <span className={cn(
                  "text-[9px] font-medium text-center leading-tight w-full",
                  active ? "text-primary font-semibold" :
                  done   ? "text-green-600" :
                           "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className={cn(
                  "w-4 h-0.5 mt-3 flex-shrink-0",
                  i < current ? "bg-green-400" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
