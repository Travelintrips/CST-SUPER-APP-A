import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const PROGRESS_STEPS = [
  { key: "NEW_ORDER",                   label: "Order Masuk"           },
  { key: "ADMIN_CONFIRMED",             label: "Dikonfirmasi Admin"    },
  { key: "SENT_TO_VENDOR",              label: "Dikirim ke Vendor"     },
  { key: "VENDOR_RESPONSE_RECEIVED",    label: "Vendor Merespon"       },
  { key: "PRICE_REVIEWED",              label: "Harga Disetujui"       },
  { key: "SENT_TO_CUSTOMER",            label: "Penawaran ke Customer" },
  { key: "CUSTOMER_APPROVED",           label: "Customer Setuju"       },
  { key: "SALES_ORDER_CREATED",         label: "Sales Order Dibuat"    },
  { key: "SENT_TO_VENDOR_FULFILLMENT",  label: "Fulfillment ke Vendor" },
  { key: "VENDOR_FULFILLMENT_CONFIRMED","label": "Vendor Konfirmasi"   },
  { key: "COMPLETED",                   label: "Selesai"               },
] as const;

type StepKey = typeof PROGRESS_STEPS[number]["key"];

function deriveCompletedSteps(order: {
  status: string;
  latestRfq?: { rfqStatus?: string } | null;
  fulfillmentStatus?: string | null;
  linkedSalesDocId?: number | null;
}): Set<StepKey> {
  const done = new Set<StepKey>();
  const rfq = order.latestRfq?.rfqStatus ?? "";
  const fs = order.fulfillmentStatus ?? "";
  const st = order.status;

  done.add("NEW_ORDER");

  if (!["New Order", "Under Review"].includes(st)) {
    done.add("ADMIN_CONFIRMED");
  }

  const blasted = ["vendor_blasted", "rfq_sent", "vendor_selected", "customer_quoted", "customer_approved", "closed"];
  if (blasted.includes(rfq)) done.add("SENT_TO_VENDOR");

  const responded = ["vendor_selected", "customer_quoted", "customer_approved", "closed"];
  if (responded.includes(rfq)) {
    done.add("VENDOR_RESPONSE_RECEIVED");
    done.add("PRICE_REVIEWED");
  }

  const quoted = ["customer_quoted", "customer_approved", "closed"];
  if (quoted.includes(rfq)) done.add("SENT_TO_CUSTOMER");

  const approved = ["customer_approved", "closed"];
  if (approved.includes(rfq)) done.add("CUSTOMER_APPROVED");

  if (order.linkedSalesDocId != null) done.add("SALES_ORDER_CREATED");

  if (fs) done.add("SENT_TO_VENDOR_FULFILLMENT");
  if (fs === "submitted") done.add("VENDOR_FULFILLMENT_CONFIRMED");

  if (st === "Completed") done.add("COMPLETED");

  return done;
}

interface OrderProgressBarProps {
  order: {
    status: string;
    latestRfq?: { rfqStatus?: string } | null;
    fulfillmentStatus?: string | null;
    linkedSalesDocId?: number | null;
  };
  compact?: boolean;
}

export function OrderProgressBar({ order, compact = true }: OrderProgressBarProps) {
  const isCancelled = order.status === "Cancelled";
  const completedSteps = deriveCompletedSteps(order);
  const lastDoneIdx = PROGRESS_STEPS.map((s, i) => completedSteps.has(s.key) ? i : -1).filter(i => i >= 0);
  const activeIdx = lastDoneIdx.length > 0 ? Math.max(...lastDoneIdx) : -1;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center gap-0 py-0.5" onClick={(e) => e.stopPropagation()}>
        {PROGRESS_STEPS.map((step, idx) => {
          const isDone = completedSteps.has(step.key);
          const isActive = idx === activeIdx;
          const isLast = idx === PROGRESS_STEPS.length - 1;

          const dotClass = cn(
            "flex-shrink-0 rounded-full transition-colors",
            compact ? "w-2.5 h-2.5" : "w-3 h-3",
            isCancelled && isDone
              ? "bg-red-400"
              : isDone && isActive
              ? "bg-emerald-500 ring-2 ring-emerald-200"
              : isDone
              ? "bg-emerald-400"
              : "bg-slate-200"
          );

          const lineClass = cn(
            "flex-1 h-px min-w-[6px]",
            isCancelled && isDone ? "bg-red-300" : isDone ? "bg-emerald-300" : "bg-slate-200"
          );

          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={dotClass} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[140px] text-center">
                  <p className="font-medium">{step.label}</p>
                  {isDone && <p className="text-emerald-600 text-[10px]">✓ Selesai</p>}
                  {!isDone && <p className="text-slate-400 text-[10px]">Belum</p>}
                </TooltipContent>
              </Tooltip>
              {!isLast && <div className={lineClass} />}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
