import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { usePortalLogin } from "@workspace/api-client-react";
import { setAuthToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { assetUrl } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageContext";

export default function Login() {
  const [, setLocation] = useLocation();
  const [errorMsg, setErrorMsg] = useState("");
  const returnTo = new URLSearchParams(window.location.search).get("returnTo");
  const { t } = useLanguage();

  const loginSchema = z.object({
    email: z.string().email({ message: t("login.email") }),
    password: z.string().min(1, { message: t("login.password") }),
  });
  type LoginFormValues = z.infer<typeof loginSchema>;

  const loginMutation = usePortalLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: LoginFormValues) => {
    setErrorMsg("");
    loginMutation.mutate({ data }, {
      onSuccess: (res) => {
        if (res.token) {
          setAuthToken(res.token);
          const rt = new URLSearchParams(window.location.search).get("returnTo");
          setLocation(rt || "/dashboard");
        }
      },
      onError: (err: any) => {
        setErrorMsg(err?.message || t("common.error"));
      }
    });
  };

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
        {/* subtle vignette */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: "inset 0 0 80px 12px rgba(11,29,50,0.50)" }}
        />

        <div className="relative z-10" style={{ maxWidth: "480px" }}>
          {/* Logo */}
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

          {/* Headline */}
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

          {/* Description */}
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

          {/* Badge row + trust text */}
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
                        <Link href="#" className="text-sm font-medium text-accent hover:underline">
                          {t("login.forgotPassword")}
                        </Link>
                      </div>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? t("login.signingIn") : t("login.signIn")}
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
