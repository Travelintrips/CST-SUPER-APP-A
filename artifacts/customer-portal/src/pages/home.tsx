import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { Globe, ShieldCheck, Clock, Package, CheckCircle2, Mail, Phone, MapPin, ArrowRight, Ship, FileCheck, Truck, Sparkles, Calculator, Tag, ChevronRight, Star, X, ShoppingCart } from "lucide-react";
import { assetUrl } from "@/lib/utils";
import { useEditMode } from "@/contexts/EditModeContext";
import { EditableText } from "@/components/EditableText";
import { EditableImage } from "@/components/EditableImage";
import { useLanguage } from "@/i18n/LanguageContext";
import { CART_KEY } from "@/lib/logistic-cart";

export default function Home() {
  const { data: company } = useGetPortalCompany({
    query: { queryKey: ["getPortalCompany"] }
  });
  const { content } = useEditMode();
  const { t } = useLanguage();

  const [draftDismissed, setDraftDismissed] = useState(false);
  const [draftCount, setDraftCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch { return 0; }
  });

  useEffect(() => {
    function readCount() {
      try {
        const raw = localStorage.getItem(CART_KEY);
        if (!raw) { setDraftCount(0); return; }
        const parsed = JSON.parse(raw);
        const count = Array.isArray(parsed) ? parsed.length : 0;
        setDraftCount((prev) => {
          if (prev === 0 && count > 0) setDraftDismissed(false);
          return count;
        });
      } catch { setDraftCount(0); }
    }
    window.addEventListener("logistic-cart-change", readCount);
    window.addEventListener("storage", readCount);
    return () => {
      window.removeEventListener("logistic-cart-change", readCount);
      window.removeEventListener("storage", readCount);
    };
  }, []);

  const showDraftBanner = draftCount > 0 && !draftDismissed;

  const stats = [
    { icon: Globe,       valueKey: "stat_countries_value",  defaultVal: "150+",    labelKey: "stat_countries_label",  defaultLabel: t("stats.countries"),  color: "text-sky-500",     bg: "bg-sky-50",     border: "border-sky-100" },
    { icon: ShieldCheck, valueKey: "stat_security_value",   defaultVal: "99.9%",   labelKey: "stat_security_label",   defaultLabel: t("stats.security"),   color: "text-emerald-500", bg: "bg-emerald-50", border: "border-emerald-100" },
    { icon: Package,     valueKey: "stat_shipments_value",  defaultVal: "10.000+", labelKey: "stat_shipments_label",  defaultLabel: t("stats.shipments"),  color: "text-violet-500",  bg: "bg-violet-50",  border: "border-violet-100" },
    { icon: Clock,       valueKey: "stat_support_value",    defaultVal: "24/7",    labelKey: "stat_support_label",    defaultLabel: t("stats.support"),    color: "text-amber-500",   bg: "bg-amber-50",   border: "border-amber-100" },
  ];

  const whyCards = [
    { titleKey: "why.card1Title", descKey: "why.card1Desc", href: "/services" },
    { titleKey: "why.card2Title", descKey: "why.card2Desc", href: "/services" },
    { titleKey: "why.card3Title", descKey: "why.card3Desc", href: "/services" },
    { titleKey: "why.card4Title", descKey: "why.card4Desc", href: "/services" },
    { titleKey: "why.card5Title", descKey: "why.card5Desc", href: "/services" },
    { titleKey: "why.card6Title", descKey: "why.card6Desc", href: "/services" },
  ];

  const aboutPoints = [
    "about.point1",
    "about.point2",
    "about.point3",
    "about.point4",
    "about.point5",
  ];

  const serviceCards = [
    { icon: Ship,        titleKey: "homePromo.services.item1Title", descKey: "homePromo.services.item1Desc", color: "from-sky-500 to-blue-600",     href: "/freight-forwarding" },
    { icon: FileCheck,   titleKey: "homePromo.services.item2Title", descKey: "homePromo.services.item2Desc", color: "from-emerald-500 to-teal-600",  href: "/pabean" },
    { icon: ShieldCheck, titleKey: "homePromo.services.item3Title", descKey: "homePromo.services.item3Desc", color: "from-amber-500 to-orange-600",  href: "/jasa/8" },
    { icon: Truck,       titleKey: "homePromo.services.item4Title", descKey: "homePromo.services.item4Desc", color: "from-rose-500 to-red-600",      href: "/services" },
  ];

  const promoCards = [
    { titleKey: "homePromo.promo.item1Title", descKey: "homePromo.promo.item1Desc", badgeKey: "homePromo.promo.item1Badge", validKey: "homePromo.promo.item1Valid", gradient: "from-sky-500 to-blue-600",     icon: Ship,     href: "/freight-forwarding" },
    { titleKey: "homePromo.promo.item2Title", descKey: "homePromo.promo.item2Desc", badgeKey: "homePromo.promo.item2Badge", validKey: "homePromo.promo.item2Valid", gradient: "from-emerald-500 to-teal-600", icon: FileCheck, href: "/pabean" },
    { titleKey: "homePromo.promo.item3Title", descKey: "homePromo.promo.item3Desc", badgeKey: "homePromo.promo.item3Badge", validKey: "homePromo.promo.item3Valid", gradient: "from-violet-500 to-purple-600", icon: Sparkles, href: "/register" },
  ];

  const testimonials = [
    { nameKey: "testimonials.t1Name", roleKey: "testimonials.t1Role", textKey: "testimonials.t1Text", photoKey: "testimonials.t1Photo", defaultImg: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&h=96&fit=crop&crop=face" },
    { nameKey: "testimonials.t2Name", roleKey: "testimonials.t2Role", textKey: "testimonials.t2Text", photoKey: "testimonials.t2Photo", defaultImg: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=96&h=96&fit=crop&crop=face" },
    { nameKey: "testimonials.t3Name", roleKey: "testimonials.t3Role", textKey: "testimonials.t3Text", photoKey: "testimonials.t3Photo", defaultImg: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=96&h=96&fit=crop&crop=face" },
  ];

  return (
    <div className="flex flex-col min-h-screen">

      {/* H1 tersembunyi untuk SEO — selalu ada di DOM tanpa JS rendering delay */}
      <h1 className="sr-only">CST Logistics — Solusi Ekspor Impor, Freight Forwarding &amp; Logistik Terpadu</h1>

      {/* ── Draft Resume Banner ───────────────────────────────────── */}
      {showDraftBanner && (
        <div className="bg-sky-50 border-b border-sky-200">
          <div className="container px-4 md:px-6 py-2.5 flex items-center gap-3">
            <ShoppingCart className="h-4 w-4 text-sky-600 shrink-0" />
            <p className="text-sm text-sky-800 flex-1">
              Kamu punya <span className="font-semibold">{draftCount} layanan</span> yang belum selesai dipesan.
            </p>
            <Link href="/book">
              <Button size="sm" className="h-7 px-3 text-xs bg-sky-600 hover:bg-sky-700 text-white shrink-0">
                Resume Pesanan →
              </Button>
            </Link>
            <button
              onClick={() => setDraftDismissed(true)}
              aria-label="Tutup"
              className="text-sky-400 hover:text-sky-700 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative w-full h-[90vh] min-h-[640px] flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 z-10"
          style={{ background: "linear-gradient(to top, rgba(2,8,23,0.95) 0%, rgba(2,8,23,0.6) 35%, rgba(2,8,23,0.25) 70%, rgba(2,8,23,0.35) 100%)" }}
        />
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(2,8,23,0.5) 100%)" }}
        />
        <EditableImage
          contentKey="hero_bg"
          defaultSrc={assetUrl("/images/hero-bg.png")}
          alt="Cargo ship at sea"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />

        <div className="container relative z-20 px-5 md:px-6 text-center text-white">
          <div className="flex justify-center mb-7">
            <span className="inline-flex items-center gap-2 py-1.5 px-5 rounded-full backdrop-blur-md bg-white/10 border border-white/20 text-white/90 text-xs sm:text-sm font-medium shadow-lg tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block animate-pulse shrink-0" />
              <EditableText contentKey="hero_tagline" defaultValue={content["hero_tagline"] || t("hero.badge")} />
            </span>
          </div>

          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-extrabold tracking-tight mb-5 max-w-4xl mx-auto leading-[1.08]"
            style={{ textShadow: "0 2px 32px rgba(0,0,0,0.5)" }}
          >
            <EditableText contentKey="hero_title" defaultValue={content["hero_title"] || t("hero.title")} as="span" multiline />
          </h1>

          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-sky-400 opacity-80" />
            <div className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
            <div className="h-px w-10 bg-gradient-to-l from-transparent to-sky-400 opacity-80" />
          </div>

          <p className="text-base sm:text-lg md:text-xl text-slate-300 mb-10 max-w-xl mx-auto leading-relaxed">
            <EditableText contentKey="hero_subtitle" defaultValue={content["hero_subtitle"] || t("hero.description")} multiline />
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="#layanan">
              <Button size="lg" className="w-full sm:w-auto bg-sky-500 hover:bg-sky-400 text-white h-14 px-10 text-base gap-2 rounded-xl font-bold shadow-[0_0_28px_rgba(14,165,233,0.55)] hover:shadow-[0_0_42px_rgba(14,165,233,0.75)] transition-all duration-300">
                {t("hero.primaryCta")} <ArrowRight className="h-5 w-5" />
              </Button>
            </a>
            <Link href="/register">
              <Button size="lg" variant="outline" className="w-full sm:w-auto backdrop-blur-md bg-white/8 border-white/30 text-white hover:bg-white/15 h-14 px-10 text-base rounded-xl font-semibold transition-all duration-300">
                {t("hero.secondaryCta")}
              </Button>
            </Link>
          </div>
        </div>

        <button
          aria-label="Scroll down"
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 text-white/50 hover:text-white/90 transition-colors duration-300 cursor-pointer"
          onClick={() => window.scrollBy({ top: window.innerHeight * 0.85, behavior: "smooth" })}
        >
          <span className="text-[9px] tracking-[0.2em] uppercase font-bold">Scroll</span>
          <ChevronRight className="h-5 w-5 rotate-90 animate-bounce" />
        </button>
      </section>

      {/* ── Trust Signals ────────────────────────────────────────── */}
      <section className="py-16 bg-gradient-to-b from-slate-50 to-white">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {stats.map(({ icon: Icon, valueKey, defaultVal, labelKey, defaultLabel, color, bg, border }) => (
              <div key={valueKey} className={`text-center p-7 rounded-2xl bg-white border ${border} shadow-sm hover:shadow-md transition-all duration-200`}>
                <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center mx-auto mb-4`}>
                  <Icon className={`h-7 w-7 ${color}`} />
                </div>
                <div className={`font-display font-bold text-4xl ${color} mb-1`}>
                  <EditableText contentKey={valueKey} defaultValue={defaultVal} />
                </div>
                <p className="text-sm font-medium text-slate-500 mt-1">
                  <EditableText contentKey={labelKey} defaultValue={defaultLabel} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Partner Carrier Logos ─────────────────────────────────── */}
      <section className="py-10 bg-slate-900 overflow-hidden">
        <div className="container px-4 md:px-6">
          <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-8">
            <EditableText contentKey="partners_label" defaultValue={t("partners.label")} />
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-5">
            {[
              { name: "MAERSK",      color: "#42B0D5", key: "partner_1" },
              { name: "MSC",         color: "#F7A81B", key: "partner_2" },
              { name: "CMA CGM",     color: "#E63946", key: "partner_3" },
              { name: "COSCO",       color: "#2196F3", key: "partner_4" },
              { name: "Hapag-Lloyd", color: "#F37021", key: "partner_5" },
              { name: "ONE",         color: "#E91E8C", key: "partner_6" },
              { name: "Evergreen",   color: "#2E7D32", key: "partner_7" },
              { name: "DHL",         color: "#FFCC00", key: "partner_8" },
            ].map(({ name, color, key }) => (
              <div
                key={key}
                className="px-5 py-2 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
                style={{ borderLeftColor: color, borderLeftWidth: 3 }}
              >
                <span className="text-slate-200 font-bold text-sm tracking-wide">
                  <EditableText contentKey={key + "_name"} defaultValue={name} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Layanan Populer ──────────────────────────────────────── */}
      <section id="layanan" className="py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="container px-4 md:px-6 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="inline-block px-3 py-1 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs font-semibold uppercase tracking-widest mb-4">
              <EditableText contentKey="homePromo.services.label" defaultValue={t("homePromo.services.label")} />
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              <EditableText contentKey="homePromo.services.title" defaultValue={t("homePromo.services.title")} />
            </h2>
            <p className="text-slate-300 text-lg leading-relaxed">
              <EditableText contentKey="homePromo.services.desc" defaultValue={t("homePromo.services.desc")} multiline />
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {serviceCards.map(({ icon: Icon, titleKey, descKey, color, href }) => (
              <Link key={titleKey} href={href}>
                <div className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-5 shadow-lg`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-display font-bold text-lg mb-2 text-white">
                    <EditableText contentKey={titleKey} defaultValue={t(titleKey)} />
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed group-hover:text-slate-300 transition-colors">
                    <EditableText contentKey={descKey} defaultValue={t(descKey)} multiline />
                  </p>
                </div>
              </Link>
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
              <EditableText contentKey="homePromo.promo.label" defaultValue={t("homePromo.promo.label")} />
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              <EditableText contentKey="homePromo.promo.title" defaultValue={t("homePromo.promo.title")} />
            </h2>
            <p className="text-muted-foreground text-lg">
              <EditableText contentKey="homePromo.promo.desc" defaultValue={t("homePromo.promo.desc")} multiline />
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {promoCards.map(({ titleKey, descKey, badgeKey, validKey, gradient, icon: Icon, href }) => (
              <Link key={titleKey} href={href}>
                <div className="group relative rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full">
                  <div className={`h-2 bg-gradient-to-r ${gradient}`} />
                  <div className="p-8">
                    <div className="flex items-start justify-between mb-5">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${gradient} text-white shadow-sm`}>
                        <EditableText contentKey={badgeKey} defaultValue={t(badgeKey)} />
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-xl mb-3">
                      <EditableText contentKey={titleKey} defaultValue={t(titleKey)} />
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                      <EditableText contentKey={descKey} defaultValue={t(descKey)} multiline />
                    </p>
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-gray-50 rounded-lg px-3 py-2">
                      <Tag className="h-3.5 w-3.5" />
                      <EditableText contentKey={validKey} defaultValue={t(validKey)} />
                    </div>
                  </div>
                </div>
              </Link>
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
                  <EditableText contentKey="calculator.title" defaultValue={t("calculator.title")} />
                </h3>
                <p className="text-slate-600 text-sm">
                  <EditableText contentKey="calculator.desc" defaultValue={t("calculator.desc")} multiline />
                </p>
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
                <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">
                  <EditableText contentKey="about.label" defaultValue={t("about.label")} />
                </p>
                <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                  <EditableText contentKey="about.title" defaultValue={t("about.title")} />
                </h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  <EditableText contentKey="about.description" defaultValue={`${company?.name || "PT. Cahaya Sejati Teknologi"} ${t("about.description")}`} multiline />
                </p>
              </div>

              <ul className="space-y-5">
                {aboutPoints.map((key) => (
                  <li key={key} className="flex gap-4 items-start">
                    <CheckCircle2 className="h-6 w-6 text-accent shrink-0 mt-0.5" />
                    <span className="text-base font-medium">
                      <EditableText contentKey={key} defaultValue={t(key)} />
                    </span>
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
          <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">
            <EditableText contentKey="why.label" defaultValue={t("why.label")} />
          </p>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            <EditableText contentKey="why.title" defaultValue={t("why.title")} />
          </h2>
          <p className="text-muted-foreground text-lg">
            <EditableText contentKey="why.description" defaultValue={t("why.description")} multiline />
          </p>
        </div>

        <div className="container px-4 md:px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {whyCards.map(({ titleKey, descKey, href }) => (
              <Link key={titleKey} href={href}>
                <div className="group bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 cursor-pointer h-full">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-5 group-hover:bg-accent/20 transition-colors">
                    <CheckCircle2 className="h-5 w-5 text-accent" />
                  </div>
                  <h3 className="font-display font-bold text-xl mb-3 group-hover:text-accent transition-colors">
                    <EditableText contentKey={titleKey} defaultValue={t(titleKey)} />
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    <EditableText contentKey={descKey} defaultValue={t(descKey)} multiline />
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────── */}
      <section className="py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="container px-4 md:px-6 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="inline-block px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-semibold uppercase tracking-widest mb-4">
              <EditableText contentKey="testimonials.label" defaultValue={t("testimonials.label")} />
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              <EditableText contentKey="testimonials.title" defaultValue={t("testimonials.title")} />
            </h2>
            <p className="text-slate-300 text-lg leading-relaxed">
              <EditableText contentKey="testimonials.desc" defaultValue={t("testimonials.desc")} multiline />
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-7">
            {testimonials.map(({ nameKey, roleKey, textKey, photoKey, defaultImg }) => (
              <div
                key={nameKey}
                className="bg-white/5 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-2xl p-8 flex flex-col transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex gap-0.5 mb-5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-slate-300 leading-relaxed italic flex-1 mb-7">
                  &ldquo;<EditableText contentKey={textKey} defaultValue={t(textKey)} multiline />&rdquo;
                </p>
                <div className="flex items-center gap-4 pt-5 border-t border-white/10">
                  <img src={content[photoKey] || defaultImg} alt={t(nameKey)} className="w-12 h-12 rounded-full object-cover ring-2 ring-sky-400/40" />
                  <div>
                    <p className="font-semibold text-white text-sm">
                      <EditableText contentKey={nameKey} defaultValue={t(nameKey)} />
                    </p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      <EditableText contentKey={roleKey} defaultValue={t(roleKey)} />
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundImage: [
            "linear-gradient(90deg, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.48) 45%, rgba(14,165,233,0.28) 100%)",
            `url(${assetUrl("/images/warehouse.png")})`,
          ].join(", "),
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          padding: "clamp(100px, 12vw, 140px) 0",
          borderTop: "1px solid rgba(255,255,255,0.10)",
          borderBottom: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 90px 16px rgba(11,29,50,0.45)" }} />

        <div className="relative z-10 px-4 md:px-6 mx-auto text-center" style={{ maxWidth: "900px" }}>
          <h2
            className="font-display mb-6"
            style={{ fontWeight: 800, fontSize: "clamp(42px, 5vw, 68px)", lineHeight: 1.08, letterSpacing: "-0.04em", color: "#ffffff", textShadow: "0 6px 24px rgba(15,23,42,0.45)" }}
          >
            <EditableText contentKey="cta.title" defaultValue={t("cta.title")} multiline />
          </h2>

          <p
            className="mx-auto"
            style={{ fontSize: "clamp(18px, 2vw, 22px)", lineHeight: 1.65, fontWeight: 500, maxWidth: "760px", margin: "0 auto 40px", color: "rgba(255,255,255,0.92)", textShadow: "0 4px 14px rgba(15,23,42,0.35)" }}
          >
            <EditableText contentKey="cta.description" defaultValue={`${t("cta.prefix")} ${t("cta.description")} ${company?.name || "CST Logistics"}. ${t("cta.suffix")}`} multiline />
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="w-full sm:w-auto">
              <button
                className="inline-flex items-center justify-center gap-2 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                style={{ background: "#0F172A", color: "#ffffff", borderRadius: "16px", padding: "15px 28px", fontSize: "16px", fontWeight: 700, letterSpacing: "-0.01em", border: "none", cursor: "pointer", boxShadow: "0 16px 35px rgba(15,23,42,0.30)", transition: "transform 0.22s ease, box-shadow 0.22s ease", whiteSpace: "nowrap" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 22px 44px rgba(15,23,42,0.45)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 16px 35px rgba(15,23,42,0.30)"; }}
              >
                {t("cta.primaryBtn")} <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
            <a href="#kontak" className="w-full sm:w-auto">
              <button
                className="inline-flex items-center justify-center w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.38)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", color: "#ffffff", borderRadius: "16px", padding: "15px 28px", fontSize: "16px", fontWeight: 700, letterSpacing: "-0.01em", cursor: "pointer", transition: "background 0.22s ease, border-color 0.22s ease", whiteSpace: "nowrap" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.24)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.62)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.14)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.38)"; }}
              >
                {t("cta.secondaryBtn")}
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Kontak ───────────────────────────────────────────────── */}
      <section id="kontak" className="py-24 bg-white scroll-mt-20">
        <div className="container px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">
                <EditableText contentKey="contact.label" defaultValue={t("contact.label")} />
              </p>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
                <EditableText contentKey="contact.title" defaultValue={t("contact.title")} />
              </h2>
              <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
                <EditableText contentKey="contact.description" defaultValue={t("contact.description")} multiline />
              </p>

              <ul className="space-y-6">
                <li className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-accent" />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="font-semibold mb-0.5">
                        <EditableText contentKey="address_jakarta_label" defaultValue="Kantor Jakarta" />
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        <EditableText contentKey="address_jakarta" defaultValue={"Jln. Ternate No. 10B/C\nJakarta, Indonesia 10150"} multiline />
                      </p>
                      <a href="https://www.google.com/maps?q=Jln+Ternate+No+10B/C+Jakarta+Indonesia+10150" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-accent hover:underline">
                        Lihat di Maps ↗
                      </a>
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">
                        <EditableText contentKey="address_tangerang_label" defaultValue="Kantor Tangerang" />
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        <EditableText contentKey="address_tangerang" defaultValue={"Sport Center Soekarno Hatta\nJl. C3 No. 831 RT 001 RW 010\nBelakang Masjid Nurul Barkah\nPajang Benda, Tangerang Kota\nBanten 15126"} multiline />
                      </p>
                      <a href="https://www.google.com/maps?q=Sport+Center+Soekarno+Hatta+Jl+C3+No+831+Pajang+Benda+Tangerang+Banten" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-accent hover:underline">
                        Lihat di Maps ↗
                      </a>
                    </div>
                  </div>
                </li>
                {company?.email && (
                  <li className="flex gap-4 items-center">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <Mail className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold mb-0.5">{t("contact.emailLabel")}</p>
                      <a href={`mailto:${company.email}`} className="text-accent hover:underline">{company.email}</a>
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
                      <a href={`tel:${company.phone}`} className="text-accent hover:underline">{company.phone}</a>
                    </div>
                  </li>
                )}
                {!company?.email && !company?.phone && (
                  <>
                    <li className="flex gap-4 items-center">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                        <Mail className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-semibold mb-0.5">{t("contact.emailLabel")}</p>
                        <p className="text-muted-foreground">
                          <EditableText contentKey="contact_email" defaultValue={content["contact_email"] || "info@cstlogistic.co.id"} />
                        </p>
                      </div>
                    </li>
                    <li className="flex gap-4 items-center">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                        <Phone className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="font-semibold mb-0.5">{t("contact.phoneLabel")}</p>
                        <p className="text-muted-foreground">
                          <EditableText contentKey="contact_phone" defaultValue={content["contact_phone"] || "+62 21 1234 5678"} />
                        </p>
                      </div>
                    </li>
                  </>
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
                    <input type="text" required placeholder={t("contact.namePlaceholder")} className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t("contact.email")}</label>
                    <input type="email" required placeholder="you@company.com" className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t("contact.company")}</label>
                  <input type="text" placeholder={t("contact.companyPlaceholder")} className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40" />
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
                  <textarea rows={4} placeholder={t("contact.messagePlaceholder")} className="w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none" />
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
