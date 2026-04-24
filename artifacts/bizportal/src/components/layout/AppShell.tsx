import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { useGetCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  Calculator,
  Settings,
  LogOut,
  Building2,
  Users,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  ShoppingBag,
  FileText,
  Receipt,
  ClipboardList,
  UserCircle,
  BookOpen,
  Wallet,
  FileSpreadsheet,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarFooter,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface AppShellProps {
  children: ReactNode;
}

interface FlatItem {
  type: "flat";
  title: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
}

interface GroupItem {
  type: "group";
  title: string;
  basePath: string;
  icon: LucideIcon;
  roles: string[];
  children: { title: string; href: string; icon: LucideIcon }[];
}

type NavItem = FlatItem | GroupItem;

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: dbUser } = useGetCurrentUser({
    query: {
      enabled: !!user,
      queryKey: getGetCurrentUserQueryKey(),
      staleTime: Infinity,
    },
  });

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.substring(0, 2).toUpperCase();
  };

  const navItems: NavItem[] = [
    { type: "flat", title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin"] },
    { type: "flat", title: "E-Commerce", href: "/ecommerce", icon: ShoppingCart, roles: ["admin", "ecommerce"] },
    {
      type: "group",
      title: "Sales",
      basePath: "/sales",
      icon: TrendingUp,
      roles: ["admin"],
      children: [
        { title: "Dashboard", href: "/sales", icon: LayoutDashboard },
        { title: "Quotations", href: "/sales/quotations", icon: FileText },
        { title: "Sales Orders", href: "/sales/orders", icon: ShoppingBag },
        { title: "Customers", href: "/sales/customers", icon: UserCircle },
        { title: "Invoices", href: "/sales/invoices", icon: Receipt },
      ],
    },
    {
      type: "group",
      title: "Purchase",
      basePath: "/purchase",
      icon: ClipboardList,
      roles: ["admin"],
      children: [
        { title: "Dashboard", href: "/purchase", icon: LayoutDashboard },
        { title: "RFQ", href: "/purchase/rfq", icon: ClipboardList },
        { title: "Purchase Orders", href: "/purchase/orders", icon: ShoppingBag },
        { title: "Vendors", href: "/purchase/vendors", icon: UserCircle },
        { title: "Bills", href: "/purchase/bills", icon: FileText },
      ],
    },
    {
      type: "group",
      title: "Laporan",
      basePath: "/reports",
      icon: TrendingUp,
      roles: ["admin"],
      children: [
        { title: "Penjualan", href: "/reports/sales", icon: TrendingUp },
        { title: "Pembelian", href: "/reports/purchase", icon: ShoppingBag },
        { title: "Piutang (AR)", href: "/reports/ar-aging", icon: Receipt },
        { title: "Hutang (AP)", href: "/reports/ap-aging", icon: FileText },
      ],
    },
    {
      type: "group",
      title: "Akunting",
      basePath: "/accounting",
      icon: BookOpen,
      roles: ["admin"],
      children: [
        { title: "Bagan Akun", href: "/accounting/accounts", icon: Landmark },
        { title: "Jurnal", href: "/accounting/journals", icon: BookOpen },
        { title: "Jurnal Entry", href: "/accounting/entries", icon: FileText },
        { title: "Pajak", href: "/accounting/taxes", icon: Receipt },
        { title: "Neraca Saldo", href: "/accounting/reports/trial-balance", icon: FileSpreadsheet },
        { title: "Buku Besar", href: "/accounting/reports/general-ledger", icon: BookOpen },
        { title: "Laba Rugi", href: "/accounting/reports/profit-loss", icon: TrendingUp },
        { title: "Neraca", href: "/accounting/reports/balance-sheet", icon: Wallet },
        { title: "Pengaturan", href: "/accounting/settings", icon: Settings },
      ],
    },
    { type: "flat", title: "Trading", href: "/trading", icon: Package, roles: ["admin", "trading"] },
    { type: "flat", title: "Logistics", href: "/logistics", icon: Truck, roles: ["admin", "logistics"] },
    { type: "flat", title: "POS", href: "/pos", icon: Calculator, roles: ["admin", "pos"] },
    { type: "flat", title: "Pengguna", href: "/users", icon: Users, roles: ["admin"] },
    { type: "flat", title: "Settings", href: "/settings", icon: Settings, roles: ["admin", "ecommerce", "trading", "logistics", "pos"] },
  ];

  const filteredNav = navItems.filter((item) => dbUser?.role && item.roles.includes(dbUser.role));

  const isGroupActive = (g: GroupItem) =>
    location === g.basePath || location.startsWith(`${g.basePath}/`);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of navItems) {
      if (item.type === "group" && (location === item.basePath || location.startsWith(`${item.basePath}/`))) {
        initial[item.basePath] = true;
      }
    }
    return initial;
  });

  const toggleGroup = (basePath: string) =>
    setOpenGroups((s) => ({ ...s, [basePath]: !s[basePath] }));

  const isChildActive = (href: string) => {
    if (location === href) return true;
    // Special-case: dashboards (/sales, /purchase) should only match exact, not nested
    if (href === "/sales" || href === "/purchase") return false;
    return location.startsWith(`${href}/`) || location === href;
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-[100dvh] w-full bg-background text-foreground">
        <Sidebar className="border-r border-border">
          <SidebarHeader className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Building2 size={18} />
              </div>
              <span className="text-lg font-bold tracking-tight">BizPortal</span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground px-4 py-2 text-xs font-medium uppercase tracking-wider">
                Modules
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {filteredNav.map((item) => {
                    if (item.type === "flat") {
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            isActive={location === item.href || location.startsWith(`${item.href}/`)}
                            tooltip={item.title}
                          >
                            <Link href={item.href} className="flex items-center gap-3" data-testid={`nav-${item.title.toLowerCase()}`}>
                              <item.icon size={18} />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    }
                    const open = openGroups[item.basePath] ?? false;
                    const active = isGroupActive(item);
                    return (
                      <SidebarMenuItem key={item.basePath}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.title}
                          onClick={() => toggleGroup(item.basePath)}
                          data-testid={`nav-group-${item.title.toLowerCase()}`}
                          className="flex items-center gap-3"
                        >
                          <item.icon size={18} />
                          <span className="flex-1">{item.title}</span>
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </SidebarMenuButton>
                        {open && (
                          <SidebarMenuSub>
                            {item.children.map((c) => (
                              <SidebarMenuSubItem key={c.href}>
                                <SidebarMenuSubButton asChild isActive={isChildActive(c.href)}>
                                  <Link href={c.href} className="flex items-center gap-2" data-testid={`nav-sub-${c.title.toLowerCase().replace(/\s+/g, "-")}`}>
                                    <c.icon size={14} />
                                    <span>{c.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-border p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarImage src={user?.imageUrl} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(dbUser?.name || user?.fullName || undefined)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="truncate text-sm font-medium leading-none">
                      {dbUser?.name || user?.fullName || "User"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground mt-1">
                      {dbUser?.role || "No Role"}
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-popover text-popover-foreground border-border">
                <div className="flex items-center gap-2 p-2">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarImage src={user?.imageUrl} />
                    <AvatarFallback>{getInitials(dbUser?.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{dbUser?.name}</p>
                    <p className="text-xs text-muted-foreground">{dbUser?.email}</p>
                  </div>
                </div>
                <div className="p-2 pt-0">
                  <Badge variant="secondary" className="w-full justify-center capitalize">
                    {dbUser?.role} Division
                  </Badge>
                </div>
                <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background px-4 sm:px-6 lg:hidden">
            <SidebarTrigger />
            <div className="flex items-center gap-2 font-bold">
              <Building2 size={18} className="text-primary" />
              <span>BizPortal</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
