import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Plus, Copy, Trash2, Loader2, X } from "lucide-react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { toast } from "sonner";

function CreateKeyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => api.apikeys.create({ name }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["apikeys"] });
      setNewKey(data.key);
    },
    onError: (e: any) => toast.error(e.message),
  });

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!"));
  }

  if (newKey) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
        <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md p-6">
          <h2 className="text-lg font-semibold text-white mb-2">API Key Created</h2>
          <p className="text-yellow-400 text-sm mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
            ⚠ Save this key now — it won't be shown again!
          </p>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-3">
            <code className="flex-1 text-emerald-400 text-xs break-all font-mono">{newKey}</code>
            <button onClick={() => copy(newKey)} className="text-slate-400 hover:text-white shrink-0">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full mt-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Create API Key</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Key Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="e.g. Production Key"
              autoFocus
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
              Generate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const [showCreate, setShowCreate] = useState(false);
  const qc = useQueryClient();
  const { data: keys = [], isLoading } = useQuery({ queryKey: ["apikeys"], queryFn: api.apikeys.list });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.apikeys.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["apikeys"] }); toast.success("Key revoked"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Layout>
      {showCreate && <CreateKeyModal onClose={() => setShowCreate(false)} />}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="text-slate-400 text-sm mt-1">Manage keys for REST API access</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Key
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>
      ) : keys.length === 0 ? (
        <div className="text-center py-20">
          <Key className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">No API keys yet.</p>
        </div>
      ) : (
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Name</th>
                <th className="text-left text-xs font-medium text-slate-500 px-5 py-3">Prefix</th>
                <th className="text-left text-xs font-medium text-slate-500 px-5 py-3 hidden sm:table-cell">Last Used</th>
                <th className="text-left text-xs font-medium text-slate-500 px-5 py-3 hidden md:table-cell">Created</th>
                <th className="px-5 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-3 font-medium text-white">{k.name}</td>
                  <td className="px-5 py-3">
                    <code className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">{k.keyPrefix}…</code>
                  </td>
                  <td className="px-5 py-3 text-slate-400 hidden sm:table-cell">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-5 py-3 text-slate-400 hidden md:table-cell">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => { if (confirm("Revoke this key?")) deleteMut.mutate(k.id); }}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
