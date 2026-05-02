import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { Globe, ShieldCheck, Clock, Package, CheckCircle2, Mail, Phone, MapPin, ArrowRight, Ship, Plane, FileCheck, Warehouse, Sparkles, Calculator, Tag, ChevronRight } from "lucide-react";
import { assetUrl } from "@/lib/utils";
import { useEditMode } from "@/contexts/EditModeContext";
import { EditableText } from "@/components/EditableText";
import { EditableImage } from "@/components/EditableImage";
import { useLanguage } from "@/i18n/LanguageContext";

export default function Home() {
  const { data: company } = useGetPortalCompany({
    query: { queryKey: ["getPortalCompany"] }
  });
  const { content } = useEditMode();
  const { t } = useLanguage();

  const whyCards = [
    { titleKey: "why.card1Title", descKey: "why.card1Desc" },
    { titleKey: "why.card2Title", descKey: "why.card2Desc" },
    { titleKey: "why.card3Title", descKey: "why.card3Desc" },
    { titleKey: "why.card4Title", descKey: "why.card4Desc" },
    { titleKey: "why.card5Title", descKey: "why.card5Desc" },
    { titleKey: "why.card6Title", descKey: "why.card6Desc" },
  ];

  const aboutPoints = [
    "about.point1",
    "about.point2",
    "about.point3",
    "about.point4",
    "about.point5",
  ];

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
            <EditableText contentKey="hero_tagline" defaultValue={content["hero_tagline"] || t("hero.badge")} />
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold tracking-tight mb-6 max-w-4xl mx-auto">
            <EditableText
              contentKey="hero_title"
              defaultValue={content["hero_title"] || t("hero.title")}
              as="span"
              multiline
            />
          </h1>
          <p className="text-lg md:text-xl text-gray-200 mb-10 max-w-2xl mx-auto">
            <EditableText
              contentKey="hero_subtitle"
              defaultValue={content["hero_subtitle"] || t("hero.description")}
              multiline
            />
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/services">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground h-12 px-8 text-base gap-2">
                {t("hero.primaryCta")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white/10 h-12 px-8 text-base">
                {t("hero.secondaryCta")}
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
              { icon: Globe, value: "150+", labelKey: "stats.countries" },
              { icon: ShieldCheck, value: "99.9%", labelKey: "stats.security" },
              { icon: Package, value: "10rb+", labelKey: "stats.shipments" },
              { icon: Clock, value: "24/7", labelKey: "stats.support" },
            ].map(({ icon: Icon, value, labelKey }) => (
              <div key={labelKey} className="flex flex-col items-center justify-center space-y-2 px-4">
                <Icon className="h-8 w-8 text-accent mb-2" />
                <h3 className="font-display font-bold text-2xl">{value}</h3>
                <p className="text-sm text-muted-foreground">{t(labelKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Layanan Populer ──────────────────────────────────────── */}
      <section className="py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="container px-4 md:px-6 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="inline-block px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-semibold uppercase tracking-widest mb-4">
              {t("homePromo.services.label")}
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              {t("homePromo.services.title")}
            </h2>
            <p className="text-slate-300 text-lg leading-relaxed">
              {t("homePromo.services.desc")}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              { icon: Ship, titleKey: "homePromo.services.item1Title", descKey: "homePromo.services.item1Desc", color: "from-sky-500 to-blue-600" },
              { icon: Plane, titleKey: "homePromo.services.item2Title", descKey: "homePromo.services.item2Desc", color: "from-violet-500 to-purple-600" },
              { icon: FileCheck, titleKey: "homePromo.services.item3Title", descKey: "homePromo.services.item3Desc", color: "from-emerald-500 to-teal-600" },
              { icon: Warehouse, titleKey: "homePromo.services.item4Title", descKey: "homePromo.services.item4Desc", color: "from-amber-500 to-orange-600" },
            ].map(({ icon: Icon, titleKey, descKey, color }) => (
              <div
                key={titleKey}
                className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-5 shadow-lg`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-display font-bold text-lg mb-2 text-white">{t(titleKey)}</h3>
                <p className="text-slate-400 text-sm leading-relaxed group-hover:text-slate-300 transition-colors">{t(descKey)}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href="/services">
              <Button size="lg" className="h-12 px-8 gap-2 bg-sky-500 hover:bg-sky-400 text-white border-0 rounded-xl">
                {t("homePromo.services.cta")} <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Promo & Penawaran ─────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="container px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="inline-block px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold uppercase tracking-widest mb-4">
              {t("homePromo.promo.label")}
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              {t("homePromo.promo.title")}
            </h2>
            <p className="text-muted-foreground text-lg">{t("homePromo.promo.desc")}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {[
              {
                titleKey: "homePromo.promo.item1Title",
                descKey: "homePromo.promo.item1Desc",
                badgeKey: "homePromo.promo.item1Badge",
                validKey: "homePromo.promo.item1Valid",
                gradient: "from-sky-500 to-blue-600",
                icon: Ship,
              },
              {
                titleKey: "homePromo.promo.item2Title",
                descKey: "homePromo.promo.item2Desc",
                badgeKey: "homePromo.promo.item2Badge",
                validKey: "homePromo.promo.item2Valid",
                gradient: "from-emerald-500 to-teal-600",
                icon: FileCheck,
              },
              {
                titleKey: "homePromo.promo.item3Title",
                descKey: "homePromo.promo.item3Desc",
                badgeKey: "homePromo.promo.item3Badge",
                validKey: "homePromo.promo.item3Valid",
                gradient: "from-violet-500 to-purple-600",
                icon: Sparkles,
              },
            ].map(({ titleKey, descKey, badgeKey, validKey, gradient, icon: Icon }) => (
              <div
                key={titleKey}
                className="group relative rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className={`h-2 bg-gradient-to-r ${gradient}`} />
                <div className="p-8">
                  <div className="flex items-start justify-between mb-5">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${gradient} text-white shadow-sm`}>
                      {t(badgeKey)}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-xl mb-3">{t(titleKey)}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-5">{t(descKey)}</p>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-gray-50 rounded-lg px-3 py-2">
                    <Tag className="h-3.5 w-3.5" />
                    {t(validKey)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href="/register">
              <Button size="lg" className="h-12 px-8 gap-2 rounded-xl">
                {t("homePromo.promo.cta")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Kalkulator CTA Banner ─────────────────────────────────── */}
      <section className="py-16 bg-gradient-to-r from-sky-50 to-blue-50 border-y border-sky-100">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 max-w-4xl mx-auto">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-sky-600 flex items-center justify-center shadow-lg shrink-0">
                <Calculator className="h-8 w-8 text-white" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-slate-900 mb-1">
                  {t("calculator.title")}
                </h3>
                <p className="text-slate-600 text-sm">{t("calculator.desc")}</p>
              </div>
            </div>
            <Link href="/calculator" className="shrink-0">
              <Button size="lg" className="h-12 px-8 gap-2 bg-sky-600 hover:bg-sky-700 rounded-xl">
                {t("nav.calculator")} <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Tentang Kami ─────────────────────────────────────────── */}
      <section id="tentang" className="py-24 bg-white overflow-hidden scroll-mt-20">
        <div className="container px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div>
                <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">{t("about.label")}</p>
                <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                  {t("about.title")}
                </h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  {company?.name || "PT. Cahaya Sejati Teknologi"} {t("about.description")}
                </p>
              </div>

              <ul className="space-y-5">
                {aboutPoints.map((key) => (
                  <li key={key} className="flex gap-4 items-start">
                    <CheckCircle2 className="h-6 w-6 text-accent shrink-0 mt-0.5" />
                    <span className="text-base font-medium">{t(key)}</span>
                  </li>
                ))}
              </ul>

              <Link href="/register">
                <Button size="lg" className="h-12 px-8 gap-2">
                  {t("about.cta")} <ArrowRight className="h-4 w-4" />
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
          <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">{t("why.label")}</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            {t("why.title")}
          </h2>
          <p className="text-muted-foreground text-lg">
            {t("why.description")}
          </p>
        </div>

        <div className="container px-4 md:px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {whyCards.map(({ titleKey, descKey }) => (
              <div
                key={titleKey}
                className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-5">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-display font-bold text-xl mb-3">{t(titleKey)}</h3>
                <p className="text-muted-foreground leading-relaxed">{t(descKey)}</p>
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
            {t("cta.title")}
          </h2>
          <p className="text-xl text-primary-foreground/80 mb-10">
            {t("cta.prefix")} {t("cta.description")} {company?.name || t("nav.home")}. {t("cta.suffix")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-accent hover:bg-accent/90 text-accent-foreground h-14 px-10 text-lg w-full sm:w-auto gap-2"
              >
                {t("cta.primaryBtn")} <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <a href="#kontak">
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 h-14 px-10 text-lg w-full sm:w-auto"
              >
                {t("cta.secondaryBtn")}
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
              <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">{t("contact.label")}</p>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                {t("contact.title")}
              </h2>
              <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
                {t("contact.description")}
              </p>

              <ul className="space-y-6">
                {company?.address && (
                  <li className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <MapPin className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">{t("contact.addressLabel")}</p>
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
                      <p className="font-semibold mb-0.5">{t("contact.emailLabel")}</p>
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
                      <p className="font-semibold mb-0.5">{t("contact.phoneLabel")}</p>
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
                        <p className="font-semibold mb-0.5">{t("contact.emailLabel")}</p>
                        <p className="text-muted-foreground">{content["contact_email"] || "info@cstlogistic.co.id"}</p>
                      </div>
                    </li>
                    <li className="flex gap-4 items-center">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                        <Phone className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-semibold mb-0.5">{t("contact.phoneLabel")}</p>
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
                      <p className="font-semibold mb-0.5">{t("contact.addressLabel")}</p>
                      <p className="text-muted-foreground whitespace-pre-line">{content["contact_address"]}</p>
                    </div>
                  </li>
                )}
              </ul>
            </div>

            {/* Contact Form */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
              <h3 className="font-display font-bold text-xl mb-6">{t("contact.sendMessage")}</h3>
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  alert(t("contact.successAlert"));
                  (e.target as HTMLFormElement).reset();
                }}
              >
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t("contact.fullName")}</label>
                    <input
                      type="text"
                      required
                      placeholder={t("contact.namePlaceholder")}
                      className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t("contact.email")}</label>
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t("contact.company")}</label>
                  <input
                    type="text"
                    placeholder={t("contact.companyPlaceholder")}
                    className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t("contact.serviceNeed")}</label>
                  <select className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40">
                    <option value="">{t("contact.selectPlaceholder")}</option>
                    <option>{t("contact.optExport")}</option>
                    <option>{t("contact.optImport")}</option>
                    <option>{t("contact.optCustoms")}</option>
                    <option>{t("contact.optWarehouse")}</option>
                    <option>{t("contact.optInternational")}</option>
                    <option>{t("contact.optOther")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t("contact.message")}</label>
                  <textarea
                    rows={4}
                    placeholder={t("contact.messagePlaceholder")}
                    className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                  />
                </div>
                <Button type="submit" className="w-full h-11 gap-2">
                  {t("contact.submit")} <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
