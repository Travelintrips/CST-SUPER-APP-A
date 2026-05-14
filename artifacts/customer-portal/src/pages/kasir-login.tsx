import { useState } from "react";
import { useLocation } from "wouter";
import { setKasirToken, setKasirProfile } from "@/lib/kasirAuth";

export default function KasirLoginPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pos-kasir/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json() as { token?: string; cashier?: { id: number; name: string; email: string }; message?: string };
      if (!res.ok) {
        setMsg({ type: "error", text: data.message ?? "Login gagal" });
      } else {
        setKasirToken(data.token!);
        setKasirProfile(data.cashier!);
        setLocation("/kasir");
      }
    } catch {
      setMsg({ type: "error", text: "Gagal terhubung ke server" });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pos-kasir/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password, phone: form.phone }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) {
        setMsg({ type: "error", text: data.message ?? "Pendaftaran gagal" });
      } else {
        setMsg({ type: "success", text: "Pendaftaran berhasil! Menunggu persetujuan admin sebelum bisa login." });
        setTab("login");
        setForm((f) => ({ ...f, name: "", password: "", phone: "" }));
      }
    } catch {
      setMsg({ type: "error", text: "Gagal terhubung ke server" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl shadow-lg mb-4 overflow-hidden bg-orange-500">
            <img src="/thai-tea-cst-logo.jpeg" alt="Thai Tea CST" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Thai Tea CST</h1>
          <p className="text-gray-500 text-sm mt-1">Portal Kasir</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b">
            <button
              onClick={() => { setTab("login"); setMsg(null); }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === "login" ? "text-amber-600 border-b-2 border-amber-500" : "text-gray-500 hover:text-gray-700"}`}
            >
              Masuk
            </button>
            <button
              onClick={() => { setTab("register"); setMsg(null); }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === "register" ? "text-amber-600 border-b-2 border-amber-500" : "text-gray-500 hover:text-gray-700"}`}
            >
              Daftar
            </button>
          </div>

          <div className="p-6">
            {msg && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${msg.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                {msg.text}
              </div>
            )}

            {tab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email" required
                    value={form.email} onChange={(e) => update("email", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="email@contoh.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password" required
                    value={form.password} onChange={(e) => update("password", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? "Memproses..." : "Masuk"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nama Lengkap</label>
                  <input
                    type="text" required
                    value={form.name} onChange={(e) => update("name", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Nama kasir"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email" required
                    value={form.email} onChange={(e) => update("email", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="email@contoh.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">No. HP (opsional)</label>
                  <input
                    type="tel"
                    value={form.phone} onChange={(e) => update("phone", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password" required minLength={6}
                    value={form.password} onChange={(e) => update("password", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Minimal 6 karakter"
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? "Memproses..." : "Daftar Akun"}
                </button>
                <p className="text-xs text-center text-gray-500">
                  Akun akan aktif setelah disetujui oleh admin.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
