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

interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  activeCompanyId: number;
  setActiveCompany: (company: Company) => void;
  isLoading: boolean;
  refetch: () => void;
}

const CompanyContext = createContext<CompanyContextValue>({
  companies: [],
  activeCompany: null,
  activeCompanyId: 1,
  setActiveCompany: () => {},
  isLoading: false,
  refetch: () => {},
});

const STORAGE_KEY = "biz_active_company_id";

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useSupabaseAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
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
  }, []);

  // Fetch whenever auth state becomes true
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

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? companies[0] ?? null;

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompany,
        activeCompanyId: activeCompany?.id ?? activeCompanyId,
        setActiveCompany,
        isLoading,
        refetch: fetchCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}

export function useCompanyQuery() {
  const { activeCompanyId } = useCompany();
  return `company=${activeCompanyId}`;
}
