import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ArrowLeft } from "lucide-react";
import { useGetFreightShipment } from "@workspace/api-client-react";

const BL_ALLOWED_STATUSES = ["confirmed", "in_transit", "completed"];

function Cell({
  label,
  value,
  className = "",
}: {
  label?: string;
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border border-gray-700 p-2 text-xs ${className}`}
      style={{ minHeight: "3rem" }}
    >
      {label && (
        <p className="text-gray-500 uppercase tracking-wide font-bold mb-1" style={{ fontSize: "0.6rem" }}>
          {label}
        </p>
      )}
      <p className="font-medium text-gray-900 whitespace-pre-wrap">{value ?? ""}</p>
    </div>
  );
}

export default function LogisticsFreightBLPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, navigate] = useLocation();

  const { data: shipment, isLoading } = useGetFreightShipment(id);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="p-8 text-center text-muted-foreground">Shipment tidak ditemukan.</div>
    );
  }

  if (!BL_ALLOWED_STATUSES.includes(shipment.status)) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <p className="text-lg font-semibold">Bill of Lading belum tersedia</p>
        <p className="text-muted-foreground">
          Dokumen Bill of Lading hanya dapat dicetak setelah shipment dikonfirmasi.
          Status saat ini: <strong>{shipment.status}</strong>.
        </p>
        <Button variant="outline" onClick={() => navigate(`/logistics/freight/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kembali ke Detail
        </Button>
      </div>
    );
  }

  const issuedDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Screen-only toolbar */}
      <div className="print:hidden bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/logistics/freight/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kembali ke Detail
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Cetak Bill of Lading
        </Button>
      </div>

      {/* BL Document */}
      <div
        className="bg-white mx-auto my-6 print:my-0 print:mx-0 shadow-lg print:shadow-none"
        style={{ maxWidth: "210mm", fontFamily: "Times New Roman, serif" }}
      >
        <div className="p-8 print:p-6">
          {/* ── Title Row ── */}
          <div className="flex items-stretch border border-gray-700 mb-0">
            {/* Left: Company Logo / Name */}
            <div className="flex-1 border-r border-gray-700 p-3 flex flex-col justify-center">
              <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Issued by</p>
              <p className="text-lg font-bold text-gray-900">FREIGHT FORWARDER</p>
              <p className="text-xs text-gray-600">Freight Forwarding Services</p>
            </div>
            {/* Right: BL Type & Number */}
            <div className="flex flex-col justify-center items-center px-6">
              <p className="text-2xl font-extrabold uppercase tracking-widest text-gray-900">Bill of Lading</p>
              <p className="text-xs text-gray-500 mt-1 font-mono">{shipment.shipmentNumber}</p>
            </div>
          </div>

          {/* ── Row 1: Shipper | B/L No. ── */}
          <div className="grid border-b-0" style={{ display: "grid", gridTemplateColumns: "1fr auto" }}>
            <Cell
              label="Shipper / Exporter"
              value={[shipment.shipperName, shipment.shipperAddress].filter(Boolean).join("\n")}
              className="border-t-0"
            />
            <div className="border border-t-0 border-gray-700 p-2 text-xs" style={{ width: "130px" }}>
              <p className="text-gray-500 uppercase tracking-wide font-bold mb-1" style={{ fontSize: "0.6rem" }}>B/L No.</p>
              <p className="font-bold font-mono text-sm">{shipment.shipmentNumber}</p>
              <p className="text-gray-500 uppercase tracking-wide font-bold mt-2 mb-1" style={{ fontSize: "0.6rem" }}>Date Issued</p>
              <p className="font-medium text-xs">{issuedDate}</p>
            </div>
          </div>

          {/* ── Row 2: Consignee ── */}
          <Cell
            label="Consignee (NOT NEGOTIABLE unless consigned to order)"
            value={[shipment.consigneeName, shipment.consigneeAddress].filter(Boolean).join("\n")}
          />

          {/* ── Row 3: Notify Party ── */}
          <Cell
            label="Notify Party"
            value={shipment.notifyParty ?? "(Same as Consignee)"}
          />

          {/* ── Row 4: Pre-carriage / Place of Receipt / Vessel / Voyage ── */}
          <div className="grid grid-cols-2">
            <Cell label="Pre-carriage By" value={""} />
            <Cell label="Place of Receipt" value={shipment.origin} />
          </div>
          <div className="grid grid-cols-2">
            <Cell label="Ocean Vessel / Ship's Name" value={shipment.vessel ?? ""} />
            <Cell label="Voyage No." value={shipment.voyage ?? ""} />
          </div>
          <div className="grid grid-cols-2">
            <Cell label="Port of Loading" value={shipment.portOfLoading ?? shipment.origin} />
            <Cell label="Port of Discharge" value={shipment.portOfDischarge ?? shipment.destination} />
          </div>
          <div className="grid grid-cols-2">
            <Cell label="Place of Delivery" value={shipment.destination} />
            <Cell label="Final Destination (Merchant's ref)" value={""} />
          </div>

          {/* ── Cargo Table ── */}
          <div className="grid border border-gray-700 mt-0" style={{ gridTemplateColumns: "1fr 1fr 2fr 1fr 1fr 1fr" }}>
            {/* Header Row */}
            {[
              "Marks & Numbers",
              "No. of Pkgs",
              "Description of Goods",
              "Gross Weight",
              "Net Weight",
              "Measurement",
            ].map((h) => (
              <div
                key={h}
                className="border-r border-b border-gray-700 p-1 text-center last:border-r-0"
                style={{ fontSize: "0.6rem", fontWeight: "bold", textTransform: "uppercase", background: "#f5f5f5" }}
              >
                {h}
              </div>
            ))}
            {/* Data Row */}
            <div className="border-r border-gray-700 p-2 text-xs last:border-r-0" style={{ minHeight: "80px" }}>
              <p className="whitespace-pre-wrap">{shipment.marksAndNumbers ?? "—"}</p>
            </div>
            <div className="border-r border-gray-700 p-2 text-xs text-center">
              <p>{shipment.quantity ?? "—"}</p>
              <p className="text-gray-500">{shipment.packingType ?? ""}</p>
            </div>
            <div className="border-r border-gray-700 p-2 text-xs">
              <p className="font-semibold">{shipment.commodity}</p>
              {shipment.hsCode && <p className="text-gray-500 mt-1">HS Code: {shipment.hsCode}</p>}
              {shipment.dimensions && <p className="text-gray-500">Dim: {shipment.dimensions}</p>}
            </div>
            <div className="border-r border-gray-700 p-2 text-xs text-center">
              <p>{shipment.grossWeight ? `${shipment.grossWeight} KG` : "—"}</p>
            </div>
            <div className="border-r border-gray-700 p-2 text-xs text-center">
              <p>{shipment.netWeight ? `${shipment.netWeight} KG` : "—"}</p>
            </div>
            <div className="p-2 text-xs text-center">
              <p>{shipment.measurement ?? "—"}</p>
            </div>
          </div>

          {/* ── Totals ── */}
          <div className="grid grid-cols-3 border border-t-0 border-gray-700">
            <div className="col-span-1 border-r border-gray-700 p-2 text-xs">
              <p className="text-gray-500 uppercase font-bold mb-1" style={{ fontSize: "0.6rem" }}>Total Packages</p>
              <p className="font-semibold">{shipment.quantity ? `${shipment.quantity} ${shipment.packingType ?? "pkgs"}` : "—"}</p>
            </div>
            <div className="col-span-1 border-r border-gray-700 p-2 text-xs">
              <p className="text-gray-500 uppercase font-bold mb-1" style={{ fontSize: "0.6rem" }}>Total Gross Weight</p>
              <p className="font-semibold">{shipment.grossWeight ? `${shipment.grossWeight} KG` : "—"}</p>
            </div>
            <div className="col-span-1 p-2 text-xs">
              <p className="text-gray-500 uppercase font-bold mb-1" style={{ fontSize: "0.6rem" }}>Total Measurement</p>
              <p className="font-semibold">{shipment.measurement ?? "—"}</p>
            </div>
          </div>

          {/* ── Freight & Charges ── */}
          <div className="border border-t-0 border-gray-700 p-2">
            <p className="text-gray-500 uppercase font-bold mb-1" style={{ fontSize: "0.6rem" }}>Freight & Charges</p>
            <p className="text-xs">☐ Freight Prepaid &nbsp;&nbsp; ☐ Freight Collect &nbsp;&nbsp; ☐ As Arranged</p>
          </div>

          {/* ── Declaration ── */}
          <div className="border border-t-0 border-gray-700 p-2">
            <p className="text-xs text-gray-600 leading-relaxed">
              Received by the Carrier the Goods as specified above in apparent good order and condition unless
              otherwise stated, to be transported to such place as agreed, authorised or permitted herein.
              The particulars given above as stated by the Shipper and the weight, measure, quantity, condition,
              contents and value of the Goods are unknown to the Carrier.
            </p>
          </div>

          {/* ── Signature Row ── */}
          <div className="grid grid-cols-2 border border-t-0 border-gray-700">
            <div className="border-r border-gray-700 p-4">
              <p className="text-gray-500 uppercase font-bold mb-1" style={{ fontSize: "0.6rem" }}>Place and Date of Issue</p>
              <p className="text-sm font-medium mt-6">{shipment.portOfLoading ?? shipment.origin}, {issuedDate}</p>
            </div>
            <div className="p-4">
              <p className="text-gray-500 uppercase font-bold mb-1" style={{ fontSize: "0.6rem" }}>
                Signed for the Carrier / As Agent for the Carrier
              </p>
              <div className="mt-10 border-t border-gray-700 pt-1">
                <p className="text-xs text-gray-500 text-center">Authorized Signature</p>
              </div>
            </div>
          </div>

          {/* ── Notes ── */}
          {shipment.notes && (
            <div className="border border-t-0 border-gray-700 p-2">
              <p className="text-gray-500 uppercase font-bold mb-1" style={{ fontSize: "0.6rem" }}>Remarks / Notes</p>
              <p className="text-xs">{shipment.notes}</p>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-400">
              This Bill of Lading is non-negotiable unless made out to order. BizPortal — Freight Management System.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
