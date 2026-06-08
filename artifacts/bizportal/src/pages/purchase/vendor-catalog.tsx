import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckCircle,
  ChevronDown,
  Eye,
  Filter,
  Globe,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  XCircle,
  GitCompare,
  X,
  ExternalLink,
  Package,
  Wrench,
  FileText,
  ClipboardList,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogRow = {
  id: number;
  vendorId: number;
  vendorName: string;
  templateKind: string | null;
  categoryKey: string | null;
  serviceType: string | null;
  name: string;
  kategori: string | null;
  subcategory: string | null;
  specSummary: string | null;
  priceBase: number;
  markupPct: number;
  priceSell: number | null;
  currency: string;
  unit: string | null;
  moq: number | null;
  stockStatus: string | null;
  stockQty: number | null;
  leadTime: string | null;
  location: string | null;
  origin: string | null;
  status: string;
  isPublished: boolean;
  isActive: boolean;
  publishedAt: string | null;
  sourceSubmissionId: number | null;
  createdAt: string;
  updatedAt: string;
};

type CatalogDetail = CatalogRow & {
  description: string | null;
  templateSnapshot: Record<string, unknown> | null;
  specValues: Record<string, unknown> | null;
  documents: Array<{ key: string; label: string; required?: boolean; url?: string }> | null;
  vendorServiceType: string | null;
  validityDate: string | null;
  isCommodityTag: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  draft:          { label: "Draft",           variant: "outline",     color: "text-muted-foreground" },
  pending_review: { label: "Pending Review",  variant: "secondary",   color: "text-yellow-600" },
  published:      { label: "Published",       variant: "default",     color: "text-green-600" },
  archived:       { label: "Archived",        variant: "destructive", color: "text-red-500" },
};

const STOCK_META: Record<string, { label: string; color: string }> = {
  available:    { label: "Available",    color: "text-green-600" },
  limited:      { label: "Limited",      color: "text-yellow-600" },
  out_of_stock: { label: "Out of Stock", color: "text-red-500" },
};

