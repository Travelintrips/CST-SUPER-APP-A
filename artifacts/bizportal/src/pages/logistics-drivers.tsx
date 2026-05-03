import { AppShell } from "@/components/layout/AppShell";
import { useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, UserX, Truck, Phone, Mail, MapPin, ChevronDown, ChevronUp } from "lucide-react";

interface Driver {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  licenseNumber: string | null;
  vehiclePlate: string | null;
  vehicleType: string | null;
  isActive: boolean;
  currentLat: string | null;
  currentLng: string | null;
  lastLocationAt: string | null;
  createdAt: string;
}

interface DriverJob {
  id: number;
  jobNumber: string;
  customerName: string | null;
  pickupAddress: string | null;
  deliveryAddress: string | null;
  status: string;
  assignedAt: string;
  completedAt: string | null;
  freightShipmentId: number | null;
}

interface DriverDetail extends Driver {
  jobs: DriverJob[];
}

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "Ditugaskan",
  ACCEPTED: "Diterima",
  ON_THE_WAY_TO_PICKUP: "Menuju Pickup",
  ARRIVED_AT_PICKUP: "Tiba Pickup",
  PICKED_UP: "Barang Diambil",
  IN_TRANSIT: "Dalam Perjalanan",
  ARRIVED_AT_DESTINATION: "Tiba di Tujuan",
  DELIVERED: "Terkirim",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};

const STATUS_COLORS: Record<string, string> = {
  ASSIGNED: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  ACCEPTED: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  ON_THE_WAY_TO_PICKUP: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  ARRIVED_AT_PICKUP: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  PICKED_UP: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  IN_TRANSIT: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  ARRIVED_AT_DESTINATION: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  DELIVERED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  COMPLETED: "bg-green-500/10 text-green-600 border-green-500/20",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/20",
};

async function apiFetch(url: string, token: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String(err.message ?? "Request gagal"));
  }
  return res.json();
}

const EMPTY_FORM = { name: "", email: "", password: "", phone: "", licenseNumber: "", vehiclePlate: "", vehicleType: "" };

