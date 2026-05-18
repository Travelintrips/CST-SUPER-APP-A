import { Target, Eye, Heart, Award, Users, Calendar } from "lucide-react";

const team = [
  { name: "Bpk. Hendra Kusuma", role: "Manajer Operasional", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Hendra" },
  { name: "Ibu Rina Sari", role: "Koordinator Fasilitas", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Rina" },
  { name: "Bpk. Dani Pratama", role: "Kepala Instruktur", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Dani" },
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
      <div
        className="relative py-24 bg-cover bg-center"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1200&auto=format&fit=crop&q=80')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/85 to-emerald-900/70" />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-4">Tentang Kami</h1>
          <p className="text-white/80 text-lg max-w-2xl mx-auto">
            Sport Center SHIA adalah pusat olahraga modern yang didedikasikan untuk mendukung gaya hidup aktif dan sehat masyarakat kawasan Bandara Soekarno-Hatta.
          </p>
        </div>
      </div>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {[
              { icon: Target, title: "Misi Kami", color: "text-blue-600", bg: "bg-blue-50", content: "Menyediakan fasilitas olahraga berkualitas tinggi yang terjangkau dan mudah diakses oleh seluruh lapisan masyarakat di kawasan bandara dan sekitarnya." },
              { icon: Eye, title: "Visi Kami", color: "text-emerald-600", bg: "bg-emerald-50", content: "Menjadi pusat olahraga terkemuka di Indonesia yang dikenal atas kualitas fasilitas, pelayanan prima, dan kontribusi nyata terhadap gaya hidup sehat masyarakat." },
              { icon: Heart, title: "Nilai Kami", color: "text-rose-500", bg: "bg-rose-50", content: "Integritas, pelayanan tulus, dan komitmen terhadap kualitas adalah fondasi kami. Kami percaya olahraga bukan hanya fisik — ia membangun karakter dan komunitas." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="p-6 rounded-xl border border-slate-100 hover:shadow-md transition-all">
                  <div className={`w-12 h-12 ${item.bg} rounded-xl flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${item.color}`} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-3">{item.title}</h3>
                  <p className="text-slate-500 leading-relaxed text-sm">{item.content}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              { icon: Award, value: "10+", label: "Tahun Pengalaman", color: "text-blue-600" },
              { icon: Users, value: "2K+", label: "Member Aktif", color: "text-emerald-600" },
              { icon: Calendar, value: "6+", label: "Jenis Fasilitas", color: "text-orange-500" },
              { icon: Heart, value: "4.8", label: "Rating Rata-rata", color: "text-rose-500" },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="bg-white rounded-xl p-6 text-center shadow-md hover:shadow-lg transition-all">
                  <Icon className={`w-8 h-8 ${stat.color} mx-auto mb-3`} />
                  <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
                  <p className="text-slate-500 text-sm mt-1">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-slate-800">Perjalanan Kami</h2>
            <p className="text-slate-500 mt-2">Lebih dari satu dekade melayani komunitas olahraga</p>
          </div>
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-600 to-emerald-500 hidden sm:block" />
            <div className="space-y-6">
              {milestones.map((m, idx) => (
                <div key={idx} className="flex gap-5 items-start sm:pl-4">
                  <div className="relative z-10 w-12 h-12 shrink-0 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-full flex items-center justify-center shadow-md">
                    <span className="text-white text-xs font-black">{m.year.slice(2)}</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 flex-1">
                    <span className="text-blue-600 font-bold text-sm">{m.year}</span>
                    <p className="text-slate-700 mt-0.5">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-slate-800">Tim Kami</h2>
            <p className="text-slate-500 mt-2">Profesional berpengalaman yang siap melayani Anda</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {team.map((member) => (
              <div key={member.name} className="bg-white rounded-xl p-6 text-center shadow-md hover:shadow-lg transition-all hover:scale-[1.02]">
                <img src={member.avatar} alt={member.name} className="w-20 h-20 rounded-full mx-auto mb-4 bg-slate-100" />
                <p className="font-bold text-slate-800">{member.name}</p>
                <p className="text-blue-600 text-sm mt-1">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
