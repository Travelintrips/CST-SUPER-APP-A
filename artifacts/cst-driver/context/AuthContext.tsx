import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '@/services/storage';
import { Driver } from '@/types';

const DEMO_DRIVER: Driver = {
  id: 'DRV-001',
  name: 'Ahmad Rizki',
  phone: '+62 812-3456-7890',
  email: 'driver@cst.co.id',
  licenseNumber: 'SIM-B2-123456',
  truckPlate: 'B 8234 CST',
  vehicleType: 'Truk Engkel',
  totalDeliveries: 127,
  rating: 4.8,
};

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  driver: Driver | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  driver: null,
  token: null,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const savedToken = await storage.getToken();
      if (savedToken) {
        setToken(savedToken);
        setDriver(DEMO_DRIVER);
        setIsAuthenticated(true);
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    if (
      (email === 'driver@cst.co.id' || email === 'driver') &&
      (password === 'driver123' || password === '123456')
    ) {
      const demoToken = 'demo_token_' + Date.now().toString();
      await storage.setToken(demoToken);
      setToken(demoToken);
      setDriver(DEMO_DRIVER);
      setIsAuthenticated(true);
    } else {
      throw new Error('Email atau password salah');
    }
  }

  async function logout() {
    await storage.clearAll();
    setToken(null);
    setDriver(null);
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, driver, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
