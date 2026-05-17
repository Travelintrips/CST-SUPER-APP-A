import { supabase } from "./supabase";

export const TOKEN_KEY = "portal_token";
const PROFILE_KEY = "portal_profile";

interface PortalProfile {
  customerId: number;
  role: string;
  name: string;
  email: string;
}

function getSupabaseSessionSync(): { access_token: string } | null {
  try {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as { access_token: string };
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  const ours = localStorage.getItem(TOKEN_KEY);
  if (ours) return ours;
  return getSupabaseSessionSync()?.access_token ?? null;
}

export async function getAuthTokenAsync(): Promise<string | null> {
  const ours = localStorage.getItem(TOKEN_KEY);
  if (ours) return ours;
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  if (supabase) supabase.auth.signOut();
  localStorage.removeItem(PROFILE_KEY);
}

export function getAuthHeaders(): { Authorization?: string } {
  const token = getAuthToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export function getPortalProfile(): PortalProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PortalProfile;
  } catch {
    return null;
  }
}

export function setPortalProfile(profile: PortalProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getPortalRole(): string {
  return getPortalProfile()?.role ?? "guest";
}

export function isPortalAdmin(): boolean {
  return getPortalRole() === "admin";
}

export async function fetchAndStoreProfile(): Promise<PortalProfile | null> {
  const token = (await getAuthTokenAsync()) ?? getAuthToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/portal/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { id: number; role: string; name: string; email: string };
    const profile: PortalProfile = {
      customerId: data.id,
      role: data.role,
      name: data.name,
      email: data.email,
    };
    setPortalProfile(profile);
    return profile;
  } catch {
    return null;
  }
}
