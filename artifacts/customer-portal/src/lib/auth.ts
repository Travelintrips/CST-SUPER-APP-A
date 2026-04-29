export const TOKEN_KEY = "portal_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAuthHeaders(): { Authorization?: string } {
  const token = getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getPortalRole(): string {
  const token = getAuthToken();
  if (!token) return "guest";
  const payload = decodeJwtPayload(token);
  if (!payload) return "guest";
  return typeof payload.role === "string" ? payload.role : "customer";
}

export function isPortalAdmin(): boolean {
  return getPortalRole() === "admin";
}
