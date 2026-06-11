import { ReactNode, useState, useEffect, useRef, useCallback } from "react";
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
  MessageSquare,
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
  CalendarDays,
  ShieldAlert,
  Database,
  Search,
  Bell,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Send,
  Link2,
  Brain,
  Trophy,
  KeyRound,
  PlaneTakeoff,
  Store,
  CreditCard,
  Sparkles,
  Plane,
  Anchor,
  MapPin,
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
import { useAlertWebSocket } from "@/hooks/useAlertWebSocket";
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
import { PinnedShortcuts } from "./PinnedShortcuts";

const IS_DEV = import.meta.env.DEV;

interface AppShellProps {
  children: ReactNode;
  noPadding?: boolean;
}

interface FlatItem {
  type: "flat";
  titleKey: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
  companyCodes?: string[];
  activePaths?: string[];
}

interface GroupItem {
  type: "group";
  titleKey: string;
  basePath: string;
  icon: LucideIcon;
  roles: string[];
  children: { titleKey: string; href: string; icon: LucideIcon; roles?: string[]; companyCodes?: string[]; devOnly?: boolean }[];
  companyCodes?: string[];
}

type NavItem = FlatItem | GroupItem;

const ALL_ROLES = ["manager", "admin", "owner", "ecommerce", "trading", "logistics"];

const getKey = (item: NavItem): string =>
  item.type === "group" ? item.basePath : item.href;

