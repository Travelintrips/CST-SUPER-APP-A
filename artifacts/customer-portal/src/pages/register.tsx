import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { usePortalRegister, useListPortalServices } from "@workspace/api-client-react";
import { setAuthToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, Check, Truck, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLanguage } from "@/i18n/LanguageContext";

type UserRole = "customer" | "vendor";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  company: z.string().optional(),
  serviceIds: z.array(z.number()).default([]),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

interface SimpleItem {
  id: number;
  name: string;
  itemType: "jasa" | "barang";
}

export default function Register() {
  const [, setLocation] = useLocation();
  const [errorMsg, setErrorMsg] = useState("");
  const returnTo = new URLSearchParams(window.location.search).get("returnTo");
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<UserRole>("customer");
  const [products, setProducts] = useState<SimpleItem[]>([]);
  const { t } = useLanguage();

  const { data: servicesData } = useListPortalServices({
    query: { queryKey: ["listPortalServices"] }
  });
  const services: SimpleItem[] = (Array.isArray(servicesData) ? servicesData : []).map((s) => ({
    id: s.id,
    name: s.name,
    itemType: "jasa" as const,
  }));

  useEffect(() => {
    fetch("/api/portal/products")
      .then((r) => r.json())
      .then((data) =>
        setProducts(
          Array.isArray(data)
            ? data.map((p: any) => ({ id: p.id, name: p.name, itemType: "barang" as const }))
            : []
        )
      )
      .catch(() => setProducts([]));
  }, []);

  const allItems: SimpleItem[] = [...services, ...products];
  const registerMutation = usePortalRegister();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", phone: "", company: "", serviceIds: [] },
  });

  const selectedIds = form.watch("serviceIds");

  const toggleItem = (id: number) => {
    const current = form.getValues("serviceIds");
    form.setValue(
      "serviceIds",
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
      { shouldDirty: true }
    );
  };

  const onSubmit = (data: RegisterFormValues) => {
    setErrorMsg("");
    registerMutation.mutate({ data: { ...data, role } as any }, {
      onSuccess: (res: any) => {
        const token = res?.token;
        const resRole = res?.customer?.role ?? role;
        if (token) {
          setAuthToken(token);
          const rt = new URLSearchParams(window.location.search).get("returnTo");
          if (rt) {
            setLocation(rt);
          } else if (resRole === "vendor") {
            setLocation("/vendor-dashboard");
          } else {
            setLocation("/dashboard");
          }
        }
      },
      onError: (err: any) => {
        setErrorMsg(err?.message || t("common.error"));
      }
    });
  };

  const handleNextStep = async () => {
    const isValid = await form.trigger(["name", "email", "password", "company", "phone"]);
    if (isValid) setStep(2);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-2xl border-none shadow-xl">
        <CardHeader className="space-y-3 pb-8 border-b border-border/40">
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-display font-bold">{t("register.title")}</CardTitle>
            <div className="text-sm font-medium bg-accent/10 text-accent px-3 py-1 rounded-full">
              {t("register.stepOf")} {step} {t("register.of")} 2
            </div>
          </div>
          <CardDescription>{t("register.subtitle")}</CardDescription>
        </CardHeader>

        <CardContent className="pt-8">
          {returnTo && (
            <Alert className="mb-6 border-primary/30 bg-primary/5">
              <Check className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm text-foreground">
                {t("register.redirectToCheckout")}
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

              {/* ── STEP 1 ── */}
              <div className={step === 1 ? "block space-y-6" : "hidden"}>

                {/* Role selector */}
                <div>
                  <p className="text-sm font-medium mb-3">Daftar sebagai</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("customer")}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-150 ${
                        role === "customer"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-white hover:border-primary/40 hover:bg-gray-50"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        role === "customer" ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                      }`}>
                        <User className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <p className={`font-semibold text-sm ${role === "customer" ? "text-primary" : "text-foreground"}`}>
                          Customer
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Butuh layanan logistik</p>
                      </div>
                      {role === "customer" && (
                        <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center mt-1">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setRole("vendor")}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-150 ${
                        role === "vendor"
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-white hover:border-primary/40 hover:bg-gray-50"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        role === "vendor" ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                      }`}>
                        <Truck className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <p className={`font-semibold text-sm ${role === "vendor" ? "text-primary" : "text-foreground"}`}>
                          Vendor / Mitra
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Penyedia layanan pengiriman</p>
                      </div>
                      {role === "vendor" && (
                        <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center mt-1">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <label className="text-sm font-medium">{t("register.fullName")}</label>
                        <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <label className="text-sm font-medium">{t("register.emailAddress")}</label>
                        <FormControl><Input type="email" placeholder="john@company.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <label className="text-sm font-medium">
                          {role === "vendor" ? "Nama Perusahaan / Armada" : t("register.company")}
                        </label>
                        <FormControl>
                          <Input
                            placeholder={role === "vendor" ? "PT Mitra Logistik" : "Acme Logistics Inc."}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <label className="text-sm font-medium">{t("register.phone")}</label>
                        <FormControl><Input placeholder="+62 812 0000 0000" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <label className="text-sm font-medium">{t("register.password")}</label>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="button" className="w-full h-12" onClick={handleNextStep}>
                  {t("register.continueToServices")}
                </Button>
              </div>

              {/* ── STEP 2 ── */}
              <div className={step === 2 ? "block space-y-6" : "hidden"}>
                <div>
                  <h3 className="text-lg font-semibold mb-1">
                    {role === "vendor" ? "Layanan yang Anda Sediakan" : t("register.servicesTitle")}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    {role === "vendor"
                      ? "Pilih jenis layanan atau produk yang Anda tawarkan sebagai mitra logistik."
                      : t("register.servicesDesc")}
                    {selectedIds.length > 0 && (
                      <span className="ml-2 font-medium text-accent">{selectedIds.length} {t("register.selected")}</span>
                    )}
                  </p>

                  {allItems.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                      {allItems.map((item) => {
                        const isSelected = selectedIds.includes(item.id);
                        return (
                          <button
                            key={`${item.itemType}-${item.id}`}
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            className={`w-full text-left flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-150 select-none ${
                              isSelected
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border bg-white hover:border-primary/40 hover:bg-gray-50"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              isSelected ? "bg-primary border-primary" : "border-muted-foreground/40 bg-white"
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </div>
                            <span className={`text-sm font-medium leading-tight ${isSelected ? "text-primary" : "text-foreground"}`}>
                              {item.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-2">
                  <Button type="button" variant="outline" className="w-1/3 h-12" onClick={() => setStep(1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> {t("register.back")}
                  </Button>
                  <Button type="submit" className="w-2/3 h-12" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? t("register.creatingAccount") : t("register.createAccount")}
                  </Button>
                </div>
              </div>

            </form>
          </Form>

          {step === 1 && (
            <div className="mt-8 text-center text-sm text-muted-foreground">
              {t("register.alreadyHaveAccount")}{" "}
              <Link
                href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"}
                className="font-medium text-primary hover:underline"
              >
                {t("register.signIn")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
