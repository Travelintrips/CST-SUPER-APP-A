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
import { AlertCircle, ArrowLeft, Check } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const registerSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
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

function deriveRedirect(selectedIds: number[], allItems: SimpleItem[]): string {
  if (selectedIds.length === 0) return "/dashboard";
  const selected = allItems.filter((i) => selectedIds.includes(i.id));
  const hasJasa = selected.some((i) => i.itemType === "jasa");
  const hasBarang = selected.some((i) => i.itemType === "barang");
  if (hasJasa && !hasBarang) return "/jasa";
  if (hasBarang && !hasJasa) return "/products";
  return "/dashboard";
}

export default function Register() {
  const [, setLocation] = useLocation();
  const [errorMsg, setErrorMsg] = useState("");
  const returnTo = new URLSearchParams(window.location.search).get("returnTo");
  const [step, setStep] = useState<1 | 2>(1);
  const [products, setProducts] = useState<SimpleItem[]>([]);

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
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      company: "",
      serviceIds: [],
    },
  });

  const selectedIds = form.watch("serviceIds");

  const toggleItem = (id: number) => {
    const current = form.getValues("serviceIds");
    if (current.includes(id)) {
      form.setValue("serviceIds", current.filter((v) => v !== id), { shouldDirty: true });
    } else {
      form.setValue("serviceIds", [...current, id], { shouldDirty: true });
    }
  };

  const onSubmit = (data: RegisterFormValues) => {
    setErrorMsg("");
    registerMutation.mutate({ data }, {
      onSuccess: (res) => {
        if (res.token) {
          setAuthToken(res.token);
          const returnTo = new URLSearchParams(window.location.search).get("returnTo");
          const redirect = returnTo || deriveRedirect(data.serviceIds, allItems);
          setLocation(redirect);
        }
      },
      onError: (err: any) => {
        setErrorMsg(err?.message || "Registration failed. Please try again.");
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
            <CardTitle className="text-2xl font-display font-bold">Create your account</CardTitle>
            <div className="text-sm font-medium bg-accent/10 text-accent px-3 py-1 rounded-full">
              Step {step} of 2
            </div>
          </div>
          <CardDescription>Join our platform to manage your logistics easily</CardDescription>
        </CardHeader>

        <CardContent className="pt-8">
          {returnTo && (
            <Alert className="mb-6 border-accent/40 bg-accent/5 text-accent-foreground">
              <Check className="h-4 w-4 text-accent" />
              <AlertDescription className="text-sm">
                Buat akun untuk melanjutkan pemesanan layanan logistik Anda.
                Setelah daftar, Anda langsung masuk ke halaman checkout.
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

              {/* Step 1 — Personal info */}
              <div className={step === 1 ? "block space-y-6" : "hidden"}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <label className="text-sm font-medium">Full Name</label>
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
                        <label className="text-sm font-medium">Email Address</label>
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
                        <label className="text-sm font-medium">Company Name</label>
                        <FormControl><Input placeholder="Acme Logistics Inc." {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <label className="text-sm font-medium">Phone Number</label>
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
                      <label className="text-sm font-medium">Password</label>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="button" className="w-full h-12" onClick={handleNextStep}>
                  Continue to Services
                </Button>
              </div>

              {/* Step 2 — Service selection */}
              <div className={step === 2 ? "block space-y-6" : "hidden"}>
                <div>
                  <h3 className="text-lg font-semibold mb-1">What services are you interested in?</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Select all that apply so we can tailor your experience.
                    {selectedIds.length > 0 && (
                      <span className="ml-2 font-medium text-accent">{selectedIds.length} dipilih</span>
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
                              isSelected
                                ? "bg-primary border-primary"
                                : "border-muted-foreground/40 bg-white"
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
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button type="submit" className="w-2/3 h-12" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? "Creating Account..." : "Create Account"}
                  </Button>
                </div>
              </div>

            </form>
          </Form>

          {step === 1 && (
            <div className="mt-8 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"} className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
