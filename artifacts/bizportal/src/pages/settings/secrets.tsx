import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, CheckCircle2, XCircle, KeyRound, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SecretEntry {
  key: string;
  label: string;
  description: string;
  configured: boolean;
  masked?: string;
  category: string;
  required: boolean;
}

async function fetchSecrets(): Promise<SecretEntry[]> {
  const res = await fetch("/api/settings/secrets", { credentials: "include" });
  if (!res.ok) throw new Error("Gagal memuat secrets");
  return res.json();
}

const CATEGORIES = [
  { key: "whatsapp", label: "WhatsApp (Fonnte)" },
  { key: "email", label: "Email / SMTP" },
  { key: "portal", label: "Customer Portal" },
  { key: "auth", label: "Autentikasi" },
  { key: "storage", label: "Storage" },
  { key: "other", label: "Lainnya" },
];

export default function SecretsPage() {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const { data: secrets = [], isLoading, isError, refetch } = useQuery<SecretEntry[]>({
    queryKey: ["settings", "secrets"],
    queryFn: fetchSecrets,
  });

  function toggleReveal(key: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: secrets.filter((s) => s.category === cat.key),
  })).filter((g) => g.items.length > 0);

  const totalRequired = secrets.filter((s) => s.required);
  const totalMissing = totalRequired.filter((s) => !s.configured);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <KeyRound className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Secrets & Environment Variables</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Status konfigurasi environment variables sistem
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {!isLoading && totalMissing.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <span>
            <strong>{totalMissing.length} secret wajib</strong> belum dikonfigurasi:{" "}
            {totalMissing.map((s) => s.key).join(", ")}.
            Set via <strong>Replit Secrets</strong> (kunci ikon di sidebar Replit).
          </span>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Memuat...
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat data secrets. Pastikan Anda login sebagai admin.
        </div>
      )}

      {grouped.map((group) => (
        <Card key={group.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{group.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {item.key}
                    </code>
                    {item.required && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        wajib
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  {item.configured && item.masked && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <code className="text-xs font-mono text-foreground">
                        {revealed.has(item.key) ? item.masked : "••••••••••••"}
                      </code>
                      <button
                        onClick={() => toggleReveal(item.key)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title={revealed.has(item.key) ? "Sembunyikan" : "Tampilkan"}
                      >
                        {revealed.has(item.key)
                          ? <EyeOff className="w-3.5 h-3.5" />
                          : <Eye className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  )}
                </div>
                <div className="shrink-0 mt-0.5">
                  {item.configured ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-xs">Aktif</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <XCircle className="w-4 h-4" />
                      <span className="text-xs">Belum diset</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Cara Menambahkan Secret</CardTitle>
          <CardDescription className="text-xs">
            Secrets diset via Replit, bukan melalui UI ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <p>1. Buka panel <strong>Secrets</strong> di sidebar kiri Replit (ikon kunci).</p>
          <p>2. Klik <strong>+ New Secret</strong>, isi nama key dan nilai.</p>
          <p>3. Restart server agar perubahan aktif.</p>
          <p className="text-amber-700">
            ⚠ Jangan pernah hardcode secret di kode sumber atau commit ke Git.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
