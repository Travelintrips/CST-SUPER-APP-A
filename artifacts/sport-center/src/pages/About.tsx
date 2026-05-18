import { Link } from "react-router-dom";
import {
  Target, Eye, Heart, Award, Users, Calendar,
  MapPin, Clock, Dumbbell, Shield, Star, ArrowRight,
  Zap, Trophy,
} from "lucide-react";

const highlights = [
  {
    icon: MapPin,
    title: "Lokasi Strategis",
    desc: "Berada di kawasan Bandara Internasional Soekarno-Hatta, mudah dijangkau dari seluruh penjuru Tangerang dan Jakarta.",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    icon: Dumbbell,
    title: "Fasilitas Premium",
    desc: "6 jenis fasilitas olahraga berstandar internasional dengan peralatan dan infrastruktur terkini.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    icon: Users,
    title: "Komunitas Aktif",
    desc: "Lebih dari 2.000 anggota aktif yang membentuk komunitas olahraga yang inklusif dan suportif.",
    color: "text-orange-500",
    bg: "bg-orange-50",
  },
  {
    icon: Shield,
    title: "Keamanan 24 Jam",
    desc: "Fasilitas dijaga penuh oleh tim keamanan terlatih dan dilengkapi sistem CCTV di seluruh area.",
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    icon: Zap,
    title: "Booking Online",
    desc: "Sistem reservasi digital yang memudahkan booking kapan saja tanpa perlu datang langsung.",
    color: "text-yellow-500",
    bg: "bg-yellow-50",
  },
  {
    icon: Trophy,
    title: "Track Record Terbaik",
    desc: "Meraih rating 4.8/5 dari ribuan ulasan pelanggan. Penghargaan Fasilitas Olahraga Terbaik 2023.",
    color: "text-rose-500",
    bg: "bg-rose-50",
  },
];

const operationalSchedule = [
  { day: "Senin – Jumat", hours: "06:00 – 22:00 WIB", note: "Hari kerja" },
  { day: "Sabtu", hours: "06:00 – 22:00 WIB", note: "Weekend" },
  { day: "Minggu", hours: "06:00 – 21:00 WIB", note: "Weekend" },
  { day: "Hari Libur Nasional", hours: "07:00 – 20:00 WIB", note: "Terbatas" },
];

const gallery = [
  {
    url: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&auto=format&fit=crop&q=80",
    caption: "Lapangan Futsal Indoor",
  },
  {
    url: "https://images.unsplash.com/photo-1599391398131-cd12dfc6c24e?w=600&auto=format&fit=crop&q=80",
    caption: "Lapangan Badminton",
  },
  {
    url: "https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=600&auto=format&fit=crop&q=80",
    caption: "Kolam Renang Olimpik",
  },
  {
    url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80",
    caption: "Fitness Center & Gym",
  },
];

const milestones = [
  { year: "2015", desc: "Sport Center SHIA didirikan dengan 2 lapangan badminton" },
  { year: "2017", desc: "Penambahan lapangan futsal indoor berstandar FIFA" },
  { year: "2019", desc: "Pembukaan Fitness Center & kolam renang olimpik" },
  { year: "2021", desc: "Sistem booking online diluncurkan untuk kemudahan pelanggan" },
  { year: "2023", desc: "Ekspansi lapangan tenis dan lapangan basket indoor" },
  { year: "2025", desc: "Mencapai 2.000+ anggota aktif dan rating 4.8/5" },
];

