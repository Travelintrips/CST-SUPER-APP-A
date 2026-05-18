import { Link } from "react-router-dom";
import { Trophy, Zap, Users, Shield, Clock, Star, ChevronRight, ArrowRight } from "lucide-react";
import FacilityCard from "@/components/ui/FacilityCard";
import { facilities, testimonials } from "@/data/dummyData";

const features = [
  {
    icon: Trophy,
    title: "Lapangan Premium",
    desc: "Fasilitas berstandar internasional dengan peralatan terkini untuk pengalaman olahraga terbaik.",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    icon: Zap,
    title: "Booking Mudah",
    desc: "Reservasi lapangan cukup dalam hitungan detik, 24 jam sehari tanpa perlu antri.",
    color: "text-orange-500",
    bg: "bg-orange-50",
  },
  {
    icon: Users,
    title: "Komunitas Aktif",
    desc: "Bergabung dengan ribuan anggota aktif dan komunitas olahraga yang terus berkembang.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    icon: Shield,
    title: "Keamanan Terjamin",
    desc: "Fasilitas dijaga 24 jam dengan CCTV dan petugas keamanan terlatih.",
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    icon: Clock,
    title: "Buka Setiap Hari",
    desc: "Beroperasi dari pukul 06.00 hingga 22.00, tujuh hari seminggu termasuk hari libur.",
    color: "text-rose-500",
    bg: "bg-rose-50",
  },
  {
    icon: Star,
    title: "Rating Tertinggi",
    desc: "Dinilai 4.8/5 oleh lebih dari 2.000 pelanggan setia kami di seluruh Tangerang.",
    color: "text-yellow-500",
    bg: "bg-yellow-50",
  },
];

export default function Home() {
  return (
    <div>
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=1600&auto=format&fit=crop&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/85 via-slate-900/75 to-emerald-900/60" />
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <span className="inline-block bg-white/15 backdrop-blur-sm text-white text-sm font-semibold px-4 py-1.5 rounded-full mb-6 border border-white/20">
            🏅 Sport Center Terbaik di Area SHIA
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight">
            Sport Center{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-emerald-300">
              Bandara Soekarno Hatta
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/80 mb-10 max-w-2xl mx-auto leading-relaxed">
            Tempat terbaik untuk olahraga, komunitas, dan gaya hidup sehat — tepat di jantung kawasan bandara internasional.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/booking"
              className="bg-gradient-to-r from-blue-600 to-emerald-500 text-white px-8 py-4 rounded-full font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2"
            >
              Booking Sekarang
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#facilities"
              className="bg-white/15 backdrop-blur-sm border border-white/30 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-white/25 transition-all duration-200"
            >
              Lihat Fasilitas
            </a>
          </div>
          <div className="flex items-center justify-center gap-8 mt-12 text-white/70 text-sm">
            <div className="text-center">
              <p className="text-3xl font-black text-white">6+</p>
              <p>Jenis Fasilitas</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="text-center">
              <p className="text-3xl font-black text-white">2K+</p>
              <p>Member Aktif</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div className="text-center">
              <p className="text-3xl font-black text-white">4.8</p>
              <p>Rating Rata-rata</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Mengapa Kami?</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-800 mt-2 mb-4">
              Keunggulan Sport Center SHIA
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              Kami hadir untuk memberikan pengalaman olahraga terbaik dengan fasilitas modern dan layanan prima.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="p-6 rounded-xl border border-slate-100 hover:shadow-md transition-all duration-200 hover:scale-[1.02]">
                  <div className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${f.color}`} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{f.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="facilities" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-4">
            <div>
              <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Fasilitas Kami</span>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-800 mt-2">
                Pilihan Lapangan Terbaik
              </h2>
            </div>
            <Link
              to="/facilities"
              className="flex items-center gap-2 text-blue-600 font-semibold hover:gap-3 transition-all text-sm"
            >
              Lihat Semua <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {facilities.slice(0, 6).map((f) => (
              <FacilityCard key={f.id} facility={f} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider">Testimoni</span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-800 mt-2">
              Kata Mereka Tentang Kami
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.id} className="bg-slate-50 rounded-xl p-6 hover:shadow-md transition-all duration-200">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < t.rating ? "text-yellow-400 fill-yellow-400" : "text-slate-200 fill-slate-200"}`}
                    />
                  ))}
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-5 italic">"{t.content}"</p>
                <div className="flex items-center gap-3">
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full bg-slate-200" />
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{t.name}</p>
                    <p className="text-slate-400 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-blue-600 to-emerald-500">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            Siap Mulai Berolahraga?
          </h2>
          <p className="text-white/80 mb-8 text-lg">
            Booking lapangan sekarang dan nikmati pengalaman olahraga premium bersama kami.
          </p>
          <Link
            to="/booking"
            className="inline-flex items-center gap-2 bg-white text-blue-600 px-10 py-4 rounded-full font-bold text-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
          >
            Booking Sekarang
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
