import { useState } from "react";
import { MapPin, Phone, Mail, Clock, Send, CheckCircle } from "lucide-react";

export default function Contact() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function update(field: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
    setErrors((p) => ({ ...p, [field]: "" }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Nama wajib diisi";
    if (!form.email.trim()) e.email = "Email wajib diisi";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Format email tidak valid";
    if (!form.subject.trim()) e.subject = "Subjek wajib diisi";
    if (!form.message.trim()) e.message = "Pesan wajib diisi";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) setSent(true);
  }

  const contacts = [
    { icon: MapPin, title: "Alamat", lines: ["Kawasan Bandara Soekarno-Hatta", "Terminal 3, Area Sport Center", "Tangerang, Banten 19110"], color: "text-blue-600", bg: "bg-blue-50" },
    { icon: Phone, title: "Telepon", lines: ["+62 21 5550 1234", "+62 812 9876 5432 (WhatsApp)"], color: "text-emerald-600", bg: "bg-emerald-50" },
    { icon: Mail, title: "Email", lines: ["info@sportcentershia.id", "booking@sportcentershia.id"], color: "text-orange-500", bg: "bg-orange-50" },
    { icon: Clock, title: "Jam Operasional", lines: ["Senin – Minggu", "06:00 – 22:00 WIB"], color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="min-h-screen">
      <div className="bg-gradient-to-r from-blue-600 to-emerald-500 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Hubungi Kami</h1>
          <p className="text-white/80 text-lg max-w-xl mx-auto">
            Ada pertanyaan atau butuh bantuan? Tim kami siap membantu Anda.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
          {contacts.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="bg-white rounded-xl shadow-md p-5 hover:shadow-lg transition-all">
                <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${c.color}`} />
                </div>
                <p className="font-bold text-slate-800 mb-2">{c.title}</p>
                {c.lines.map((line) => (
                  <p key={line} className="text-slate-500 text-sm">{line}</p>
                ))}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-2xl font-black text-slate-800 mb-6">Kirim Pesan</h2>
            {sent ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Pesan Terkirim!</h3>
                <p className="text-slate-500 mb-6">Tim kami akan menghubungi Anda dalam 1x24 jam.</p>
                <button
                  onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "", message: "" }); }}
                  className="bg-gradient-to-r from-blue-600 to-emerald-500 text-white px-6 py-2.5 rounded-full font-semibold"
                >
                  Kirim Pesan Lain
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nama <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      placeholder="Nama Anda"
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.name ? "border-red-400" : "border-slate-300"}`}
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      placeholder="email@anda.com"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.email ? "border-red-400" : "border-slate-300"}`}
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subjek <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="Topik pesan Anda"
                    value={form.subject}
                    onChange={(e) => update("subject", e.target.value)}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.subject ? "border-red-400" : "border-slate-300"}`}
                  />
                  {errors.subject && <p className="text-red-500 text-xs mt-1">{errors.subject}</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Pesan <span className="text-red-500">*</span></label>
                  <textarea
                    placeholder="Tuliskan pesan Anda di sini..."
                    value={form.message}
                    onChange={(e) => update("message", e.target.value)}
                    rows={5}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${errors.message ? "border-red-400" : "border-slate-300"}`}
                  />
                  {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message}</p>}
                </div>
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-3 rounded-full font-bold hover:shadow-lg hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Kirim Pesan
                </button>
              </form>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="bg-slate-100 h-72 relative flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                <p className="font-bold text-slate-700">Sport Center SHIA</p>
                <p className="text-slate-500 text-sm">Kawasan Bandara Soekarno-Hatta</p>
                <p className="text-slate-400 text-sm">Terminal 3, Tangerang, Banten 19110</p>
              </div>
              <div className="absolute inset-0 border-2 border-dashed border-slate-200 m-4 rounded-xl pointer-events-none" />
            </div>
            <div className="p-5">
              <h3 className="font-bold text-slate-800 mb-3">Cara Menuju Sport Center</h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex gap-2"><span className="text-blue-600 font-bold shrink-0">🚗</span>Dari Tol Dalam Kota: keluar di pintu tol Bandara, ikuti petunjuk Terminal 3</li>
                <li className="flex gap-2"><span className="text-blue-600 font-bold shrink-0">🚌</span>Bus Damri tersedia dari Gambir, Blok M, dan Bekasi langsung ke Terminal 3</li>
                <li className="flex gap-2"><span className="text-blue-600 font-bold shrink-0">🚆</span>Kereta Bandara dari Stasiun Manggarai, turun di Stasiun BNI City atau Duri</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
