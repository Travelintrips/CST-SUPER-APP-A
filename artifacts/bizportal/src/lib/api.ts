
export async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...opts });
  return res;
export async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
