import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetCurrentUser, getGetCurrentUserQueryKey, useListAiDraftQuotations, getListAiDraftQuotationsQueryKey } from "@workspace/api-client-react";
import {
  LayoutDashboard,
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
  Mail,
  Ship,
  Boxes,
  DollarSign,
  Tags,
  BarChart2,
  PackageOpen,
  List,
  GitMerge,
  Bot,
  ScanLine,
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
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useLanguage } from "@/contexts/LanguageContext";

interface AppShellProps {
  children: ReactNode;
}

interface FlatItem {
  type: "flat";
  titleKey: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
}

interface GroupItem {
  type: "group";
  titleKey: string;
  basePath: string;
  icon: LucideIcon;
  roles: string[];
  children: { titleKey: string; href: string; icon: LucideIcon }[];
}

type NavItem = FlatItem | GroupItem;

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const { t } = useLanguage();
  const { data: dbUser } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      staleTime: Infinity,
    },
  });

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.substring(0, 2).toUpperCase();
  };

  const navItems: NavItem[] = [
    { type: "flat", titleKey: "dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin"] },
    {
      type: "group",
      titleKey: "sales",
      basePath: "/sales",
      icon: TrendingUp,
      roles: ["admin"],
      children: [
        { titleKey: "salesDashboard", href: "/sales", icon: LayoutDashboard },
        { titleKey: "masterItem", href: "/sales/items", icon: Boxes },
        { titleKey: "quotations", href: "/sales/quotations", icon: FileText },
        { titleKey: "salesOrders", href: "/sales/orders", icon: ShoppingBag },
        { titleKey: "aiDrafts", href: "/sales/ai-drafts", icon: Bot },
        { titleKey: "customers", href: "/sales/customers", icon: UserCircle },
        { titleKey: "invoices", href: "/sales/invoices", icon: Receipt },
      ],
    },
    {
      type: "group",
      titleKey: "purchase",
      basePath: "/purchase",
      icon: ClipboardList,
      roles: ["admin"],
      children: [
        { titleKey: "purchaseDashboard", href: "/purchase", icon: LayoutDashboard },
        { titleKey: "rfq", href: "/purchase/rfq", icon: ClipboardList },
        { titleKey: "purchaseOrders", href: "/purchase/orders", icon: ShoppingBag },
        { titleKey: "vendors", href: "/purchase/vendors", icon: UserCircle },
        { titleKey: "vendorService", href: "/logistics/vendors", icon: Truck },
        { titleKey: "bills", href: "/purchase/bills", icon: FileText },
      ],
    },
    {
      type: "group",
      titleKey: "reports",
      basePath: "/reports",
      icon: TrendingUp,
      roles: ["admin"],
      children: [
        { titleKey: "salesReport", href: "/reports/sales", icon: TrendingUp },
        { titleKey: "purchaseReport", href: "/reports/purchase", icon: ShoppingBag },
        { titleKey: "arAging", href: "/reports/ar-aging", icon: Receipt },
        { titleKey: "apAging", href: "/reports/ap-aging", icon: FileText },
      ],
    },
    {
      type: "group",
      titleKey: "accounting",
      basePath: "/accounting",
      icon: BookOpen,
      roles: ["admin"],
      children: [
        { titleKey: "chartOfAccounts", href: "/accounting/accounts", icon: Landmark },
        { titleKey: "journals", href: "/accounting/journals", icon: BookOpen },
        { titleKey: "journalEntry", href: "/accounting/entries", icon: FileText },
        { titleKey: "journalItems", href: "/accounting/journal-items", icon: List },
        { titleKey: "payments", href: "/accounting/payments", icon: Wallet },
        { titleKey: "taxes", href: "/accounting/taxes", icon: Receipt },
        { titleKey: "trialBalance", href: "/accounting/reports/trial-balance", icon: FileSpreadsheet },
        { titleKey: "generalLedger", href: "/accounting/reports/general-ledger", icon: BookOpen },
        { titleKey: "profitLoss", href: "/accounting/reports/profit-loss", icon: TrendingUp },
        { titleKey: "balanceSheet", href: "/accounting/reports/balance-sheet", icon: Wallet },
        { titleKey: "reconciliation", href: "/accounting/reconciliation", icon: GitMerge },
        { titleKey: "accountingSettings", href: "/accounting/settings", icon: Settings },
      ],
    },
    { type: "flat", titleKey: "trading", href: "/trading", icon: Package, roles: ["admin", "trading"] },
    {
      type: "group",
      titleKey: "logistics",
      basePath: "/logistics",
      icon: Truck,
      roles: ["admin", "logistics"],
      children: [
        { titleKey: "shipments", href: "/logistics", icon: Truck },
        { titleKey: "freightForwarding", href: "/logistics/freight", icon: Ship },
        { titleKey: "portalOrders", href: "/logistics/portal-orders", icon: ClipboardList },
      ],
    },
    { type: "flat", titleKey: "pos", href: "/pos", icon: Calculator, roles: ["admin", "pos"] },
    {
      type: "group",
      titleKey: "expense",
      basePath: "/expense",
      icon: DollarSign,
      roles: ["admin"],
      children: [
        { titleKey: "expenseList", href: "/expense", icon: Receipt },
        { titleKey: "expenseCategories", href: "/expense/categories", icon: Tags },
        { titleKey: "expenseReports", href: "/expense/reports", icon: BarChart2 },
      ],
    },
    { type: "flat", titleKey: "correspondences", href: "/correspondences", icon: Mail, roles: ["admin"] },
    { type: "flat", titleKey: "emailInbox", href: "/email-inbox", icon: Mail, roles: ["admin"] },
    { type: "flat", titleKey: "users", href: "/users", icon: Users, roles: ["admin"] },
    { type: "flat", titleKey: "aiChatbot", href: "/settings/ai-chatbot", icon: Bot, roles: ["admin"] },
    { type: "flat", titleKey: "aiScanSettings", href: "/settings/ai-scan", icon: ScanLine, roles: ["admin"] },
    { type: "flat", titleKey: "settings", href: "/settings", icon: Settings, roles: ["admin", "ecommerce", "trading", "logistics", "pos"] },
  ];

  const getNavTitle = (key: string): string => {
    return (t.nav as Record<string, string>)[key] ?? key;
  };

  const { data: aiDrafts = [] } = useListAiDraftQuotations({
    query: {
      enabled: dbUser?.role === "admin",
      refetchInterval: 60_000,
      queryKey: getListAiDraftQuotationsQueryKey(),
    },
  });
  const aiDraftCount = aiDrafts.length;

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
    if (href === "/sales" || href === "/purchase" || href === "/logistics") return false;
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
                {t.nav.modules}
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
                            tooltip={getNavTitle(item.titleKey)}
                          >
                            <Link href={item.href} className="flex items-center gap-3" data-testid={`nav-${item.titleKey.toLowerCase()}`}>
                              <item.icon size={18} />
                              <span>{getNavTitle(item.titleKey)}</span>
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
                          tooltip={getNavTitle(item.titleKey)}
                          onClick={() => toggleGroup(item.basePath)}
                          data-testid={`nav-group-${item.titleKey.toLowerCase()}`}
                          className="flex items-center gap-3"
                        >
                          <item.icon size={18} />
                          <span className="flex-1">{getNavTitle(item.titleKey)}</span>
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </SidebarMenuButton>
                        {open && (
                          <SidebarMenuSub>
                            {item.children.map((c) => (
                              <SidebarMenuSubItem key={c.href}>
                                <SidebarMenuSubButton asChild isActive={isChildActive(c.href)}>
                                  <Link href={c.href} className="flex items-center gap-2" data-testid={`nav-sub-${c.titleKey.toLowerCase().replace(/\s+/g, "-")}`}>
                                    <c.icon size={14} />
                                    <span className="flex-1">{getNavTitle(c.titleKey)}</span>
                                    {c.href === "/sales/ai-drafts" && aiDraftCount > 0 && (
                                      <span className="ml-auto inline-flex items-center justify-center rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none min-w-[18px]">
                                        {aiDraftCount}
                                      </span>
                                    )}
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
            <div className="mb-3">
              <LanguageSelector />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getInitials(dbUser?.name || undefined)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="truncate text-sm font-medium leading-none">
                      {dbUser?.name || "User"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground mt-1">
                      {dbUser?.role || t.common.noRole}
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-popover text-popover-foreground border-border">
                <div className="flex items-center gap-2 p-2">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarFallback>{getInitials(dbUser?.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{dbUser?.name}</p>
                    <p className="text-xs text-muted-foreground">{dbUser?.email}</p>
                  </div>
                </div>
                <div className="p-2 pt-0">
                  <Badge variant="secondary" className="w-full justify-center capitalize">
                    {dbUser?.role} {t.common.division}
                  </Badge>
                </div>
                <DropdownMenuItem
                  onClick={() => { window.location.href = "/api/logout"; }}
                  className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t.common.logOut}</span>
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
