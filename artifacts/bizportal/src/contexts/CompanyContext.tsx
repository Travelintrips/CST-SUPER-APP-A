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
  isHolding?: boolean;
}

// Special sentinel value for "Holding Consolidated" mode
export const CONSOLIDATED_ID = -1;

interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  activeCompanyId: number;
  isConsolidated: boolean;
  setActiveCompany: (company: Company) => void;
  setConsolidatedMode: () => void;
  isLoading: boolean;
  refetch: () => void;
  /** Returns query string like "companyId=2" or "consolidated=true" */
  companyQueryParam: string;
}

const CompanyContext = createContext<CompanyContextValue>({
  companies: [],
  activeCompany: null,
  activeCompanyId: 1,
  isConsolidated: false,
  setActiveCompany: () => {},
  setConsolidatedMode: () => {},
  isLoading: false,
  refetch: () => {},
  companyQueryParam: "companyId=1",
});

const STORAGE_KEY = "biz_active_company_id";
const CONSOLIDATED_STORAGE_VALUE = "consolidated";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useSupabaseAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === CONSOLIDATED_STORAGE_VALUE) return CONSOLIDATED_ID;
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
      if (data.length > 0 && activeCompanyId !== CONSOLIDATED_ID) {
        const storedId = (() => {
          try { return Number(localStorage.getItem(STORAGE_KEY)) || 1; } catch { return 1; }
        })();
        if (!data.find((c) => c.id === storedId)) {
          setActiveCompanyId(data[0].id);
        }
      }
    } catch {
      // silently ignore
    } finally {
      setIsLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchedRef.current = false;
    }
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
    setActiveCompanyId(company.id);
    try {
      localStorage.setItem(STORAGE_KEY, String(company.id));
    } catch {}
  }, []);

  const setConsolidatedMode = useCallback(() => {
    setActiveCompanyId(CONSOLIDATED_ID);
    try {
      localStorage.setItem(STORAGE_KEY, CONSOLIDATED_STORAGE_VALUE);
    } catch {}
  }, []);

  const isConsolidated = activeCompanyId === CONSOLIDATED_ID;
  const activeCompany = isConsolidated
    ? null
    : (companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null);

  const resolvedId = isConsolidated ? CONSOLIDATED_ID : (activeCompany?.id ?? activeCompanyId);
  const companyQueryParam = isConsolidated ? "consolidated=true" : `companyId=${resolvedId}`;

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompany,
        activeCompanyId: resolvedId,
        isConsolidated,
        setActiveCompany,
        setConsolidatedMode,
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

/** @deprecated use companyQueryParam from useCompany() instead */
export function useCompanyQuery() {
  const { companyQueryParam } = useCompany();
  return companyQueryParam;
}
