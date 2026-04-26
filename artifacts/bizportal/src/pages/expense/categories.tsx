import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useListExpenseCategories,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  useDeleteExpenseCategory,
  useSeedExpenseCategories,
  useListAccounts,
  getListExpenseCategoriesQueryKey,
  type ExpenseCategory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Tags, RefreshCw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EMPTY_FORM = {
  name: "",
  code: "",
  expenseAccountId: null as number | null,
  payableAccountId: null as number | null,
  requiresAttachment: false,
  isActive: true,
};

export default function ExpenseCategoriesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: cats = [] } = useListExpenseCategories();
  const { data: accounts = [] } = useListAccounts();
  const createMut = useCreateExpenseCategory();
  const updateMut = useUpdateExpenseCategory();
  const deleteMut = useDeleteExpenseCategory();
  const seedMut = useSeedExpenseCategories();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const reset = () => { setEditing(null); setForm({ ...EMPTY_FORM }); };

  const startEdit = (c: ExpenseCategory) => {
    setEditing(c);
    setForm({
      name: c.name,
      code: c.code,
      expenseAccountId: c.expenseAccountId ?? null,
      payableAccountId: c.payableAccountId ?? null,
      requiresAttachment: c.requiresAttachment,
      isActive: c.isActive,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast({ title: "Nama dan kode wajib diisi", variant: "destructive" }); return;
    }
    try {
      const body = {
        name: form.name,
        code: form.code.toUpperCase(),
        expenseAccountId: form.expenseAccountId || undefined,
        payableAccountId: form.payableAccountId || undefined,
        requiresAttachment: form.requiresAttachment,
        isActive: form.isActive,
      };
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: body });
        toast({ title: "Kategori diperbarui" });
      } else {
        await createMut.mutateAsync({ data: body });
        toast({ title: "Kategori dibuat" });
      }
      qc.invalidateQueries({ queryKey: getListExpenseCategoriesQueryKey() });
      reset(); setOpen(false);
    } catch (e: any) {
      toast({ title: e?.message ?? "Gagal menyimpan", variant: "destructive" });
    }
  };

  const handleSeed = async () => {
    try {
      const res = await seedMut.mutateAsync();
      qc.invalidateQueries({ queryKey: getListExpenseCategoriesQueryKey() });
      toast({ title: `${res.seeded} kategori diseed` });
    } catch (e: any) {
      toast({ title: e?.message ?? "Gagal seed", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMut.mutateAsync({ id: deleteId });
      qc.invalidateQueries({ queryKey: getListExpenseCategoriesQueryKey() });
      toast({ title: "Kategori dihapus" });
    } catch (e: any) {
      toast({ title: e?.message ?? "Gagal hapus", variant: "destructive" });
    } finally { setDeleteId(null); }
  };

  const getAccountName = (id: number | null | undefined) =>
    id ? (accounts.find((a) => a.id === id)?.name ?? `#${id}`) : "—";

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Tags size={22} className="text-primary" />
            <div>
              <h1 className="text-xl font-bold">Kategori Biaya</h1>
              <p className="text-sm text-muted-foreground">Kelola kategori pengelompokan biaya operasional</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seedMut.isPending}>
              <RefreshCw size={14} className="mr-1" />
              Seed Default
            </Button>
            <Button size="sm" onClick={() => { reset(); setOpen(true); }}>
              <Plus size={14} className="mr-1" />
              Tambah Kategori
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Akun Biaya</TableHead>
                  <TableHead>Akun Hutang</TableHead>
                  <TableHead>Lampiran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      Belum ada kategori. Klik "Seed Default" untuk memulai.
                    </TableCell>
                  </TableRow>
                )}
                {cats.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{getAccountName(c.expenseAccountId)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{getAccountName(c.payableAccountId)}</TableCell>
                    <TableCell>
                      {c.requiresAttachment
                        ? <Badge variant="outline" className="text-amber-400 border-amber-500 text-xs">Wajib</Badge>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {c.isActive
                        ? <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-700 text-xs">Aktif</Badge>
                        : <Badge variant="outline" className="text-muted-foreground text-xs">Non-aktif</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}>
                          <Pencil size={13} />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); setOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Kategori" : "Tambah Kategori"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nama <span className="text-destructive">*</span></Label>
                <Input placeholder="Biaya Trucking" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Kode <span className="text-destructive">*</span></Label>
                <Input placeholder="TRUCKING" value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Akun Biaya (Debit)</Label>
              <Select
                value={form.expenseAccountId?.toString() ?? "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, expenseAccountId: v === "none" ? null : Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Pilih akun..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tidak dipilih —</SelectItem>
                  {accounts.filter((a) => a.type === "expense" || a.type === "asset").map((a) => (
                    <SelectItem key={a.id} value={a.id.toString()}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Akun Hutang (Kredit)</Label>
              <Select
                value={form.payableAccountId?.toString() ?? "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, payableAccountId: v === "none" ? null : Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Pilih akun..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tidak dipilih —</SelectItem>
                  {accounts.filter((a) => a.type === "liability").map((a) => (
                    <SelectItem key={a.id} value={a.id.toString()}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Wajib Lampiran</p>
                <p className="text-xs text-muted-foreground">Expense dengan kategori ini wajib melampirkan bukti</p>
              </div>
              <Switch checked={form.requiresAttachment}
                onCheckedChange={(v) => setForm((f) => ({ ...f, requiresAttachment: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Aktif</p>
              </div>
              <Switch checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); setOpen(false); }}>Batal</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>
              {editing ? "Simpan Perubahan" : "Tambah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Kategori?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
