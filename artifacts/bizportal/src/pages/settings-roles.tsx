import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Plus, Pencil, Trash2, Users, UserPlus, X, ChevronRight } from "lucide-react";

const MODULES = [
  { key: "dashboard",       label: "Dashboard",            group: "Umum" },
  { key: "sales",           label: "Penjualan",            group: "Transaksi" },
  { key: "purchase",        label: "Pembelian",            group: "Transaksi" },
  { key: "accounting",      label: "Akuntansi",            group: "Transaksi" },
  { key: "reports",         label: "Laporan",              group: "Transaksi" },
  { key: "trading",         label: "Trading",              group: "Bisnis" },
  { key: "logistics",       label: "Logistik",             group: "Bisnis" },
  { key: "pos",             label: "POS Kasir",            group: "POS" },
  { key: "pos-kasir",       label: "Kasir Thai Tea",       group: "POS" },
  { key: "pos-inventory",   label: "Inventori POS",        group: "POS" },
  { key: "warehouse",       label: "Gudang",               group: "Operasional" },
  { key: "expense",         label: "Pengeluaran",          group: "Operasional" },
  { key: "correspondences", label: "Korespondensi",        group: "Komunikasi" },
  { key: "email-inbox",     label: "Email Inbox",          group: "Komunikasi" },
  { key: "holding",         label: "Holding",              group: "Manajemen" },
  { key: "users",           label: "Manajemen Pengguna",   group: "Admin" },
  { key: "media",           label: "Media Manager",        group: "Admin" },
  { key: "settings",        label: "Pengaturan",           group: "Admin" },
  { key: "roles",           label: "Manajemen Role",       group: "Admin" },
];

const GROUPS = Array.from(new Set(MODULES.map((m) => m.group)));

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin", ecommerce: "Ecommerce", trading: "Trading",
  logistics: "Logistik", pos: "POS",
};

interface CustomRole {
  id: number;
  name: string;
  description: string | null;
  color: string;
  permissions: string[];
  user_count: number;
}

interface RoleUser {
  id: string;
  email: string;
  name: string;
  role: string;
  division: string | null;
}

interface AllUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const emptyForm = { name: "", description: "", color: "#6366f1", permissions: [] as string[] };

