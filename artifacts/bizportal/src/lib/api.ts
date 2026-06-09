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
function withBody(method: string, body?: unknown): RequestInit {
  return {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  };
}

export const api = {
  get: async <T = unknown>(url: string) => ({ data: (await apiFetch(url)) as T }),
  post: async <T = unknown>(url: string, body?: unknown) => ({ data: (await apiFetch(url, withBody("POST", body))) as T }),
  put: async <T = unknown>(url: string, body?: unknown) => ({ data: (await apiFetch(url, withBody("PUT", body))) as T }),
  patch: async <T = unknown>(url: string, body?: unknown) => ({ data: (await apiFetch(url, withBody("PATCH", body))) as T }),
  delete: async <T = unknown>(url: string) => ({ data: (await apiFetch(url, { method: "DELETE", credentials: "include" })) as T }),
};
