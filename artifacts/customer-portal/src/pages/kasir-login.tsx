import { useState } from "react";
import { useLocation } from "wouter";
import { setKasirToken, setKasirProfile } from "@/lib/kasirAuth";

export default function KasirLoginPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [showPw, setShowPw] = useState(false);

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
        setMsg({ type: "success", text: "Pendaftaran berhasil! Akun akan aktif setelah disetujui admin." });
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #ff8c00 0%, #ff6b00 40%, #e05500 100%)" }}>

      {/* Decorative blobs */}
      <div className="absolute top-0 left-0 w-72 h-72 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)", transform: "translate(-30%, -30%)" }} />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)", transform: "translate(30%, 30%)" }} />
      <div className="absolute top-1/2 left-1/4 w-48 h-48 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #ffdd99 0%, transparent 70%)" }} />

      <div className="w-full max-w-sm mx-4 relative z-10">
        {/* Logo card */}
        <div className="text-center mb-6">
          <div className="inline-block mb-3">
            <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-2xl border-4 border-white/30 mx-auto"
              style={{ backdropFilter: "blur(10px)" }}>
              <img src="/thai-tea-cst-logo.jpeg" alt="Thai Tea CST" className="w-full h-full object-cover" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-lg">Thai Tea CST</h1>
          <p className="text-orange-100 text-sm mt-1 font-medium">Portal Kasir</p>
        </div>

        {/* Card */}
        <div className="rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)" }}>

          {/* Tab bar */}
          <div className="flex p-1.5 gap-1 bg-orange-50 m-4 rounded-2xl">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setMsg(null); }}
                className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 ${
                  tab === t
                    ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                    : "text-orange-400 hover:text-orange-600"
                }`}
              >
                {t === "login" ? "Masuk" : "Daftar"}
              </button>
            ))}
          </div>

          <div className="px-5 pb-5">
            {msg && (
              <div className={`mb-4 p-3.5 rounded-2xl text-sm font-medium flex items-start gap-2 ${
                msg.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-100"
                  : "bg-green-50 text-green-700 border border-green-100"
              }`}>
                <span className="text-base flex-shrink-0">{msg.type === "error" ? "⚠️" : "✅"}</span>
                {msg.text}
              </div>
            )}

            {tab === "login" ? (
              <form onSubmit={handleLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
                  <input
                    type="email" required
                    value={form.email} onChange={(e) => update("email", e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-all placeholder-gray-300"
                    placeholder="email@contoh.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"} required
                      value={form.password} onChange={(e) => update("password", e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-all placeholder-gray-300 pr-12"
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs px-1">
                      {showPw ? "Sembunyikan" : "Lihat"}
                    </button>
                  </div>
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-2xl font-black text-white text-sm transition-all duration-200 active:scale-95 disabled:opacity-50 mt-2 shadow-lg shadow-orange-200"
                  style={{ background: loading ? "#ccc" : "linear-gradient(135deg, #ff8c00, #e05500)" }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Memproses...
                    </span>
                  ) : "Masuk →"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nama Lengkap</label>
                  <input
                    type="text" required
                    value={form.name} onChange={(e) => update("name", e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-all placeholder-gray-300"
                    placeholder="Nama kasir"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
                  <input
                    type="email" required
                    value={form.email} onChange={(e) => update("email", e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-all placeholder-gray-300"
                    placeholder="email@contoh.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">No. HP <span className="text-gray-300 font-normal normal-case">(opsional)</span></label>
                  <input
                    type="tel"
                    value={form.phone} onChange={(e) => update("phone", e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-all placeholder-gray-300"
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Password</label>
                  <input
                    type="password" required minLength={6}
                    value={form.password} onChange={(e) => update("password", e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:bg-white transition-all placeholder-gray-300"
                    placeholder="Min. 6 karakter"
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-2xl font-black text-white text-sm transition-all duration-200 active:scale-95 disabled:opacity-50 shadow-lg shadow-orange-200"
                  style={{ background: loading ? "#ccc" : "linear-gradient(135deg, #ff8c00, #e05500)" }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Memproses...
                    </span>
                  ) : "Daftar Akun"}
                </button>
                <p className="text-xs text-center text-gray-400 pt-1">
                  Akun aktif setelah disetujui admin ✓
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-orange-200 text-xs mt-5">© Thai Tea CST · Portal Kasir</p>
      </div>
    </div>
  );
}
