import { useState } from "react";
import { MapPin, Phone, Mail, Clock, Send, CheckCircle, MessageCircle, AlertCircle } from "lucide-react";

const WA_NUMBER = "6281234567890";
const WA_LINK = `https://wa.me/${WA_NUMBER}`;
const MESSAGES_KEY = "sportcenter_messages";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

function saveMessage(msg: Omit<ContactMessage, "id" | "createdAt">) {
  const existing: ContactMessage[] = (() => {
    try { return JSON.parse(localStorage.getItem(MESSAGES_KEY) ?? "[]"); }
    catch { return []; }
  })();
  const newMsg: ContactMessage = {
    ...msg,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(MESSAGES_KEY, JSON.stringify([newMsg, ...existing]));
}

export default function Contact() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
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
    if (!form.message.trim()) e.message = "Pesan wajib diisi";
    else if (form.message.trim().length < 10) e.message = "Pesan terlalu singkat (minimal 10 karakter)";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    saveMessage({ name: form.name, email: form.email, message: form.message });
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-blue-600 to-emerald-500 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Hubungi Kami</h1>
          <p className="text-white/80 text-lg max-w-xl mx-auto">
            Ada pertanyaan, saran, atau kebutuhan khusus? Tim kami siap membantu Anda.
          </p>
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 mt-6 bg-[#25D366] text-white px-8 py-3.5 rounded-full font-bold text-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            <MessageCircle className="w-5 h-5" />
            Chat WhatsApp
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {[
            {
              icon: MapPin,
              title: "Alamat",
              color: "text-blue-600",
              bg: "bg-blue-50",
              content: (
                <div className="text-sm text-slate-500 space-y-0.5">
                  <p>Kawasan Bandara Soekarno-Hatta</p>
                  <p>Terminal 3, Area Sport Center</p>
                  <p>Tangerang, Banten 19110</p>
                </div>
              ),
            },
            {
              icon: Phone,
              title: "Telepon & WhatsApp",
              color: "text-emerald-600",
              bg: "bg-emerald-50",
              content: (
                <div className="text-sm space-y-1.5">
                  <a href="tel:+622155501234" className="block text-slate-600 hover:text-blue-600 transition-colors">
                    +62 21 5550 1234
                  </a>
                  <a
                    href={WA_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[#25D366] font-semibold hover:underline"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    +62 812-3456-7890
                  </a>
                </div>
              ),
            },
            {
              icon: Mail,
              title: "Email",
              color: "text-orange-500",
              bg: "bg-orange-50",
              content: (
                <div className="text-sm space-y-1.5">
                  <a href="mailto:info@sportcentershia.com" className="block text-slate-600 hover:text-blue-600 transition-colors break-all">
                    info@sportcentershia.com
                  </a>
                  <a href="mailto:booking@sportcentershia.com" className="block text-slate-600 hover:text-blue-600 transition-colors break-all">
                    booking@sportcentershia.com
                  </a>
                </div>
              ),
            },
            {
              icon: Clock,
              title: "Jam Operasional",
              color: "text-purple-600",
              bg: "bg-purple-50",
              content: (
                <div className="text-sm text-slate-500 space-y-1">
                  <p><span className="font-medium text-slate-700">Sen–Sab:</span> 06:00 – 22:00</p>
                  <p><span className="font-medium text-slate-700">Minggu:</span> 06:00 – 21:00</p>
                  <p className="text-xs text-slate-400 mt-1">Termasuk hari libur</p>
                </div>
              ),
            },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-md transition-all">
                <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${c.color}`} />
                </div>
                <p className="font-bold text-slate-800 mb-2">{c.title}</p>
                {c.content}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-800">Lokasi Kami</h2>
              <p className="text-sm text-slate-500 mt-1">Sport Center Bandara Soekarno-Hatta, Tangerang</p>
            </div>
            <div className="flex-1 min-h-[280px]">
              <iframe
                title="Lokasi Sport Center SHIA"
                width="100%"
                height="100%"
                style={{ minHeight: 280, border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src="https://www.google.com/maps?q=-6.125,106.655&z=15&output=embed"
              />
            </div>
            <div className="p-5 border-t border-slate-100">
              <h3 className="font-bold text-slate-800 mb-3 text-sm">Cara Menuju Sport Center</h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex gap-2.5 items-start">
                  <span className="shrink-0">🚗</span>
                  <span>Dari Tol Dalam Kota: keluar di pintu tol Bandara, ikuti petunjuk Terminal 3</span>
                </li>
                <li className="flex gap-2.5 items-start">
                  <span className="shrink-0">🚌</span>
                  <span>Bus Damri tersedia dari Gambir, Blok M, dan Bekasi langsung ke Terminal 3</span>
                </li>
                <li className="flex gap-2.5 items-start">
                  <span className="shrink-0">🚆</span>
                  <span>Kereta Bandara dari Stasiun Manggarai, turun di Stasiun BNI City atau Duri</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col">
            <h2 className="text-xl font-black text-slate-800 mb-1">Kirim Pesan</h2>
            <p className="text-sm text-slate-500 mb-6">Kami akan merespons dalam 1×24 jam kerja.</p>

            {sent ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Pesan Terkirim!</h3>
                <p className="text-slate-500 text-sm mb-6 max-w-xs">
                  Terima kasih! Tim kami akan menghubungi Anda secepatnya melalui email yang terdaftar.
                </p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button
                    onClick={() => { setSent(false); setForm({ name: "", email: "", message: "" }); }}
                    className="bg-gradient-to-r from-blue-600 to-emerald-500 text-white px-6 py-2.5 rounded-full font-semibold text-sm"
                  >
                    Kirim Pesan Lain
                  </button>
                  <a
                    href={WA_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-[#25D366] text-white px-6 py-2.5 rounded-full font-semibold text-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Chat WhatsApp
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Nama <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Nama Anda"
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.name ? "border-red-400 bg-red-50" : "border-slate-300"
                      }`}
                    />
                    {errors.name && (
                      <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />{errors.name}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="email@anda.com"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errors.email ? "border-red-400 bg-red-50" : "border-slate-300"
                      }`}
                    />
                    {errors.email && (
                      <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />{errors.email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Pesan <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    placeholder="Tuliskan pesan, pertanyaan, atau kebutuhan Anda di sini..."
                    value={form.message}
                    onChange={(e) => update("message", e.target.value)}
                    rows={6}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
                      errors.message ? "border-red-400 bg-red-50" : "border-slate-300"
                    }`}
                  />
                  {errors.message && (
                    <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />{errors.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-3 rounded-full font-bold hover:shadow-lg hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Kirim Pesan
                  </button>
                  <a
                    href={WA_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 px-6 rounded-full font-bold hover:shadow-lg transition-all"
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </a>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
