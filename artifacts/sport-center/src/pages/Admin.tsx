import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import BookingTable from "@/components/admin/BookingTable";

const ADMIN_PASSWORD = "admin123";

export default function Admin() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("sc_admin") === "1");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem("sc_admin", "1");
      setAuthed(true);
    } else {
      setError("Password salah. Coba lagi.");
      setPassword("");
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("sc_admin");
    setAuthed(false);
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 text-center mb-1">Admin Panel</h1>
          <p className="text-slate-400 text-sm text-center mb-6">Sport Center SHIA</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password Admin</label>
              <input
                type="password"
                placeholder="Masukkan password..."
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className={`w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? "border-red-400" : "border-slate-300"}`}
                autoFocus
              />
              {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-3 rounded-full font-bold hover:shadow-lg transition-all"
            >
              Masuk
            </button>
          </form>
          <p className="text-xs text-slate-400 text-center mt-4">Demo password: admin123</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-blue-600 to-emerald-500 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Admin Panel</h1>
              <p className="text-white/70 text-sm">Manajemen Booking Sport Center SHIA</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="bg-white/20 hover:bg-white/30 text-white border border-white/30 px-5 py-2 rounded-full text-sm font-semibold transition-all"
          >
            Keluar
          </button>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BookingTable />
      </div>
    </div>
  );
}
