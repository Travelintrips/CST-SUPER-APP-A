import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useListCompanies, type Company } from "@workspace/api-client-react";

const LS_KEY = "accounting_company_id";

interface AccountingCompanyCtx {
  companyId: number;
  company: Company | undefined;
  companies: Company[];
  setCompanyId: (id: number) => void;
  isLoading: boolean;
}

const AccountingCompanyContext = createContext<AccountingCompanyCtx>({
  companyId: 1,
  company: undefined,
  companies: [],
  setCompanyId: () => {},
  isLoading: false,
});

export function AccountingCompanyProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyIdState] = useState<number>(() => {
    const stored = localStorage.getItem(LS_KEY);
    return stored ? Number(stored) : 1;
  });

  const { data: companies = [], isLoading } = useListCompanies();

  useEffect(() => {
    if (companies.length > 0 && !companies.find((c) => c.id === companyId)) {
      setCompanyIdState(companies[0]!.id);
    }
  }, [companies, companyId]);

  const setCompanyId = (id: number) => {
    setCompanyIdState(id);
    localStorage.setItem(LS_KEY, String(id));
  };

  const company = companies.find((c) => c.id === companyId);

  return (
    <AccountingCompanyContext.Provider value={{ companyId, company, companies, setCompanyId, isLoading }}>
      {children}
    </AccountingCompanyContext.Provider>
  );
}

export function useAccountingCompany() {
  return useContext(AccountingCompanyContext);
}
