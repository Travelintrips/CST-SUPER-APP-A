import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowRight, CheckCircle, XCircle, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

interface PRLine { id?: number; name: string; quantity: string; unit: string; estimatedCost: string; notes: string; }
interface PR { id: number; prNumber: string; status: string; requestedBy: string; department: string; requiredDate: string; notes: string; lines: PRLine[]; approvals: Record<string, unknown>[]; rfqId?: number; }

const apiFetch = (path: string, opts?: RequestInit) => fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });

const statusColor: Record<string, string> = { draft: "secondary", submitted: "default", approved: "default", rejected: "destructive", converted: "outline", cancelled: "destructive" };
const statusLabel: Record<string, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Rejected", converted: "Converted→RFQ", cancelled: "Cancelled" };

export default function PurchaseRequestEditorPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const isNew = !id || id === "new";

  const { data: pr, isLoading } = useQuery<PR>({
    queryKey: ["/api/purchase-workflow/pr", id],
    queryFn: () => apiFetch(`/purchase-workflow/pr/${id}`).then(r => r.json()),
    enabled: !isNew,
  });

  const [form, setForm] = useState({ requestedBy: "", department: "", requiredDate: "", notes: "" });
  const [lines, setLines] = useState<PRLine[]>([{ name: "", quantity: "1", unit: "pcs", estimatedCost: "0", notes: "" }]);
  const [actionNotes, setActionNotes] = useState("");

  useEffect(() => {
    if (pr) {
      setForm({ requestedBy: pr.requestedBy ?? "", department: pr.department ?? "", requiredDate: pr.requiredDate ? pr.requiredDate.substring(0, 10) : "", notes: pr.notes ?? "" });
      setLines(pr.lines?.length ? pr.lines.map(l => ({ name: l.name, quantity: String(l.quantity), unit: l.unit, estimatedCost: String(l.estimatedCost), notes: l.notes ?? "" })) : [{ name: "", quantity: "1", unit: "pcs", estimatedCost: "0", notes: "" }]);
    }
  }, [pr]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { ...form, companyId: activeCompanyId, lines };
      const r = isNew
        ? await apiFetch("/purchase-workflow/pr", { method: "POST", body: JSON.stringify(payload) })
        : await apiFetch(`/purchase-workflow/pr/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error("Gagal menyimpan");
      return r.json();
    },
    onSuccess: (data: PR) => {
      toast.success("PR tersimpan");
      qc.invalidateQueries({ queryKey: ["/api/purchase-workflow/pr"] });
      if (isNew) navigate(`/purchase/pr/${data.id}`);
    },
    onError: () => toast.error("Gagal menyimpan"),
  });

  const actionMut = useMutation({
    mutationFn: async (action: string) => {
      const r = await apiFetch(`/purchase-workflow/pr/${pr?.id ?? id}/action`, { method: "POST", body: JSON.stringify({ action, notes: actionNotes }) });
      if (!r.ok) throw new Error("Gagal");
      return r.json();
    },
    onSuccess: (data) => {
      toast.success("Berhasil");
      qc.invalidateQueries({ queryKey: ["/api/purchase-workflow/pr", id] });
      if (data.rfqId) navigate(`/purchase/rfq/${data.rfqId}`);
    },
    onError: () => toast.error("Gagal melakukan aksi"),
  });

  const addLine = () => setLines(prev => [...prev, { name: "", quantity: "1", unit: "pcs", estimatedCost: "0", notes: "" }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, key: keyof PRLine, value: string) => setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [key]: value } : l));

  const isDraft = !pr || pr.status === "draft";
  const isSubmitted = pr?.status === "submitted";

  if (!isNew && isLoading) return <AppShell><div className="flex items-center justify-center h-64">Loading...</div></AppShell>;

  return (
    <AppShell>
      <div className="flex flex-col gap-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/purchase/pr")}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{isNew ? "Buat Purchase Request" : `PR: ${pr?.prNumber}`}</h1>
            {pr && <Badge variant={statusColor[pr.status] as "default" | "secondary" | "destructive" | "outline"}>{statusLabel[pr.status]}</Badge>}
          </div>
          {isDraft && <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Simpan</Button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Informasi PR</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Pemohon</Label><Input value={form.requestedBy} onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))} disabled={!isDraft} /></div>
              <div><Label>Departemen</Label><Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} disabled={!isDraft} /></div>
              <div><Label>Tanggal Diperlukan</Label><Input type="date" value={form.requiredDate} onChange={e => setForm(f => ({ ...f, requiredDate: e.target.value }))} disabled={!isDraft} /></div>
              <div><Label>Catatan</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} disabled={!isDraft} rows={3} /></div>
            </CardContent>
          </Card>

          {pr && (
            <Card>
              <CardHeader><CardTitle className="text-base">Aksi Workflow</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Catatan Approval</Label><Textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)} rows={2} placeholder="Opsional..." /></div>
                <div className="flex flex-wrap gap-2">
                  {isDraft && <Button size="sm" onClick={() => actionMut.mutate("submit")} disabled={actionMut.isPending}><ArrowRight className="mr-1 h-4 w-4" />Submit</Button>}
                  {isSubmitted && <Button size="sm" variant="default" onClick={() => actionMut.mutate("approve")} disabled={actionMut.isPending}><CheckCircle className="mr-1 h-4 w-4" />Approve</Button>}
                  {isSubmitted && <Button size="sm" variant="destructive" onClick={() => actionMut.mutate("reject")} disabled={actionMut.isPending}><XCircle className="mr-1 h-4 w-4" />Reject</Button>}
                  {pr.status === "approved" && <Button size="sm" onClick={() => actionMut.mutate("convert_rfq")} disabled={actionMut.isPending}><ArrowRight className="mr-1 h-4 w-4" />Konversi ke RFQ</Button>}
                  {(isDraft || isSubmitted) && <Button size="sm" variant="outline" onClick={() => actionMut.mutate("cancel")} disabled={actionMut.isPending}><XCircle className="mr-1 h-4 w-4" />Cancel</Button>}
                </div>
                {pr.rfqId && <p className="text-sm text-muted-foreground">RFQ dibuat: <a href={`/purchase/rfq/${pr.rfqId}`} className="underline">Lihat RFQ</a></p>}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Item yang Dibutuhkan</CardTitle>
            {isDraft && <Button size="sm" variant="outline" onClick={addLine}><Plus className="mr-1 h-4 w-4" />Tambah Item</Button>}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Nama Item</th>
                    <th className="text-left py-2 px-2 w-24">Qty</th>
                    <th className="text-left py-2 px-2 w-20">Satuan</th>
                    <th className="text-left py-2 px-2 w-32">Est. Harga</th>
                    <th className="text-left py-2 px-2">Catatan</th>
                    {isDraft && <th className="w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-1 px-2"><Input value={line.name} onChange={e => updateLine(i, "name", e.target.value)} disabled={!isDraft} className="h-8" /></td>
                      <td className="py-1 px-2"><Input type="number" value={line.quantity} onChange={e => updateLine(i, "quantity", e.target.value)} disabled={!isDraft} className="h-8" /></td>
                      <td className="py-1 px-2"><Input value={line.unit} onChange={e => updateLine(i, "unit", e.target.value)} disabled={!isDraft} className="h-8" /></td>
                      <td className="py-1 px-2"><Input type="number" value={line.estimatedCost} onChange={e => updateLine(i, "estimatedCost", e.target.value)} disabled={!isDraft} className="h-8" /></td>
                      <td className="py-1 px-2"><Input value={line.notes} onChange={e => updateLine(i, "notes", e.target.value)} disabled={!isDraft} className="h-8" /></td>
                      {isDraft && <td className="py-1 px-2"><Button size="icon" variant="ghost" onClick={() => removeLine(i)} className="h-8 w-8"><Trash2 className="h-4 w-4 text-destructive" /></Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {pr?.approvals && pr.approvals.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Riwayat Approval</CardTitle></CardHeader>
            <CardContent>
              {pr.approvals.map((a, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <Badge variant={a.status === "approved" ? "default" : a.status === "rejected" ? "destructive" : "secondary"}>Step {String(a.step)}: {String(a.status)}</Badge>
                  <span className="text-sm">{String(a.approverName ?? "-")}</span>
                  {a.notes && <span className="text-sm text-muted-foreground">— {String(a.notes)}</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
