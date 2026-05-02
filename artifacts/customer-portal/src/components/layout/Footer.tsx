import { Link } from "wouter";
import { Mail, MapPin, Phone, MessageCircle } from "lucide-react";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { useLanguage } from "@/i18n/LanguageContext";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  return "62" + digits;
}

const FOOTER_STYLE: React.CSSProperties = {
  background: "linear-gradient(150deg, #0F172A 0%, #1E293B 50%, #0C4A6E 100%)",
};

const DIVIDER: React.CSSProperties = {
  borderColor: "rgba(255,255,255,0.12)",
};

const linkCls =
  "text-white/70 hover:text-white hover:translate-x-1 transition-all duration-200 inline-block text-sm leading-relaxed";

export function Footer() {
  const { data: company } = useGetPortalCompany({
    query: { queryKey: ["getPortalCompany"] },
  });
  const { t } = useLanguage();

  const brandName = company?.name
    ? company.name.length > 24
      ? "CST Logistics"
      : company.name
    : "CST Logistics";

  const phone = company?.phone ? normalizePhone(company.phone) : null;
  const waHref = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(t("footer.waMessage"))}`
    : null;
  const mapsHref = company?.address
    ? `https://maps.google.com/?q=${encodeURIComponent(company.address)}`
    : null;

  return (
    <footer style={FOOTER_STYLE} className="text-white">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 pt-16 pb-10">

        {/* ── 4-column grid ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">

          {/* Col 1 — Brand */}
          <div className="space-y-5 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="shrink-0 bg-white/95 rounded-xl p-1.5 shadow-md">
                <img
                  src={`${import.meta.env.BASE_URL}images/logo.png`}
                  alt="Logo"
                  className="h-[48px] w-auto object-contain"
                  style={{ maxWidth: "120px" }}
                />
              </div>
              <span className="font-bold text-[16px] leading-tight tracking-tight text-white whitespace-nowrap">
                {brandName}
              </span>
            </div>
            <p className="text-white/65 text-sm leading-relaxed max-w-[260px]">
              {t("footer.description")}
            </p>

            {/* Social / WA quick link */}
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#25D366]/20 hover:bg-[#25D366]/35 border border-[#25D366]/40 text-[#4ADE80] text-sm font-medium transition-all duration-200"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            )}
          </div>

          {/* Col 2 — Quick Links */}
          <div className="space-y-5">
            <h4 className="text-white font-semibold text-[15px] tracking-wide">
              {t("footer.quickLinks")}
            </h4>
            <ul className="space-y-3">
              {[
                { label: t("footer.home"), href: "/" },
                { label: t("footer.about"), href: "/#tentang" },
                { label: t("footer.calculator"), href: "/calculator" },
                { label: t("footer.track"), href: "/track" },
                { label: t("footer.customerPortal"), href: "/login" },
              ].map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className={linkCls}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Services */}
          <div className="space-y-5">
            <h4 className="text-white font-semibold text-[15px] tracking-wide">
              {t("footer.servicesTitle")}
            </h4>
            <ul className="space-y-3">
              {[
                { label: t("footer.seaFreight"), href: "/freight-forwarding" },
                { label: t("footer.airFreight"), href: "/freight-forwarding" },
                { label: t("footer.customsBrokerage"), href: "/pabean" },
                { label: t("footer.domesticDistribution"), href: "/jasa" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className={linkCls}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4 — Contact */}
          <div className="space-y-5">
            <h4 className="text-white font-semibold text-[15px] tracking-wide">
              {t("footer.contactUs")}
            </h4>
            <ul className="space-y-4">
              {/* Address */}
              {(company?.address || true) && (
                <li>
                  {mapsHref ? (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 text-white/70 hover:text-white transition-colors duration-200 group"
                    >
                      <MapPin className="h-5 w-5 text-sky-400 shrink-0 mt-0.5 group-hover:text-sky-300 transition-colors" />
                      <span className="text-sm leading-relaxed">
                        {company?.address || "Jakarta, Indonesia"}
                      </span>
                    </a>
                  ) : (
                    <div className="flex items-start gap-3 text-white/70">
                      <MapPin className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
                      <span className="text-sm leading-relaxed">
                        {company?.address || "Jakarta, Indonesia"}
                      </span>
                    </div>
                  )}
                </li>
              )}

              {/* Phone / WhatsApp */}
              {(company?.phone || true) && (
                <li>
                  <a
                    href={waHref ?? `tel:${company?.phone ?? "+6280000000000"}`}
                    target={waHref ? "_blank" : undefined}
                    rel={waHref ? "noopener noreferrer" : undefined}
                    className="flex items-center gap-3 text-white/70 hover:text-white transition-colors duration-200 group"
                  >
                    <Phone className="h-5 w-5 text-sky-400 shrink-0 group-hover:text-sky-300 transition-colors" />
                    <span className="text-sm">
                      {company?.phone || "+62 800 0000 0000"}
                    </span>
                  </a>
                </li>
              )}

              {/* Email */}
              {(company?.email || true) && (
                <li>
                  <a
                    href={`mailto:${company?.email ?? "info@cstlogistic.com"}`}
                    className="flex items-center gap-3 text-white/70 hover:text-white transition-colors duration-200 group"
                  >
                    <Mail className="h-5 w-5 text-sky-400 shrink-0 group-hover:text-sky-300 transition-colors" />
                    <span className="text-sm">
                      {company?.email || "info@cstlogistic.com"}
                    </span>
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* ── Copyright ──────────────────────────────────────────── */}
        <div
          className="mt-12 pt-6 text-center"
          style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}
        >
          <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.50)" }}>
            &copy; {new Date().getFullYear()} {company?.name || "PT. Cahaya Sejati Teknologi"}.{" "}
            {t("footer.copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}
