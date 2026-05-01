import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ship, Plane, Package, Truck, FileCheck, Warehouse, Shield, ArrowRight, CheckCircle, Globe, Clock, Award } from "lucide-react";

const SERVICES = [
  { icon: Plane, label: "Air Freight", desc: "Fast, reliable air cargo worldwide" },
  { icon: Ship, label: "Sea Freight", desc: "FCL & LCL ocean shipping" },
  { icon: FileCheck, label: "Customs Clearance", desc: "Expert import/export handling" },
  { icon: Truck, label: "Trucking", desc: "Door-to-door land transport" },
  { icon: Warehouse, label: "Warehousing", desc: "Secure bonded & cold storage" },
  { icon: Shield, label: "Insurance", desc: "Full cargo protection coverage" },
];

const FLOW_STEPS = [
  { step: "01", title: "Choose Shipment Type", desc: "Select Import, Export, Domestic, or Door to Door" },
  { step: "02", title: "Select Service", desc: "Browse Freight, Customs, Trucking, Storage, and more" },
  { step: "03", title: "Calculate Estimate", desc: "Enter cargo details — get instant price calculation" },
  { step: "04", title: "Submit Order", desc: "Fill in company details and confirm your booking" },
];

export default function HomePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logistic-order/logo.png" alt="CST Logistics" className="h-10 w-auto object-contain" />
            <span className="font-bold text-foreground text-sm tracking-wide">PT. Cahaya Sejati Teknologi</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/track")}>Track Order</Button>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/admin")}>Admin</Button>
            <Button size="sm" onClick={() => setLocation("/book")}>Start Booking</Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-6 py-20 md:py-28">
          <div className="max-w-3xl">
            <Badge className="mb-6 bg-accent text-accent-foreground border-0 text-xs font-semibold tracking-wider uppercase">
              Export Import & Logistics
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
              Export Import &<br />Logistic Solutions
            </h1>
            <p className="text-lg text-primary-foreground/70 mb-8 leading-relaxed">
              Freight, Customs Clearance, Trucking, Warehousing &amp; End-to-End Logistics Services.
              Get an instant estimate and submit your order online.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                size="lg"
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
                onClick={() => setLocation("/book")}
              >
                Start Booking <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => setLocation("/track")}
              >
                Track My Order
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: Globe, label: "50+ Countries Covered" },
            { icon: Package, label: "10,000+ Shipments/Year" },
            { icon: Clock, label: "24/7 Support" },
            { icon: Award, label: "ISO Certified" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-accent flex-shrink-0" />
              <span className="text-sm font-medium text-foreground">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-foreground mb-2">How It Works</h2>
          <p className="text-muted-foreground">Submit your logistics order in 4 simple steps</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {FLOW_STEPS.map(({ step, title, desc }, idx) => (
            <div key={step} className="relative">
              {idx < FLOW_STEPS.length - 1 && (
                <div className="hidden md:block absolute top-5 left-full w-full h-px bg-border z-0" style={{ width: "calc(100% - 2rem)", left: "calc(100% - 1rem)" }} />
              )}
              <div className="relative z-10 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  {step}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm mb-1">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="bg-muted/30 border-y border-border">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-foreground mb-2">Our Services</h2>
            <p className="text-muted-foreground">Comprehensive logistics solutions for every shipment need</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {SERVICES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-5 hover:shadow-md transition-shadow">
                <Icon className="w-6 h-6 text-accent mb-3" />
                <h3 className="font-semibold text-foreground text-sm mb-1">{label}</h3>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 py-16 text-center">
        <div className="bg-primary rounded-2xl p-10 text-primary-foreground">
          <h2 className="text-2xl font-bold mb-3">Ready to Ship?</h2>
          <p className="text-primary-foreground/70 mb-6 text-sm">
            Use our booking calculator to get an instant estimate and submit your order.
          </p>
          <Button
            size="lg"
            className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
            onClick={() => setLocation("/book")}
          >
            Get Estimate Now <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Ship className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Export Import &amp; Logistic Ordering System</span>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <button onClick={() => setLocation("/book")} className="hover:text-foreground transition-colors">Book</button>
            <button onClick={() => setLocation("/track")} className="hover:text-foreground transition-colors">Track</button>
            <button onClick={() => setLocation("/admin")} className="hover:text-foreground transition-colors">Admin</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
