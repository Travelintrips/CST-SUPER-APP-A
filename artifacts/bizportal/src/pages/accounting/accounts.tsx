import { useState, useMemo } from "react";
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
  useListAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount,
  getListAccountsQueryKey, type Account,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Landmark, Search } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  asset: "Aset",
  liability: "Liabilitas",
  equity: "Ekuitas",
  revenue: "Pendapatan",
  expense: "Beban",
};

export default function AccountsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: accounts } = useListAccounts();
  const createMut = useCreateAccount();
  const updateMut = useUpdateAccount();
  const deleteMut = useDeleteAccount();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ code: "", name: "", type: "asset" as Account["type"], isActive: true });

  const reset = () => { setEditing(null); setForm({ code: "", name: "", type: "asset", isActive: true }); };

  const startEdit = (a: Account) => {
    setEditing(a);
    setForm({ code: a.code, name: a.name, type: a.type, isActive: a.isActive });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Kode & nama wajib diisi", variant: "destructive" }); return;
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: form });
        toast({ title: "Akun diperbarui" });
      } else {
        await createMut.mutateAsync({ data: form });
        toast({ title: "Akun dibuat" });
      }
      qc.invalidateQueries({ queryKey: getListAccountsQueryKey() });
      reset(); setOpen(false);
    } catch (e: any) {
      toast({ title: "Gagal", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const remove = async (a: Account) => {
    if (!confirm(`Hapus akun ${a.code} - ${a.name}?`)) return;
    try {
      await deleteMut.mutateAsync({ id: a.id });
      toast({ title: "Akun dihapus" });
      qc.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    } catch (e: any) {
      toast({ title: "Gagal menghapus", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return (accounts ?? []).filter((a) =>
      !s || a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)
    );
  }, [accounts, search]);

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Landmark className="h-6 w-6" /> Bagan Akun
            </h1>
            <p className="text-sm text-muted-foreground">Chart of Accounts (CoA) — daftar akun buku besar</p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-account"><Plus className="h-4 w-4 mr-2" />Tambah Akun</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit Akun" : "Akun Baru"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Kode</Label><Input data-testid="input-account-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="1-1010" /></div>
                <div><Label>Nama</Label><Input data-testid="input-account-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kas" /></div>
                <div>
                  <Label>Tipe</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Account["type"] })}>
                    <SelectTrigger data-testid="select-account-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  <Label htmlFor="active">Aktif</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Batal</Button>
                <Button onClick={submit} data-testid="button-save-account">Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="relative mb-3">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Cari kode atau nama..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-account" />
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Tipe</TableHead><TableHead>Status</TableHead><TableHead className="w-32 text-right">Aksi</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Tidak ada akun</TableCell></TableRow>
                ) : filtered.map((a) => (
                  <TableRow key={a.id} data-testid={`row-account-${a.id}`}>
                    <TableCell className="font-mono">{a.code}</TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABELS[a.type]}</Badge></TableCell>
                    <TableCell>{a.isActive ? <Badge>Aktif</Badge> : <Badge variant="secondary">Non-aktif</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(a)} data-testid={`button-edit-${a.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(a)} data-testid={`button-delete-${a.id}`}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
