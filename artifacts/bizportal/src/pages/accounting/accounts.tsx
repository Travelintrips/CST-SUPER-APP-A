import { useState, useMemo, useEffect } from "react";
import { useCodeCheck } from "@/hooks/useCodeCheck";
import { CodeCheckIndicator } from "@/components/ui/code-check-indicator";
import { AppShell } from "@/components/layout/AppShell";
import { useLanguage } from "@/contexts/LanguageContext";
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
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateAccount, useUpdateAccount, useDeleteAccount,
  type Account,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { Pencil, Plus, Trash2, Landmark, Search, ChevronRight, ChevronDown, ChevronsUpDown, Check, GitMerge, Clock } from "lucide-react";
import { Link } from "wouter";

const TYPE_LABELS: Record<string, string> = {
  asset: "Aset",
  liability: "Liabilitas",
  equity: "Ekuitas",
  revenue: "Pendapatan",
  expense: "Beban",
};

const TYPE_COLORS: Record<string, string> = {
  asset: "bg-blue-50 text-blue-700 border-blue-200",
  liability: "bg-orange-50 text-orange-700 border-orange-200",
  equity: "bg-purple-50 text-purple-700 border-purple-200",
  revenue: "bg-green-50 text-green-700 border-green-200",
  expense: "bg-red-50 text-red-700 border-red-200",
};

interface TreeNode extends Account {
  children: TreeNode[];
  depth: number;
}

