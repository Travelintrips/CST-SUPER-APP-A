import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ShoppingCart, Package, Truck, Calculator } from "lucide-react";
import { useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";

export default function WelcomePage() {
  const { signOut } = useClerk();

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4 text-foreground relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      
      <div className="max-w-4xl w-full space-y-8 relative z-10">
        <div className="text-center space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg mb-4">
            <Building2 size={32} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Welcome to BizPortal</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Akun Anda sudah terdaftar. Hubungi administrator untuk mendapatkan akses ke divisi Anda.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <ShoppingCart className="h-8 w-8 text-primary mb-2" />
              <CardTitle>E-Commerce</CardTitle>
              <CardDescription className="text-muted-foreground">Online Retail Management</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Manage your online store products, track customer orders, and monitor digital sales performance in one unified interface.</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <Package className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Trading</CardTitle>
              <CardDescription className="text-muted-foreground">B2B Inventory & Suppliers</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Track bulk inventory, manage supplier relationships, monitor cost prices, and handle HS codes for international trading.</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <Truck className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Logistik</CardTitle>
              <CardDescription className="text-muted-foreground">Fleet & Shipment Tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Monitor deliveries in real-time, update shipment statuses, and ensure packages reach their destinations on time.</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <Calculator className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Point of Sale</CardTitle>
              <CardDescription className="text-muted-foreground">In-Store Transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Process retail transactions quickly, support multiple payment methods, and track daily physical store revenue.</p>
            </CardContent>
          </Card>
        </div>
        
        <div className="flex justify-center pt-8">
          <Button variant="outline" onClick={() => signOut()} className="min-w-[200px] border-border text-foreground hover:bg-accent">
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
