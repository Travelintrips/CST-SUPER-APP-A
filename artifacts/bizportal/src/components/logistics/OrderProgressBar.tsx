import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const PROGRESS_STEPS = [
  { key: "NEW_ORDER",                   label: "Order Masuk",           color: "bg-blue-400",    ring: "ring-blue-300",    text: "text-blue-600",    line: "bg-blue-300",    hover: "hover:bg-blue-500"    },
  { key: "ADMIN_CONFIRMED",             label: "Dikonfirmasi Admin",    color: "bg-indigo-400",  ring: "ring-indigo-300",  text: "text-indigo-600",  line: "bg-indigo-300",  hover: "hover:bg-indigo-500"  },
  { key: "SENT_TO_VENDOR",              label: "Dikirim ke Vendor",     color: "bg-violet-400",  ring: "ring-violet-300",  text: "text-violet-600",  line: "bg-violet-300",  hover: "hover:bg-violet-500"  },
  { key: "VENDOR_RESPONSE_RECEIVED",    label: "Vendor Merespon",       color: "bg-fuchsia-400", ring: "ring-fuchsia-300", text: "text-fuchsia-600", line: "bg-fuchsia-300", hover: "hover:bg-fuchsia-500" },
  { key: "PRICE_REVIEWED",              label: "Harga Disetujui",       color: "bg-pink-400",    ring: "ring-pink-300",    text: "text-pink-600",    line: "bg-pink-300",    hover: "hover:bg-pink-500"    },
  { key: "SENT_TO_CUSTOMER",            label: "Penawaran ke Customer", color: "bg-rose-400",    ring: "ring-rose-300",    text: "text-rose-600",    line: "bg-rose-300",    hover: "hover:bg-rose-500"    },
  { key: "CUSTOMER_APPROVED",           label: "Customer Setuju",       color: "bg-orange-400",  ring: "ring-orange-300",  text: "text-orange-600",  line: "bg-orange-300",  hover: "hover:bg-orange-500"  },
  { key: "SALES_ORDER_CREATED",         label: "Sales Order Dibuat",    color: "bg-amber-400",   ring: "ring-amber-300",   text: "text-amber-600",   line: "bg-amber-300",   hover: "hover:bg-amber-500"   },
  { key: "SENT_TO_VENDOR_FULFILLMENT",  label: "Fulfillment ke Vendor", color: "bg-yellow-400",  ring: "ring-yellow-300",  text: "text-yellow-600",  line: "bg-yellow-300",  hover: "hover:bg-yellow-500"  },
  { key: "VENDOR_FULFILLMENT_CONFIRMED",label: "Vendor Konfirmasi",     color: "bg-lime-400",    ring: "ring-lime-300",    text: "text-lime-600",    line: "bg-lime-300",    hover: "hover:bg-lime-500"    },
  { key: "COMPLETED",                   label: "Selesai",               color: "bg-emerald-500", ring: "ring-emerald-300", text: "text-emerald-600", line: "bg-emerald-400", hover: "hover:bg-emerald-600"  },
] as const;

type StepKey = typeof PROGRESS_STEPS[number]["key"];

function deriveCompletedSteps(order: {
  status: string;
  latestRfq?: { rfqStatus?: string } | null;
  fulfillmentStatus?: string | null;
  linkedSalesDocId?: number | null;
}): Set<StepKey> {
  const done = new Set<StepKey>();
  const rfq = (order.latestRfq as any)?.rfqStatus ?? "";
  const fs = order.fulfillmentStatus ?? "";
  const st = order.status;

  done.add("NEW_ORDER");
  if (!["New Order", "Under Review"].includes(st)) done.add("ADMIN_CONFIRMED");
  if (["vendor_blasted", "rfq_sent", "vendor_selected", "customer_quoted", "customer_approved", "closed"].includes(rfq)) done.add("SENT_TO_VENDOR");
  if (["vendor_selected", "customer_quoted", "customer_approved", "closed"].includes(rfq)) {
    done.add("VENDOR_RESPONSE_RECEIVED");
    done.add("PRICE_REVIEWED");
  }
  if (["customer_quoted", "customer_approved", "closed"].includes(rfq)) done.add("SENT_TO_CUSTOMER");
  if (["customer_approved", "closed"].includes(rfq)) done.add("CUSTOMER_APPROVED");
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
  orderId?: number;
  onUpdate?: () => void;
}