function buildTree(accounts: Account[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];

  for (const a of accounts) {
    byId.set(a.id, { ...a, children: [], depth: 0 });
  }

  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function setDepth(node: TreeNode, depth: number) {
    node.depth = depth;
    node.children.sort((a, b) => a.code.localeCompare(b.code));
    node.children.forEach((c) => setDepth(c, depth + 1));
  }
  roots.sort((a, b) => a.code.localeCompare(b.code));
  roots.forEach((r) => setDepth(r, 0));

  return roots;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(ns: TreeNode[]) {
    for (const n of ns) {
      result.push(n);
      if (n.children.length) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

interface RekonInfo {
  config: { lastRunDate?: string; enabled?: boolean } | null;
  lastManualRekonAt: string | null;
}

function RekonStatusCard() {
  const [info, setInfo] = useState<RekonInfo | null>(null);
  useEffect(() => {
    fetch("/api/accounting/rekon-schedule", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setInfo(j as RekonInfo))
      .catch(() => {});
  }, []);

  const manualDate = info?.lastManualRekonAt
    ? new Date(info.lastManualRekonAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const autoDate = info?.config?.lastRunDate ?? null;
  const autoEnabled = info?.config?.enabled ?? false;

  if (!info) return null;

  return (
    <Card className="border-blue-100 bg-blue-50/40">
      <CardContent className="p-3 flex flex-wrap items-center gap-x-6 gap-y-1">
        <div className="flex items-center gap-1.5 text-sm text-blue-800">
          <GitMerge className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="font-medium">Rekonsiliasi Bank</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <span>Manual terakhir:</span>
          <span className="font-semibold text-slate-800">{manualDate ?? "—"}</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <span>Otomatis terakhir:</span>
          <span className="font-semibold text-slate-800">{autoDate ?? "—"}</span>
          {autoEnabled && <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200">Aktif</span>}
          {!autoEnabled && <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">Nonaktif</span>}
        </div>
        <Link href="/accounting/reconciliation" className="ml-auto text-xs text-blue-600 hover:underline font-medium">
          Buka Rekonsiliasi →
        </Link>
      </CardContent>
    </Card>
  );
}

export default function AccountsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { activeCompanyId } = useCompany();

  const companyId = activeCompanyId ?? 1;

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounting/accounts", companyId],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/accounting/accounts?company=${companyId}`, {
        credentials: "include",
        signal,
      });
      if (!res.ok) throw new Error("Gagal memuat akun");
      return res.json();
    },
  });

  const createMut = useCreateAccount();
  const updateMut = useUpdateAccount();
  const deleteMut = useDeleteAccount();

  const [open, setOpen] = useState(false);
  const [parentPopoverOpen, setParentPopoverOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({
    code: "", name: "", type: "asset" as Account["type"],
    isActive: true, parentId: null as number | null,
  });

  const reset = () => {
    setEditing(null);
    setForm({ code: "", name: "", type: "asset", isActive: true, parentId: null });
  };

  const startEdit = (a: Account) => {
    setEditing(a);
    setForm({ code: a.code, name: a.name, type: a.type, isActive: a.isActive, parentId: a.parentId ?? null });
    setOpen(true);
  };

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const codeCheckUrl = open && form.code.trim()
    ? `/api/accounting/accounts/check-code?code=${encodeURIComponent(form.code)}&companyId=${companyId}${editing ? `&excludeId=${editing.id}` : ""}`
    : null;
  const { checking: codeChecking, taken: codeTaken } = useCodeCheck(codeCheckUrl, form.code);

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: t.common.error, variant: "destructive" }); return;
    }
    try {
      const payload = { ...form, companyId, parentId: form.parentId ?? undefined };
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
        toast({ title: t.common.success });
      } else {
        await createMut.mutateAsync({ data: payload });
        toast({ title: t.common.success });
      }
      qc.invalidateQueries({ queryKey: ["/api/accounting/accounts", companyId] });
      reset(); setOpen(false);
    } catch (e: any) {
      toast({ title: t.common.error, description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const remove = async (a: Account) => {
    if (!confirm(t.common.confirmDeleteDesc)) return;
    try {
      await deleteMut.mutateAsync({ id: a.id });
      toast({ title: t.common.success });
      qc.invalidateQueries({ queryKey: ["/api/accounting/accounts", companyId] });
    } catch (e: any) {
      toast({ title: t.common.error, description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const { treeFlat, searchFlat } = useMemo(() => {
    const tree = buildTree(accounts);
    const flat = flattenTree(tree);
    const s = search.toLowerCase().trim();
    if (!s) return { treeFlat: flat, searchFlat: null };
    const searchFlat = accounts
      .filter((a) => a.code.toLowerCase().includes(s) || a.name.toLowerCase().includes(s))
      .map((a) => ({ ...a, children: [], depth: 0 } as TreeNode))
      .sort((a, b) => a.code.localeCompare(b.code));
    return { treeFlat: flat, searchFlat };
  }, [accounts, search]);

  const displayed = search.trim() ? searchFlat! : treeFlat.filter((node) => {
    if (!node.parentId) return true;
    const parentCollapsed = (acc: Account): boolean => {
      if (!acc.parentId) return collapsed.has(acc.id);
      const parent = accounts.find((a) => a.id === acc.parentId);
      return collapsed.has(acc.id) || (parent ? parentCollapsed(parent) : false);
    };
    const parent = accounts.find((a) => a.id === node.parentId);
    return parent ? !parentCollapsed(parent) : true;
  });

  const isParent = (node: TreeNode) => node.children.length > 0;

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Landmark className="h-6 w-6" /> Bagan Akun
            </h1>
            <p className="text-sm text-muted-foreground">Chart of Accounts (CoA) — hierarki akun buku besar</p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-account"><Plus className="h-4 w-4 mr-2" />Tambah Akun</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? "Edit Akun" : "Akun Baru"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Kode</Label>
                    <Input data-testid="input-account-code" value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      placeholder="5-2010"
                      className={codeTaken === true ? "border-destructive focus-visible:ring-destructive" : ""} />
                    <CodeCheckIndicator checking={codeChecking} taken={codeTaken} />
                  </div>
                  <div>
                    <Label>Nama</Label>
                    <Input data-testid="input-account-name" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Beban Gaji" />
                  </div>
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
                  <div>
                    <Label>Akun Induk (opsional)</Label>
                    <Popover open={parentPopoverOpen} onOpenChange={setParentPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                        >
                          {form.parentId
                            ? (() => {
                                const a = accounts.find((x) => x.id === form.parentId);
                                return a ? `${a.code} — ${a.name}` : "— Tidak ada (akun akar) —";
                              })()
                            : "— Tidak ada (akun akar) —"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Cari kode atau nama akun..." />
                          <CommandList>
                            <CommandEmpty>Akun tidak ditemukan</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="none"
                                onSelect={() => { setForm({ ...form, parentId: null }); setParentPopoverOpen(false); }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${!form.parentId ? "opacity-100" : "opacity-0"}`} />
                                — Tidak ada (akun akar) —
                              </CommandItem>
                              {accounts
                                .filter((a) => a.id !== editing?.id)
                                .sort((a, b) => a.code.localeCompare(b.code))
                                .map((a) => (
                                  <CommandItem
                                    key={a.id}
                                    value={`${a.code} ${a.name}`}
                                    onSelect={() => { setForm({ ...form, parentId: a.id }); setParentPopoverOpen(false); }}
                                  >
                                    <Check className={`mr-2 h-4 w-4 ${form.parentId === a.id ? "opacity-100" : "opacity-0"}`} />
                                    {a.code} — {a.name}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="active" checked={form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
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
        </div>

        <RekonStatusCard />

        <Card>
          <CardContent className="p-4">
            <div className="relative mb-3">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Cari kode atau nama akun..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-account" />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Kode</TableHead>
                  <TableHead>Nama Akun</TableHead>
                  <TableHead className="w-32">Tipe</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-24 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {search ? "Tidak ada hasil pencarian" : "Tidak ada akun"}
                    </TableCell>
                  </TableRow>
                ) : displayed.map((a) => {
                  const isGroup = isParent(a);
                  const isCollapsed = collapsed.has(a.id);
                  const indent = a.depth * 20;

                  return (
                    <TableRow
                      key={a.id}
                      data-testid={`row-account-${a.id}`}
                      className={isGroup && a.depth === 0 ? "bg-muted/40 font-semibold" : isGroup ? "bg-muted/20 font-medium" : ""}
                    >
                      <TableCell className="font-mono text-sm">
                        <div style={{ paddingLeft: indent }} className="flex items-center gap-1">
                          {isGroup && !search.trim() ? (
                            <button
                              onClick={() => toggleCollapse(a.id)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {isCollapsed
                                ? <ChevronRight size={14} />
                                : <ChevronDown size={14} />
                              }
                            </button>
                          ) : (
                            <span className="w-[14px] inline-block" />
                          )}
                          <span>{a.code}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div style={{ paddingLeft: indent }} className="flex items-center gap-1.5">
                          {isGroup && (
                            <span className="text-xs text-muted-foreground">[Grup]</span>
                          )}
                          {a.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${TYPE_COLORS[a.type]}`}>
                          {TYPE_LABELS[a.type]}
                        </span>
                      </TableCell>
                      <TableCell>
                        {a.isActive
                          ? <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">Aktif</Badge>
                          : <Badge variant="secondary" className="text-xs">Non-aktif</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => startEdit(a)} data-testid={`button-edit-${a.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(a)} data-testid={`button-delete-${a.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-2 px-1">
              {accounts.length} akun total — klik ikon segitiga untuk buka/tutup grup
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
