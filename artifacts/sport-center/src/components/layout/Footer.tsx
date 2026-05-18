import { Link } from "react-router-dom";
import { Dumbbell, MapPin, Phone, Mail, Instagram, Facebook, Youtube } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-lg flex items-center justify-center">
                <Dumbbell className="w-5 h-5 text-white" />
              </div>
              <span className="text-white font-bold text-lg">Sport Center SHIA</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              Fasilitas olahraga premium di kawasan Bandara Internasional Soekarno-Hatta. Tempat terbaik untuk gaya hidup aktif dan sehat.
            </p>
            <div className="flex gap-3 mt-4">
              <a href="#" className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors">
                <Facebook className="w-4 h-4" />
              </a>
              <a href="#" className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors">
                <Youtube className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Menu</h3>
            <ul className="space-y-2 text-sm">
              {[
                { to: "/sport-center/", label: "Beranda" },
                { to: "/sport-center/facilities", label: "Fasilitas" },
                { to: "/sport-center/schedule", label: "Jadwal" },
                { to: "/sport-center/booking", label: "Booking" },
                { to: "/sport-center/about", label: "Tentang Kami" },
                { to: "/sport-center/contact", label: "Kontak" },
              ].map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-blue-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Fasilitas</h3>
            <ul className="space-y-2 text-sm">
              {["Lapangan Futsal", "Lapangan Badminton", "Lapangan Tenis", "Lapangan Basket", "Kolam Renang", "Fitness & Gym"].map((f) => (
                <li key={f}>
                  <Link to="/sport-center/facilities" className="hover:text-blue-400 transition-colors">
                    {f}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Kontak</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3">
                <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>Kawasan Bandara Soekarno-Hatta, Tangerang, Banten 19110</span>
              </li>
              <li className="flex gap-3">
                <Phone className="w-4 h-4 text-blue-400 shrink-0" />
                <span>+62 21 5550 1234</span>
              </li>
              <li className="flex gap-3">
                <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                <span>info@sportcentershia.id</span>
              </li>
            </ul>
            <div className="mt-4 text-sm">
              <p className="text-slate-400">Jam Operasional:</p>
              <p className="text-white font-medium">Senin – Minggu: 06:00 – 22:00</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-sm text-slate-500">
          <p>© 2025 Sport Center SHIA. All rights reserved.</p>
          <p>Dikembangkan untuk kawasan Bandara Soekarno-Hatta</p>
        </div>
      </div>
    </footer>
  );
}