export default function LogisticsDriversPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showDialog, setShowDialog] = useState(false);
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: drivers = [], isLoading } = useQuery<Driver[]>({
    queryKey: ["drivers"],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch("/api/drivers", token!);
    },
  });

  const { data: expandedDetail } = useQuery<DriverDetail>({
    queryKey: ["driver-detail", expandedId],
    queryFn: async () => {
      const token = await getToken();
      return apiFetch(`/api/drivers/${expandedId}`, token!);
    },
    enabled: expandedId !== null,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const token = await getToken();
      return apiFetch("/api/drivers", token!, { method: "POST", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({ title: "Driver berhasil ditambahkan" });
      setShowDialog(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof EMPTY_FORM> & { isActive?: boolean } }) => {
      const token = await getToken();
      return apiFetch(`/api/drivers/${id}`, token!, { method: "PUT", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({ title: "Driver berhasil diperbarui" });
      setShowDialog(false);
      setEditDriver(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      return apiFetch(`/api/drivers/${id}`, token!, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({ title: "Driver dinonaktifkan" });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditDriver(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  }

  function openEdit(driver: Driver) {
    setEditDriver(driver);
    setForm({
      name: driver.name,
      email: driver.email,
      password: "",
      phone: driver.phone ?? "",
      licenseNumber: driver.licenseNumber ?? "",
      vehiclePlate: driver.vehiclePlate ?? "",
      vehicleType: driver.vehicleType ?? "",
    });
    setShowDialog(true);
  }

  function handleSubmit() {
    if (editDriver) {
      const payload: Partial<typeof EMPTY_FORM> = { ...form };
      if (!payload.password) delete payload.password;
      updateMutation.mutate({ id: editDriver.id, data: payload });
    } else {
      createMutation.mutate(form);
    }
  }

  const activeCount = drivers.filter((d) => d.isActive).length;
  const inactiveCount = drivers.length - activeCount;

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Manajemen Driver</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {drivers.length} total · {activeCount} aktif · {inactiveCount} nonaktif
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Tambah Driver
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeCount}</p>
                  <p className="text-sm text-muted-foreground">Driver Aktif</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{inactiveCount}</p>
                  <p className="text-sm text-muted-foreground">Driver Nonaktif</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{drivers.filter((d) => d.lastLocationAt).length}</p>
                  <p className="text-sm text-muted-foreground">Terdeteksi GPS</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Daftar Driver</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kontak</TableHead>
                  <TableHead>Kendaraan</TableHead>
                  <TableHead>SIM</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lokasi Terakhir</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : drivers.length === 0
                    ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                          Belum ada driver. Klik "Tambah Driver" untuk memulai.
                        </TableCell>
                      </TableRow>
                    )
                    : drivers.map((driver) => (
                      <>
                        <TableRow
                          key={driver.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setExpandedId(expandedId === driver.id ? null : driver.id)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {expandedId === driver.id
                                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                              {driver.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5 text-sm">
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Mail className="w-3 h-3" />{driver.email}
                              </span>
                              {driver.phone && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Phone className="w-3 h-3" />{driver.phone}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p className="font-medium">{driver.vehiclePlate ?? "—"}</p>
                              <p className="text-muted-foreground">{driver.vehicleType ?? "—"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{driver.licenseNumber ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={driver.isActive ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-muted text-muted-foreground"}>
                              {driver.isActive ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {driver.lastLocationAt
                              ? new Date(driver.lastLocationAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })
                              : "Belum terdeteksi"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(driver)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {driver.isActive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => deactivateMutation.mutate(driver.id)}
                                >
                                  <UserX className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedId === driver.id && (
                          <TableRow key={`${driver.id}-detail`}>
                            <TableCell colSpan={7} className="bg-muted/20 p-4">
                              <div className="space-y-3">
                                <h3 className="text-sm font-semibold">Riwayat Job — {driver.name}</h3>
                                {!expandedDetail || expandedDetail.id !== driver.id ? (
                                  <Skeleton className="h-20 w-full" />
                                ) : expandedDetail.jobs.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Belum ada job yang ditugaskan.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {expandedDetail.jobs.map((job) => (
                                      <div key={job.id} className="flex items-center justify-between bg-background rounded-lg border px-4 py-2 text-sm">
                                        <div>
                                          <span className="font-medium">{job.jobNumber}</span>
                                          <span className="text-muted-foreground ml-2">{job.customerName ?? "—"}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <span className="text-muted-foreground text-xs">
                                            {new Date(job.assignedAt).toLocaleDateString("id-ID")}
                                          </span>
                                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[job.status] ?? ""}`}>
                                            {STATUS_LABELS[job.status] ?? job.status}
                                          </Badge>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setShowDialog(false); setEditDriver(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editDriver ? "Edit Driver" : "Tambah Driver Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nama Lengkap *</Label>
              <Input placeholder="Ahmad Rizki" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" placeholder="driver@cst.co.id" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{editDriver ? "Password Baru" : "Password *"}</Label>
                <Input type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>No. Telepon</Label>
              <Input placeholder="+62 812-3456-7890" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>No. SIM</Label>
              <Input placeholder="SIM-B2-123456" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Plat Kendaraan</Label>
                <Input placeholder="B 1234 ABC" value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipe Kendaraan</Label>
                <Input placeholder="Truk Engkel" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })} />
              </div>
            </div>
            {editDriver && (
              <div className="flex items-center justify-between border rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Status Aktif</p>
                  <p className="text-xs text-muted-foreground">Driver dapat menerima job baru</p>
                </div>
                <Switch
                  checked={editDriver.isActive}
                  onCheckedChange={(checked) => {
                    updateMutation.mutate({ id: editDriver.id, data: { isActive: checked } });
                    setEditDriver({ ...editDriver, isActive: checked });
                  }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setEditDriver(null); setForm(EMPTY_FORM); }}>
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending || !form.name || !form.email || (!editDriver && !form.password)}
            >
              {createMutation.isPending || updateMutation.isPending ? "Menyimpan..." : editDriver ? "Simpan Perubahan" : "Tambah Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
