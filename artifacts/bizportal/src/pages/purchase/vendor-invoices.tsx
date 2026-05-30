import { useState, useEffect } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Eye, ChevronLeft, Send, CheckCircle, FileText } from "lucide-react";
import { toast } from "sonner";

const idr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const apiFetch = (path: string, opts?: RequestInit) => fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });

interface VILine { productId?: number; name: string; quantity: string; unit: string; unitCost: string; subtotal: string; taxAmount: string; notes: string; }
interface VI { id: number; invoiceNumber: string; status: string; supplierName: string; vendorInvoiceRef?: string; poId?: number; grId?: number; invoiceDate: string; dueDate?: string; paymentTermDays: number; totalAmount: string; taxAmount: string; grandTotal: string; amountPaid: string; threeWayMatchStatus: string; matchNotes?: string; lines: VILine[]; }

export function VendorInvoicesListPage() {
  const { activeCompanyId } = useCompany();
  const { data: vis = [], isLoading } = useQuery({
    queryKey: ["/api/purchase-workflow/vendor-invoices", activeCompanyId],
    queryFn: () => fetch(`/api/purchase-workflow/vendor-invoices?company=${activeCompanyId}`, { credentials: "include" }).then(r => r.json()),
  });

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold">Vendor Invoice (AP)</h1><p className="text-sm text-muted-foreground">Invoice dari supplier & 3-way matching</p></div>
          <Link href="/purchase/vendor-invoices/new"><Button><Plus className="mr-2 h-4 w-4" />Buat Invoice</Button></Link>
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Daftar Vendor Invoice</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <div className="text-center py-8">Loading...</div> : vis.length === 0 ? <div className="text-center py-8 text-muted-foreground">Belum ada vendor invoice</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-3">No. Invoice</th>
                    <th className="text-left py-2 px-3">Supplier</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">3-Way Match</th>
                    <th className="text-right py-2 px-3">Grand Total</th>
                    <th className="text-right py-2 px-3">Terbayar</th>
                    <th className="text-right py-2 px-3">Aksi</th>
                  </tr></thead>
                  <tbody>
                    {vis.map((vi: Record<string, unknown>) => (
                      <tr key={String(vi.id)} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3 font-mono text-xs">{String(vi.invoiceNumber)}</td>
                        <td className="py-2 px-3">{String(vi.supplierName)}</td>
                        <td className="py-2 px-3"><Badge variant={vi.status === "paid" ? "default" : vi.status === "cancelled" ? "destructive" : "secondary"}>{String(vi.status)}</Badge></td>
                        <td className="py-2 px-3"><Badge variant={vi.threeWayMatchStatus === "matched" ? "default" : vi.threeWayMatchStatus === "partial" ? "secondary" : "outline"} className="text-xs">{String(vi.threeWayMatchStatus)}</Badge></td>
                        <td className="py-2 px-3 text-right font-mono">{idr(Number(vi.grandTotal))}</td>
                        <td className="py-2 px-3 text-right font-mono text-muted-foreground">{idr(Number(vi.amountPaid))}</td>
                        <td className="py-2 px-3 text-right"><Link href={`/purchase/vendor-invoices/${vi.id}`}><Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

export function VendorInvoiceEditorPage() {
  const { id } = useParams();
  const search = useSearch();
  const sp = new URLSearchParams(search);
  const [, navigate] = useLocation();
  const qcClient = useQueryClient();
  const { activeCompanyId } = useCompany();
  const isNew = !id || id === "new";

  const { data: vi, isLoading } = useQuery<VI>({
    queryKey: ["/api/purchase-workflow/vendor-invoices", id],
    queryFn: () => apiFetch(`/purchase-workflow/vendor-invoices/${id}`).then(r => r.json()),
    enabled: !isNew,
  });

  const [form, setForm] = useState({ supplierName: "", vendorInvoiceRef: "", poId: sp.get("poId") ?? "", grId: sp.get("grId") ?? "", invoiceDate: new Date().toISOString().substring(0, 10), paymentTermDays: "30", notes: "" });
  const [lines, setLines] = useState<VILine[]>([{ name: "", quantity: "1", unit: "pcs", unitCost: "0", subtotal: "0", taxAmount: "0", notes: "" }]);

  useEffect(() => {
    if (vi) {
      setForm({ supplierName: vi.supplierName, vendorInvoiceRef: vi.vendorInvoiceRef ?? "", poId: String(vi.poId ?? ""), grId: String(vi.grId ?? ""), invoiceDate: vi.invoiceDate.substring(0, 10), paymentTermDays: String(vi.paymentTermDays), notes: "" });
      setLines(vi.lines?.length ? vi.lines.map(l => ({ ...l, quantity: String(l.quantity), unitCost: String(l.unitCost), subtotal: String(l.subtotal), taxAmount: String(l.taxAmount) })) : []);
    }
  }, [vi]);

  const updateLine = (i: number, key: keyof VILine, value: string) => setLines(prev => {
    const updated = prev.map((l, idx) => idx === i ? { ...l, [key]: value } : l);
    const line = updated[i];
    if (line && (key === "quantity" || key === "unitCost")) updated[i] = { ...line, subtotal: String((Number(line.quantity) * Number(line.unitCost)).toFixed(2)) };
    return updated;
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { ...form, poId: form.poId ? Number(form.poId) : undefined, grId: form.grId ? Number(form.grId) : undefined, companyId: activeCompanyId, lines };
      const r = isNew ? await apiFetch("/purchase-workflow/vendor-invoices", { method: "POST", body: JSON.stringify(payload) }) : await apiFetch(`/purchase-workflow/vendor-invoices/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: (data: VI) => { toast.success("Tersimpan"); qcClient.invalidateQueries({ queryKey: ["/api/purchase-workflow/vendor-invoices"] }); if (isNew) navigate(`/purchase/vendor-invoices/${data.id}`); },
    onError: () => toast.error("Gagal"),
  });

  const postMut = useMutation({
    mutationFn: () => apiFetch(`/purchase-workflow/vendor-invoices/${vi?.id}/post`, { method: "POST" }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    onSuccess: () => { toast.success("Invoice diposting & jurnal dibuat"); qcClient.invalidateQueries({ queryKey: ["/api/purchase-workflow/vendor-invoices", id] }); },
    onError: () => toast.error("Gagal posting"),
  });

  const isDraft = !vi || vi.status === "draft";
  if (!isNew && isLoading) return <AppShell><div className="flex items-center justify-center h-64">Loading...</div></AppShell>;

  const totalAmount = lines.reduce((s, l) => s + Number(l.subtotal), 0);
  const taxAmount = lines.reduce((s, l) => s + Number(l.taxAmount), 0);

  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/purchase/vendor-invoices")}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{isNew ? "Buat Vendor Invoice" : `Invoice: ${vi?.invoiceNumber}`}</h1>
            {vi && (
              <div className="flex gap-2 mt-1">
                <Badge variant={vi.status === "paid" ? "default" : vi.status === "cancelled" ? "destructive" : "secondary"}>{vi.status}</Badge>
                <Badge variant={vi.threeWayMatchStatus === "matched" ? "default" : "secondary"}>{vi.threeWayMatchStatus}</Badge>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {isDraft && <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Simpan</Button>}
            {!isNew && isDraft && <Button variant="default" onClick={() => postMut.mutate()} disabled={postMut.isPending}><Send className="mr-1 h-4 w-4" />Post & 3-Way Match</Button>}
          </div>
        </div>

        {vi?.matchNotes && (
          <div className={`p-3 rounded border text-sm ${vi.threeWayMatchStatus === "matched" ? "bg-green-50 border-green-200 text-green-800" : "bg-yellow-50 border-yellow-200 text-yellow-800"}`}>
            <strong>3-Way Match:</strong> {vi.matchNotes}
          </div>
        )}

        {!isNew && vi && vi.status === "posted" && (
          <div className="flex gap-2">
            <Link href={`/purchase/payment-requests/new?viId=${vi.id}&supplier=${encodeURIComponent(vi.supplierName)}&amount=${Number(vi.grandTotal) - Number(vi.amountPaid)}`}>
              <Button variant="outline" size="sm"><CheckCircle className="mr-1 h-4 w-4" />Buat Payment Request</Button>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Info Invoice</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Nama Supplier</Label><Input value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} disabled={!isDraft} /></div>
              <div><Label>No. Invoice Supplier</Label><Input value={form.vendorInvoiceRef} onChange={e => setForm(f => ({ ...f, vendorInvoiceRef: e.target.value }))} disabled={!isDraft} placeholder="Nomor dari supplier..." /></div>
              <div><Label>No. PO (ID)</Label><Input value={form.poId} onChange={e => setForm(f => ({ ...f, poId: e.target.value }))} disabled={!isDraft} /></div>
              <div><Label>No. GRN (ID)</Label><Input value={form.grId} onChange={e => setForm(f => ({ ...f, grId: e.target.value }))} disabled={!isDraft} /></div>
              <div><Label>Tgl Invoice</Label><Input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} disabled={!isDraft} /></div>
              <div><Label>Term Pembayaran (hari)</Label><Input type="number" value={form.paymentTermDays} onChange={e => setForm(f => ({ ...f, paymentTermDays: e.target.value }))} disabled={!isDraft} /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Ringkasan</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono">{idr(totalAmount)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Pajak (PPN)</span><span className="font-mono">{idr(taxAmount)}</span></div>
              <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Grand Total</span><span className="font-mono">{idr(totalAmount + taxAmount)}</span></div>
              {vi && <div className="flex justify-between text-green-600"><span>Terbayar</span><span className="font-mono">{idr(Number(vi.amountPaid))}</span></div>}
              {vi && <div className="flex justify-between font-semibold text-red-600"><span>Sisa</span><span className="font-mono">{idr(Math.max(0, Number(vi.grandTotal) - Number(vi.amountPaid)))}</span></div>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Item Invoice</CardTitle>
            {isDraft && <Button size="sm" variant="outline" onClick={() => setLines(prev => [...prev, { name: "", quantity: "1", unit: "pcs", unitCost: "0", subtotal: "0", taxAmount: "0", notes: "" }])}><Plus className="mr-1 h-4 w-4" />Tambah</Button>}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left py-2 px-2">Nama</th>
                  <th className="text-left py-2 px-2 w-20">Qty</th>
                  <th className="text-left py-2 px-2 w-20">Satuan</th>
                  <th className="text-left py-2 px-2 w-32">Harga</th>
                  <th className="text-left py-2 px-2 w-28">Pajak</th>
                  <th className="text-right py-2 px-2 w-32">Subtotal</th>
                  {isDraft && <th className="w-10" />}
                </tr></thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-1 px-2"><Input value={line.name} onChange={e => updateLine(i, "name", e.target.value)} disabled={!isDraft} className="h-8" /></td>
                      <td className="py-1 px-2"><Input type="number" value={line.quantity} onChange={e => updateLine(i, "quantity", e.target.value)} disabled={!isDraft} className="h-8" /></td>
                      <td className="py-1 px-2"><Input value={line.unit} onChange={e => updateLine(i, "unit", e.target.value)} disabled={!isDraft} className="h-8" /></td>
                      <td className="py-1 px-2"><Input type="number" value={line.unitCost} onChange={e => updateLine(i, "unitCost", e.target.value)} disabled={!isDraft} className="h-8" /></td>
                      <td className="py-1 px-2"><Input type="number" value={line.taxAmount} onChange={e => updateLine(i, "taxAmount", e.target.value)} disabled={!isDraft} className="h-8" placeholder="PPN..." /></td>
                      <td className="py-1 px-2 text-right font-mono text-xs">{idr(Number(line.subtotal))}</td>
                      {isDraft && <td className="py-1 px-2"><Button size="icon" variant="ghost" onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
