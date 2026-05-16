import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";

export interface Company {
  id: number;
  companyName: string;
  companyCode: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  npwp?: string | null;
  isActive: boolean;
}

// Sentinel ID used to represent "All Companies (Consolidated)" mode.
// Must not clash with any real company id (which are positive integers).
export const CONSOLIDATED_ID = 0;

export type CompanyScope = number | typeof CONSOLIDATED_ID;

interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  activeCompanyId: CompanyScope;
  isConsolidated: boolean;
  setActiveCompany: (company: Company) => void;
  setConsolidated: () => void;
  isLoading: boolean;
  refetch: () => void;
  /** Returns the query param string for API calls, e.g. "companyId=3" or "companyId=all" */
  companyQueryParam: string;
}

const CompanyContext = createContext<CompanyContextValue>({
  companies: [],
  activeCompany: null,
  activeCompanyId: 1,
  isConsolidated: false,
  setActiveCompany: () => {},
  setConsolidated: () => {},
  isLoading: false,
  refetch: () => {},
  companyQueryParam: "companyId=1",
});

const STORAGE_KEY = "biz_active_company_id";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useSupabaseAuth();
  const [companies, setCompanies] = useState<Company[]>([]);

  const [activeCompanyId, setActiveCompanyIdState] = useState<CompanyScope>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "all") return CONSOLIDATED_ID;
      return stored ? Number(stored) : 1;
    } catch {
      return 1;
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/companies", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as Company[];
      setCompanies(data);
      if (data.length > 0) {
        const storedRaw = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
        if (storedRaw === "all") return; // consolidated stays as-is
        const storedId = storedRaw ? Number(storedRaw) : 1;
        if (!data.find((c) => c.id === storedId)) {
          setActiveCompanyIdState(data[0].id);
        }
      }
    } catch {
      // silently ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) { fetchedRef.current = false; }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && !fetchedRef.current) {
      fetchedRef.current = true;
      void fetchCompanies();
    } else if (!isAuthenticated) {
      setIsLoading(false);
    }
  }, [isAuthenticated, fetchCompanies]);

  const setActiveCompany = useCallback((company: Company) => {
    setActiveCompanyIdState(company.id);
    try { localStorage.setItem(STORAGE_KEY, String(company.id)); } catch {}
  }, []);

  const setConsolidated = useCallback(() => {
    setActiveCompanyIdState(CONSOLIDATED_ID);
    try { localStorage.setItem(STORAGE_KEY, "all"); } catch {}
  }, []);

  const isConsolidated = activeCompanyId === CONSOLIDATED_ID;
  const activeCompany = isConsolidated
    ? null
    : (companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null);

  const resolvedId: CompanyScope = isConsolidated
    ? CONSOLIDATED_ID
    : (activeCompany?.id ?? activeCompanyId);

  const companyQueryParam = isConsolidated ? "companyId=all" : `companyId=${resolvedId}`;

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompany,
        activeCompanyId: resolvedId,
        isConsolidated,
        setActiveCompany,
        setConsolidated,
        isLoading,
        refetch: fetchCompanies,
        companyQueryParam,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}

/** @deprecated Use companyQueryParam from useCompany() instead */
export function useCompanyQuery() {
  const { companyQueryParam } = useCompany();
  return companyQueryParam;
}
