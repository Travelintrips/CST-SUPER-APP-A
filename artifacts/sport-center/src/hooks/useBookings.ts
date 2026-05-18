import { useState, useCallback, useEffect } from "react";
import type { Booking } from "@/types";
import { generateBookingCode } from "@/utils/bookingCode";

const API_BASE = "/api/sport-center/bookings";

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<Booking[]>(API_BASE);
      setBookings(data);
      setError(null);
    } catch {
      setError("Gagal memuat data booking");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const addBooking = useCallback(
    async (data: Omit<Booking, "id" | "bookingCode" | "status" | "createdAt">): Promise<Booking> => {
      const bookingCode = generateBookingCode();
      const newBooking = await apiFetch<Booking>(API_BASE, {
        method: "POST",
        body: JSON.stringify({ ...data, bookingCode }),
      });
      setBookings((prev) => [newBooking, ...prev]);
      return newBooking;
    },
    [],
  );

  const updateStatus = useCallback(async (id: string | number, status: Booking["status"]) => {
    const updated = await apiFetch<Booking>(`${API_BASE}/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    setBookings((prev) => prev.map((b) => (String(b.id) === String(id) ? updated : b)));
  }, []);

  const deleteBooking = useCallback(async (id: string | number) => {
    await apiFetch(`${API_BASE}/${id}`, { method: "DELETE" });
    setBookings((prev) => prev.filter((b) => String(b.id) !== String(id)));
  }, []);

  const getBookingByCode = useCallback(
    (code: string) => bookings.find((b) => b.bookingCode === code),
    [bookings],
  );

  return { bookings, loading, error, addBooking, updateStatus, deleteBooking, getBookingByCode, refetch: fetchBookings };
}
