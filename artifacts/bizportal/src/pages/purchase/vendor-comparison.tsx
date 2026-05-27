import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, CheckCircle, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const idr = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const apiFetch = (path: string, opts?: RequestInit) => fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });

export default function VendorComparisonPage() {
  const { rfqId } = useParams();
  const [, navigate] = useLocation();
  const qcClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVQ, setNewVQ] = useState({ supplierName: "", deliveryDays: "", paymentTermDays: "30", notes: "", ppnRate: "11", lines: [{ name: "", quantity: "1", unit: "pcs", unitCost: "0" }] });

  const { data: quotations = [], isLoading, refetch } = useQuery({
    queryKey: ["/api/purchase-workflow/vq/compare", rfqId],
    queryFn: () => fetch(`/api/purchase-workflow/vq/compare/${rfqId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!rfqId,
  });

  const { data: rfq } = useQuery({
    queryKey: ["/api/purchase/documents", rfqId],
    queryFn: () => fetch(`/api/purchase/documents/${rfqId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!rfqId,
  });

  const addQuoteMut = useMutation({
    mutationFn: async () => {
      const totalAmount = newVQ.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0);
      const ppnPct = Number(newVQ.ppnRate) || 0;
      const taxAmount = Math.round(totalAmount * ppnPct) / 100;
      const grandTotal = totalAmount + taxAmount;
      const payload = { rfqId: Number(rfqId), supplierName: newVQ.supplierName, deliveryDays: newVQ.deliveryDays ? Number(newVQ.deliveryDays) : undefined, paymentTermDays: Number(newVQ.paymentTermDays), notes: newVQ.notes, totalAmount: String(totalAmount), taxAmount: String(taxAmount), grandTotal: String(grandTotal), lines: newVQ.lines };
      const r = await apiFetch("/purchase-workflow/vq", { method: "POST", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: () => { toast.success("Quotation ditambahkan"); setShowAddForm(false); setNewVQ({ supplierName: "", deliveryDays: "", paymentTermDays: "30", notes: "", lines: [{ name: "", quantity: "1", unit: "pcs", unitCost: "0" }] }); refetch(); },
    onError: () => toast.error("Gagal"),
  });

  const selectMut = useMutation({
    mutationFn: async (vqId: number) => {
      const r = await apiFetch(`/purchase-workflow/vq/${vqId}/select`, { method: "POST" });
      if (!r.ok) throw new Error();
      return r.json();
    },
    onSuccess: (data) => { toast.success(`PO dibuat: ${data.poNumber}`); qcClient.invalidateQueries({ queryKey: ["/api/purchase-workflow/vq/compare", rfqId] }); navigate(`/purchase/orders/${data.poId}`); },
    onError: () => toast.error("Gagal memilih quotation"),
  });

  const allItems = quotations.length > 0 ? (quotations[0].lines || []).map((l: Record<string, unknown>) => String(l.name)) : [];
  const minTotal = quotations.length > 0 ? Math.min(...quotations.map((q: Record<string, unknown>) => Number(q.grandTotal))) : 0;

  if (isLoading) return <AppShell><div className="flex items-center justify-center h-64">Loading...</div></AppShell>;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/purchase/rfq/${rfqId}`)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Perbandingan Vendor</h1>
            <p className="text-sm text-muted-foreground">RFQ: {rfq?.docNumber ?? `#${rfqId}`}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}><Plus className="mr-1 h-4 w-4" />Tambah Quotation</Button>
        </div>

        {showAddForm && (
          <Card>
            <CardHeader><CardTitle className="text-base">Tambah Quotation Vendor</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nama Vendor</Label><Input value={newVQ.supplierName} onChange={e => setNewVQ(v => ({ ...v, supplierName: e.target.value }))} /></div>
                <div><Label>Lead Time (hari)</Label><Input type="number" value={newVQ.deliveryDays} onChange={e => setNewVQ(v => ({ ...v, deliveryDays: e.target.value }))} /></div>
                <div><Label>Term Bayar (hari)</Label><Input type="number" value={newVQ.paymentTermDays} onChange={e => setNewVQ(v => ({ ...v, paymentTermDays: e.target.value }))} /></div>
                <div><Label>PPN (%)</Label><Input type="number" value={newVQ.ppnRate} onChange={e => setNewVQ(v => ({ ...v, ppnRate: e.target.value }))} placeholder="0 = tidak ada PPN" /></div>
                <div className="col-span-2"><Label>Catatan</Label><Input value={newVQ.notes} onChange={e => setNewVQ(v => ({ ...v, notes: e.target.value }))} /></div>
              </div>
              {(() => {
                const sub = newVQ.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0);
                const ppn = Math.round(sub * (Number(newVQ.ppnRate) || 0)) / 100;
                return sub > 0 ? (
                  <div className="text-sm text-right text-muted-foreground space-y-0.5 border rounded p-3 bg-muted/20">
                    <div>Subtotal (Harga Dasar, belum PPN): <span className="font-mono font-medium text-foreground ml-2">{idr(sub)}</span></div>
                    {ppn > 0 && <div>PPN {newVQ.ppnRate}%: <span className="font-mono font-medium text-foreground ml-2">{idr(ppn)}</span></div>}
                    <div className="font-semibold border-t pt-1 mt-1">Total (termasuk PPN): <span className="font-mono font-bold text-foreground ml-2">{idr(sub + ppn)}</span></div>
                  </div>
                ) : null;
              })()}
              <div>
                <Label>Item & Harga</Label>
                <div className="space-y-1 mt-1">
                  {newVQ.lines.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder="Nama item" value={l.name} onChange={e => setNewVQ(v => ({ ...v, lines: v.lines.map((ll, idx) => idx === i ? { ...ll, name: e.target.value } : ll) }))} />
                      <Input type="number" placeholder="Qty" value={l.quantity} onChange={e => setNewVQ(v => ({ ...v, lines: v.lines.map((ll, idx) => idx === i ? { ...ll, quantity: e.target.value } : ll) }))} className="w-20" />
                      <Input value={l.unit} onChange={e => setNewVQ(v => ({ ...v, lines: v.lines.map((ll, idx) => idx === i ? { ...ll, unit: e.target.value } : ll) }))} className="w-20" />
                      <Input type="number" placeholder="Harga" value={l.unitCost} onChange={e => setNewVQ(v => ({ ...v, lines: v.lines.map((ll, idx) => idx === i ? { ...ll, unitCost: e.target.value } : ll) }))} className="w-32" />
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setNewVQ(v => ({ ...v, lines: [...v.lines, { name: "", quantity: "1", unit: "pcs", unitCost: "0" }] }))}><Plus className="mr-1 h-4 w-4" />Item</Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => addQuoteMut.mutate()} disabled={addQuoteMut.isPending || !newVQ.supplierName}>Simpan Quotation</Button>
                <Button variant="outline" onClick={() => { setShowAddForm(false); setNewVQ({ supplierName: "", deliveryDays: "", paymentTermDays: "30", notes: "", ppnRate: "11", lines: [{ name: "", quantity: "1", unit: "pcs", unitCost: "0" }] }); }}>Batal</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {quotations.length === 0 ? (
          <Card><CardContent className="text-center py-12 text-muted-foreground">Belum ada quotation vendor untuk RFQ ini. Tambahkan quotation dari vendor.</CardContent></Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Item</th>
                  {quotations.map((q: Record<string, unknown>) => (
                    <th key={String(q.id)} className="text-center py-3 px-4 font-medium min-w-48">
                      <div>{String(q.supplierName)}</div>
                      <div className="text-xs text-muted-foreground font-normal">Lead: {String(q.deliveryDays ?? "?")} hari | NET{String(q.paymentTermDays ?? 30)}</div>
                      <Badge variant={q.status === "selected" ? "default" : "secondary"} className="text-xs mt-1">{String(q.status)}</Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Item rows */}
                {allItems.map((itemName: string, idx: number) => (
                  <tr key={idx} className="border-t">
                    <td className="py-2 px-4 font-medium">{itemName}</td>
                    {quotations.map((q: Record<string, unknown>) => {
                      const line = (q.lines as Record<string, unknown>[])?.find(l => String(l.name) === itemName);
                      return (
                        <td key={String(q.id)} className="py-2 px-4 text-center font-mono">
                          {line ? idr(Number(line.unitCost)) : <span className="text-muted-foreground">-</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Subtotal row */}
                <tr className="border-t bg-muted/20">
                  <td className="py-2 px-4 text-muted-foreground text-xs">Subtotal (Harga Dasar, belum PPN)</td>
                  {quotations.map((q: Record<string, unknown>) => (
                    <td key={String(q.id)} className="py-2 px-4 text-center font-mono text-sm text-muted-foreground">
                      {idr(Number(q.totalAmount ?? 0))}
                    </td>
                  ))}
                </tr>
                {/* PPN row */}
                <tr className="border-t bg-muted/20">
                  <td className="py-2 px-4 text-muted-foreground text-xs">PPN</td>
                  {quotations.map((q: Record<string, unknown>) => {
                    const tax = Number(q.taxAmount ?? 0);
                    const sub = Number(q.totalAmount ?? 0);
                    const pct = sub > 0 ? Math.round(tax / sub * 100) : 0;
                    return (
                      <td key={String(q.id)} className="py-2 px-4 text-center font-mono text-sm text-muted-foreground">
                        {tax > 0 ? <>{idr(tax)} <span className="text-xs">({pct}%)</span></> : <span className="text-xs">—</span>}
                      </td>
                    );
                  })}
                </tr>
                {/* Grand total row */}
                <tr className="border-t bg-muted/30 font-bold">
                  <td className="py-3 px-4">Total (termasuk PPN)</td>
                  {quotations.map((q: Record<string, unknown>) => {
                    const isLowest = Number(q.grandTotal) === minTotal;
                    return (
                      <td key={String(q.id)} className={`py-3 px-4 text-center font-mono ${isLowest ? "text-green-600" : ""}`}>
                        {isLowest && <Trophy className="h-3 w-3 inline mr-1 text-green-600" />}
                        {idr(Number(q.grandTotal))}
                      </td>
                    );
                  })}
                </tr>
                {/* Action row */}
                <tr className="border-t">
                  <td className="py-3 px-4" />
                  {quotations.map((q: Record<string, unknown>) => (
                    <td key={String(q.id)} className="py-3 px-4 text-center">
                      {q.status === "selected" ? (
                        <Badge>Terpilih</Badge>
                      ) : (
                        <Button size="sm" onClick={() => selectMut.mutate(Number(q.id))} disabled={selectMut.isPending || quotations.some((qq: Record<string, unknown>) => qq.status === "selected")}>
                          <CheckCircle className="mr-1 h-4 w-4" />Pilih & Buat PO
                        </Button>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