function applySortOrder<T extends { href: string }>(items: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0) return items;
  return [...items].sort((a, b) => {
    const ia = order.indexOf(a.href);
    const ib = order.indexOf(b.href);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function AppShell({ children, noPadding }: AppShellProps) {
  const [location, navigate] = useLocation();
  const { t } = useLanguage();
  const { activeCompany, isConsolidated } = useCompany();
  const { data: dbUser } = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      staleTime: Infinity,
    },
  });
  const { unreadCount, dbUnreadTotal } = useOrderNotificationsContext();

  useAlertWebSocket();

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
      activePaths: ["/dashboard", "/approvals", "/analytics", "/ceo-dashboard", "/operational-dashboard", "/enterprise-dashboard", "/exceptions"],
    },

    // ── 2. EXECUTIVE ──────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Executive",
      href: "/executive",
      icon: Trophy,
      roles: ["admin", "owner"],
      activePaths: ["/executive", "/holding", "/analytics", "/ceo-dashboard"],
    },

    // ── 3. MASTER DATA ────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Master Data",
      href: "/master-data",
      icon: Database,
      roles: ["manager", "admin", "owner"],
      activePaths: ["/master-data", "/products", "/katalog-terpadu"],
    },

    // ── 4. CRM & SALES ────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "CRM & Sales",
      href: "/sales",
      icon: TrendingUp,
      roles: ["admin", "owner"],
      activePaths: ["/sales", "/portal-product-orders"],
    },

    // ── 5. PROCUREMENT ────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Procurement",
      href: "/purchase",
      icon: ClipboardList,
      roles: ["admin", "owner"],
      activePaths: ["/purchase", "/marketplace"],
    },

    // ── 6. LOGISTICS ──────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Logistics",
      href: "/logistics",
      icon: Truck,
      roles: ["admin", "owner", "logistics", "trading"],
      activePaths: ["/logistics", "/air-freight", "/operational-dashboard", "/ocean-freight-master-data", "/logistics/vendor-fulfillments"],
      children: [
        { titleKey: "trading", href: "/trading", icon: Package, roles: ["admin", "owner", "trading"] },
        { titleKey: "Operational Dashboard", href: "/operational-dashboard", icon: LayoutDashboard },
        { titleKey: "shipments", href: "/logistics", icon: Truck },
        { titleKey: "freightForwarding", href: "/logistics/freight", icon: Ship, companyCodes: ["CST"] },
        { titleKey: "portalOrders", href: "/logistics/portal-orders", icon: ClipboardList, companyCodes: ["CST"] },
        { titleKey: "Order Trucking", href: "/logistics/trucking-orders", icon: Truck, companyCodes: ["CST"] },
        { titleKey: "Ocean Freight Orders", href: "/logistics/ocean-freight-orders", icon: Anchor, companyCodes: ["CST"] },
        { titleKey: "Air Freight Orders", href: "/air-freight/orders", icon: Plane, companyCodes: ["CST"] },
        { titleKey: "PPJK — Kepabeanan", href: "/logistics/ppjk", icon: FileText, companyCodes: ["CST"] },
        { titleKey: "Unified Shipments", href: "/logistics/shipments", icon: Layers, companyCodes: ["CST"] },
        { titleKey: "Vendor Fulfillment", href: "/logistics/vendor-fulfillments", icon: PackageCheck, companyCodes: ["CST"] },
        { titleKey: "Manajemen Driver", href: "/logistics/drivers", icon: Users, companyCodes: ["CST"] },
        { titleKey: "Performa Driver", href: "/logistics/driver-performance", icon: BarChart2, companyCodes: ["CST"] },
        { titleKey: "Analytics Driver", href: "/logistics/drivers/analytics", icon: BarChart2, companyCodes: ["CST"] },
        { titleKey: "RFQ Vendor", href: "/logistics/rfq", icon: Send, companyCodes: ["CST"] },
        { titleKey: "Request Quote", href: "/logistics/quote-requests", icon: FileText, companyCodes: ["CST"] },
        { titleKey: "Balasan Quotation WA", href: "/logistics/quotation-reply", icon: MessageCircle, companyCodes: ["CST"] },
        { titleKey: "AI Import Advisor", href: "/logistics/import-assistant", icon: Bot, companyCodes: ["CST"] },
        { titleKey: "Rate Management", href: "/logistics/rate-management", icon: DollarSign, roles: ["admin", "owner"] },
        { titleKey: "Margin Rules", href: "/logistics/margin-rules", icon: Calculator },
        { titleKey: "Internal Tasks", href: "/logistics/internal-tasks", icon: ClipboardCheck },
        { titleKey: "Vendor Recommendation", href: "/logistics/vendor-recommendation", icon: BarChart2, roles: ["admin", "owner"] },
        { titleKey: "Vendor × Komoditas", href: "/logistics/vendor-commodity-intelligence", icon: BarChart2, roles: ["admin", "owner"] },
        { titleKey: "Pelanggan Portal", href: "/portal/customers", icon: Users },
        { titleKey: "Persetujuan Onboarding", href: "/portal/onboarding-approvals", icon: Users },
        { titleKey: "Dashboard Logistik",   href: "/logistics/dashboard",          icon: LayoutDashboard },
        { titleKey: "Semua Shipment",        href: "/logistics/shipments",           icon: Truck },
        { titleKey: "RFQ & Quote",           href: "/logistics/rfq",                icon: Send },
        { titleKey: "Trucking",              href: "/logistics/trucking",           icon: Truck },
        { titleKey: "Air Freight",           href: "/logistics/air-freight",        icon: Plane },
        { titleKey: "Ocean Freight",         href: "/logistics/ocean-freight",      icon: Anchor },
        { titleKey: "PPJK / Customs",        href: "/logistics/ppjk",              icon: ClipboardList },
        { titleKey: "Vendor Fulfillment",    href: "/logistics/vendor-fulfillment", icon: PackageCheck },
        { titleKey: "Profitability",         href: "/logistics/profitability",      icon: TrendingUp,  roles: ["admin", "owner"] },
        { titleKey: "Settings Logistik",     href: "/logistics/settings",          icon: Settings },
      ],
    },

    // ── 7. TRADING ────────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Trading",
      href: "/trading",
      icon: Boxes,
      roles: ["admin", "owner", "trading"],
    },

    // ── 7b. SPORT CENTER ──────────────────────────────────────────────
    {
      type: "group",
      titleKey: "Sport Center",
      basePath: "/sport-center",
      icon: Trophy,
      roles: ["admin", "owner", "manager"],
      children: [
        { titleKey: "Dashboard", href: "/sport-center/dashboard", icon: LayoutDashboard },
        { titleKey: "Bookings", href: "/sport-center/bookings", icon: CalendarDays },
        { titleKey: "Fasilitas", href: "/sport-center/facilities", icon: Building2 },
        { titleKey: "Customers", href: "/sport-center/customers", icon: UserCircle },
        { titleKey: "Members", href: "/sport-center/members", icon: Users },
        { titleKey: "Pricing Rules", href: "/sport-center/pricing-rules", icon: Tags },
        { titleKey: "Pembayaran", href: "/sport-center/payments", icon: DollarSign },
        { titleKey: "Pengaturan", href: "/sport-center/settings", icon: Settings },
      ],
    },

    // ── TENANT / PENYEWA ──────────────────────────────────────────────
    {
      type: "group",
      titleKey: "Tenant / Penyewa",
      basePath: "/tenant",
      icon: Store,
      roles: ["admin", "owner", "manager"],
      children: [
        { titleKey: "Dashboard",        href: "/tenant/dashboard",           icon: LayoutDashboard },
        { titleKey: "Data Tenant",      href: "/tenant/tenants",             icon: Store },
        { titleKey: "Mall Units",       href: "/tenant/mall-units",          icon: MapPin },
        { titleKey: "Unit Kantin",      href: "/tenant/units",               icon: Building2 },
        { titleKey: "Booking Tenant",   href: "/tenant/bookings",            icon: FileText },
        { titleKey: "Invoice Tenant",   href: "/tenant/invoices",            icon: Receipt },
        { titleKey: "POS Tenant",       href: "/tenant/pos-tenant",          icon: LayoutGrid },
        { titleKey: "Pembayaran Sewa",  href: "/tenant/payments",            icon: DollarSign },
        { titleKey: "Rekap Tenant",     href: "/tenant/rekap",               icon: ClipboardList },
        { titleKey: "Laporan Keuangan", href: "/tenant/laporan-keuangan",    icon: BarChart2 },
        { titleKey: "Rekonsiliasi",     href: "/tenant/rekonsiliasi",        icon: ArrowLeftRight },
        { titleKey: "Rekonsiliasi Bank",href: "/accounting/bank-reconciliation", icon: Landmark },
        { titleKey: "Perbandingan Lokasi", href: "/tenant/perbandingan-lokasi", icon: MapPin },
        { titleKey: "Kirim WA",         href: "/tenant/kirim-wa",            icon: MessageCircle },
        { titleKey: "Template WA",      href: "/settings/wa-templates",      icon: MessageSquare },
        { titleKey: "Audit Log",        href: "/tenant/audit-log",           icon: Shield },
        { titleKey: "Manajemen User",   href: "/users",                      icon: Users },
        { titleKey: "Pengaturan",       href: "/tenant/pengaturan",          icon: Settings },
      ],
    },

    // ── KASIR POS (kasir_* tables) ────────────────────────────────────
    {
      type: "group",
      titleKey: "Kasir POS",
      basePath: "/tenant/kasir",
      icon: Store,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "Perusahaan",  href: "/tenant/kasir/companies", icon: Building2 },
        { titleKey: "Cabang",      href: "/tenant/kasir/branches",  icon: Layers },
        { titleKey: "Pengguna",    href: "/tenant/kasir/users",     icon: Users },
        { titleKey: "Produk",      href: "/tenant/kasir/products",  icon: ShoppingBag },
        { titleKey: "Perangkat",   href: "/tenant/kasir/devices",   icon: Database },
      ],
    },

    // ── POS SYSTEM (pos_* tables) ─────────────────────────────────────
    {
      type: "group",
      titleKey: "POS System",
      basePath: "/tenant/pos",
      icon: Package,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "Cabang POS",  href: "/tenant/pos/branches",  icon: Building2 },
        { titleKey: "Kasir",       href: "/tenant/pos/cashiers",  icon: UserCircle },
        { titleKey: "Produk POS",  href: "/tenant/pos/products",  icon: Package },
        { titleKey: "Role & Akses",href: "/tenant/pos/roles",     icon: Shield },
        { titleKey: "Pengaturan",  href: "/tenant/pos/settings",  icon: Settings },
      ],
    },

    // ── NOTIFICATIONS ─────────────────────────────────────────────────
    {
      type: "group",
      titleKey: "Notifications",
      basePath: "/notifications",
      icon: CalendarDays,
      roles: ["admin", "owner"],
      children: [
        { titleKey: "Dashboard",     href: "/sport-center/dashboard",       icon: LayoutDashboard },
        { titleKey: "Bookings",      href: "/sport-center/bookings",        icon: Calendar },
        { titleKey: "Fasilitas",     href: "/sport-center/facilities",      icon: Layers },
        { titleKey: "Members",       href: "/sport-center/members",         icon: Users },
        { titleKey: "Customers",     href: "/sport-center/customers",       icon: UserCircle },
        { titleKey: "Pricing Rules", href: "/sport-center/pricing-rules",   icon: Tags },
        { titleKey: "Pembayaran",        href: "/sport-center/payments",          icon: CreditCard },
        { titleKey: "Tagihan Perusahaan", href: "/sport-center/company-invoices", icon: FileText },
        { titleKey: "Laporan",           href: "/sport-center/reports",           icon: BarChart2 },
        { titleKey: "Settings",          href: "/sport-center/settings",          icon: Settings },
      ],
    },


    // ── 8. FINANCE ────────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Finance",
      href: "/finance",
      icon: BookOpen,
      roles: ["admin", "owner"],
      activePaths: ["/finance", "/accounting", "/expense", "/tax", "/holding"],
    },

    // ── 9. HR & PAYROLL ───────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "HR & Payroll",
      href: "/hr",
      icon: Users,
      roles: ["admin", "owner"],
    },

    // ── 10. AI CENTER ─────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "AI Center",
      href: "/ai-center",
      icon: Bot,
      roles: ["admin", "owner"],
      activePaths: ["/ai-center", "/ai", "/ai-approvals", "/operational-context", "/intelligence-alerts"],
    },

    // ── 11. REPORTS ───────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "Reports",
      href: "/reports",
      icon: BarChart2,
      roles: ["manager", "admin", "owner"],
      activePaths: ["/reports", "/audit", "/vendors"],
    },

    // ── 12. SETTINGS ──────────────────────────────────────────────────
    {
      type: "flat",
      titleKey: "settings",
      href: "/settings",
      icon: Settings,
      roles: ["admin", "owner"],
      activePaths: ["/settings", "/users", "/org", "/correspondences", "/email-inbox", "/media", "/system-health", "/notifications", "/notification-history"],
      children: [
        { titleKey: "Inbox", href: "/notifications", icon: Bell },
        { titleKey: "History", href: "/notification-history", icon: MessageCircle },
      ],
    },

    // ── 10. ADMINISTRATION / SETTINGS ────────────────────────────────
    {
      type: "group",
      titleKey: "Administration / Settings",
      basePath: "/admin",
      icon: Shield,
      roles: ["admin", "owner"],
      children: [
        // User Management
        { titleKey: "Pengguna", href: "/users", icon: UserCircle },
        { titleKey: "Manajemen Role", href: "/settings/roles", icon: ShieldCheck },
        { titleKey: "Aturan Approval", href: "/settings/approval-rules", icon: ClipboardCheck },
        { titleKey: "Struktur Organisasi", href: "/org", icon: Network },
        // Document Templates
        { titleKey: "Product Templates", href: "/settings/product-templates", icon: Layers },
        { titleKey: "Service Templates", href: "/settings/service-templates", icon: Layers },
        // COA / Taxes / Payment Methods
        { titleKey: "chartOfAccounts", href: "/accounting/accounts", icon: Landmark },
        { titleKey: "taxes", href: "/accounting/taxes", icon: Receipt },
        { titleKey: "payments", href: "/accounting/payments", icon: Wallet },
        // Communications & Config
        { titleKey: "correspondences", href: "/correspondences", icon: Mail },
        { titleKey: "emailInbox", href: "/email-inbox", icon: MessageCircle },
        { titleKey: "WA Templates Logistik", href: "/settings/wa-templates", icon: MessageCircle },
        { titleKey: "Enterprise WA Templates", href: "/settings/enterprise-wa-templates", icon: MessageSquare },
        { titleKey: "Monitor WA Driver", href: "/settings/wa-notification-logs", icon: Activity },
        // Logistics ops (dipindah dari menu Logistics)
        { titleKey: "Portal Orders", href: "/logistics/portal-orders", icon: ClipboardList, companyCodes: ["CST"] },
        { titleKey: "Service Requests (CSR)", href: "/logistics/service-requests", icon: ClipboardCheck },
        { titleKey: "Pelanggan Portal", href: "/portal/customers", icon: Users },
        { titleKey: "Verifikasi Customer", href: "/portal/customer-verification", icon: Users },
        { titleKey: "Persetujuan Onboarding", href: "/portal/onboarding-approvals", icon: Users },
        { titleKey: "Balasan Quotation WA", href: "/logistics/quotation-reply", icon: MessageCircle },
        { titleKey: "AI Import Advisor", href: "/logistics/import-assistant", icon: Bot },
        { titleKey: "Internal Tasks", href: "/logistics/internal-tasks", icon: ClipboardCheck },
        { titleKey: "Image Manager", href: "/media", icon: ImageIcon },
        { titleKey: "Short Links", href: "/settings/short-links", icon: Link2 },
        { titleKey: "Konfigurasi Menu", href: "/settings/nav-company-config", icon: LayoutGrid },
        { titleKey: "settings", href: "/settings", icon: Settings },
        { titleKey: "Secrets & Env Vars", href: "/settings/secrets", icon: KeyRound, roles: ["admin", "owner"] },
        { titleKey: "Status Sistem", href: "/system-health", icon: Activity, roles: ["admin", "owner"] },
      ],
      activePaths: ["/settings", "/users", "/org", "/correspondences", "/email-inbox", "/media", "/system-health", "/notifications", "/notification-history", "/sport-center", "/tenant"],
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

  const { hiddenItems, itemOrder, childOrder, toggle: toggleHidden, reorder, reorderChildren, reset: resetHidden } = useNavPreferences();
  const [customizeMode, setCustomizeMode] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("bizportal_sidebar_open") !== "false"; }
    catch { return true; }
  });
  const handleSidebarOpenChange = (open: boolean) => {
    setSidebarOpen(open);
    try { localStorage.setItem("bizportal_sidebar_open", String(open)); } catch { /* ignore */ }
  };

  const SIDEBAR_MIN = 200;
  const SIDEBAR_MAX = 420;
  const SIDEBAR_DEFAULT = 256;
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("bizportal_sidebar_width");
    const n = saved ? parseInt(saved, 10) : NaN;
    return isNaN(n) ? SIDEBAR_DEFAULT : Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n));
  });
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const onDragMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, dragStartWidth.current + delta));
      setSidebarWidth(next);
    };
    const onMouseUp = (ev: MouseEvent) => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const delta = ev.clientX - dragStartX.current;
      const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, dragStartWidth.current + delta));
      localStorage.setItem("bizportal_sidebar_width", String(next));
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Helper: apakah custom-role user punya akses ke path ini?
  const canAccessPath = (p: string): boolean => {
    if (!customRolePermissions) return true; // bukan custom-role, lolos
    const seg = p.replace(/^\//, "").split("/")[0] ?? "";
    const full = p.replace(/^\//, "");
    return (
      customRolePermissions.includes(`${seg}:view`) ||
      customRolePermissions.includes(`${full}:view`) ||
      customRolePermissions.includes(seg) ||
      customRolePermissions.includes(full)
    );
  };

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

    // Custom role permissions: tampilkan grup jika minimal satu child lolos
    // semua filter (custom-permission + role + company + devOnly).
    if (customRolePermissions != null) {
      if (item.type === "flat") return canAccessPath(item.href);
      // Grup: tampil jika ada child yang lolos semua filter
      return item.children.some(
        (c) =>
          canAccessPath(c.href) &&
          (!c.roles || c.roles.includes(dbUser.role)) &&
          filterChild(c) &&
          (IS_DEV || !c.devOnly),
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

  const handleNavDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const keys = orderedNav.map(getKey);
    const oldIdx = keys.indexOf(String(active.id));
    const newIdx = keys.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    reorder(arrayMove(keys, oldIdx, newIdx));
  };

  const handleChildDragEnd = (basePath: string, orderedHrefs: string[]) => ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIdx = orderedHrefs.indexOf(String(active.id));
    const newIdx = orderedHrefs.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    reorderChildren(basePath, arrayMove(orderedHrefs, oldIdx, newIdx));
  };

  const isGroupActive = (g: GroupItem) => {
    if (location === g.basePath || location.startsWith(`${g.basePath}/`)) return true;
    // Cek apakah salah satu child aktif (untuk grup dengan basePath virtual)
    if (g.children.some((c) => location === c.href || location.startsWith(`${c.href}/`))) return true;
    return false;
  };

  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();
  usePageTracker();

  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }
      if (e.key === "Escape") {
        setShowShortcuts(false);
        return;
      }
      if (showShortcuts && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const item = orderedNav[idx];
        if (item) {
          e.preventDefault();
          const href = item.type === "group" ? (item.children[0]?.href ?? item.basePath) : item.href;
          navigate(href);
          setShowShortcuts(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showShortcuts, orderedNav, navigate]);

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
      const isActive =
        location === item.href ||
        location.startsWith(`${item.href}/`) ||
        (item.activePaths ?? []).some(
          (p) => location === p || location.startsWith(`${p}/`)
        );
      return (
        <SidebarMenuItem key={item.href} className={cn(customizeMode && isHidden && "opacity-40")}>
          <div className="flex items-center">
            <SidebarMenuButton
              asChild
              isActive={isActive}
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

    const roleFilteredChildren = item.children.filter((c) =>
      canAccessPath(c.href) &&
      (!c.roles || (dbUser?.role && c.roles.includes(dbUser.role))) &&
      filterChild(c) &&
      (IS_DEV || !c.devOnly)
    );
    const visibleChildren = customizeMode
      ? roleFilteredChildren
      : roleFilteredChildren.filter((c) => !hiddenItems.includes(c.href));
    const sortedChildren = applySortOrder(visibleChildren, childOrder[item.basePath]);

    const renderChildItem = (c: typeof sortedChildren[0]) => {
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
    };

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
            {customizeMode ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleChildDragEnd(item.basePath, sortedChildren.map((c) => c.href))}
              >
                <SortableContext items={sortedChildren.map((c) => c.href)} strategy={verticalListSortingStrategy}>
                  {sortedChildren.map((c) => (
                    <SortableNavWrapper key={c.href} id={c.href}>
                      {renderChildItem(c)}
                    </SortableNavWrapper>
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              sortedChildren.map(renderChildItem)
            )}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>
    );
  };

  const shortcutsOverlay = showShortcuts ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setShowShortcuts(false)}
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tekan <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">1</kbd>–<kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">9</kbd> untuk navigasi cepat · <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">?</kbd> tutup · <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Esc</kbd> tutup
            </p>
          </div>
          <button
            onClick={() => setShowShortcuts(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {orderedNav.map((item, idx) => {
            const shortcutKey = idx < 9 ? String(idx + 1) : null;
            const title = getNavTitle(item.titleKey);
            const Icon = item.icon;
            const children = item.type === "group"
              ? item.children
                  .filter((c) => filterChild(c) && (IS_DEV || !("devOnly" in c && c.devOnly)))
                  .slice(0, 6)
              : [];
            return (
              <div key={item.type === "group" ? item.basePath : item.href} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  {shortcutKey && (
                    <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">{shortcutKey}</kbd>
                  )}
                  <Icon size={14} className="shrink-0 text-primary" />
                  <span className="text-xs font-semibold truncate">{title}</span>
                </div>
                {children.length > 0 && (
                  <div className="pl-1 space-y-0.5">
                    {children.map((c) => (
                      <button
                        key={c.href}
                        onClick={() => { navigate(c.href); setShowShortcuts(false); }}
                        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <c.icon size={11} className="shrink-0" />
                        <span className="truncate">{getNavTitle(c.titleKey)}</span>
                      </button>
                    ))}
                    {item.type === "group" && item.children.filter((c) => filterChild(c) && (IS_DEV || !("devOnly" in c && c.devOnly))).length > 6 && (
                      <span className="block pl-1 text-[10px] text-muted-foreground/60">
                        +{item.children.filter((c) => filterChild(c) && (IS_DEV || !("devOnly" in c && c.devOnly))).length - 6} lainnya…
                      </span>
                    )}
                  </div>
                )}
                {item.type === "flat" && (
                  <button
                    onClick={() => { navigate(item.href); setShowShortcuts(false); }}
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <span className="truncate">→ {item.href}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground flex gap-4">
          <span><kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl+K</kbd> Command palette</span>
          <span><kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">?</kbd> Toggle overlay ini</span>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange} style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
      {shortcutsOverlay}
      <div className="flex min-h-[100dvh] w-full bg-background text-foreground">
        <Sidebar className="border-r border-border">
          <div
            onMouseDown={onDragMouseDown}
            className="absolute top-0 right-0 z-50 h-full w-1.5 cursor-col-resize group hidden md:flex items-center justify-center"
            title="Geser untuk resize sidebar"
          >
            <div className="h-12 w-0.5 rounded-full bg-border group-hover:bg-primary transition-colors" />
          </div>
          <SidebarHeader className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
                <Building2 size={18} />
              </div>
              <span className="text-lg font-bold tracking-tight flex-1">BizPortal</span>
            </div>
            {(["admin", "owner", "super_admin", "manager"] as string[]).includes(dbUser?.role as string) && (
              <button
                onClick={() => setCustomizeMode((m) => !m)}
                className={cn(
                  "mt-1.5 w-full flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  customizeMode
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-foreground hover:bg-accent hover:border-accent-foreground/20"
                )}
                title="Sesuaikan tampilan menu"
              >
                <SlidersHorizontal size={13} />
                <span>{customizeMode ? "✓ Mode Kustomisasi Aktif" : "Kustomisasi Sidebar"}</span>
              </button>
            )}
            {customizeMode && (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-md bg-amber-950/40 border border-amber-700/30 px-2 py-1.5 text-[11px] text-amber-300">
                <span>Seret <span className="font-mono">⠿</span> untuk reorder · <EyeOff size={10} className="inline -mt-px" /> sembunyikan</span>
                <button
                  onClick={resetHidden}
                  className="shrink-0 font-semibold text-red-400 hover:text-red-300"
                >
                  Reset
                </button>
              </div>
            )}
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                {renderNavList(orderedNav, handleNavDragEnd)}
              </SidebarGroupContent>
            </SidebarGroup>
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
              <button
                onClick={() => setShowShortcuts(true)}
                className="hidden sm:flex items-center justify-center rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
                title="Keyboard shortcuts (?)"
              >
                <span className="font-mono font-bold">?</span>
              </button>
              <NotificationBell />
            </div>
          </div>
          <div className="hidden lg:sticky lg:top-0 lg:z-10 lg:flex lg:flex-col">
          <div className="flex h-12 items-center justify-between border-b border-border bg-background px-6">
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
              <button
                onClick={() => setShowShortcuts(true)}
                className="flex items-center justify-center rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                title="Keyboard shortcuts (?)"
              >
                <span className="font-mono font-bold text-[11px]">?</span>
              </button>
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
          <PinnedShortcuts />
          </div>
          <div className={noPadding ? "flex-1 overflow-hidden flex flex-col" : "flex-1 overflow-auto p-4 sm:p-6 lg:p-8"}>
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
