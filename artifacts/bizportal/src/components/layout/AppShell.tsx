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
  MessageCircle,
  Layers,
  Network,
  ImageIcon,
  Warehouse,
  LayoutGrid,
  PackageSearch,
  ArrowLeftRight,
  ClipboardCheck,
  Activity,
  FlaskConical,
  ChefHat,
  GitBranch,
  RotateCcw,
  AlertTriangle,
  PackageCheck,
  QrCode,
  FileBarChart2,
  ShieldCheck,
  Shield,
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
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useLanguage } from "@/contexts/LanguageContext";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useCompany } from "@/contexts/CompanyContext";

interface AppShellProps {
  children: ReactNode;
}

interface FlatItem {
  type: "flat";
  titleKey: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
  companyCodes?: string[];
}

interface GroupItem {
  type: "group";
  titleKey: string;
  basePath: string;
  icon: LucideIcon;
  roles: string[];
  children: { titleKey: string; href: string; icon: LucideIcon; roles?: string[] }[];
  companyCodes?: string[];
}

type NavItem = FlatItem | GroupItem;

// Role hierarchy — semua role diatas "kasir" juga dapat melihat semua yang kasir bisa lihat
// kasir    : Dashboard, POS Kasir
// gudang   : Inventory
// manager  : Dashboard, POS Kasir, Inventory, Cabang, Laporan
// admin    : semua menu dalam company
// owner    : semua menu
// (plus legacy built-in roles: ecommerce, trading, logistics, pos)