export function OrderProgressBar({ order, orderId, onUpdate }: OrderProgressBarProps) {
  const isCancelled = order.status === "Cancelled";
  const [manualDone, setManualDone] = useState<Set<StepKey>>(new Set());
  const [manualRemoved, setManualRemoved] = useState<Set<StepKey>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);

  const baseDone = deriveCompletedSteps(order);
  const completedSteps = new Set<StepKey>([
    ...Array.from(baseDone).filter((k) => !manualRemoved.has(k)),
    ...Array.from(manualDone),
  ]);

  const doneIndices = PROGRESS_STEPS.map((s, i) => completedSteps.has(s.key) ? i : -1).filter(i => i >= 0);
  const activeIdx = doneIndices.length > 0 ? Math.max(...doneIndices) : -1;
  const activeStep = activeIdx >= 0 ? PROGRESS_STEPS[activeIdx] : null;

  const clickable = !!orderId && !isCancelled;

  async function handleDotClick(step: typeof PROGRESS_STEPS[number], idx: number) {
    if (!clickable || loading) return;
    const isDone = completedSteps.has(step.key);
    const isActive = idx === activeIdx;

    try {
      setLoading(step.key);
      if (isDone && isActive) {
        // Undo step ini
        const res = await fetch(`/api/logistic/orders/${orderId}/progress/${step.key}`, { method: "DELETE", credentials: "include" });
        if (res.ok) {
          setManualDone(prev => { const n = new Set(prev); n.delete(step.key); return n; });
          setManualRemoved(prev => new Set([...prev, step.key]));
          onUpdate?.();
        }
      } else if (!isDone) {
        // Tandai selesai — sekaligus set semua step sebelumnya yang belum done
        const stepsToSet = PROGRESS_STEPS.slice(0, idx + 1).filter(s => !completedSteps.has(s.key));
        for (const s of stepsToSet) {
          await fetch(`/api/logistic/orders/${orderId}/progress/set`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stepKey: s.key }),
          });
          setManualDone(prev => new Set([...prev, s.key]));
          setManualRemoved(prev => { const n = new Set(prev); n.delete(s.key); return n; });
        }
        onUpdate?.();
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <TooltipProvider delayDuration={80}>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Dot + line track */}
        <div className="flex items-center flex-1 min-w-0">
          {PROGRESS_STEPS.map((step, idx) => {
            const isDone = completedSteps.has(step.key);
            const isActive = idx === activeIdx;
            const isLoading = loading === step.key;
            const isLast = idx === PROGRESS_STEPS.length - 1;
            const isClickable = clickable && (isDone ? isActive : true);

            const dotClass = cn(
              "flex-shrink-0 rounded-full transition-all duration-200",
              isLoading ? "w-3 h-3 animate-pulse" : isActive ? "w-3.5 h-3.5" : "w-2.5 h-2.5",
              isCancelled && isDone
                ? "bg-red-400"
                : isDone && isActive
                ? `${step.color} ring-2 ${step.ring} scale-110`
                : isDone
                ? step.color
                : "bg-slate-200 dark:bg-slate-700",
              isClickable && !isCancelled ? `cursor-pointer ${step.hover} transition-transform active:scale-90` : "",
              !isDone && clickable ? "hover:bg-slate-400 cursor-pointer" : ""
            );

            const lineClass = cn(
              "flex-1 h-0.5 min-w-[4px] transition-colors duration-200",
              isCancelled && isDone ? "bg-red-200" : isDone && !isActive ? step.line : "bg-slate-200 dark:bg-slate-700"
            );

            const tooltipText = isCancelled
              ? step.label
              : isDone && isActive
              ? `${step.label} ✓\n${clickable ? "Klik untuk undo" : ""}`
              : isDone
              ? `${step.label} ✓`
              : clickable
              ? `Klik → tandai "${step.label}"`
              : step.label;

            return (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={dotClass}
                      onClick={() => handleDotClick(step, idx)}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[160px] text-center whitespace-pre-line">
                    {tooltipText}
                  </TooltipContent>
                </Tooltip>
                {!isLast && <div className={lineClass} />}
              </div>
            );
          })}
        </div>

        {/* Active step label */}
        {activeStep && (
          <span className={cn(
            "text-[10px] font-semibold whitespace-nowrap shrink-0 px-1.5 py-0.5 rounded-full border",
            isCancelled
              ? "bg-red-50 text-red-500 border-red-200"
              : `${activeStep.text} border-current bg-white dark:bg-transparent opacity-90`
          )}>
            {isCancelled ? "✗ Dibatalkan" : `● ${activeStep.label}`}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
