import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { DollarSign, Plus, Pencil, Trash2, Search, RefreshCw } from "lucide-react";

const IDR = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

const RATE_SOURCE_TYPES = [
  { v: "shipping_line",      l: "Shipping Line" },
  { v: "nvocc",              l: "NVOCC" },
  { v: "coloader",           l: "Co-Loader" },
  { v: "forwarder_partner",  l: "Forwarder Partner" },
  { v: "internal_rate",      l: "Internal Rate" },
  { v: "vendor_rate",        l: "Vendor Rate" },
];
const SHIPMENT_TYPES = ["FCL","LCL"];
const SERVICE_MODES  = ["port_to_port","door_to_port","port_to_door","door_to_door"];
const CONTAINER_TYPES = ["20ft","40ft","40HC","reefer_20","reefer_40","open_top","flat_rack"];
const TRADE_TYPES = ["domestic","export","import","cross_border"];
const CURRENCIES  = ["USD","IDR","SGD","EUR"];
const DIRECT_OPTS = ["direct","transshipment"];
const PRICE_STATUSES = ["estimate","confirmed"];

const emptyForm = () => ({
  rate_code: "", rate_source_type: "shipping_line", rate_source_name: "", carrier_name: "",
  origin_city: "", origin_port: "", destination_city: "", destination_port: "",
  trade_type: "export", shipment_type: "FCL", service_mode: "port_to_port", container_type: "20ft",
  currency: "USD", exchange_rate_to_idr: "16500", ocean_freight_amount: "0",
  lcl_rate_per_cbm: "", lcl_minimum_cbm: "",
  thc_origin: "0", thc_destination: "0", doc_fee: "0", bl_fee: "0", do_fee: "0",
  handling_fee: "0", customs_clearance_fee: "0", trucking_pickup_estimate: "0",
  trucking_delivery_estimate: "0", insurance_percent: "0", dg_surcharge_percent: "0",
  reefer_surcharge: "0", peak_season_surcharge: "0", emergency_bunker_surcharge: "0",
  currency_adjustment_factor: "0",
  valid_from: new Date().toISOString().slice(0,10),
  valid_until: new Date(Date.now()+30*86400_000).toISOString().slice(0,10),
  transit_days: "", carrier: "", vessel_name: "", voyage: "",
  direct_or_transshipment: "direct", price_status: "estimate", notes: "", is_active: true,
});

type FormData = ReturnType<typeof emptyForm>;

