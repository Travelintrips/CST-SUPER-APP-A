import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { fetchAndStoreProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { assetUrl } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageContext";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  const [, setLocation] = useLocation();
  const [errorMsg, setErrorMsg] = useState("");
  const returnTo = new URLSearchParams(window.location.search).get("returnTo");
  const { t } = useLanguage();

  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const loginSchema = z.object({
    email: z.string().email({ message: t("login.email") }),
    password: z.string().min(1, { message: t("login.password") }),
  });
  type LoginFormValues = z.infer<typeof loginSchema>;

  const form = useForm<LoginFormValues, unknown, LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setErrorMsg("");
    setIsSubmitting(true);
    if (!supabase) {
      setErrorMsg("Layanan autentikasi tidak tersedia.");
      setIsSubmitting(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      setErrorMsg(error.message);
      setIsSubmitting(false);
      return;
    }
    const profile = await fetchAndStoreProfile();
    if (profile) {
      const rt = new URLSearchParams(window.location.search).get("returnTo");
      if (rt) {
        setLocation(rt);
      } else if (profile.role === "admin") {
        setLocation("/admin");
      } else if (profile.role === "vendor") {
        setLocation("/vendor-dashboard");
      } else {
        setLocation("/dashboard");
      }
    }
    setIsSubmitting(false);
  };

  async function handleForgotPassword() {
    setForgotMsg(null);
    const email = form.getValues("email").trim();

    if (!email) {
      setForgotMsg({ type: "err", text: "Masukkan email terlebih dahulu." });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setForgotMsg({ type: "err", text: "Format email tidak valid." });
      return;
    }

    setForgotLoading(true);
    if (!supabase) {
      setForgotMsg({ type: "err", text: "Layanan autentikasi tidak tersedia." });
      setForgotLoading(false);
      return;
    }
    const redirectTo = `${window.location.origin}${BASE}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      setForgotMsg({ type: "err", text: error.message });
    } else {
      setForgotMsg({ type: "ok", text: "Jika email terdaftar, link reset password telah dikirim." });
    }
    setForgotLoading(false);
  }

  async function handleGoogleLogin() {
    if (!supabase) {
      setErrorMsg("Layanan autentikasi tidak tersedia. Silakan hubungi administrator.");
      return;
    }
    setErrorMsg("");
    const redirectTo = `${window.location.origin}${BASE}/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setErrorMsg(error.message);
    }
  }

  return (
    <div className="min-h-[calc(100vh-80px)] grid md:grid-cols-2 bg-background">
      {/* ── Left panel ─────────────────────────────────────────── */}
      <div
        className="hidden md:flex flex-col justify-center p-12 lg:p-16 relative overflow-hidden"
        style={{
          backgroundImage: [
            "linear-gradient(120deg, rgba(15,23,42,0.72) 0%, rgba(14,165,233,0.55) 45%, rgba(14,165,233,0.32) 100%)",
            `url(${assetUrl("/images/warehouse.png")})`,
          ].join(", "),
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: "inset 0 0 80px 12px rgba(11,29,50,0.50)" }}
        />

        <div className="relative z-10" style={{ maxWidth: "480px" }}>
          <div
            className="inline-flex mb-10"
            style={{
              background: "rgba(255,255,255,0.90)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              borderRadius: "18px",
              padding: "12px 16px",
              boxShadow: "0 12px 35px rgba(15,23,42,0.22)",
            }}
          >
            <img
              src={assetUrl("/images/logo.png")}
              alt="Logo"
              className="h-12 w-auto object-contain"
              style={{ maxWidth: "160px" }}
            />
          </div>

          <h1
            className="font-display mb-6"
            style={{
              fontWeight: 800,
              fontSize: "clamp(36px, 4vw, 56px)",
              lineHeight: 1.08,
              letterSpacing: "-0.04em",
              color: "#ffffff",
              textShadow: "0 6px 24px rgba(15,23,42,0.55)",
            }}
          >
            {t("login.sideTitle")}
          </h1>

          <p
            className="mb-10"
            style={{
              fontSize: "clamp(17px, 1.6vw, 21px)",
              lineHeight: 1.6,
              maxWidth: "420px",
              color: "rgba(255,255,255,0.94)",
              textShadow: "0 3px 14px rgba(15,23,42,0.45)",
            }}
          >
            {t("login.sideDesc")}
          </p>

          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white"
                  style={{
                    background: "#0F172A",
                    border: "2px solid rgba(255,255,255,0.55)",
                    boxShadow: "0 8px 20px rgba(15,23,42,0.25)",
                  }}
                >
                  {String.fromCharCode(64 + i)}
                </div>
              ))}
            </div>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#ffffff",
                textShadow: "0 2px 10px rgba(15,23,42,0.45)",
              }}
            >
              {t("login.sideTrust")}
            </span>
          </div>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────── */}
      <div className="flex items-center justify-center p-6 md:p-12">
        <Card className="w-full max-w-md border-none shadow-none md:shadow-xl md:border-solid">
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl font-display font-bold">{t("login.welcomeBack")}</CardTitle>
            <CardDescription>{t("login.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {returnTo && (
              <Alert className="mb-4 border-accent/40 bg-accent/5">
                <AlertCircle className="h-4 w-4 text-accent" />
                <AlertDescription className="text-sm">
                  {t("login.loginRequired")}
                </AlertDescription>
              </Alert>
            )}
            {errorMsg && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            {/* ── OAuth button ── */}
            <div className="flex flex-col gap-3 mb-6">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="flex items-center justify-center gap-3 w-full h-11 rounded-lg border border-border bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors shadow-sm"
              >
                <GoogleIcon />
                Masuk dengan Google
              </button>
            </div>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">atau dengan email</span>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("login.email")}</FormLabel>
                      <FormControl>
                        <Input placeholder="you@company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>{t("login.password")}</FormLabel>
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          disabled={forgotLoading}
                          className="text-sm font-medium text-accent hover:underline disabled:opacity-60"
                        >
                          {forgotLoading ? "Mengirim..." : t("login.forgotPassword")}
                        </button>
                      </div>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {forgotMsg && (
                  <Alert
                    variant={forgotMsg.type === "err" ? "destructive" : "default"}
                    className={forgotMsg.type === "ok" ? "border-green-200 bg-green-50" : ""}
                  >
                    {forgotMsg.type === "ok"
                      ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : <AlertCircle className="h-4 w-4" />
                    }
                    <AlertDescription className={forgotMsg.type === "ok" ? "text-green-800" : ""}>
                      {forgotMsg.text}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? t("login.signingIn") : t("login.signIn")}
                </Button>
              </form>
            </Form>

            <div className="mt-8 text-center text-sm text-muted-foreground">
              {t("login.noAccount")}{" "}
              <Link
                href={returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : "/register"}
                className="font-medium text-primary hover:underline"
              >
                {t("login.createAccount")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
