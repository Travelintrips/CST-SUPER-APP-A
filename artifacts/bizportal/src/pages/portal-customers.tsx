import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, MessageCircle, Mail, KeyRound, Phone, Building2, RefreshCw } from "lucide-react";

type PortalCustomer = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  role: string;
  source: "wa" | "oauth" | "email";
  createdAt: string;
  profileStatus: string;
  profileAccountType: string | null;
  profileFullName: string | null;
  profileAddress: string | null;
};

type Stats = {
  total: number; wa: number; customer: number; vendor: number;
  profileIncomplete: number; profilePending: number; profileActive: number;
};

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function PortalCustomersPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const params = new URLSearchParams();
  if (roleFilter !== "all") params.set("role", roleFilter);
  if (search.trim()) params.set("q", search.trim());

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["portal-customers", params.toString()],
    queryFn: () => fetchJSON<{ items: PortalCustomer[]; total: number }>(`/api/portal/admin/customers?${params.toString()}`),
  });

  const { data: stats } = useQuery({
    queryKey: ["portal-customers-stats"],
    queryFn: () => fetchJSON<Stats>("/api/portal/admin/customers/stats"),
  });

  const items = (data?.items ?? []).filter((it) => sourceFilter === "all" || it.source === sourceFilter);

  const sourceBadge = (source: PortalCustomer["source"]) => {
    if (source === "wa") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><MessageCircle className="w-3 h-3 mr-1" />WhatsApp</Badge>;
    if (source === "oauth") return <Badge variant="secondary"><KeyRound className="w-3 h-3 mr-1" />OAuth</Badge>;
    return <Badge variant="outline"><Mail className="w-3 h-3 mr-1" />Email</Badge>;
  };

  const profileBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      not_started: { cls: "bg-gray-100 text-gray-700", label: "Belum Onboarding" },
      incomplete:  { cls: "bg-amber-100 text-amber-700", label: "Belum Lengkap" },
      pending:     { cls: "bg-blue-100 text-blue-700", label: "Menunggu Approval" },
      active:      { cls: "bg-emerald-100 text-emerald-700", label: "Aktif" },
      rejected:    { cls: "bg-rose-100 text-rose-700", label: "Ditolak" },
    };
    const m = map[status] ?? map.not_started;
    return <Badge className={`${m.cls} hover:${m.cls}`}>{m.label}</Badge>;
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" />Pelanggan Portal</h1>
            <p className="text-sm text-muted-foreground">Daftar semua user yang mendaftar di Customer Portal (web/WA/OAuth).</p>
          </div>
          <button onClick={() => refetch()} className="inline-flex items-center gap-2 text-sm px-3 py-2 border rounded-md hover:bg-accent">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "Total", value: stats.total, cls: "text-foreground" },
              { label: "Via WA", value: stats.wa, cls: "text-emerald-600" },
              { label: "Customer", value: stats.customer, cls: "text-blue-600" },
              { label: "Vendor", value: stats.vendor, cls: "text-purple-600" },
              { label: "Belum Onboarding", value: stats.profileIncomplete, cls: "text-gray-600" },
              { label: "Pending Approval", value: stats.profilePending, cls: "text-amber-600" },
              { label: "Aktif", value: stats.profileActive, cls: "text-emerald-600" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                  <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Cari nama / email / phone / perusahaan…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Role</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Sumber" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Sumber</SelectItem>
                  <SelectItem value="wa">WhatsApp</SelectItem>
                  <SelectItem value="email">Email/Password</SelectItem>
                  <SelectItem value="oauth">OAuth (Google)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kontak</TableHead>
                    <TableHead>Perusahaan</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Sumber</TableHead>
                    <TableHead>Status Onboarding</TableHead>
                    <TableHead>Terdaftar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Memuat…</TableCell></TableRow>
                  )}
                  {!isLoading && items.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada data.</TableCell></TableRow>
                  )}
                  {items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.profileFullName || c.name}</div>
                        {c.profileFullName && c.profileFullName !== c.name && (
                          <div className="text-xs text-muted-foreground">alias: {c.name}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-sm">
                          {c.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</div>}
                          {c.email && !c.email.endsWith("@wa.local") && (
                            <div className="flex items-center gap-1 text-muted-foreground"><Mail className="w-3 h-3" />{c.email}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.company ? (
                          <div className="flex items-center gap-1 text-sm"><Building2 className="w-3 h-3" />{c.company}</div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{c.role}</Badge></TableCell>
                      <TableCell>{sourceBadge(c.source)}</TableCell>
                      <TableCell>{profileBadge(c.profileStatus)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