export default function SettingsRolesPage() {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<CustomRole | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CustomRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [selectedRole, setSelectedRole] = useState<CustomRole | null>(null);
  const [roleUsers, setRoleUsers] = useState<RoleUser[]>([]);
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [assignUserId, setAssignUserId] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);

  const loadRoles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/custom-roles");
      setRoles(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const loadAllUsers = useCallback(async () => {
    try {
      const data = await apiFetch("/users");
      setAllUsers(data);
    } catch {}
  }, []);

  const openRoleUsers = useCallback(async (role: CustomRole) => {
    setSelectedRole(role);
    setUsersLoading(true);
    try {
      const data = await apiFetch(`/custom-roles/${role.id}`);
      setRoleUsers(data.users ?? []);
    } catch {}
    setUsersLoading(false);
    await loadAllUsers();
  }, [loadAllUsers]);

  const openAdd = () => {
    setEditRole(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (role: CustomRole) => {
    setEditRole(role);
    setForm({
      name: role.name,
      description: role.description ?? "",
      color: role.color,
      permissions: [...role.permissions],
    });
    setDialogOpen(true);
  };

  const togglePerm = (key: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editRole) {
        await apiFetch(`/custom-roles/${editRole.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/custom-roles", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }
      setDialogOpen(false);
      await loadRoles();
    } catch (e: any) {
      alert("Gagal menyimpan: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/custom-roles/${deleteTarget.id}`, { method: "DELETE" });
      if (selectedRole?.id === deleteTarget.id) setSelectedRole(null);
      await loadRoles();
      setDeleteTarget(null);
    } catch (e: any) {
      alert("Gagal menghapus: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedRole || !assignUserId) return;
    try {
      await apiFetch(`/custom-roles/${selectedRole.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ userId: assignUserId }),
      });
      setAssignUserId("");
      await openRoleUsers(selectedRole);
      await loadRoles();
    } catch (e: any) {
      alert("Gagal: " + e.message);
    }
  };

  const handleUnassign = async (userId: string) => {
    if (!selectedRole) return;
    try {
      await apiFetch(`/custom-roles/${selectedRole.id}/assign/${userId}`, { method: "DELETE" });
      await openRoleUsers(selectedRole);
      await loadRoles();
    } catch (e: any) {
      alert("Gagal: " + e.message);
    }
  };

  const unassignedUsers = allUsers.filter((u) => !roleUsers.find((ru) => ru.id === u.id));

  return (
    <AppShell>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Manajemen Role</h1>
              <p className="text-sm text-muted-foreground">Buat role kustom dan atur akses modul per pengguna</p>
            </div>
          </div>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Tambah Role
          </Button>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-destructive text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Role List */}
          <div className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Memuat...</div>
            ) : roles.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Belum ada role. Klik "Tambah Role" untuk mulai.</p>
              </div>
            ) : (
              roles.map((role) => (
                <div
                  key={role.id}
                  className={`rounded-xl border bg-card p-4 cursor-pointer transition-all hover:shadow-md ${selectedRole?.id === role.id ? "ring-2 ring-primary" : ""}`}
                  onClick={() => openRoleUsers(role)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="h-9 w-9 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: role.color }}
                      >
                        {role.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{role.name}</div>
                        {role.description && (
                          <div className="text-xs text-muted-foreground truncate">{role.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(role); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(role); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.slice(0, 4).map((p) => (
                        <Badge key={p} variant="secondary" className="text-xs py-0">{MODULES.find((m) => m.key === p)?.label ?? p}</Badge>
                      ))}
                      {role.permissions.length > 4 && (
                        <Badge variant="outline" className="text-xs py-0">+{role.permissions.length - 4} lagi</Badge>
                      )}
                      {role.permissions.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">Tidak ada akses</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                      <Users className="h-3.5 w-3.5" />
                      {role.user_count} pengguna
                      <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Users Panel */}
          {selectedRole ? (
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-md flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: selectedRole.color }}>
                  {selectedRole.name.slice(0, 2).toUpperCase()}
                </div>
                <h2 className="font-semibold">Pengguna — {selectedRole.name}</h2>
              </div>

              {/* Assign user */}
              <div className="flex gap-2">
                <Select value={assignUserId} onValueChange={setAssignUserId}>
                  <SelectTrigger className="flex-1 h-8 text-sm">
                    <SelectValue placeholder="Pilih pengguna untuk ditambahkan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unassignedUsers.length === 0
                      ? <SelectItem value="_" disabled>Semua pengguna sudah di role ini</SelectItem>
                      : unassignedUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name || u.email} <span className="text-muted-foreground text-xs">({ROLE_LABELS[u.role] ?? u.role})</span>
                          </SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleAssign} disabled={!assignUserId} className="gap-1 h-8">
                  <UserPlus className="h-3.5 w-3.5" /> Tambah
                </Button>
              </div>

              {/* User list */}
              {usersLoading ? (
                <div className="text-sm text-muted-foreground text-center py-4">Memuat...</div>
              ) : roleUsers.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Belum ada pengguna di role ini</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {roleUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-2 rounded-lg border bg-background">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.name || u.email}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <Badge variant="outline" className="text-xs">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleUnassign(u.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-10 flex flex-col items-center justify-center text-center text-muted-foreground">
              <Users className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Pilih role di kiri untuk mengelola pengguna</p>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRole ? "Edit Role" : "Tambah Role Baru"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nama Role <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="contoh: Staf Gudang"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Warna</Label>
                <div className="flex gap-2 flex-wrap pt-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`h-7 w-7 rounded-full border-2 transition-transform ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea
                placeholder="Deskripsi singkat tentang role ini..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Akses Modul</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setForm((f) => ({ ...f, permissions: MODULES.map((m) => m.key) }))}>Pilih Semua</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setForm((f) => ({ ...f, permissions: [] }))}>Kosongkan</Button>
                </div>
              </div>
              <div className="rounded-lg border p-4 space-y-4">
                {GROUPS.map((group) => (
                  <div key={group}>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {MODULES.filter((m) => m.group === group).map((m) => (
                        <div key={m.key} className="flex items-center gap-2">
                          <Checkbox
                            id={`perm-${m.key}`}
                            checked={form.permissions.includes(m.key)}
                            onCheckedChange={() => togglePerm(m.key)}
                          />
                          <label htmlFor={`perm-${m.key}`} className="text-sm cursor-pointer select-none">{m.label}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
              {saving ? "Menyimpan..." : editRole ? "Simpan Perubahan" : "Buat Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Role "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua pengguna yang ditetapkan ke role ini akan dilepas. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Menghapus..." : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
