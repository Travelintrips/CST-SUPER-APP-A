import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Halaman callback OAuth Supabase untuk popup BizPortal.
 * Supabase redirect ke sini setelah Google OAuth selesai (implicit flow → hash).
 * Halaman ini mengambil token dari sesi Supabase lalu postMessage ke parent dan close.
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!supabase) {
      setStatus("error");
      try { window.opener?.postMessage("auth:error", "*"); } catch {}
      window.close();
      return;
    }

    let done = false;

    function sendAndClose(accessToken: string) {
      if (done) return;
      done = true;
      try {
        window.opener?.postMessage({ type: "supabase-auth", access_token: accessToken }, "*");
      } catch {}
      setStatus("success");
      setTimeout(() => window.close(), 500);
    }

    function sendError() {
      if (done) return;
      done = true;
      try { window.opener?.postMessage("auth:error", "*"); } catch {}
      setStatus("error");
      setTimeout(() => window.close(), 1000);
    }

    // Cek session yang mungkin sudah ter-detect otomatis dari hash URL (implicit flow)
    supabase!.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        sendAndClose(session.access_token);
        return;
      }

      // Fallback: tunggu event SIGNED_IN dari Supabase (implicit flow parse hash async)
      const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session?.access_token) {
          sendAndClose(session.access_token);
          subscription.unsubscribe();
        }
      });

      // Timeout 15 detik
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        sendError();
      }, 15_000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        {status === "loading" && (
          <>
            <div className="h-7 w-7 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Memproses login Google...</p>
          </>
        )}
        {status === "success" && (
          <p className="text-sm text-green-600">Login berhasil. Menutup tab...</p>
        )}
        {status === "error" && (
          <p className="text-sm text-destructive">Login gagal. Tutup tab ini dan coba lagi.</p>
        )}
      </div>
    </div>
  );
}
