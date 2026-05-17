import { AppShell } from "@/components/layout/AppShell";
import {
  useUpdateUser,
  getListUsersQueryKey,
  getGetCurrentUserQueryKey,
  UpdateUserBodyRole,
} from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Users, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

const ROLES = ["admin", "ecommerce", "trading", "logistics", "pos"] as const;
type Role = typeof ROLES[number];

const roleColor = (role: string) => {
  switch (role) {
    case "admin":      return "bg-violet-500/10 text-violet-500 border-violet-500/20";
    case "ecommerce":  return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "trading":    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "logistics":  return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    case "pos":        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    default:           return "bg-muted text-muted-foreground";
  }
};

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  division: string | null;
  customRoleId: number | null;
  customRoleName: string | null;
  customRoleColor: string | null;
}

interface CustomRole {
  id: number;
  name: string;
  color: string;
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

export default function UsersPage() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading, error } = useQuery<UserRow[]>({
    queryKey: getListUsersQueryKey(),
    queryFn: () => apiFetch("/users"),
    retry: false,
  });

  const { data: customRoles = [] } = useQuery<CustomRole[]>({
    queryKey: ["custom-roles"],
    queryFn: () => apiFetch("/custom-roles"),
    retry: false,
  });

  const updateUser = useUpdateUser();

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editRole, setEditRole]         = useState<Role>("ecommerce");
  const [editDivision, setEditDivision] = useState<string>("");
  const [editName, setEditName]         = useState<string>("");
  const [editCustomRoleId, setEditCustomRoleId] = useState<string>("");
  const [customRoleSaving, setCustomRoleSaving] = useState(false);

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setEditRole(u.role as Role);
    setEditDivision(u.division ?? "");
    setEditName(u.name ?? "");
    setEditCustomRoleId(u.customRoleId != null ? String(u.customRoleId) : "none");
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;

    setCustomRoleSaving(true);
    try {
      // 1. Update base role / name / division
      await new Promise<void>((resolve, reject) => {
        updateUser.mutate({
          id: editing.id,
          data: {
            role: editRole as UpdateUserBodyRole,
            division: editDivision.trim() || null,
            name: editName.trim() || editing.name,
          }
        }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
      });

      // 2. Update custom role if changed
      const prevCrId = editing.customRoleId != null ? String(editing.customRoleId) : "none";
      if (editCustomRoleId !== prevCrId) {
        if (prevCrId !== "none") {
          // unassign from old role
          await apiFetch(`/custom-roles/${prevCrId}/assign/${editing.id}`, { method: "DELETE" });
        }
        if (editCustomRoleId !== "none") {
          // assign to new role
          await apiFetch(`/custom-roles/${editCustomRoleId}/assign`, {
            method: "POST",
            body: JSON.stringify({ userId: editing.id }),
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      setEditing(null);
      toast({ title: t.users.title + " — " + t.common.saved });
    } catch {
      toast({ title: t.common.error, variant: "destructive" });
    } finally {
      setCustomRoleSaving(false);
    }
  };

  const isForbidden = (error as any)?.status === 403 || (error as any)?.message?.includes("403");

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.users.title}</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">{t.users.subtitle}</p>
        </div>

        {isForbidden ? (
          <Card><CardContent className="p-8 text-center space-y-2">
            <ShieldAlert className="h-10 w-10 mx-auto text-destructive" />
            <p className="font-medium">{t.users.accessDenied}</p>
            <p className="text-sm text-muted-foreground">{t.users.adminOnly}</p>
          </CardContent></Card>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.common.name}</TableHead>
                      <TableHead>{t.common.email}</TableHead>
                      <TableHead>{t.users.role}</TableHead>
                      <TableHead>Custom Role</TableHead>
                      <TableHead>{t.common.division}</TableHead>
                      <TableHead className="text-right w-[100px]">{t.common.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-[140px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[180px]" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-[60px] ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : users?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Users className="h-8 w-8 mb-2 opacity-50" />
                            <p>{t.users.noUsers}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      users?.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`capitalize ${roleColor(u.role)}`}>{u.role}</Badge>
                          </TableCell>
                          <TableCell>
                            {u.customRoleName ? (
                              <Badge
                                variant="outline"
                                className="gap-1 border"
                                style={{ borderColor: u.customRoleColor ?? "#6366f1", color: u.customRoleColor ?? "#6366f1" }}
                              >
                                <ShieldCheck className="h-3 w-3" />
                                {u.customRoleName}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{u.division || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(u)} aria-label={t.common.edit}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-4 space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                  </CardContent></Card>
                ))
              ) : users?.length === 0 ? (
                <Card><CardContent className="p-8 text-center">
                  <Users className="h-8 w-8 mb-2 opacity-50 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t.users.noUsers}</p>
                </CardContent></Card>
              ) : (
                users?.map((u) => (
                  <Card key={u.id}><CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{u.email}</p>
                      </div>
                      <Badge variant="outline" className={`capitalize shrink-0 ${roleColor(u.role)}`}>{u.role}</Badge>
                    </div>
                    {u.customRoleName && (
                      <Badge
                        variant="outline"
                        className="gap-1 border text-xs"
                        style={{ borderColor: u.customRoleColor ?? "#6366f1", color: u.customRoleColor ?? "#6366f1" }}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {u.customRoleName}
                      </Badge>
                    )}
                    {u.division && (
                      <p className="text-xs text-muted-foreground">{t.common.division}: <span className="text-foreground">{u.division}</span></p>
                    )}
                    <Button size="sm" variant="outline" className="w-full" onClick={() => openEdit(u)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> {t.common.edit}
                    </Button>
                  </CardContent></Card>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && (
            <form onSubmit={handleSave}>
              <DialogHeader>
                <DialogTitle>{t.users.editTitle}</DialogTitle>
                <DialogDescription>{t.users.editDesc}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>{t.common.email}</Label>
                  <Input value={editing.email} disabled />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="user-name">{t.common.name}</Label>
                  <Input id="user-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="user-role">{t.users.role} (sistem)</Label>
                  <Select value={editRole} onValueChange={(v) => setEditRole(v as Role)}>
                    <SelectTrigger id="user-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="user-custom-role">Custom Role</Label>
                  <Select value={editCustomRoleId} onValueChange={setEditCustomRoleId}>
                    <SelectTrigger id="user-custom-role">
                      <SelectValue placeholder="Tidak ada custom role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <X className="h-3.5 w-3.5" /> Tidak ada custom role
                        </span>
                      </SelectItem>
                      {customRoles.map((cr) => (
                        <SelectItem key={cr.id} value={String(cr.id)}>
                          <span className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full inline-block" style={{ backgroundColor: cr.color }} />
                            {cr.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {customRoles.length === 0 && (
                    <p className="text-xs text-muted-foreground">Belum ada custom role. Buat dulu di menu Manajemen Role.</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="user-division">{t.users.divisionOptional}</Label>
                  <Input id="user-division" value={editDivision} onChange={(e) => setEditDivision(e.target.value)} placeholder="cth. Jakarta Pusat" />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t.common.cancel}</Button>
                <Button type="submit" disabled={updateUser.isPending || customRoleSaving}>
                  {updateUser.isPending || customRoleSaving ? t.common.saving : t.common.save}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
