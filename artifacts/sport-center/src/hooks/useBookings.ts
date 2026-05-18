import { useState, useCallback } from "react";
import type { Booking } from "@/types";
import { generateBookingCode } from "@/utils/bookingCode";

const STORAGE_KEY = "sport_center_bookings";

function loadBookings(): Booking[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Booking[]) : [];
  } catch {
    return [];
  }
}

function saveBookings(bookings: Booking[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
}

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>(loadBookings);

  const addBooking = useCallback(
    (data: Omit<Booking, "id" | "bookingCode" | "status" | "createdAt">) => {
      const newBooking: Booking = {
        ...data,
        id: crypto.randomUUID(),
        bookingCode: generateBookingCode(),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      setBookings((prev) => {
        const updated = [newBooking, ...prev];
        saveBookings(updated);
        return updated;
      });
      return newBooking;
    },
    [],
  );

  const updateStatus = useCallback(
    (id: string, status: Booking["status"]) => {
      setBookings((prev) => {
        const updated = prev.map((b) => (b.id === id ? { ...b, status } : b));
        saveBookings(updated);
        return updated;
      });
    },
    [],
  );

  const deleteBooking = useCallback((id: string) => {
    setBookings((prev) => {
      const updated = prev.filter((b) => b.id !== id);
      saveBookings(updated);
      return updated;
    });
  }, []);

  const getBookingByCode = useCallback(
    (code: string) => bookings.find((b) => b.bookingCode === code),
    [bookings],
  );

  return { bookings, addBooking, updateStatus, deleteBooking, getBookingByCode };
}
