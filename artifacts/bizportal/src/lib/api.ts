export async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message ?? "Terjadi kesalahan.");
  return d;
}

export const api = {
  async get(url: string, opts?: RequestInit) {
    const r = await fetch(url, { credentials: "include", ...opts });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message ?? "Terjadi kesalahan.");
    return { data };
  },
  async post(url: string, body?: unknown, opts?: RequestInit) {
    const r = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...opts,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message ?? "Terjadi kesalahan.");
    return { data };
  },
  async put(url: string, body?: unknown, opts?: RequestInit) {
    const r = await fetch(url, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...opts,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message ?? "Terjadi kesalahan.");
    return { data };
  },
  async delete(url: string, opts?: RequestInit) {
    const r = await fetch(url, { method: "DELETE", credentials: "include", ...opts });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message ?? "Terjadi kesalahan.");
    return { data };
  },
};
