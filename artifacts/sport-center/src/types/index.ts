export interface Facility {
  id: string;
  name: string;
  description: string;
  pricePerHour: number;
  image: string;
  capacity: number;
  amenities: string[];
  available: boolean;
  rating: number;
  category: string;
}

export interface TimeSlot {
  id: string;
  facilityId: string;
  day: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface DayScheduleItem {
  id: string;
  time: string;
  activity: string;
  location: string;
  facilityId: string;
  totalSlots: number;
  bookedSlots: number;
  pricePerHour: number;
}

export interface Booking {
  id: string;
  bookingCode: string;
  facilityId: string;
  facilityName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  totalPrice: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  createdAt: string;
  notes?: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  content: string;
  rating: number;
  avatar: string;
}

export interface Schedule {
  facilityId: string;
  facilityName: string;
  slots: {
    time: string;
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    sun: boolean;
  }[];
}
