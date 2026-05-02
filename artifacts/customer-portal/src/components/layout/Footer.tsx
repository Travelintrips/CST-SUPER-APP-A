import { Link } from "wouter";
import { Mail, MapPin, Phone } from "lucide-react";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { useLanguage } from "@/i18n/LanguageContext";

export function Footer() {
  const { data: company } = useGetPortalCompany({
    query: { queryKey: ["getPortalCompany"] }
  });
  const { t } = useLanguage();

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">

          <div className="md:col-span-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0 bg-white/95 rounded-xl p-1.5 shadow-sm">
                <img
                  src={`${import.meta.env.BASE_URL}images/logo.png`}
                  alt="Logo"
                  className="h-9 w-auto object-contain"
                  style={{ maxWidth: "120px" }}
                />
              </div>
              <span className="font-display font-bold text-xl">
                {company?.name || "CST"}
              </span>
            </div>
            <p className="text-primary-foreground/70 text-sm leading-relaxed max-w-xs">
              {company?.tagline || t("footer.tagline")}
            </p>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-lg">{t("footer.quickLinks")}</h4>
            <ul className="space-y-2 text-sm text-primary-foreground/70">
              <li><Link href="/" className="hover:text-accent transition-colors">{t("footer.home")}</Link></li>
              <li><Link href="/services" className="hover:text-accent transition-colors">{t("footer.services")}</Link></li>
              <li><Link href="/login" className="hover:text-accent transition-colors">{t("footer.portal")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-lg">{t("footer.services")}</h4>
            <ul className="space-y-2 text-sm text-primary-foreground/70">
              <li>{t("footer.seaFreight")}</li>
              <li>{t("footer.airFreight")}</li>
              <li>{t("footer.customs")}</li>
              <li>{t("footer.domestic")}</li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-4 text-lg">{t("footer.contactUs")}</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/70">
              <li className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-accent shrink-0" />
                <span>{company?.address || "Jakarta, Indonesia"}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-accent shrink-0" />
                <span>{company?.phone || "+62 800 0000 0000"}</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-accent shrink-0" />
                <span>{company?.email || "info@cstlogistic.com"}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-primary-foreground/10 text-center text-sm text-primary-foreground/50">
          <p>&copy; {new Date().getFullYear()} {company?.name || "PT. Cahaya Sejati Teknologi"}. {t("footer.allRights")}</p>
        </div>
      </div>
    </footer>
  );
}