const ALL_ROLES = ["kasir", "gudang", "manager", "admin", "owner", "ecommerce", "trading", "logistics", "pos"];

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const { t } = useLanguage();
  const { activeCompany, isConsolidated } = useCompany();
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
    // ── 1. DASHBOARD ──────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      roles: ALL_ROLES,
    },

    // ── 2. POS KASIR ──────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "POS Kasir",
      href: "/pos-kasir",
      icon: Calculator,
      roles: ["kasir", "manager", "admin", "owner", "pos"],
    },

    // ── 3. PRODUK & RECIPE/BOM ────────────────────────────────────────
    {
      type: "group",
      titleKey: "Produk & Recipe/BOM",
      basePath: "/products",
      icon: ChefHat,
      roles: ["manager", "admin", "owner"],
      children: [
        { titleKey: "Produk / Bahan Baku", href: "/products/items", icon: PackageSearch },
        { titleKey: "Recipe / BOM", href: "/products/recipes", icon: FlaskConical },
      ],
    },

    // ── 4. INVENTORY ──────────────────────────────────────────────────
    {
      type: "group",
      titleKey: "Inventory",
      basePath: "/inventory",
      icon: Boxes,
      roles: ["gudang", "manager", "admin", "owner"],
      children: [
        { titleKey: "Gudang", href: "/inventory/warehouses", icon: Warehouse },
        { titleKey: "Rak", href: "/inventory/racks", icon: LayoutGrid },
        { titleKey: "Stok", href: "/inventory/stock", icon: Boxes },
        { titleKey: "Transfer Stok", href: "/inventory/transfers", icon: ArrowLeftRight },
        { titleKey: "Retur Barang", href: "/inventory/returns", icon: RotateCcw },
        { titleKey: "Barang Rusak / Hilang", href: "/inventory/damage", icon: AlertTriangle },
        { titleKey: "Stock Opname", href: "/inventory/opname", icon: ClipboardCheck },
        { titleKey: "Riwayat Pergerakan", href: "/inventory/movements", icon: Activity },
      ],
    },

    // ── 5. CABANG ─────────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Cabang",
      href: "/pos-inventory/branches",
      icon: GitBranch,
      roles: ["manager", "admin", "owner"],
    },

    // ── 6. USER & ROLE ────────────────────────────────────────────────
    {
      type: "group",
      titleKey: "User & Role",
      basePath: "/users-role",
      icon: Users,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "Pengguna", href: "/users", icon: UserCircle },
        { titleKey: "Manajemen Role", href: "/settings/roles", icon: ShieldCheck },
        { titleKey: "Struktur Organisasi", href: "/org", icon: Network },
      ],
    },

    // ── 7. LAPORAN ────────────────────────────────────────────────────
    {
      type: "group",
      titleKey: "Laporan",
      basePath: "/reports",
      icon: BarChart2,
      roles: ["manager", "admin", "owner", "kasir", "gudang"],
      children: [
        { titleKey: "Lap. Operasional (POS & Stok)", href: "/reports/operasional", icon: BarChart2, roles: ["manager", "admin", "owner", "kasir", "gudang"] },
        { titleKey: "Audit Log Keamanan", href: "/reports/audit-log", icon: Shield, roles: ["admin", "owner"] },
        { titleKey: "Laporan Penjualan B2B", href: "/reports/sales", icon: TrendingUp, roles: ["manager", "admin", "owner"] },
        { titleKey: "Laporan Pembelian", href: "/reports/purchase", icon: ShoppingBag, roles: ["admin", "owner"] },
        { titleKey: "Valuasi Persediaan", href: "/reports/inventory-valuation", icon: PackageSearch, roles: ["admin", "owner"] },
        { titleKey: "AR Aging", href: "/reports/ar-aging", icon: Receipt, roles: ["admin", "owner"] },
        { titleKey: "AP Aging", href: "/reports/ap-aging", icon: FileText, roles: ["admin", "owner"] },
      ],
    },

    // ── 8. SETTINGS ───────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "settings",
      href: "/settings",
      icon: Settings,
      roles: ["admin", "owner", "ecommerce", "trading", "logistics", "pos"],
    },

    // ── MODUL ERP LANJUTAN (admin / owner) ────────────────────────────
    {
      type: "group",
      titleKey: "sales",
      basePath: "/sales",
      icon: TrendingUp,
      roles: ["admin", "owner"],
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
      roles: ["admin", "owner"],
      children: [
        { titleKey: "purchaseDashboard", href: "/purchase", icon: LayoutDashboard },
        { titleKey: "Purchase Request (PR)", href: "/purchase/pr", icon: ClipboardList },
        { titleKey: "rfq", href: "/purchase/rfq", icon: ClipboardList },
        { titleKey: "purchaseOrders", href: "/purchase/orders", icon: ShoppingBag },
        { titleKey: "Terima Barang (GRN)", href: "/purchase/gr", icon: PackageCheck },
        { titleKey: "QC Inspection", href: "/purchase/qc", icon: ClipboardCheck },
        { titleKey: "Purchase Return", href: "/purchase/returns", icon: RotateCcw },
        { titleKey: "Vendor Invoice (AP)", href: "/purchase/vendor-invoices", icon: FileText },
        { titleKey: "Payment Request", href: "/purchase/payment-requests", icon: Wallet },
        { titleKey: "Landed Cost", href: "/purchase/landed-costs", icon: Calculator },
        { titleKey: "vendors", href: "/purchase/vendors", icon: UserCircle },
        { titleKey: "bills", href: "/purchase/bills", icon: FileText },
      ],
    },
    {
      type: "group",
      titleKey: "accounting",
      basePath: "/accounting",
      icon: BookOpen,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "chartOfAccounts", href: "/accounting/accounts", icon: Landmark },
        { titleKey: "journals", href: "/accounting/journals", icon: BookOpen },
        { titleKey: "journalEntry", href: "/accounting/entries", icon: FileText },
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
    {
      type: "group",
      titleKey: "logistics",
      basePath: "/logistics",
      icon: Truck,
      roles: ["admin", "owner", "logistics"],
      children: [
        { titleKey: "shipments", href: "/logistics", icon: Truck },
        { titleKey: "freightForwarding", href: "/logistics/freight", icon: Ship },
        { titleKey: "Balasan Quotation WA", href: "/logistics/quotation-reply", icon: MessageCircle },
        { titleKey: "Performa Driver", href: "/logistics/driver-performance", icon: BarChart2 },
        { titleKey: "Request Quote", href: "/logistics/quote-requests", icon: FileText },
        { titleKey: "portalOrders", href: "/logistics/portal-orders", icon: ClipboardList },
      ],
    },
    { type: "flat", titleKey: "trading", href: "/trading", icon: Package, roles: ["admin", "owner", "trading"] },
    {
      type: "group",
      titleKey: "expense",
      basePath: "/expense",
      icon: DollarSign,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "expenseList", href: "/expense", icon: Receipt },
        { titleKey: "expenseCategories", href: "/expense/categories", icon: Tags },
        { titleKey: "expenseReports", href: "/expense/reports", icon: BarChart2 },
      ],
    },
    { type: "flat", titleKey: "correspondences", href: "/correspondences", icon: Mail, roles: ["admin", "owner"] },
    { type: "flat", titleKey: "emailInbox", href: "/email-inbox", icon: Mail, roles: ["admin", "owner"] },
    { type: "flat", titleKey: "Image Manager", href: "/media", icon: ImageIcon, roles: ["admin", "owner"] },
    { type: "flat", titleKey: "aiChatbot", href: "/settings/ai-chatbot", icon: Bot, roles: ["admin", "owner"] },
    { type: "flat", titleKey: "aiKnowledgeBase", href: "/settings/ai-knowledge", icon: BookOpen, roles: ["admin", "owner"] },
    { type: "flat", titleKey: "aiScanSettings", href: "/settings/ai-scan", icon: ScanLine, roles: ["admin", "owner"] },
    {
      type: "group",
      titleKey: "holding",
      basePath: "/holding",
      icon: Layers,
      roles: ["owner"],
      children: [
        { titleKey: "holdingDashboard", href: "/holding/dashboard", icon: BarChart2 },
        { titleKey: "holdingPLReport", href: "/holding/pl-report", icon: FileBarChart2 },
        { titleKey: "holdingCompanies", href: "/holding", icon: Building2 },
      ],
    },
    {
      type: "group",
      titleKey: "Thai Tea CST",
      basePath: "/thai-tea",
      icon: ShoppingBag,
      roles: ["admin", "owner"],
      companyCodes: ["CST"],
      children: [
        { titleKey: "Dashboard", href: "/thai-tea/dashboard", icon: LayoutDashboard },
        { titleKey: "Stok Bahan Baku", href: "/thai-tea/stock", icon: Boxes },
        { titleKey: "Monitoring Cabang", href: "/thai-tea/branches", icon: GitBranch },
        { titleKey: "Produksi / Racikan", href: "/thai-tea/production", icon: FlaskConical },
        { titleKey: "Laporan", href: "/thai-tea/reports", icon: BarChart2 },
      ],
    },
  ];

  const getNavTitle = (key: string): string => {
    return (t.nav as Record<string, string>)[key] ?? key;
  };

  const { data: aiDrafts = [] } = useListAiDraftQuotations({
    query: {
      enabled: dbUser?.role === "admin" || dbUser?.role === "owner",
      refetchInterval: 60_000,
      queryKey: getListAiDraftQuotationsQueryKey(),
    },
  });
  const aiDraftCount = aiDrafts.length;

  const customRolePermissions = (dbUser as any)?.customRolePermissions as string[] | null | undefined;

  const filteredNav = navItems.filter((item) => {
    if (!dbUser?.role) return false;

    // Filter berdasarkan company code
    if (item.companyCodes && item.companyCodes.length > 0) {
      if (isConsolidated || !activeCompany) return false;
      if (!item.companyCodes.includes(activeCompany.companyCode)) return false;
    }

    // owner dan admin (built-in) melihat semua
    if (dbUser.role === "owner") return true;
    if (dbUser.role === "admin") return true;

    // Custom role permissions (format: "module" atau "module:view")
    if (customRolePermissions != null) {
      const path = item.type === "group" ? item.basePath : item.href;
      const seg = path.replace(/^\//, "").split("/")[0] ?? "";
      const full = path.replace(/^\//, "");

      // Cek format baru "segment:view" atau format lama "segment"
      return (
        customRolePermissions.includes(`${seg}:view`) ||
        customRolePermissions.includes(`${full}:view`) ||
        customRolePermissions.includes(seg) ||
        customRolePermissions.includes(full)
      );
    }

    // Built-in roles
    return item.roles.includes(dbUser.role);
  });

  // Pisahkan nav utama (8 menu pokok) dan ERP lanjutan
  const MAIN_PATHS = [
    "/dashboard", "/pos-kasir", "/pos-products", "/pos-inventory",
    "/users-role", "/reports", "/settings",
  ];
  const mainNav = filteredNav.filter((item) => {
    const p = item.type === "group" ? item.basePath : item.href;
    return MAIN_PATHS.includes(p) || p === "/pos-inventory/branches";
  });
  const erpNav = filteredNav.filter((item) => {
    const p = item.type === "group" ? item.basePath : item.href;
    return !MAIN_PATHS.includes(p) && p !== "/pos-inventory/branches";
  });

  const DASHBOARD_CHILD_PATHS = ["/portal-product-orders"];
  const isGroupActive = (g: GroupItem) => {
    if (location === g.basePath || location.startsWith(`${g.basePath}/`)) return true;
    if (g.basePath === "/dashboard" && DASHBOARD_CHILD_PATHS.some((p) => location === p || location.startsWith(`${p}/`))) return true;
    // Cek apakah salah satu child aktif (untuk grup dengan basePath virtual)
    if (g.children.some((c) => location === c.href || location.startsWith(`${c.href}/`))) return true;
    return false;
  };

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of navItems) {
      if (item.type === "group") {
        const active =
          location === item.basePath ||
          location.startsWith(`${item.basePath}/`) ||
          item.children.some((c) => location === c.href || location.startsWith(`${c.href}/`));
        if (active) initial[item.basePath] = true;
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

  const renderNavItem = (item: NavItem) => {
    if (item.type === "flat") {
      return (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            isActive={location === item.href || location.startsWith(`${item.href}/`)}
            tooltip={getNavTitle(item.titleKey)}
          >
            <Link href={item.href} className="flex items-center gap-3" data-testid={`nav-${item.titleKey.toLowerCase().replace(/\s+/g, "-")}`}>
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
          data-testid={`nav-group-${item.titleKey.toLowerCase().replace(/\s+/g, "-")}`}
          className="flex items-center gap-3"
        >
          <item.icon size={18} />
          <span className="flex-1">{getNavTitle(item.titleKey)}</span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </SidebarMenuButton>
        {open && (
          <SidebarMenuSub>
            {item.children.filter((c) => !c.roles || (dbUser?.role && c.roles.includes(dbUser.role))).map((c) => (
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
            {/* Menu Utama */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground px-4 py-2 text-xs font-medium uppercase tracking-wider">
                Menu Utama
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainNav.map(renderNavItem)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Modul ERP (hanya tampil jika ada menu ERP) */}
            {erpNav.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-muted-foreground px-4 py-2 text-xs font-medium uppercase tracking-wider">
                  Modul ERP
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {erpNav.map(renderNavItem)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          <SidebarFooter />
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background px-4 sm:px-6 lg:hidden">
            <SidebarTrigger />
            <div className="flex items-center gap-2 font-bold">
              <Building2 size={18} className="text-primary" />
              <span>BizPortal</span>
            </div>
            <div className="ml-auto">
              <NotificationBell />
            </div>
          </div>
          <div className="hidden lg:flex sticky top-0 z-10 h-12 items-center justify-between border-b border-border bg-background px-6">
            <CompanySwitcher />
            <div className="flex items-center gap-3">
              <LanguageSelector />
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="h-7 w-7 border border-border">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {getInitials(dbUser?.name || undefined)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-medium leading-none">{dbUser?.name || "User"}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{dbUser?.role || t.common.noRole}</span>
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
                    onClick={() => { window.location.href = "/api/logout?redirect=/bizportal/"; }}
                    className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{t.common.logOut}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
