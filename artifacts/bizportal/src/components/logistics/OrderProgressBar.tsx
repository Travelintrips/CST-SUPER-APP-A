import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const PROGRESS_STEPS = [
  { key: "NEW_ORDER",                   label: "Order Masuk",           color: "bg-blue-400",    ring: "ring-blue-200",    text: "text-blue-600",    line: "bg-blue-300"   },
  { key: "ADMIN_CONFIRMED",             label: "Dikonfirmasi Admin",    color: "bg-indigo-400",  ring: "ring-indigo-200",  text: "text-indigo-600",  line: "bg-indigo-300" },
  { key: "SENT_TO_VENDOR",              label: "Dikirim ke Vendor",     color: "bg-violet-400",  ring: "ring-violet-200",  text: "text-violet-600",  line: "bg-violet-300" },
  { key: "VENDOR_RESPONSE_RECEIVED",    label: "Vendor Merespon",       color: "bg-fuchsia-400", ring: "ring-fuchsia-200", text: "text-fuchsia-600", line: "bg-fuchsia-300"},
  { key: "PRICE_REVIEWED",              label: "Harga Disetujui",       color: "bg-pink-400",    ring: "ring-pink-200",    text: "text-pink-600",    line: "bg-pink-300"   },
  { key: "SENT_TO_CUSTOMER",            label: "Penawaran ke Customer", color: "bg-rose-400",    ring: "ring-rose-200",    text: "text-rose-600",    line: "bg-rose-300"   },
  { key: "CUSTOMER_APPROVED",           label: "Customer Setuju",       color: "bg-orange-400",  ring: "ring-orange-200",  text: "text-orange-600",  line: "bg-orange-300" },
  { key: "SALES_ORDER_CREATED",         label: "Sales Order Dibuat",    color: "bg-amber-400",   ring: "ring-amber-200",   text: "text-amber-600",   line: "bg-amber-300"  },
  { key: "SENT_TO_VENDOR_FULFILLMENT",  label: "Fulfillment ke Vendor", color: "bg-yellow-400",  ring: "ring-yellow-200",  text: "text-yellow-600",  line: "bg-yellow-300" },
  { key: "VENDOR_FULFILLMENT_CONFIRMED","label":"Vendor Konfirmasi",    color: "bg-lime-400",    ring: "ring-lime-200",    text: "text-lime-600",    line: "bg-lime-300"   },
  { key: "COMPLETED",                   label: "Selesai",               color: "bg-emerald-500", ring: "ring-emerald-200", text: "text-emerald-600", line: "bg-emerald-400"},
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

  const blasted = ["vendor_blasted", "rfq_sent", "vendor_selected", "customer_quoted", "customer_approved", "closed"];
  if (blasted.includes(rfq)) done.add("SENT_TO_VENDOR");

  const responded = ["vendor_selected", "customer_quoted", "customer_approved", "closed"];
  if (responded.includes(rfq)) {
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
}

export function OrderProgressBar({ order }: OrderProgressBarProps) {
  const isCancelled = order.status === "Cancelled";
  const completedSteps = deriveCompletedSteps(order);

  const doneIndices = PROGRESS_STEPS.map((s, i) => completedSteps.has(s.key) ? i : -1).filter(i => i >= 0);
  const activeIdx = doneIndices.length > 0 ? Math.max(...doneIndices) : -1;
  const activeStep = activeIdx >= 0 ? PROGRESS_STEPS[activeIdx] : null;

  return (
    <TooltipProvider delayDuration={80}>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Dot + line track */}
        <div className="flex items-center flex-1 min-w-0">
          {PROGRESS_STEPS.map((step, idx) => {
            const isDone = completedSteps.has(step.key);
            const isActive = idx === activeIdx;
            const isLast = idx === PROGRESS_STEPS.length - 1;

            const dotClass = cn(
              "flex-shrink-0 rounded-full transition-all duration-200",
              "w-2.5 h-2.5",
              isCancelled && isDone
                ? "bg-red-400"
                : isDone && isActive
                ? `${step.color} ring-2 ${step.ring} scale-125`
                : isDone
                ? step.color
                : "bg-slate-200 dark:bg-slate-700"
            );

            const lineClass = cn(
              "flex-1 h-0.5 min-w-[4px] transition-colors duration-200",
              isCancelled && isDone
                ? "bg-red-200"
                : isDone && !isActive
                ? step.line
                : "bg-slate-200 dark:bg-slate-700"
            );

            return (
              <div key={step.key} className="flex items-center flex-1 min-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={dotClass} />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <p className="font-medium">{step.label}</p>
                    <p className={cn("text-[10px]", isDone ? "text-emerald-500" : "text-slate-400")}>
                      {isDone ? "✓ Selesai" : "Belum"}
                    </p>
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