export default function OceanFreightRatesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search,         setSearch]         = useState("");
  const [filterShipment, setFilterShipment] = useState("all");
  const [filterActive,   setFilterActive]   = useState("all");
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [editId,         setEditId]         = useState<number | null>(null);
  const [form,           setForm]           = useState<FormData>(emptyForm());
  const [saving,         setSaving]         = useState(false);

  const { data: rates = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["ocean-freight-rates"],
    queryFn: () => fetch("/api/ocean-freight-rates").then(r => r.json()),
  });

  const today = new Date().toISOString().slice(0,10);
  const filtered = rates.filter(r => {
    if (filterShipment !== "all" && r.shipment_type !== filterShipment) return false;
    if (filterActive === "active"   && !r.is_active) return false;
    if (filterActive === "inactive" && r.is_active) return false;
    if (filterActive === "expired"  && r.valid_until >= today) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.origin_port?.toLowerCase().includes(q) ||
             r.destination_port?.toLowerCase().includes(q) ||
             r.rate_source_name?.toLowerCase().includes(q) ||
             r.carrier?.toLowerCase().includes(q) ||
             r.carrier_name?.toLowerCase().includes(q);
    }
    return true;
  });

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(r: any) {
    setEditId(r.id);
    setForm({
      rate_code: r.rate_code ?? "", rate_source_type: r.rate_source_type ?? "shipping_line",
      rate_source_name: r.rate_source_name ?? "", carrier_name: r.carrier_name ?? "",
      origin_city: r.origin_city ?? "", origin_port: r.origin_port ?? "",
      destination_city: r.destination_city ?? "", destination_port: r.destination_port ?? "",
      trade_type: r.trade_type ?? "export", shipment_type: r.shipment_type ?? "FCL",
      service_mode: r.service_mode ?? "port_to_port", container_type: r.container_type ?? "20ft",
      currency: r.currency ?? "USD", exchange_rate_to_idr: String(r.exchange_rate_to_idr ?? 16500),
      ocean_freight_amount: String(r.ocean_freight_amount ?? 0),
      lcl_rate_per_cbm: String(r.lcl_rate_per_cbm ?? ""),
      lcl_minimum_cbm: String(r.lcl_minimum_cbm ?? ""),
      thc_origin: String(r.thc_origin ?? 0), thc_destination: String(r.thc_destination ?? 0),
      doc_fee: String(r.doc_fee ?? 0), bl_fee: String(r.bl_fee ?? 0),
      do_fee: String(r.do_fee ?? 0), handling_fee: String(r.handling_fee ?? 0),
      customs_clearance_fee: String(r.customs_clearance_fee ?? 0),
      trucking_pickup_estimate: String(r.trucking_pickup_estimate ?? 0),
      trucking_delivery_estimate: String(r.trucking_delivery_estimate ?? 0),
      insurance_percent: String(r.insurance_percent ?? 0),
      dg_surcharge_percent: String(r.dg_surcharge_percent ?? 0),
      reefer_surcharge: String(r.reefer_surcharge ?? 0),
      peak_season_surcharge: String(r.peak_season_surcharge ?? 0),
      emergency_bunker_surcharge: String(r.emergency_bunker_surcharge ?? 0),
      currency_adjustment_factor: String(r.currency_adjustment_factor ?? 0),
      valid_from: r.valid_from?.slice(0,10) ?? today,
      valid_until: r.valid_until?.slice(0,10) ?? "",
      transit_days: String(r.transit_days ?? ""), carrier: r.carrier ?? "",
      vessel_name: r.vessel_name ?? "", voyage: r.voyage ?? "",
      direct_or_transshipment: r.direct_or_transshipment ?? "direct",
      price_status: r.price_status ?? "estimate", notes: r.notes ?? "",
      is_active: r.is_active !== false,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url    = editId ? `/api/ocean-freight-rates/${editId}` : "/api/ocean-freight-rates";
      const method = editId ? "PUT" : "POST";
      const res    = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, is_active: form.is_active }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal simpan");
      qc.invalidateQueries({ queryKey: ["ocean-freight-rates"] });
      setDialogOpen(false);
      toast({ title: editId ? "Rate diperbarui" : "Rate ditambahkan" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus rate ini?")) return;
    await fetch(`/api/ocean-freight-rates/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["ocean-freight-rates"] });
    toast({ title: "Rate dihapus" });
  }

  function F(key: keyof FormData) {
    return {
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value })),
    };
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Ocean Freight Rate Management</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Tambah Rate
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Cari port / vendor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-56" />
        </div>
        <Select value={filterShipment} onValueChange={setFilterShipment}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Shipment Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Type</SelectItem>
            {SHIPMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterActive} onValueChange={setFilterActive}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Memuat...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">Belum ada rate</div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Sumber","Rute","Type","Container","Currency","Ocean Freight","Total Est.","Valid","Transit","Status","Aksi"].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => {
                const isExpired = r.valid_until < today;
                const totalEst = (Number(r.ocean_freight_amount ?? 0) + Number(r.thc_origin ?? 0) + Number(r.thc_destination ?? 0) + Number(r.doc_fee ?? 0) + Number(r.bl_fee ?? 0) + Number(r.do_fee ?? 0) + Number(r.handling_fee ?? 0));
                const totalIdr  = r.currency === "IDR" ? totalEst : totalEst * Number(r.exchange_rate_to_idr ?? 16500);
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${!r.is_active || isExpired ? "opacity-60" : ""}`}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-800">{r.rate_source_name}</p>
                      <p className="text-xs text-gray-500">{r.rate_source_type}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p>{r.origin_port} → {r.destination_port}</p>
                      <p className="text-xs text-gray-500 capitalize">{r.trade_type}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="text-xs">{r.shipment_type}</Badge>
                      <p className="text-xs text-gray-500 mt-0.5 capitalize">{r.service_mode?.replace(/_/g," ")}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">{r.container_type ?? "-"}</td>
                    <td className="px-3 py-3 text-xs font-medium">{r.currency}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.shipment_type === "LCL"
                        ? <p className="text-xs">{r.currency} {Number(r.lcl_rate_per_cbm ?? 0).toLocaleString()}/CBM<br/><span className="text-gray-400">Min: {r.lcl_minimum_cbm} CBM</span></p>
                        : <p className="font-semibold">{r.currency} {Number(r.ocean_freight_amount ?? 0).toLocaleString()}</p>
                      }
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-green-700 font-semibold text-xs">
                      {IDR(totalIdr)}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      <p className={isExpired ? "text-red-500" : "text-gray-600"}>{r.valid_from?.slice(0,10)} – {r.valid_until?.slice(0,10)}</p>
                      {isExpired && <Badge className="bg-red-100 text-red-600 text-xs mt-0.5">Expired</Badge>}
                    </td>
                    <td className="px-3 py-3 text-xs">{r.transit_days ? `${r.transit_days}d` : "-"}</td>
                    <td className="px-3 py-3">
                      <Badge className={r.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                        {r.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Rate" : "Tambah Rate Baru"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">

            {/* Source */}
            <div>
              <Label>Rate Source Type</Label>
              <select {...F("rate_source_type")} className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm">
                {RATE_SOURCE_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <Label>Rate Source Name</Label>
              <Input {...F("rate_source_name")} placeholder="Samudera / CMA CGM / ..." />
            </div>
            <div>
              <Label>Carrier Name</Label>
              <Input {...F("carrier_name")} placeholder="Nama carrier" />
            </div>
            <div>
              <Label>Rate Code (opsional)</Label>
              <Input {...F("rate_code")} />
            </div>

            {/* Route */}
            <div>
              <Label>Origin City</Label>
              <Input {...F("origin_city")} placeholder="Surabaya" />
            </div>
            <div>
              <Label>Origin Port (POL)</Label>
              <Input {...F("origin_port")} placeholder="Tanjung Perak" />
            </div>
            <div>
              <Label>Destination City</Label>
              <Input {...F("destination_city")} placeholder="Singapore" />
            </div>
            <div>
              <Label>Destination Port (POD)</Label>
              <Input {...F("destination_port")} placeholder="PSA Singapore" />
            </div>

            {/* Type */}
            <div>
              <Label>Trade Type</Label>
              <select {...F("trade_type")} className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm">
                {TRADE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Shipment Type</Label>
              <select {...F("shipment_type")} className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm">
                {SHIPMENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Service Mode</Label>
              <select {...F("service_mode")} className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm">
                {SERVICE_MODES.map(m => <option key={m} value={m}>{m.replace(/_/g," ")}</option>)}
              </select>
            </div>
            {form.shipment_type === "FCL" && (
              <div>
                <Label>Container Type</Label>
                <select {...F("container_type")} className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm">
                  {CONTAINER_TYPES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}

            {/* Pricing */}
            <div>
              <Label>Currency</Label>
              <select {...F("currency")} className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label>Exchange Rate to IDR</Label>
              <Input type="number" {...F("exchange_rate_to_idr")} disabled={form.currency === "IDR"} />
            </div>

            {form.shipment_type === "FCL" ? (
              <div className="col-span-2">
                <Label>Ocean Freight Amount ({form.currency})</Label>
                <Input type="number" {...F("ocean_freight_amount")} />
              </div>
            ) : (
              <>
                <div>
                  <Label>LCL Rate per CBM ({form.currency})</Label>
                  <Input type="number" {...F("lcl_rate_per_cbm")} />
                </div>
                <div>
                  <Label>LCL Minimum CBM</Label>
                  <Input type="number" {...F("lcl_minimum_cbm")} />
                </div>
              </>
            )}

            {/* Surcharges & Fees */}
            {[
              ["THC Origin", "thc_origin"],["THC Dest", "thc_destination"],
              ["Doc Fee", "doc_fee"],["B/L Fee", "bl_fee"],["D/O Fee", "do_fee"],
              ["Handling Fee", "handling_fee"],["Customs Clearance", "customs_clearance_fee"],
              ["Trucking Pickup", "trucking_pickup_estimate"],["Trucking Delivery", "trucking_delivery_estimate"],
              ["Insurance %", "insurance_percent"],["DG Surcharge %", "dg_surcharge_percent"],
              ["Reefer Surcharge", "reefer_surcharge"],["Peak Season", "peak_season_surcharge"],
              ["EBS", "emergency_bunker_surcharge"],["CAF", "currency_adjustment_factor"],
            ].map(([lbl, key]) => (
              <div key={key}>
                <Label className="text-xs">{lbl}</Label>
                <Input type="number" {...F(key as keyof FormData)} />
              </div>
            ))}

            {/* Validity */}
            <div>
              <Label>Valid From</Label>
              <Input type="date" {...F("valid_from")} />
            </div>
            <div>
              <Label>Valid Until</Label>
              <Input type="date" {...F("valid_until")} />
            </div>
            <div>
              <Label>Transit Days</Label>
              <Input type="number" {...F("transit_days")} />
            </div>
            <div>
              <Label>Direct / Transshipment</Label>
              <select {...F("direct_or_transshipment")} className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm">
                {DIRECT_OPTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <Label>Price Status</Label>
              <select {...F("price_status")} className="w-full border border-gray-200 rounded-md px-2 py-2 text-sm">
                {PRICE_STATUSES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch
                checked={form.is_active}
                onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))}
              />
              <Label>Active</Label>
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea {...F("notes")} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 text-white">
              {saving ? "Menyimpan..." : editId ? "Update Rate" : "Tambah Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
