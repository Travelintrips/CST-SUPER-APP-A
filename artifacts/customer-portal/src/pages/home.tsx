import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { Globe, ShieldCheck, Clock, Package, CheckCircle2, Mail, Phone, MapPin, ArrowRight } from "lucide-react";
import { assetUrl } from "@/lib/utils";
import { useEditMode } from "@/contexts/EditModeContext";
import { EditableText } from "@/components/EditableText";
import { EditableImage } from "@/components/EditableImage";

export default function Home() {
  const { data: company } = useGetPortalCompany({
    query: { queryKey: ["getPortalCompany"] }
  });
  const { content } = useEditMode();

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative w-full h-[85vh] min-h-[600px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-black/60 z-10" />
        <EditableImage
          contentKey="hero_bg"
          defaultSrc={assetUrl("/images/hero-bg.png")}
          alt="Cargo ship at sea"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
        <div className="container relative z-20 px-4 md:px-6 text-center text-white">
          <span className="inline-block py-1 px-3 rounded-full bg-accent/20 border border-accent/50 text-accent-foreground text-sm font-medium mb-6">
            <EditableText contentKey="hero_tagline" defaultValue={company?.tagline || "Solusi Logistik Terintegrasi & Berbasis Teknologi"} />
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold tracking-tight mb-6 max-w-4xl mx-auto">
            <EditableText
              contentKey="hero_title"
              defaultValue="Logistik Global, Presisi Tanpa Kompromi."
              as="span"
              multiline
            />
          </h1>
          <p className="text-lg md:text-xl text-gray-200 mb-10 max-w-2xl mx-auto">
            <EditableText
              contentKey="hero_subtitle"
              defaultValue="Solusi ekspor, impor, dan kepabeanan yang andal — menghubungkan bisnis Anda ke seluruh dunia dengan aman dan tepat waktu."
              multiline
            />
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/services">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground h-12 px-8 text-base gap-2">
                <EditableText contentKey="hero_cta" defaultValue="Lihat Layanan" /> <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white/10 h-12 px-8 text-base">
                Daftar sebagai Mitra
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust Signals ────────────────────────────────────────── */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-x divide-gray-100">
            {[
              { icon: Globe, value: "150+", label: "Negara Tujuan" },
              { icon: ShieldCheck, value: "99.9%", label: "Keamanan Kargo" },
              { icon: Package, value: "10rb+", label: "Pengiriman per Bulan" },
              { icon: Clock, value: "24/7", label: "Layanan Pelanggan" },
            ].map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex flex-col items-center justify-center space-y-2 px-4">
                <Icon className="h-8 w-8 text-accent mb-2" />
                <h3 className="font-display font-bold text-2xl">{value}</h3>
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tentang Kami ─────────────────────────────────────────── */}
      <section id="tentang" className="py-24 bg-white overflow-hidden scroll-mt-20">
        <div className="container px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div>
                <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">Tentang Kami</p>
                <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                  Infrastruktur & Keahlian yang Tidak Tertandingi
                </h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  {company?.name || "PT. Cahaya Sejati Teknologi"} adalah perusahaan freight forwarding dan customs brokerage terpercaya yang melayani kebutuhan ekspor-impor korporat maupun UMKM di Indonesia. Kami memiliki tim bersertifikat dan jaringan agen global di lebih dari 150 negara.
                </p>
              </div>

              <ul className="space-y-5">
                {[
                  "Visibilitas rantai pasok dari ujung ke ujung secara real-time",
                  "Tenaga ahli kepabeanan berlisensi untuk pengurusan dokumen cepat",
                  "Fasilitas pergudangan strategis dekat pelabuhan utama",
                  "Account manager dedikasi untuk klien korporat",
                  "Teknologi tracking shipment berbasis cloud",
                ].map((item, i) => (
                  <li key={i} className="flex gap-4 items-start">
                    <CheckCircle2 className="h-6 w-6 text-accent shrink-0 mt-0.5" />
                    <span className="text-base font-medium">{item}</span>
                  </li>
                ))}
              </ul>

              <Link href="/register">
                <Button size="lg" className="h-12 px-8 gap-2">
                  Bergabung Bersama Kami <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="relative pb-12">
              <div className="relative aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl">
                <EditableImage
                  contentKey="about_img1"
                  defaultSrc={assetUrl("/images/port-operations.png")}
                  alt="Operasi Pelabuhan"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -left-6 aspect-square w-2/3 rounded-2xl overflow-hidden shadow-2xl border-4 border-white">
                <EditableImage
                  contentKey="about_img2"
                  defaultSrc={assetUrl("/images/customs.png")}
                  alt="Dokumen Kepabeanan"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Mengapa Pilih Kami ───────────────────────────────────── */}
      <section className="py-24 bg-gray-50">
        <div className="container px-4 md:px-6 text-center max-w-3xl mx-auto mb-16">
          <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">Keunggulan Kami</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            Mengapa Percayakan Logistik kepada Kami?
          </h2>
          <p className="text-muted-foreground text-lg">
            Kami tidak sekadar mengangkut barang — kami memastikan seluruh perjalanan kargo Anda berjalan mulus dari dokumen hingga tiba di tujuan.
          </p>
        </div>

        <div className="container px-4 md:px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "Kepabeanan Ekspres",
                desc: "Tim ahli kami memproses dokumen BC 2.0 / BC 3.0 dengan cepat sehingga kargo tidak tertahan di pelabuhan.",
              },
              {
                title: "Jaringan Global",
                desc: "Agen di lebih dari 150 negara memastikan pengiriman door-to-door ke destinasi manapun di dunia.",
              },
              {
                title: "Teknologi Transparan",
                desc: "Platform berbasis cloud kami memberi visibilitas penuh atas status pengiriman kapan saja dan di mana saja.",
              },
              {
                title: "Asuransi Kargo",
                desc: "Perlindungan komprehensif untuk setiap pengiriman, melindungi investasi bisnis Anda dari risiko tak terduga.",
              },
              {
                title: "Harga Kompetitif",
                desc: "Negosiasi tarif terbaik dengan maskapai dan pelayaran global sehingga biaya logistik Anda lebih efisien.",
              },
              {
                title: "Dukungan 24/7",
                desc: "Tim customer service kami siap membantu kapan pun Anda membutuhkan informasi atau penanganan darurat.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-5">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-display font-bold text-xl mb-3">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10 bg-cover bg-center mix-blend-overlay"
          style={{ backgroundImage: `url(${assetUrl("/images/warehouse.png")})` }}
        />
        <div className="container relative z-10 px-4 md:px-6 text-center max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">
            Siap mempercepat logistik global Anda?
          </h2>
          <p className="text-xl text-primary-foreground/80 mb-10">
            Ribuan pelaku bisnis mempercayakan kargo mereka kepada {company?.name || "kami"}. Bergabunglah dan rasakan perbedaannya.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-accent hover:bg-accent/90 text-accent-foreground h-14 px-10 text-lg w-full sm:w-auto gap-2"
              >
                Buat Akun Gratis <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <a href="#kontak">
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 h-14 px-10 text-lg w-full sm:w-auto"
              >
                Hubungi Sales
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Kontak ───────────────────────────────────────────────── */}
      <section id="kontak" className="py-24 bg-white scroll-mt-20">
        <div className="container px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">Hubungi Kami</p>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                Ada yang bisa kami bantu?
              </h2>
              <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
                Tim kami siap menjawab pertanyaan Anda seputar layanan ekspor-impor, kepabeanan, pergudangan, dan solusi logistik lainnya.
              </p>

              <ul className="space-y-6">
                {company?.address && (
                  <li className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">Alamat Kantor</p>
                      <p className="text-muted-foreground">{company.address}</p>
                    </div>
                  </li>
                )}
                {company?.email && (
                  <li className="flex gap-4 items-center">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <Mail className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">Email</p>
                      <a href={`mailto:${company.email}`} className="text-accent hover:underline">
                        {company.email}
                      </a>
                    </div>
                  </li>
                )}
                {company?.phone && (
                  <li className="flex gap-4 items-center">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <Phone className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">Telepon</p>
                      <a href={`tel:${company.phone}`} className="text-accent hover:underline">
                        {company.phone}
                      </a>
                    </div>
                  </li>
                )}
                {/* Fallback dari konten CMS atau default */}
                {!company?.email && !company?.phone && (
                  <>
                    <li className="flex gap-4 items-center">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                        <Mail className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-semibold mb-0.5">Email</p>
                        <p className="text-muted-foreground">{content["contact_email"] || "info@cstlogistic.co.id"}</p>
                      </div>
                    </li>
                    <li className="flex gap-4 items-center">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                        <Phone className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-semibold mb-0.5">Telepon</p>
                        <p className="text-muted-foreground">{content["contact_phone"] || "+62 21 1234 5678"}</p>
                      </div>
                    </li>
                  </>
                )}
                {content["contact_address"] && (
                  <li className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">Alamat</p>
                      <p className="text-muted-foreground whitespace-pre-line">{content["contact_address"]}</p>
                    </div>
                  </li>
                )}
              </ul>
            </div>

            {/* Contact Form */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
              <h3 className="font-display font-bold text-xl mb-6">Kirim Pesan</h3>
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  alert("Pesan Anda telah terkirim. Tim kami akan segera menghubungi Anda.");
                  (e.target as HTMLFormElement).reset();
                }}
              >
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Nama Lengkap</label>
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Email</label>
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Nama Perusahaan</label>
                  <input
                    type="text"
                    placeholder="PT. Contoh Industri"
                    className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Kebutuhan Layanan</label>
                  <select className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40">
                    <option value="">Pilih layanan...</option>
                    <option>Ekspor</option>
                    <option>Impor</option>
                    <option>Kepabeanan / Customs Clearance</option>
                    <option>Pergudangan</option>
                    <option>Pengiriman Internasional</option>
                    <option>Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Pesan</label>
                  <textarea
                    rows={4}
                    placeholder="Ceritakan kebutuhan logistik Anda..."
                    className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                  />
                </div>
                <Button type="submit" className="w-full h-11 gap-2">
                  Kirim Pesan <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
