import { ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CommandPalette, useCommandPalette, usePageTracker } from "@/components/CommandPalette";
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
  ShieldCheck,
  Shield,
  Calendar,

  Search,
  Bell,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Send,
  Link2,
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
import { DevUserSwitcher } from "@/components/layout/DevUserSwitcher";
import { useOrderNotificationsContext } from "@/contexts/OrderNotificationsContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useCompany } from "@/contexts/CompanyContext";
import { cn } from "@/lib/utils";
import { useNavPreferences } from "@/hooks/useNavPreferences";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { SortableNavWrapper } from "./SortableNavWrapper";

const IS_DEV = import.meta.env.DEV;

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
  children: { titleKey: string; href: string; icon: LucideIcon; roles?: string[]; companyCodes?: string[] }[];
  companyCodes?: string[];
}

type NavItem = FlatItem | GroupItem;

const ALL_ROLES = ["manager", "admin", "owner", "ecommerce", "trading", "logistics"];

const getKey = (item: NavItem): string =>
  item.type === "group" ? item.basePath : item.href;

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
  const { unreadCount, dbUnreadTotal } = useOrderNotificationsContext();

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

    // ── NOTIFIKASI ────────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Notifikasi",
      href: "/notifications",
      icon: Bell,
      roles: ["admin", "owner"],
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

    // ── 4. USER & ROLE ────────────────────────────────────────────────
    {
      type: "group",
      titleKey: "User & Role",
      basePath: "/users",
      icon: Users,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "Pengguna", href: "/users", icon: UserCircle },
        { titleKey: "Manajemen Role", href: "/settings/roles", icon: ShieldCheck },
        { titleKey: "Aturan Approval", href: "/settings/approval-rules", icon: ClipboardCheck },
        { titleKey: "Struktur Organisasi", href: "/org", icon: Network },
      ],
    },

    // ── 7. LAPORAN ────────────────────────────────────────────────────
    {
      type: "group",
      titleKey: "Laporan",
      basePath: "/reports",
      icon: BarChart2,
      roles: ["manager", "admin", "owner"],
      children: [
        { titleKey: "Audit ERP", href: "/audit", icon: ClipboardCheck, roles: ["admin", "owner"] },
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
        { titleKey: "Portal Product Orders", href: "/portal-product-orders", icon: ShoppingBag, companyCodes: ["CST"] },
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
        { titleKey: "rfq", href: "/purchase/rfq", icon: FileText },
        { titleKey: "purchaseOrders", href: "/purchase/orders", icon: ShoppingBag },
        { titleKey: "Terima Barang (GRN)", href: "/purchase/gr", icon: PackageCheck },
        { titleKey: "QC Inspection", href: "/purchase/qc", icon: ClipboardCheck },
        { titleKey: "Purchase Return", href: "/purchase/returns", icon: RotateCcw },
        { titleKey: "Vendor Invoice (AP)", href: "/purchase/vendor-invoices", icon: Receipt },
        { titleKey: "Payment Request", href: "/purchase/payment-requests", icon: Wallet },
        { titleKey: "Landed Cost", href: "/purchase/landed-costs", icon: Calculator },
        { titleKey: "vendors", href: "/purchase/vendors", icon: UserCircle },
        { titleKey: "Vendor Forms", href: "/purchase/vendor-forms", icon: Send },
        { titleKey: "Thai Tea Procurement", href: "/purchase/thai-tea", icon: ShoppingBag, companyCodes: ["CST"] },
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
        { titleKey: "freightForwarding", href: "/logistics/freight", icon: Ship, companyCodes: ["CST"] },
        { titleKey: "Balasan Quotation WA", href: "/logistics/quotation-reply", icon: MessageCircle, companyCodes: ["CST"] },
        { titleKey: "Performa Driver", href: "/logistics/driver-performance", icon: BarChart2, companyCodes: ["CST"] },
        { titleKey: "RFQ Vendor", href: "/logistics/rfq", icon: Send, companyCodes: ["CST"] },
        { titleKey: "Request Quote", href: "/logistics/quote-requests", icon: FileText, companyCodes: ["CST"] },
        { titleKey: "portalOrders", href: "/logistics/portal-orders", icon: ClipboardList, companyCodes: ["CST"] },
        { titleKey: "Pelanggan Portal", href: "/portal/customers", icon: Users },
        { titleKey: "Persetujuan Onboarding", href: "/portal/onboarding-approvals", icon: Users },
      ],
    },
    // ── HOLDING ────────────────────────────────────────────────────────
    {
      type: "group",
      titleKey: "Holding",
      basePath: "/holding",
      icon: Building2,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "Overview Perusahaan", href: "/holding", icon: LayoutDashboard },
        { titleKey: "Dashboard Holding", href: "/holding/dashboard", icon: BarChart2 },
        { titleKey: "Laporan L/R Holding", href: "/holding/pl-report", icon: TrendingUp },
        { titleKey: "Laporan Arus Kas", href: "/holding/cashflow-report", icon: Wallet },
      ],
    },

    { type: "flat", titleKey: "trading", href: "/trading", icon: Package, roles: ["admin", "owner", "trading"] },
    { type: "flat", titleKey: "Katalog Terpadu", href: "/katalog-terpadu", icon: Layers, roles: ["admin", "owner"] },
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

    // ── KOMUNIKASI (gabungan Korespondensi + Email Inbox) ──────────────
    {
      type: "group",
      titleKey: "Komunikasi",
      basePath: "/correspondences",
      icon: Mail,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "correspondences", href: "/correspondences", icon: Mail },
        { titleKey: "emailInbox", href: "/email-inbox", icon: MessageCircle },
      ],
    },

    // ── AI & MEDIA (gabungan AI tools + Image Manager) ─────────────────
    {
      type: "group",
      titleKey: "AI & Media",
      basePath: "/settings/ai",
      icon: Bot,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "aiChatbot", href: "/settings/ai-chatbot", icon: Bot },
        { titleKey: "aiKnowledgeBase", href: "/settings/ai-chatbot/knowledge", icon: BookOpen },
        { titleKey: "aiScanSettings", href: "/settings/ai-scan", icon: ScanLine },
        { titleKey: "Konfigurasi Menu", href: "/settings/nav-company-config", icon: LayoutGrid },
        { titleKey: "Short Links", href: "/settings/short-links", icon: Link2 },
        { titleKey: "Image Manager", href: "/media", icon: ImageIcon },
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
      enabled: (dbUser?.role as string) === "admin" || (dbUser?.role as string) === "owner",
      refetchInterval: 60_000,
      queryKey: getListAiDraftQuotationsQueryKey(),
    },
  });
  const aiDraftCount = aiDrafts.length;

  const customRolePermissions = (dbUser as any)?.customRolePermissions as string[] | null | undefined;

  const { hiddenItems, itemOrder, toggle: toggleHidden, reorder, reset: resetHidden } = useNavPreferences();
  const [customizeMode, setCustomizeMode] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filteredNav = navItems.filter((item) => {
    if (!dbUser?.role) return false;

    // Filter berdasarkan company code
    if (item.companyCodes && item.companyCodes.length > 0) {
      if (isConsolidated || !activeCompany) return false;
      if (!item.companyCodes.includes(activeCompany.companyCode)) return false;
    }

    // owner dan admin (built-in) melihat semua
    if ((dbUser.role as string) === "owner") return true;
    if ((dbUser.role as string) === "admin") return true;

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

  // Per-user hidden items filter (bypass in customize mode to show all)
  const visibleNav = customizeMode
    ? filteredNav
    : filteredNav.filter((item) => !hiddenItems.includes(getKey(item)));

  // Terapkan urutan custom pengguna
  const orderedNav = itemOrder.length === 0
    ? visibleNav
    : [...visibleNav].sort((a, b) => {
        const ia = itemOrder.indexOf(getKey(a));
        const ib = itemOrder.indexOf(getKey(b));
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

  // Pisahkan nav utama (8 menu pokok) dan ERP lanjutan
  const MAIN_PATHS = [
    "/dashboard", "/notifications", "/products",
    "/users", "/reports", "/settings",
  ];
  const mainNav = orderedNav.filter((item) => {
    const p = getKey(item);
    return MAIN_PATHS.includes(p);
  });
  const erpNav = orderedNav.filter((item) => {
    const p = getKey(item);
    return !MAIN_PATHS.includes(p);
  });

  const handleMainNavDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const keys = mainNav.map(getKey);
    const oldIdx = keys.indexOf(String(active.id));
    const newIdx = keys.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    reorder([...arrayMove(keys, oldIdx, newIdx), ...erpNav.map(getKey)]);
  };

  const handleErpNavDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const keys = erpNav.map(getKey);
    const oldIdx = keys.indexOf(String(active.id));
    const newIdx = keys.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    reorder([...mainNav.map(getKey), ...arrayMove(keys, oldIdx, newIdx)]);
  };

  const DASHBOARD_CHILD_PATHS = ["/portal-product-orders"];
  const isGroupActive = (g: GroupItem) => {
    if (location === g.basePath || location.startsWith(`${g.basePath}/`)) return true;
    if (g.basePath === "/dashboard" && DASHBOARD_CHILD_PATHS.some((p) => location === p || location.startsWith(`${p}/`))) return true;
    // Cek apakah salah satu child aktif (untuk grup dengan basePath virtual)
    if (g.children.some((c) => location === c.href || location.startsWith(`${c.href}/`))) return true;
    return false;
  };

  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();
  usePageTracker();

  const { data: navConfig } = useQuery<Record<string, string[]>>({
    queryKey: ["settings", "nav-company-config"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/settings/nav-company-config", { credentials: "include" });
        if (!res.ok) return {};
        return res.json();
      } catch { return {}; }
    },
    staleTime: 5 * 60 * 1000,
    enabled: (dbUser?.role as string) === "admin" || (dbUser?.role as string) === "owner",
  });

  const companyKey = isConsolidated ? "__all__" : String(activeCompany?.id ?? 0);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of navItems) {
      if (item.type === "group") {
        const active =
          location === item.basePath ||
          location.startsWith(`${item.basePath}/`) ||
          item.children.some((c) => location === c.href || location.startsWith(`${c.href}/`));
        if (active) initial[`${companyKey}:${item.basePath}`] = true;
      }
    }
    return initial;
  });

  const toggleGroup = (basePath: string) =>
    setOpenGroups((s) => ({ ...s, [`${companyKey}:${basePath}`]: !s[`${companyKey}:${basePath}`] }));

  const filterChild = (c: { href: string; companyCodes?: string[] }) => {
    const effectiveCodes = c.href in (navConfig ?? {}) ? (navConfig ?? {})[c.href] : c.companyCodes;
    if (!effectiveCodes || effectiveCodes.length === 0) return true;
    if (effectiveCodes.includes("__holding__")) return isConsolidated;
    if (isConsolidated) return false;
    return activeCompany ? effectiveCodes.includes(activeCompany.companyCode) : false;
  };

  const isChildActive = (href: string) => {
    if (location === href) return true;
    if (href === "/sales" || href === "/purchase" || href === "/logistics") return false;
    return location.startsWith(`${href}/`) || location === href;
  };

  const renderNavList = (items: NavItem[], onDragEnd: (e: DragEndEvent) => void) => {
    if (!customizeMode) {
      return (
        <SidebarMenu>
          {items.map(renderNavItem)}
        </SidebarMenu>
      );
    }
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map(getKey)} strategy={verticalListSortingStrategy}>
          <div className="flex w-full min-w-0 flex-col gap-1">
            {items.map((item) => (
              <SortableNavWrapper key={getKey(item)} id={getKey(item)}>
                {renderNavItem(item)}
              </SortableNavWrapper>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  };

  const renderNavItem = (item: NavItem) => {
    const itemKey = item.type === "group" ? item.basePath : item.href;
    const isHidden = hiddenItems.includes(itemKey);

    if (item.type === "flat") {
      const isNotif = item.href === "/notifications";
      return (
        <SidebarMenuItem key={item.href} className={cn(customizeMode && isHidden && "opacity-40")}>
          <div className="flex items-center">
            <SidebarMenuButton
              asChild
              isActive={location === item.href || location.startsWith(`${item.href}/`)}
              tooltip={getNavTitle(item.titleKey)}
              className="flex-1"
            >
              <Link href={item.href} className="flex items-center gap-3" data-testid={`nav-${item.titleKey.toLowerCase().replace(/\s+/g, "-")}`}>
                <item.icon size={18} />
                <span className="flex-1">{getNavTitle(item.titleKey)}</span>
                {isNotif && dbUnreadTotal > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none min-w-[18px]">
                    {dbUnreadTotal > 99 ? "99+" : dbUnreadTotal}
                  </span>
                )}
              </Link>
            </SidebarMenuButton>
            {customizeMode && (
              <button
                onClick={() => toggleHidden(itemKey)}
                className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground"
                title={isHidden ? "Tampilkan" : "Sembunyikan"}
              >
                {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            )}
          </div>
        </SidebarMenuItem>
      );
    }

    const open = openGroups[`${companyKey}:${item.basePath}`] ?? false;
    const active = isGroupActive(item);

    const ERP_MODULE_PATHS = ["/accounting", "/sales", "/purchase", "/logistics", "/expense"];
    const isErpModule = ERP_MODULE_PATHS.includes(item.basePath);

    const roleFilteredChildren = item.children.filter((c) =>
      (!c.roles || (dbUser?.role && c.roles.includes(dbUser.role))) && filterChild(c)
    );
    const visibleChildren = customizeMode
      ? roleFilteredChildren
      : roleFilteredChildren.filter((c) => !hiddenItems.includes(c.href));

    return (
      <SidebarMenuItem key={item.basePath} className={cn(customizeMode && isHidden && "opacity-40")}>
        <div className="flex items-center">
          <SidebarMenuButton
            isActive={active}
            tooltip={getNavTitle(item.titleKey)}
            onClick={() => toggleGroup(item.basePath)}
            data-testid={`nav-group-${item.titleKey.toLowerCase().replace(/\s+/g, "-")}`}
            className="flex items-center gap-3 flex-1"
          >
            <item.icon size={18} />
            <span className="flex-1">{getNavTitle(item.titleKey)}</span>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </SidebarMenuButton>
          {customizeMode && (
            <button
              onClick={() => toggleHidden(itemKey)}
              className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground"
              title={isHidden ? "Tampilkan" : "Sembunyikan"}
            >
              {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          )}
        </div>
        {open && (
          <SidebarMenuSub>
            {visibleChildren.map((c) => {
              const childHidden = hiddenItems.includes(c.href);
              return (
                <SidebarMenuSubItem key={c.href} className={cn(customizeMode && childHidden && "opacity-40")}>
                  <div className="flex items-center">
                    <SidebarMenuSubButton asChild isActive={isChildActive(c.href)} className="flex-1">
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
                    {customizeMode && (
                      <button
                        onClick={() => toggleHidden(c.href)}
                        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground"
                        title={childHidden ? "Tampilkan" : "Sembunyikan"}
                      >
                        {childHidden ? <Eye size={11} /> : <EyeOff size={11} />}
                      </button>
                    )}
                  </div>
                </SidebarMenuSubItem>
              );
            })}
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
              <span className="text-lg font-bold tracking-tight flex-1">BizPortal</span>
              <button
                onClick={() => setCustomizeMode((m) => !m)}
                className={cn(
                  "p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors",
                  customizeMode && "bg-accent text-foreground"
                )}
                title="Sesuaikan tampilan menu"
              >
                <SlidersHorizontal size={14} />
              </button>
            </div>
            {customizeMode && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-accent/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                <span>Klik <EyeOff size={10} className="inline -mt-px" /> untuk sembunyikan item</span>
                <button
                  onClick={resetHidden}
                  className="shrink-0 font-medium text-destructive hover:text-destructive/80"
                >
                  Reset
                </button>
              </div>
            )}
          </SidebarHeader>

          <SidebarContent>
            {/* Menu Utama */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground px-4 py-2 text-xs font-medium uppercase tracking-wider">
                Menu Utama
              </SidebarGroupLabel>
              <SidebarGroupContent>
                {renderNavList(mainNav, handleMainNavDragEnd)}
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Modul ERP (hanya tampil jika ada menu ERP) */}
            {erpNav.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-muted-foreground px-4 py-2 text-xs font-medium uppercase tracking-wider">
                  Modul ERP
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  {renderNavList(erpNav, handleErpNavDragEnd)}
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          <SidebarFooter />
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-border bg-background px-4 sm:px-6 lg:hidden">
            <SidebarTrigger />
            <div className="flex items-center gap-2 font-bold">
              <Building2 size={18} className="text-primary" />
              <span>BizPortal</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setCmdOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
                aria-label="Buka pencarian (Ctrl+K)"
              >
                <Search size={13} />
                <span className="hidden sm:inline">Cari...</span>
                <kbd className="hidden sm:inline rounded bg-background px-1 py-0.5 text-[10px] font-mono border border-border">⌘K</kbd>
              </button>
              {IS_DEV && dbUser && (
                <span className="hidden sm:flex items-center gap-1 rounded border border-amber-600/40 bg-amber-950/30 px-2 py-0.5 text-[10px] font-mono text-amber-400 max-w-[140px] truncate" title={`Login sebagai: ${dbUser.email}`}>
                  {dbUser.name || dbUser.email}
                </span>
              )}
              {IS_DEV && <DevUserSwitcher />}
              <NotificationBell />
            </div>
          </div>
          <div className="hidden lg:flex sticky top-0 z-10 h-12 items-center justify-between border-b border-border bg-background px-6">
            <CompanySwitcher />
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCmdOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                aria-label="Buka pencarian (Ctrl+K)"
              >
                <Search size={13} />
                <span>Cari halaman...</span>
                <kbd className="ml-1 rounded bg-background px-1 py-0.5 text-[10px] font-mono border border-border">Ctrl+K</kbd>
              </button>
              {IS_DEV && dbUser && (
                <span className="flex items-center gap-1.5 rounded border border-amber-600/40 bg-amber-950/30 px-2 py-1 text-[11px] font-mono text-amber-400 max-w-[200px]" title={dbUser.email ?? ""}>
                  <span className="text-amber-600/70 shrink-0">as:</span>
                  <span className="truncate">{dbUser.name || dbUser.email}</span>
                </span>
              )}
              {IS_DEV && <DevUserSwitcher />}
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
