import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { usePortalRegister, useListPortalServices } from "@workspace/api-client-react";
import { setAuthToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, ArrowLeft, Package } from "lucide-react";
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

export default function Register() {
  const [, setLocation] = useLocation();
  const [errorMsg, setErrorMsg] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const { data: servicesData } = useListPortalServices({
    query: { queryKey: ["listPortalServices"] }
  });
  const services = Array.isArray(servicesData) ? servicesData : [];

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

  const onSubmit = (data: RegisterFormValues) => {
    setErrorMsg("");
    registerMutation.mutate({ data }, {
      onSuccess: (res) => {
        if (res.token) {
          setAuthToken(res.token);
          setLocation("/dashboard");
        }
      },
      onError: (err: any) => {
        setErrorMsg(err?.message || "Registration failed. Please try again.");
      }
    });
  };

  const handleNextStep = async () => {
    const isValid = await form.trigger(["name", "email", "password", "company", "phone"]);
    if (isValid) {
      setStep(2);
    }
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
          {errorMsg && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className={step === 1 ? "block space-y-6" : "hidden"}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
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
                        <FormLabel>Email Address</FormLabel>
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
                        <FormLabel>Company Name</FormLabel>
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
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl><Input placeholder="+1 (555) 000-0000" {...field} /></FormControl>
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
                      <FormLabel>Password</FormLabel>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="button" className="w-full h-12" onClick={handleNextStep}>
                  Continue to Services
                </Button>
              </div>

              <div className={step === 2 ? "block space-y-6" : "hidden"}>
                <div>
                  <h3 className="text-lg font-medium mb-4">What services are you interested in?</h3>
                  <p className="text-sm text-muted-foreground mb-6">Select all that apply so we can tailor your experience.</p>
                  
                  <FormField
                    control={form.control}
                    name="serviceIds"
                    render={() => (
                      <FormItem>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {services.map((service) => (
                            <FormField
                              key={service.id}
                              control={form.control}
                              name="serviceIds"
                              render={({ field }) => {
                                return (
                                  <FormItem
                                    key={service.id}
                                    className="flex flex-row items-start space-x-3 space-y-0 border p-4 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(service.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...field.value, service.id])
                                            : field.onChange(
                                                field.value?.filter((value) => value !== service.id)
                                              )
                                        }}
                                      />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                      <FormLabel className="font-medium cursor-pointer">
                                        {service.name}
                                      </FormLabel>
                                    </div>
                                  </FormItem>
                                )
                              }}
                            />
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex gap-4 pt-4">
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
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
