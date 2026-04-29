import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetPortalCompany, useListPortalServices } from "@workspace/api-client-react";
import { ArrowRight, Globe, ShieldCheck, Clock, MapPin, Package, CheckCircle2 } from "lucide-react";
import { assetUrl } from "@/lib/utils";

export default function Home() {
  const { data: company } = useGetPortalCompany({
    query: { queryKey: ["getPortalCompany"] }
  });

  const { data: servicesData } = useListPortalServices({
    query: { queryKey: ["listPortalServices"] }
  });

  const services = Array.isArray(servicesData) ? servicesData : [];
  const previewServices = services.slice(0, 3);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative w-full h-[80vh] min-h-[600px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-black/60 z-10" />
        <img 
          src={assetUrl("/images/hero-bg.png")} 
          alt="Cargo ship at sea" 
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
        <div className="container relative z-20 px-4 md:px-6 text-center text-white">
          <span className="inline-block py-1 px-3 rounded-full bg-accent/20 border border-accent/50 text-accent-foreground text-sm font-medium mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {company?.tagline || "Solusi Logistik Terintegrasi & Berbasis Teknologi"}
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold tracking-tight mb-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            Global Logistics,<br />Delivered with Precision.
          </h1>
          <p className="text-lg md:text-xl text-gray-200 mb-10 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            {company?.description || "Expert logistics solutions handling export, import, and customs clearance with care and precision."}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
            <Link href="/services">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground h-12 px-8 text-base">
                Explore Services
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white/10 h-12 px-8 text-base">
                Become a Partner
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-x divide-gray-100">
            <div className="flex flex-col items-center justify-center space-y-2">
              <Globe className="h-8 w-8 text-accent mb-2" />
              <h3 className="font-display font-bold text-2xl">150+</h3>
              <p className="text-sm text-muted-foreground">Countries Served</p>
            </div>
            <div className="flex flex-col items-center justify-center space-y-2">
              <ShieldCheck className="h-8 w-8 text-accent mb-2" />
              <h3 className="font-display font-bold text-2xl">99.9%</h3>
              <p className="text-sm text-muted-foreground">Safety Record</p>
            </div>
            <div className="flex flex-col items-center justify-center space-y-2">
              <Package className="h-8 w-8 text-accent mb-2" />
              <h3 className="font-display font-bold text-2xl">10k+</h3>
              <p className="text-sm text-muted-foreground">Monthly Shipments</p>
            </div>
            <div className="flex flex-col items-center justify-center space-y-2">
              <Clock className="h-8 w-8 text-accent mb-2" />
              <h3 className="font-display font-bold text-2xl">24/7</h3>
              <p className="text-sm text-muted-foreground">Support Operations</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Preview */}
      <section className="py-24 bg-gray-50">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Our Core Services</h2>
              <p className="text-muted-foreground text-lg">
                Comprehensive logistics solutions tailored to your supply chain needs. We handle the complexity so you can focus on your business.
              </p>
            </div>
            <Link href="/services">
              <Button variant="outline" className="gap-2 group">
                View All Services <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {previewServices.length > 0 ? (
              previewServices.map((service) => (
                <Card key={service.id} className="group hover-elevate transition-all duration-300 border-border/50 overflow-hidden flex flex-col h-full">
                  <div className="aspect-video w-full overflow-hidden bg-gray-100">
                    <img 
                      src={service.imageUrl || assetUrl("/images/warehouse.png")} 
                      alt={service.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <CardHeader>
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {service.categories?.map((cat: string, i: number) => (
                        <span key={i} className="text-xs font-medium text-accent bg-accent/10 px-2 py-1 rounded">
                          {cat}
                        </span>
                      ))}
                    </div>
                    <CardTitle className="text-xl">{service.name}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-2">{service.description}</CardDescription>
                  </CardHeader>
                  <div className="mt-auto p-6 pt-0">
                    <div className="font-medium text-lg text-primary mb-4">
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(service.price)}
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                Loading services...
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Why Choose Us / Operations */}
      <section className="py-24 bg-white overflow-hidden">
        <div className="container px-4 md:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Unrivaled Infrastructure & Expertise</h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  We bridge the gap between global markets with our state-of-the-art facilities and deep understanding of international trade compliance.
                </p>
              </div>
              
              <ul className="space-y-6">
                {[
                  "End-to-end supply chain visibility and tracking",
                  "Licensed customs brokers ensuring rapid clearance",
                  "Strategically located warehousing near major ports",
                  "Dedicated account managers for enterprise clients"
                ].map((item, i) => (
                  <li key={i} className="flex gap-4 items-start">
                    <CheckCircle2 className="h-6 w-6 text-accent shrink-0 mt-0.5" />
                    <span className="text-lg font-medium">{item}</span>
                  </li>
                ))}
              </ul>

              <Button size="lg" className="h-12 px-8">Read Our Story</Button>
            </div>
            <div className="relative">
              <div className="relative aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl">
                <img src={assetUrl("/images/port-operations.png")} alt="Port Operations" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-8 -left-8 aspect-square w-2/3 rounded-2xl overflow-hidden shadow-2xl border-4 border-white">
                <img src={assetUrl("/images/customs.png")} alt="Customs Documents" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-cover bg-center mix-blend-overlay" style={{ backgroundImage: `url(${assetUrl("/images/warehouse.png")})` }} />
        <div className="container relative z-10 px-4 md:px-6 text-center max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Ready to streamline your global logistics?</h2>
          <p className="text-xl text-primary-foreground/80 mb-10">
            Join thousands of businesses that trust {company?.name || "CST"} to move their cargo across borders securely and efficiently.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground h-14 px-10 text-lg w-full sm:w-auto">
                Create Customer Portal
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="bg-transparent border-primary-foreground/20 hover:bg-primary-foreground/10 h-14 px-10 text-lg w-full sm:w-auto">
              Contact Sales
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
