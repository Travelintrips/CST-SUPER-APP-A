import { useState } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useListExpenses, useListExpenseCategories, getListExpensesQueryKey,
  useDeleteExpense, useListSalesDocuments, useListFreightShipments,
  type Expense,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Receipt, Search, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Diajukan",
  approved: "Disetujui",
  posted: "Diposting",
  paid: "Lunas",
  rejected: "Ditolak",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-800 text-slate-300 border-slate-600",
  submitted: "bg-sky-900/40 text-sky-300 border-sky-600",
  approved: "bg-indigo-900/40 text-indigo-300 border-indigo-600",
  posted: "bg-emerald-900/40 text-emerald-300 border-emerald-600",
  paid: "bg-green-900/50 text-green-300 border-green-600",
  rejected: "bg-red-900/40 text-red-300 border-red-600",
};

const TYPE_LABELS: Record<string, string> = {
  vendor_bill: "Tagihan Vendor",
  reimbursement: "Reimburse",
  internal: "Internal",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={`text-xs border ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export default function ExpenseListPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [salesDocFilter, setSalesDocFilter] = useState("all");
  const [shipmentFilter, setShipmentFilter] = useState("all");

  const { data: expenses = [], isLoading } = useListExpenses({
    status: statusFilter !== "all" ? statusFilter : undefined,
    expenseType: typeFilter !== "all" ? typeFilter : undefined,
    categoryId: catFilter !== "all" ? Number(catFilter) : undefined,
    salesDocId: salesDocFilter !== "all" ? Number(salesDocFilter) : undefined,
    shipmentId: shipmentFilter !== "all" ? Number(shipmentFilter) : undefined,
    search: search || undefined,
  });
  const { data: cats = [] } = useListExpenseCategories();
  const { data: salesDocs = [] } = useListSalesDocuments({ kind: "order" });
  const { data: shipments = [] } = useListFreightShipments();
  const deleteMut = useDeleteExpense();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMut.mutateAsync({ id: deleteId });
      qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
      toast({ title: "Expense dihapus" });
    } catch (e: any) {
      toast({ title: e?.message ?? "Gagal hapus", variant: "destructive" });
    } finally { setDeleteId(null); }
  };

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Receipt size={22} className="text-primary" />
            <div>
              <h1 className="text-xl font-bold">Biaya Operasional</h1>
              <p className="text-sm text-muted-foreground">Kelola seluruh expense & biaya operasional bisnis</p>
            </div>
          </div>
          <Link href="/expense/new">
            <Button size="sm">
              <Plus size={14} className="mr-1" />
              Buat Expense
            </Button>
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cari nomor, vendor, deskripsi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Semua tipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tipe</SelectItem>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Semua kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={salesDocFilter} onValueChange={setSalesDocFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Semua Sales Order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Sales Order</SelectItem>
              {salesDocs.map((sd) => (
                <SelectItem key={sd.id} value={sd.id.toString()}>
                  {sd.docNumber} — {sd.customerName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={shipmentFilter} onValueChange={setShipmentFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Semua Shipment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Shipment</SelectItem>
              {shipments.map((sh) => (
                <SelectItem key={sh.id} value={sh.id.toString()}>
                  {sh.shipmentNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Expense</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Vendor/Karyawan</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Memuat data...</TableCell>
                  </TableRow>
                )}
                {!isLoading && expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      Belum ada expense. Klik "Buat Expense" untuk memulai.
                    </TableCell>
                  </TableRow>
                )}
                {expenses.map((exp) => {
                  const cat = cats.find((c) => c.id === exp.categoryId);
                  return (
                    <TableRow key={exp.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Link href={`/expense/${exp.id}`}>
                          <span className="font-mono text-xs text-primary hover:underline">{exp.expenseNumber}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{exp.date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{TYPE_LABELS[exp.expenseType] ?? exp.expenseType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{exp.vendorEmployee ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{exp.description ?? "—"}</TableCell>
                      <TableCell>
                        {cat ? (
                          <Badge variant="secondary" className="text-xs">{cat.name}</Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium">{idr(exp.total)}</TableCell>
                      <TableCell><StatusBadge status={exp.status} /></TableCell>
                      <TableCell>
                        {(exp.status === "draft" || exp.status === "rejected") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(exp.id)}>
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Expense?</AlertDialogTitle>
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
