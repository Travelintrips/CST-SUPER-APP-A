export async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message ?? "Terjadi kesalahan.");
  return d;
}

// Minimal axios-compatible wrapper untuk dipakai di pages yang butuh .get/.post
export const api = {
  async get(url: string) {
    const r = await fetch(url, { credentials: "include" });
    const data = await r.json();
    if (!r.ok) {
      const err: any = new Error((data as any).message ?? "Terjadi kesalahan.");
      err.response = { data, status: r.status };
      throw err;
    }
    return { data };
  },
  async post(url: string, body?: unknown) {
    const r = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) {
      const err: any = new Error((data as any).message ?? "Terjadi kesalahan.");
      err.response = { data, status: r.status };
      throw err;
    }
    return { data };
  },
};
