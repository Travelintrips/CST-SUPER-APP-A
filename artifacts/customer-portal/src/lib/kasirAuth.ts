const KASIR_TOKEN_KEY = "pos_kasir_token";
const KASIR_PROFILE_KEY = "pos_kasir_profile";

export interface KasirProfile {
  id: number;
  name: string;
  email: string;
  branchId?: number | null;
  branchName?: string | null;
  companyId?: number | null;
}

export function getKasirToken(): string | null {
  return localStorage.getItem(KASIR_TOKEN_KEY);
}

export function setKasirToken(token: string): void {
  localStorage.setItem(KASIR_TOKEN_KEY, token);
}

export function removeKasirToken(): void {
  localStorage.removeItem(KASIR_TOKEN_KEY);
  localStorage.removeItem(KASIR_PROFILE_KEY);
}

export function getKasirProfile(): KasirProfile | null {
  try {
    const raw = localStorage.getItem(KASIR_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as KasirProfile) : null;
  } catch {
    return null;
  }
}

export function setKasirProfile(profile: KasirProfile): void {
  localStorage.setItem(KASIR_PROFILE_KEY, JSON.stringify(profile));
}

export function isKasirLoggedIn(): boolean {
  return !!getKasirToken();
}

export function kasirAuthHeaders(): Record<string, string> {
  const token = getKasirToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function kasirFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...kasirAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
}