export default function About() {
  return (
    <div className="min-h-screen">
      <section
        className="relative py-24 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1400&auto=format&fit=crop&q=80')",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/85 to-emerald-900/70" />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <span className="inline-block bg-white/15 backdrop-blur-sm text-white text-sm font-semibold px-4 py-1.5 rounded-full mb-5 border border-white/20">
            Tentang Sport Center SHIA
          </span>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-5">
            Pusat Olahraga Terbaik di{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-emerald-300">
              Area Bandara SHIA
            </span>
          </h1>
          <p className="text-white/80 text-lg max-w-2xl mx-auto leading-relaxed">
            Sejak 2015, kami hadir sebagai pusat olahraga modern yang mendukung gaya hidup aktif dan sehat masyarakat kawasan Bandara Soekarno-Hatta.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Profil Kami</span>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-800 mt-2 mb-5">
                Lebih dari Sekadar Tempat Olahraga
              </h2>
              <p className="text-slate-600 leading-relaxed mb-4">
                Sport Center Bandara Soekarno-Hatta (SHIA) adalah pusat olahraga terintegrasi yang berlokasi strategis di kawasan bandara internasional terbesar Indonesia. Kami menyediakan fasilitas berkualitas premium untuk berbagai cabang olahraga dengan pelayanan kelas dunia.
              </p>
              <p className="text-slate-600 leading-relaxed mb-6">
                Dengan lebih dari satu dekade pengalaman, kami telah melayani ratusan ribu sesi olahraga dari berbagai kalangan — mulai dari atlet profesional, komunitas hobi, hingga keluarga yang ingin gaya hidup sehat bersama.
              </p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { value: "10+", label: "Tahun Beroperasi", color: "text-blue-600" },
                  { value: "2K+", label: "Member Aktif", color: "text-emerald-600" },
                  { value: "4.8★", label: "Rating Pelanggan", color: "text-yellow-500" },
                ].map((s) => (
                  <div key={s.label} className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  icon: Target,
                  title: "Misi Kami",
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                  content:
                    "Menyediakan fasilitas olahraga berkualitas tinggi yang terjangkau dan mudah diakses oleh seluruh lapisan masyarakat di kawasan bandara.",
                },
                {
                  icon: Eye,
                  title: "Visi Kami",
                  color: "text-emerald-600",
                  bg: "bg-emerald-50",
                  content:
                    "Menjadi pusat olahraga terkemuka di Indonesia yang dikenal atas kualitas fasilitas dan kontribusi nyata terhadap gaya hidup sehat.",
                },
                {
                  icon: Heart,
                  title: "Nilai Kami",
                  color: "text-rose-500",
                  bg: "bg-rose-50",
                  content:
                    "Integritas, pelayanan tulus, dan komitmen terhadap kualitas. Olahraga bukan hanya fisik — ia membangun karakter dan komunitas.",
                },
                {
                  icon: Award,
                  title: "Komitmen",
                  color: "text-orange-500",
                  bg: "bg-orange-50",
                  content:
                    "Terus berinovasi dan meningkatkan standar layanan demi kepuasan anggota dan komunitas olahraga Indonesia.",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="bg-white border border-slate-100 rounded-xl p-5 hover:shadow-md transition-all">
                    <div className={`w-10 h-10 ${item.bg} rounded-xl flex items-center justify-center mb-3`}>
                      <Icon className={`w-5 h-5 ${item.color}`} />
                    </div>
                    <h3 className="font-bold text-slate-800 mb-2 text-sm">{item.title}</h3>
                    <p className="text-slate-500 text-xs leading-relaxed">{item.content}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Mengapa Kami</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-800 mt-2 mb-3">
              Keunggulan Sport Center SHIA
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              Kami berkomitmen memberikan pengalaman olahraga terbaik dengan standar fasilitas dan layanan premium.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {highlights.map((h) => {
              const Icon = h.icon;
              return (
                <div key={h.title} className="bg-white rounded-xl p-6 border border-slate-100 hover:shadow-md transition-all hover:scale-[1.02]">
                  <div className={`w-12 h-12 ${h.bg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${h.color}`} />
                  </div>
                  <h3 className="font-bold text-slate-800 mb-2">{h.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{h.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Jam Operasional</span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mt-2 mb-6">
                Kami Buka Setiap Hari
              </h2>
              <div className="space-y-3">
                {operationalSchedule.map((s) => (
                  <div
                    key={s.day}
                    className="flex items-center justify-between bg-slate-50 rounded-xl px-5 py-4"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{s.day}</p>
                        <p className="text-xs text-slate-400">{s.note}</p>
                      </div>
                    </div>
                    <span className="font-bold text-blue-600 text-sm">{s.hours}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-700">
                <span className="font-semibold">Catatan:</span> Jadwal dapat berubah saat event khusus atau libur nasional tertentu. Hubungi kami untuk konfirmasi.
              </div>
            </div>

            <div>
              <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Perjalanan Kami</span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mt-2 mb-6">
                Satu Dekade Melayani
              </h2>
              <div className="relative">
                <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-gradient-to-b from-blue-600 to-emerald-500" />
                <div className="space-y-4">
                  {milestones.map((m) => (
                    <div key={m.year} className="flex gap-4 items-start">
                      <div className="relative z-10 w-10 h-10 shrink-0 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-full flex items-center justify-center shadow">
                        <span className="text-white text-[10px] font-black">{m.year.slice(2)}</span>
                      </div>
                      <div className="bg-slate-50 rounded-xl px-4 py-3 flex-1 mt-0.5">
                        <span className="text-blue-600 font-bold text-xs">{m.year}</span>
                        <p className="text-slate-700 text-sm mt-0.5">{m.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Galeri</span>
            <h2 className="text-3xl font-black text-slate-800 mt-2">Fasilitas Kami</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {gallery.map((g) => (
              <div key={g.caption} className="relative group overflow-hidden rounded-2xl aspect-video">
                <img
                  src={g.url}
                  alt={g.caption}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                  <p className="text-white font-semibold text-sm">{g.caption}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              to="/facilities"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white px-8 py-3.5 rounded-full font-bold hover:shadow-lg hover:scale-105 transition-all"
            >
              Lihat Semua Fasilitas
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-r from-blue-600 to-emerald-500">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <Star className="w-10 h-10 text-white/60 mx-auto mb-4" />
          <h2 className="text-3xl font-black text-white mb-3">Bergabung Bersama Kami</h2>
          <p className="text-white/80 mb-8 text-lg">
            Jadilah bagian dari komunitas olahraga terbesar di kawasan Bandara Soekarno-Hatta.
          </p>
          <Link
            to="/booking"
            className="inline-flex items-center gap-2 bg-white text-blue-600 px-10 py-4 rounded-full font-bold text-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            Booking Sekarang
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
