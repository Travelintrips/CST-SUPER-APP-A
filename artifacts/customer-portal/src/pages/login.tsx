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
      <div className="hidden md:flex flex-col justify-center p-12 lg:p-24 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-cover bg-center mix-blend-overlay" style={{ backgroundImage: `url(${assetUrl("/images/warehouse.png")})` }} />
        <div className="relative z-10 max-w-lg">
          <div className="inline-flex mb-8 bg-white/95 rounded-xl p-2 shadow-sm">
            <img
              src={assetUrl("/images/logo.png")}
              alt="Logo"
              className="h-12 w-auto object-contain"
              style={{ maxWidth: "160px" }}
            />
          </div>
          <h1 className="text-4xl lg:text-5xl font-display font-bold leading-tight mb-6">
            {t("login.sideTitle")}
          </h1>
          <p className="text-xl text-primary-foreground/80 mb-8">
            {t("login.sideDesc")}
          </p>
          <div className="flex items-center gap-4 text-sm font-medium">
            <div className="flex -space-x-3">
              {[1,2,3].map(i => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-primary bg-accent flex items-center justify-center text-accent-foreground font-bold">
                  {String.fromCharCode(64 + i)}
                </div>
              ))}
            </div>
            <span>{t("login.sideTrust")}</span>
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
