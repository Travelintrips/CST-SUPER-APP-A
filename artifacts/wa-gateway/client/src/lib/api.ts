import { authHeaders } from "./auth";

const BASE = "/wa-gateway/api";

async function req<T>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? res.statusText);
  return data as T;
}

export const api = {
  auth: {
    register: (body: { email: string; password: string; name?: string }) =>
      req<{ token: string; account: Account }>("POST", "/auth/register", body),
    login: (body: { email: string; password: string }) =>
      req<{ token: string; account: Account }>("POST", "/auth/login", body),
    me: () => req<Account>("GET", "/auth/me"),
  },
  devices: {
    list: () => req<Device[]>("GET", "/devices"),
    get: (id: number) => req<Device>("GET", `/devices/${id}`),
    create: (body: { name: string; webhookUrl?: string }) =>
      req<Device>("POST", "/devices", body),
    update: (id: number, body: { name?: string; webhookUrl?: string }) =>
      req<Device>("PUT", `/devices/${id}`, body),
    delete: (id: number) => req<{ ok: boolean }>("DELETE", `/devices/${id}`),
    connect: (id: number) => req<{ ok: boolean }>("POST", `/devices/${id}/connect`),
    disconnect: (id: number) => req<{ ok: boolean }>("POST", `/devices/${id}/disconnect`),
  },
  messages: {
    list: (params?: { device_id?: number; limit?: number; page?: number }) => {
      const qs = new URLSearchParams();
      if (params?.device_id) qs.set("device_id", String(params.device_id));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.page) qs.set("page", String(params.page));
      return req<{ messages: Message[]; page: number; limit: number }>("GET", `/messages?${qs}`);
    },
    send: (body: { device_id: number; to: string; message: string }) =>
      req<{ ok: boolean; messageId: string }>("POST", "/messages/send", body),
  },
  apikeys: {
    list: () => req<ApiKey[]>("GET", "/apikeys"),
    create: (body: { name: string; device_id?: number }) =>
      req<ApiKey & { key: string; warning: string }>("POST", "/apikeys", body),
    delete: (id: number) => req<{ ok: boolean }>("DELETE", `/apikeys/${id}`),
  },
};

export interface Account {
  id: number;
  email: string;
  name: string | null;
}

export interface Device {
  id: number;
  accountId: number;
  name: string;
  phoneNumber: string | null;
  status: "disconnected" | "connecting" | "connected";
  webhookUrl: string | null;
  sessionDir: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number;
  deviceId: number;
  direction: "inbound" | "outbound";
  toFrom: string;
  messageType: string;
  content: string | null;
  status: string | null;
  waMessageId: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  deviceId: number | null;
  lastUsedAt: string | null;
  createdAt: string;
}
