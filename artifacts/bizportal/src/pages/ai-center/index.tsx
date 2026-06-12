import { AppShell } from "@/components/layout/AppShell";
import { ModuleHub } from "@/components/layout/ModuleHub";
import {
  Bot, ShieldAlert, ShieldCheck, Brain, Layers, BookOpen, ScanLine,
} from "lucide-react";

export default function AiCenterHubPage() {
  return (
    <AppShell>
      <ModuleHub
        moduleIcon={Bot}
        moduleName="AI Center"
        moduleDesc="Kecerdasan buatan, otomatisasi, dan pengambilan keputusan berbasis data"
        cards={[
          {
            href: "/intelligence-alerts",
            icon: ShieldAlert,
            title: "Intelligence Alerts",
            desc: "Peringatan otomatis dari sistem AI untuk anomali dan risiko",
            accent: "bg-red-500/10 text-red-600 group-hover:bg-red-500/20",
          },
          {
            href: "/ai-approvals",
            icon: ShieldCheck,
            title: "AI Approval Queue",
            desc: "Antrean persetujuan yang direkomendasikan AI",
            accent: "bg-amber-500/10 text-amber-600 group-hover:bg-amber-500/20",
          },
          {
            href: "/ai/decision-memory",
            icon: Brain,
            title: "Decision Memory",
            desc: "Riwayat keputusan yang dipelajari oleh AI",
            accent: "bg-purple-500/10 text-purple-600 group-hover:bg-purple-500/20",
          },
          {
            href: "/operational-context",
            icon: Layers,
            title: "Operational Context",
            desc: "Konteks operasional yang digunakan AI dalam analisis",
            accent: "bg-blue-500/10 text-blue-600 group-hover:bg-blue-500/20",
          },
          {
            href: "/settings/ai-chatbot",
            icon: Bot,
            title: "Konfigurasi AI Chatbot",
            desc: "Pengaturan chatbot AI untuk respon otomatis",
          },
          {
            href: "/settings/ai-chatbot/knowledge",
            icon: BookOpen,
            title: "Knowledge Base AI",
            desc: "Basis pengetahuan yang digunakan chatbot AI",
          },
          {
            href: "/settings/ai-scan",
            icon: ScanLine,
            title: "AI Scan & OCR",
            desc: "Pengaturan pemindaian dokumen dan ekstraksi data otomatis",
          },
        ]}
      />
    </AppShell>
  );
}
