import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useListJournals, useCreateJournal, useUpdateJournal, useListAccounts,
  getListJournalsQueryKey, type AccountingJournal,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, BookOpen } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  sales: "Penjualan", purchase: "Pembelian", bank: "Bank", cash: "Kas", general: "Umum",
};

export default function JournalsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: journals } = useListJournals();
  const { data: accounts } = useListAccounts();
  const createMut = useCreateJournal();
  const updateMut = useUpdateJournal();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountingJournal | null>(null);
  const [form, setForm] = useState({
    code: "", name: "", type: "general" as AccountingJournal["type"],
    defaultDebitAccountId: null as number | null, defaultCreditAccountId: null as number | null, isActive: true,
  });

  const reset = () => { setEditing(null); setForm({ code: "", name: "", type: "general", defaultDebitAccountId: null, defaultCreditAccountId: null, isActive: true }); };

  const startEdit = (j: AccountingJournal) => {
    setEditing(j);
    setForm({ code: j.code, name: j.name, type: j.type, defaultDebitAccountId: j.defaultDebitAccountId ?? null, defaultCreditAccountId: j.defaultCreditAccountId ?? null, isActive: j.isActive });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Kode & nama wajib diisi", variant: "destructive" }); return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: form });
        toast({ title: "Jurnal diperbarui" });
      } else {
        await createMut.mutateAsync({ data: form });
        toast({ title: "Jurnal dibuat" });
      }
      qc.invalidateQueries({ queryKey: getListJournalsQueryKey() });
      reset(); setOpen(false);
    } catch (e: any) {
      toast({ title: "Gagal", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const accLabel = (id: number | null | undefined) => {
    if (!id) return "-";
    const a = accounts?.find((x) => x.id === id);
    return a ? `${a.code} ${a.name}` : `#${id}`;
  };

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6" />Jurnal</h1>
            <p className="text-sm text-muted-foreground">Buku jurnal — Penjualan, Pembelian, Bank, Kas, Umum</p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild><Button data-testid="button-add-journal"><Plus className="h-4 w-4 mr-2" />Tambah Jurnal</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit Jurnal" : "Jurnal Baru"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Kode</Label><Input data-testid="input-journal-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SAL" /></div>
                <div><Label>Nama</Label><Input data-testid="input-journal-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jurnal Penjualan" /></div>
                <div>
                  <Label>Tipe</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as AccountingJournal["type"] })}>
                    <SelectTrigger data-testid="select-journal-type"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <Label htmlFor="active">Aktif</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Batal</Button>
                <Button onClick={submit} data-testid="button-save-journal">Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card><CardContent className="p-4">
          <Table>
            <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Tipe</TableHead><TableHead>Akun Debit Default</TableHead><TableHead>Akun Kredit Default</TableHead><TableHead>Status</TableHead><TableHead className="w-20 text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {(journals ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Tidak ada jurnal</TableCell></TableRow>
              ) : journals!.map((j) => (
                <TableRow key={j.id} data-testid={`row-journal-${j.id}`}>
                  <TableCell className="font-mono">{j.code}</TableCell>
                  <TableCell>{j.name}</TableCell>
                  <TableCell><Badge variant="outline">{TYPE_LABELS[j.type]}</Badge></TableCell>
                  <TableCell className="text-xs">{accLabel(j.defaultDebitAccountId)}</TableCell>
                  <TableCell className="text-xs">{accLabel(j.defaultCreditAccountId)}</TableCell>
                  <TableCell>{j.isActive ? <Badge>Aktif</Badge> : <Badge variant="secondary">Non-aktif</Badge>}</TableCell>
                  <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => startEdit(j)} data-testid={`button-edit-${j.id}`}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </AppShell>
  );
}
