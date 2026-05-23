import { useEffect, useState } from "react";
import { useParams } from "wouter";

export default function ShortLinkRedirect() {
  const { code } = useParams<{ code: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/q/${code}`)
      .then(async (r) => {
        if (r.redirected) {
          window.location.replace(r.url);
          return;
        }
        if (r.status === 404) {
          setError("Link tidak ditemukan atau sudah kedaluwarsa.");
          return;
        }
        const data = await r.json().catch(() => null);
        if (data?.targetUrl) {
          window.location.replace(data.targetUrl);
        } else {
          setError("Link tidak valid.");
        }
      })
      .catch(() => setError("Terjadi kesalahan jaringan."));
  }, [code]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Link Tidak Valid</h2>
          <p className="text-sm text-slate-500">{error}</p>
          <p className="text-xs text-slate-400 mt-3">
            Hubungi tim CST Logistics untuk mendapatkan link baru.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <div className="h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Mengalihkan...</span>
      </div>
    </div>
  );
}
