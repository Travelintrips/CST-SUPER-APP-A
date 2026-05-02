import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { UserButton, useUser, useAuth } from "@clerk/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Briefcase, Shield, MessageCircle, Save, Loader2, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

function WhatsAppNotificationCard() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [adminWa, setAdminWa] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/settings/notifications", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json() as { adminWa: string };
          setAdminWa(data.adminWa ?? "");
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ adminWa }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast({ title: "Nomor WhatsApp admin berhasil disimpan" });
    } catch (err) {
      toast({ title: "Gagal menyimpan", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="col-span-1 md:col-span-3 bg-card border-border">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Notifikasi WhatsApp
        </CardTitle>
        <CardDescription>
          Nomor WhatsApp admin yang menerima notifikasi saat ada order atau dokumen baru.
          Admin akan mendapat pesan otomatis untuk Sales Quotation, Sales Order, Logistik, dan E-commerce Order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-10 w-full max-w-sm bg-muted" />
        ) : (
          <div className="flex flex-col gap-3 max-w-sm">
            <div className="space-y-1.5">
              <Label htmlFor="admin-wa">Nomor WhatsApp Admin</Label>
              <Input
                id="admin-wa"
                value={adminWa}
                onChange={(e) => setAdminWa(e.target.value)}
                placeholder="628xxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                Format: kode negara + nomor tanpa tanda +, spasi, atau strip. Contoh: <code>6281234567890</code>
              </p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="gap-2 w-fit"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Menyimpan..." : saved ? "Tersimpan!" : "Simpan"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const { data: dbUser, isLoading: dbLoading } = useGetCurrentUser({
    query: {
      enabled: isLoaded && !!user,
      queryKey: getGetCurrentUserQueryKey(),
      staleTime: Infinity,
    }
  });

  const isLoading = !isLoaded || dbLoading;
  const isAdmin = dbUser?.role === "admin";

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage your account preferences and view your organizational role.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="col-span-1 md:col-span-2 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Profile Information
              </CardTitle>
              <CardDescription>Your personal details within BizPortal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24 bg-muted" />
                    <Skeleton className="h-10 w-full bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24 bg-muted" />
                    <Skeleton className="h-10 w-full bg-muted" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <User className="h-4 w-4" /> Full Name
                    </label>
                    <div className="p-3 bg-background rounded-md border border-border text-foreground font-medium">
                      {dbUser?.name || user?.fullName || "Not provided"}
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Email Address
                    </label>
                    <div className="p-3 bg-background rounded-md border border-border text-foreground font-medium">
                      {dbUser?.email || user?.primaryEmailAddress?.emailAddress || "Not provided"}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-1 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Access Level
              </CardTitle>
              <CardDescription>Your assigned permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-24 bg-muted rounded-full" />
                  <Skeleton className="h-8 w-32 bg-muted rounded-full" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col space-y-3">
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Role
                    </label>
                    <div>
                      <Badge variant="default" className="text-sm px-3 py-1 bg-primary text-primary-foreground uppercase tracking-wider">
                        {dbUser?.role || "Unassigned"}
                      </Badge>
                    </div>
                  </div>
                  
                  {dbUser?.division && (
                    <div className="flex flex-col space-y-3">
                      <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Briefcase className="h-4 w-4" /> Division
                      </label>
                      <div>
                        <Badge variant="outline" className="text-sm px-3 py-1 border-border text-foreground">
                          {dbUser.division}
                        </Badge>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          
          <Card className="col-span-1 md:col-span-3 bg-card border-border">
            <CardHeader>
              <CardTitle className="text-xl">Authentication</CardTitle>
              <CardDescription>Manage your security settings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Clerk Account</p>
                  <p className="text-sm text-muted-foreground">Manage your password, connected accounts, and sessions.</p>
                </div>
                <div className="scale-125 origin-right">
                  <UserButton appearance={{
                    elements: {
                      userButtonBox: "shadow-sm",
                      userButtonTrigger: "focus:shadow-none focus:ring-2 focus:ring-primary rounded-full"
                    }
                  }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {isAdmin && <WhatsAppNotificationCard />}
        </div>
      </div>
    </AppShell>
  );
}
