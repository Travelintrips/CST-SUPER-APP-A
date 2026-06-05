export async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "include", ...opts });
  return res;
}