function fmtIDR(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, variant: "outline" as const, color: "" };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function StockBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const m = STOCK_META[status] ?? { label: status, color: "" };
  return <span className={`text-xs font-medium ${m.color}`}>{m.label}</span>;
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function fetchCatalogAll(params: Record<string, string>) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v && v !== "all")
  ).toString();
  const res = await fetch(`/api/trading/suppliers/catalog/all${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CatalogRow[]>;
}

async function fetchDetail(id: number) {
  const res = await fetch(`/api/trading/suppliers/catalog/${id}/detail`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CatalogDetail>;
}

async function patchStatus(id: number, status: string) {
  const res = await fetch(`/api/trading/suppliers/catalog/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function patchFields(id: number, fields: Record<string, unknown>) {
  const res = await fetch(`/api/trading/suppliers/catalog/${id}/fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TemplateSnapshotView({ snapshot }: { snapshot: Record<string, unknown> | null }) {
  if (!snapshot) return <p className="text-muted-foreground text-sm">Tidak ada template snapshot.</p>;
  const fields = (snapshot as { fields?: Array<{ key: string; label: string; type?: string }> }).fields ?? [];
  if (fields.length === 0) {
    return (
      <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    );
  }
  return (
    <div className="space-y-1">
      {fields.map((f) => (
        <div key={f.key} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground w-32 shrink-0">{f.label}</span>
          <Badge variant="outline" className="text-xs">{f.type ?? "text"}</Badge>
        </div>
      ))}
    </div>
  );
}

function SpecValuesView({ values }: { values: Record<string, unknown> | null }) {
  if (!values || Object.keys(values).length === 0)
    return <p className="text-muted-foreground text-sm">Tidak ada spec values.</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(values).map(([k, v]) => (
        <div key={k} className="bg-muted rounded p-2">
          <p className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
          <p className="text-sm font-medium">{String(v ?? "—")}</p>
        </div>
      ))}
    </div>
  );
}

function DocumentsView({ documents }: { documents: CatalogDetail["documents"] }) {
  if (!documents || documents.length === 0)
    return <p className="text-muted-foreground text-sm">Tidak ada dokumen.</p>;
  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div key={doc.key} className="flex items-center justify-between gap-2 p-2 border rounded">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{doc.label}</span>
            {doc.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
          </div>
          {doc.url && (
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

function DetailDialog({
  itemId,
  open,
  onClose,
}: {
  itemId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["catalog-detail", itemId],
    queryFn: () => fetchDetail(itemId!),
    enabled: open && itemId != null,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.name ?? "Detail Catalog Item"}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Vendor</span><p className="font-medium">{data.vendorName}</p></div>
              <div><span className="text-muted-foreground">Status</span><p><StatusBadge status={data.status} /></p></div>
              <div><span className="text-muted-foreground">Template Kind</span><p className="font-medium capitalize">{data.templateKind ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Category / Service</span><p className="font-medium">{data.categoryKey ?? data.serviceType ?? data.kategori ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Harga Dasar (Admin)</span><p className="font-semibold text-orange-600">{fmtIDR(data.priceBase)}</p></div>
              <div><span className="text-muted-foreground">Harga Jual</span><p className="font-semibold text-green-600">{fmtIDR(data.priceSell)}</p></div>
              <div><span className="text-muted-foreground">Unit</span><p className="font-medium">{data.unit ?? "—"}</p></div>
              <div><span className="text-muted-foreground">MOQ</span><p className="font-medium">{data.moq ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Stock</span><p className="font-medium"><StockBadge status={data.stockStatus} /> {data.stockQty != null ? `(${data.stockQty})` : ""}</p></div>
              <div><span className="text-muted-foreground">Lead Time</span><p className="font-medium">{data.leadTime ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Lokasi</span><p className="font-medium">{data.location ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Origin</span><p className="font-medium">{data.origin ?? "—"}</p></div>
              {data.publishedAt && (
                <div><span className="text-muted-foreground">Published At</span><p className="font-medium">{new Date(data.publishedAt).toLocaleDateString("id-ID")}</p></div>
              )}
              {data.sourceSubmissionId && (
                <div>
                  <span className="text-muted-foreground">Source Submission</span>
                  <p>
                    <Link href={`/purchase/vendor-forms?submission=${data.sourceSubmissionId}`} className="text-blue-500 hover:underline flex items-center gap-1">
                      #{data.sourceSubmissionId} <ExternalLink className="h-3 w-3" />
                    </Link>
                  </p>
                </div>
              )}
            </div>

            {data.description && (
              <div>
                <h4 className="font-semibold mb-1">Deskripsi</h4>
                <p className="text-sm text-muted-foreground">{data.description}</p>
              </div>
            )}

            {/* Template Snapshot */}
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Template Snapshot
              </h4>
              <TemplateSnapshotView snapshot={data.templateSnapshot as Record<string, unknown> | null} />
            </div>

            {/* Spec Values */}
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Package className="h-4 w-4" /> Spec Values
              </h4>
              <SpecValuesView values={data.specValues as Record<string, unknown> | null} />
            </div>

            {/* Documents / Required Docs */}
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Required Documents
              </h4>
              <DocumentsView documents={data.documents} />
            </div>

            {/* Checklist from templateSnapshot */}
            {(() => {
              const checklist = (data.templateSnapshot as { checklist?: Array<{ key: string; label: string }> } | null)?.checklist ?? [];
              if (checklist.length === 0) return null;
              return (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" /> Checklist
                  </h4>
                  <div className="space-y-1">
                    {checklist.map((c) => (
                      <div key={c.key} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        <span>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button asChild variant="outline">
            <Link href={`/purchase/vendors/${data?.vendorId}`}>
              Buka Vendor Detail <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Fields Dialog ───────────────────────────────────────────────────────

function EditFieldsDialog({
  item,
  open,
  onClose,
  onSaved,
}: {
  item: CatalogRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [priceSell, setPriceSell] = useState("");
  const [priceBase, setPriceBase] = useState("");
  const [stockStatus, setStockStatus] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [leadTime, setLeadTime] = useState("");

  // Reset when item changes
  useMemo(() => {
    if (item) {
      setPriceSell(item.priceSell != null ? String(item.priceSell) : "");
      setPriceBase(String(item.priceBase));
      setStockStatus(item.stockStatus ?? "available");
      setStockQty(item.stockQty != null ? String(item.stockQty) : "");
      setLeadTime(item.leadTime ?? "");
    }
  }, [item]);

  const mutation = useMutation({
    mutationFn: () =>
      patchFields(item!.id, {
        priceSell: priceSell !== "" ? Number(priceSell) : null,
        priceBase: priceBase !== "" ? Number(priceBase) : 0,
        stockStatus,
        stockQty: stockQty !== "" ? Number(stockQty) : null,
        leadTime: leadTime || null,
      }),
    onSuccess: () => {
      toast({ title: "Tersimpan", description: "Fields berhasil diupdate." });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Fields — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Harga Dasar (Admin Only)</Label>
              <Input
                type="number"
                placeholder="0"
                value={priceBase}
                onChange={(e) => setPriceBase(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Harga Jual</Label>
              <Input
                type="number"
                placeholder="0"
                value={priceSell}
                onChange={(e) => setPriceSell(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Stock Status</Label>
            <Select value={stockStatus} onValueChange={setStockStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="limited">Limited</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Stock Qty</Label>
              <Input
                type="number"
                placeholder="—"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Lead Time</Label>
              <Input
                placeholder="e.g. 3-5 hari"
                value={leadTime}
                onChange={(e) => setLeadTime(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Compare Dialog ───────────────────────────────────────────────────────────

function CompareDialog({
  items,
  open,
  onClose,
}: {
  items: CatalogRow[];
  open: boolean;
  onClose: () => void;
}) {
  if (items.length === 0) return null;

  const fields: Array<{ key: keyof CatalogRow; label: string }> = [
    { key: "vendorName", label: "Vendor" },
    { key: "templateKind", label: "Tipe" },
    { key: "categoryKey", label: "Category" },
    { key: "priceBase", label: "Harga Dasar" },
    { key: "priceSell", label: "Harga Jual" },
    { key: "unit", label: "Unit" },
    { key: "moq", label: "MOQ" },
    { key: "stockStatus", label: "Stock" },
    { key: "stockQty", label: "Qty" },
    { key: "leadTime", label: "Lead Time" },
    { key: "location", label: "Lokasi" },
    { key: "origin", label: "Origin" },
    { key: "status", label: "Status" },
  ];

  const renderVal = (item: CatalogRow, key: keyof CatalogRow) => {
    const v = item[key];
    if (key === "priceBase" || key === "priceSell") return fmtIDR(v as number | null);
    if (key === "stockStatus") return <StockBadge status={v as string | null} />;
    if (key === "status") return <StatusBadge status={v as string} />;
    return v != null ? String(v) : "—";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Perbandingan Catalog — {items.length} item</DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Field</TableHead>
                {items.map((item) => (
                  <TableHead key={item.id} className="min-w-40">
                    <div className="font-semibold text-sm">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.vendorName}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f) => (
                <TableRow key={f.key}>
                  <TableCell className="text-muted-foreground text-xs font-medium">{f.label}</TableCell>
                  {items.map((item) => (
                    <TableCell key={item.id} className="text-sm">
                      {renderVal(item, f.key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VendorCatalogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [search, setSearch] = useState("");
  const [filterVendor, setFilterVendor] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterKind, setFilterKind] = useState("all");

  // Dialogs
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<CatalogRow | null>(null);
  const [compareItems, setCompareItems] = useState<CatalogRow[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Selection for compare
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const QK = ["vendor-catalog-all", filterVendor, filterStatus, filterKind, search];

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: QK,
    queryFn: () =>
      fetchCatalogAll({
        vendor: filterVendor,
        status: filterStatus,
        templateKind: filterKind,
        search,
      }),
  });

  // Unique vendors for filter dropdown
  const vendors = useMemo(() => {
    const map = new Map<number, string>();
    data.forEach((r) => map.set(r.vendorId, r.vendorName));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  // Stats
  const stats = useMemo(() => ({
    total: data.length,
    published: data.filter((r) => r.status === "published").length,
    pending: data.filter((r) => r.status === "pending_review").length,
    draft: data.filter((r) => r.status === "draft").length,
    archived: data.filter((r) => r.status === "archived").length,
  }), [data]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => patchStatus(id, status),
    onSuccess: (_, vars) => {
      toast({ title: "Status diupdate", description: `Item berhasil di-${vars.status}.` });
      queryClient.invalidateQueries({ queryKey: ["vendor-catalog-all"] });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCompare() {
    const items = data.filter((r) => selected.has(r.id));
    setCompareItems(items);
    setCompareOpen(true);
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Vendor Catalog</h1>
            <p className="text-muted-foreground text-sm">Review, approve, dan kelola catalog item dari semua vendor.</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size >= 2 && (
              <Button variant="outline" size="sm" onClick={openCompare}>
                <GitCompare className="h-4 w-4 mr-1" />
                Compare ({selected.size})
              </Button>
            )}
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Published", value: stats.published, color: "text-green-600" },
            { label: "Pending Review", value: stats.pending, color: "text-yellow-600" },
            { label: "Draft", value: stats.draft, color: "text-muted-foreground" },
            { label: "Archived", value: stats.archived, color: "text-red-500" },
          ].map((s) => (
            <Card key={s.label} className="cursor-pointer hover:shadow" onClick={() => setFilterStatus(s.label === "Total" ? "all" : s.label.toLowerCase().replace(" ", "_"))}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-48">
                <Label className="text-xs mb-1 block">Cari item</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Nama item, vendor, kategori..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="min-w-40">
                <Label className="text-xs mb-1 block">Vendor</Label>
                <Select value={filterVendor} onValueChange={setFilterVendor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Vendor</SelectItem>
                    {vendors.map(([id, name]) => (
                      <SelectItem key={id} value={String(id)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-36">
                <Label className="text-xs mb-1 block">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_review">Pending Review</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-36">
                <Label className="text-xs mb-1 block">Tipe Template</Label>
                <Select value={filterKind} onValueChange={setFilterKind}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua tipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Tipe</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(filterVendor !== "all" || filterStatus !== "all" || filterKind !== "all" || search) && (
                <Button variant="ghost" size="sm" onClick={() => { setFilterVendor("all"); setFilterStatus("all"); setFilterKind("all"); setSearch(""); }}>
                  <X className="h-4 w-4 mr-1" />Reset
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              {data.length} item ditemukan
              {selected.size > 0 && (
                <span className="ml-2 text-sm text-muted-foreground font-normal">{selected.size} dipilih</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Tidak ada catalog item ditemukan.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Spec</TableHead>
                      <TableHead className="text-right">Hrg Dasar</TableHead>
                      <TableHead className="text-right">Hrg Jual</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Lead Time</TableHead>
                      <TableHead>Asal/Lok.</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row) => (
                      <TableRow
                        key={row.id}
                        className={selected.has(row.id) ? "bg-blue-50 dark:bg-blue-950/20" : undefined}
                      >
                        {/* Checkbox for compare */}
                        <TableCell>
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selected.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                          />
                        </TableCell>

                        {/* Vendor */}
                        <TableCell>
                          <Link
                            href={`/purchase/vendors/${row.vendorId}`}
                            className="text-blue-600 hover:underline text-sm font-medium"
                          >
                            {row.vendorName}
                          </Link>
                        </TableCell>

                        {/* Item name */}
                        <TableCell>
                          <p className="font-medium text-sm">{row.name}</p>
                          {row.subcategory && (
                            <p className="text-xs text-muted-foreground">{row.subcategory}</p>
                          )}
                        </TableCell>

                        {/* Template Kind */}
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                {row.templateKind === "product" ? (
                                  <Package className="h-4 w-4 text-blue-500" />
                                ) : (
                                  <Wrench className="h-4 w-4 text-purple-500" />
                                )}
                              </TooltipTrigger>
                              <TooltipContent>{row.templateKind ?? "—"}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>

                        {/* Kategori */}
                        <TableCell>
                          <span className="text-xs">
                            {row.categoryKey ?? row.serviceType ?? row.kategori ?? "—"}
                          </span>
                        </TableCell>

                        {/* Spec summary */}
                        <TableCell>
                          <span className="text-xs text-muted-foreground max-w-32 truncate block" title={row.specSummary ?? ""}>
                            {row.specSummary ?? "—"}
                          </span>
                        </TableCell>

                        {/* Harga Dasar (admin only) */}
                        <TableCell className="text-right font-mono text-sm text-orange-600">
                          {fmtIDR(row.priceBase)}
                        </TableCell>

                        {/* Harga Jual */}
                        <TableCell className="text-right font-mono text-sm text-green-600">
                          {fmtIDR(row.priceSell)}
                        </TableCell>

                        {/* Stock Status */}
                        <TableCell>
                          <StockBadge status={row.stockStatus} />
                        </TableCell>

                        {/* Stock Qty */}
                        <TableCell className="text-sm">
                          {row.stockQty != null ? row.stockQty : "—"}
                        </TableCell>

                        {/* Unit */}
                        <TableCell className="text-xs text-muted-foreground">
                          {row.unit ?? "—"}
                        </TableCell>

                        {/* Lead Time */}
                        <TableCell className="text-xs">
                          {row.leadTime ?? "—"}
                        </TableCell>

                        {/* Origin / Location */}
                        <TableCell className="text-xs text-muted-foreground">
                          {row.origin ?? row.location ?? "—"}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <TooltipProvider>
                              {/* View Detail */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setDetailId(row.id)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Lihat Detail</TooltipContent>
                              </Tooltip>

                              {/* Edit Fields */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setEditItem(row)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit Harga & Stock</TooltipContent>
                              </Tooltip>

                              {/* Publish / Unpublish / Archive */}
                              {row.status !== "published" && row.status !== "archived" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-green-600"
                                      disabled={statusMutation.isPending}
                                      onClick={() => statusMutation.mutate({ id: row.id, status: "published" })}
                                    >
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Publish</TooltipContent>
                                </Tooltip>
                              )}

                              {row.status === "published" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-yellow-600"
                                      disabled={statusMutation.isPending}
                                      onClick={() => statusMutation.mutate({ id: row.id, status: "draft" })}
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Unpublish</TooltipContent>
                                </Tooltip>
                              )}

                              {row.status !== "archived" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-500"
                                      disabled={statusMutation.isPending}
                                      onClick={() => statusMutation.mutate({ id: row.id, status: "archived" })}
                                    >
                                      <Archive className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Archive</TooltipContent>
                                </Tooltip>
                              )}

                              {row.status === "archived" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-blue-500"
                                      disabled={statusMutation.isPending}
                                      onClick={() => statusMutation.mutate({ id: row.id, status: "draft" })}
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Restore ke Draft</TooltipContent>
                                </Tooltip>
                              )}
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* VENDOR CATALOG ADMIN UI REPORT */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">VENDOR CATALOG ADMIN UI REPORT</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Total items: <strong>{stats.total}</strong> | Published: <strong className="text-green-600">{stats.published}</strong> | Pending: <strong className="text-yellow-600">{stats.pending}</strong> | Draft: <strong>{stats.draft}</strong> | Archived: <strong className="text-red-500">{stats.archived}</strong></p>
            <p>Vendors: <strong>{vendors.length}</strong> | Filters aktif: {[filterVendor !== "all" && "vendor", filterStatus !== "all" && "status", filterKind !== "all" && "kind", search && "search"].filter(Boolean).join(", ") || "tidak ada"}</p>
            <p>Dipilih untuk compare: <strong>{selected.size}</strong> item | Min. 2 item untuk compare</p>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <DetailDialog
        itemId={detailId}
        open={detailId != null}
        onClose={() => setDetailId(null)}
      />

      <EditFieldsDialog
        item={editItem}
        open={editItem != null}
        onClose={() => setEditItem(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["vendor-catalog-all"] })}
      />

      <CompareDialog
        items={compareItems}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />
    </AppShell>
  );
}
