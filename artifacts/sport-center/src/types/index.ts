export interface Facility {
  id: string;
  name: string;
  description: string;
  pricePerHour: number;
  image: string;
  capacity: number;
  amenities: string[];
  available: boolean;
  rating?: number;
  category?: string;
}

export interface Schedule {
  id: string;
  facilityId: string;
  day: string;
  startTime: string;
  endTime: string;
  activity: string;
  availableSlots: number;
  price: number;
}

export interface Booking {
  id: string | number;
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
