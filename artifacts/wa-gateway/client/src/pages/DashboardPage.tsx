import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Cpu, Wifi, WifiOff, Loader2, Trash2, Settings, X } from "lucide-react";
import Layout from "../components/Layout";
import { api, type Device } from "../lib/api";
import { toast } from "sonner";

function StatusBadge({ status }: { status: Device["status"] }) {
  const cfg = {
    connected: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    connecting: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    disconnected: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg}`}>
      {status === "connected" && <Wifi className="w-3 h-3" />}
      {status === "connecting" && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === "disconnected" && <WifiOff className="w-3 h-3" />}
      {status}
    </span>
  );
}

function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [webhook, setWebhook] = useState("");
  const mut = useMutation({
    mutationFn: () => api.devices.create({ name, webhookUrl: webhook || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      toast.success("Device created");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Add Device</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Device Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="e.g. Marketing Bot"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Webhook URL (optional)</label>
            <input
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="https://your-server.com/webhook"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg py-2.5 text-sm transition-colors">
              Cancel
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={!name || mut.isPending}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();
  const { data: devices = [], isLoading } = useQuery({ queryKey: ["devices"], queryFn: api.devices.list });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.devices.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["devices"] }); toast.success("Device deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Layout>
      {showAdd && <AddDeviceModal onClose={() => setShowAdd(false)} />}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Devices</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your WhatsApp connections</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Device
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      )}

      {!isLoading && devices.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            <Cpu className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-slate-400 text-sm">No devices yet. Add your first WhatsApp device.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {devices.map((d) => (
          <div key={d.id} className="bg-[#111827] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Cpu className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{d.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{d.phoneNumber ? `+${d.phoneNumber}` : "Not connected"}</p>
                </div>
              </div>
              <StatusBadge status={d.status} />
            </div>

            <div className="flex gap-2 mt-4">
              <Link href={`/wa-gateway/devices/${d.id}`}>
                <a className="flex-1 flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg py-2 text-xs font-medium transition-colors">
                  <Settings className="w-3.5 h-3.5" />
                  Manage
                </a>
              </Link>
              <button
                onClick={() => {
                  if (confirm(`Delete device "${d.name}"?`)) deleteMut.mutate(d.id);
                }}
                className="p-2 bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
