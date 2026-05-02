import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      aria-label={t("footer.backToTop")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
      style={{
        position: "fixed",
        bottom: "100px",
        right: "24px",
        zIndex: 50,
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        background: "#0F172A",
        color: "#ffffff",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 16px rgba(15,23,42,0.28)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.25s ease, transform 0.25s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1.1)";
        (e.currentTarget as HTMLElement).style.background = "#1E293B";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = visible ? "translateY(0) scale(1)" : "translateY(12px)";
        (e.currentTarget as HTMLElement).style.background = "#0F172A";
      }}
    >
      <ArrowUp style={{ width: "20px", height: "20px" }} />
    </button>
  );
}
