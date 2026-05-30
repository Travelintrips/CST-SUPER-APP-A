import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

export const PROGRESS_STEPS = [
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
] as const;

type StepKey = typeof PROGRESS_STEPS[number]["key"];

const STATUS_RANK: Record<string, number> = {
  // Canonical 15
  "Order Received":    0,
  "Admin Review":      1,
  "RFQ Sent":          2,
  "Quote Received":    3,
  "Customer Approval": 4,
  "Vendor Confirmed":  5,
  "In Progress":       6,
  "Pickup":            7,
  "In Transit":        8,
  "Arrived":           9,
  "Delivered":         10,
  "POD Uploaded":      11,
  "Invoice Issued":    12,
  "Payment Received":  13,
  "Completed":         14,
  // Legacy backward compat
  "New Order":         0,
  "Under Review":      1,
  "Quotation Sent":    3,
  "Customer Approved": 5,
  "Confirmed":         5,
  "Done":              14,
};

/** Maps any order status/rfq/fulfillment to the set of completed canonical step keys. */
export function deriveCompletedSteps(order: {
  status: string;
  latestRfq?: { rfqStatus?: string } | null;
  fulfillmentStatus?: string | null;
  linkedSalesDocId?: number | null;
}): Set<StepKey> {
  const done = new Set<StepKey>();
  const rank = STATUS_RANK[order.status] ?? -1;

  // Mark all steps up to and including the current status rank as done
  for (let i = 0; i <= rank && i < PROGRESS_STEPS.length; i++) {
    done.add(PROGRESS_STEPS[i].key);
  }

  // Extra signals from rfq/fulfillment (for pre-canonical data)
  const rfq = (order.latestRfq as any)?.rfqStatus ?? "";
  if (["vendor_blasted", "rfq_sent"].includes(rfq)) done.add("RFQ Sent");
  if (["vendor_selected", "customer_quoted", "customer_approved", "closed"].includes(rfq)) {
    done.add("RFQ Sent"); done.add("Quote Received");
  }
  if (["customer_quoted", "customer_approved", "closed"].includes(rfq)) done.add("Customer Approval");
  if (["customer_approved", "closed"].includes(rfq)) done.add("Vendor Confirmed");
  if (order.linkedSalesDocId != null) done.add("Vendor Confirmed");
  if (order.fulfillmentStatus) done.add("In Progress");
  if (order.fulfillmentStatus === "submitted") done.add("Pickup");

  return done;
}

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
        {PROGRESS_STEPS.map((step, i) => {
          const done = i <= current;
          const active = i === current;
          return (
            <div key={step.key} className="flex items-start">
              <div className="flex flex-col items-center gap-1 w-[62px]">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center border-2 text-[10px] font-bold transition-all flex-shrink-0",
                  done && !active ? "bg-green-500 border-green-500 text-white" :
                  active         ? "bg-primary border-primary text-primary-foreground shadow ring-2 ring-primary/20" :
                                   "bg-white border-border text-muted-foreground"
                )}>
                  {done && !active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
                </div>
                <span className={cn(
                  "text-[9px] font-medium text-center leading-tight w-full",
                  active       ? "text-primary font-semibold" :
                  done         ? "text-green-600" :
                                 "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
              {i < PROGRESS_STEPS.length - 1 && (
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
