import type { Facility, Testimonial, DayScheduleItem } from "@/types";

export const facilities: Facility[] = [
  {
    id: "futsal-1",
    name: "Lapangan Futsal Indoor",
    description:
      "Lapangan futsal standar FIFA dengan rumput sintetis premium. Dilengkapi pencahayaan LED profesional dan sistem ventilasi modern untuk kenyamanan bermain.",
    pricePerHour: 150000,
    image:
      "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&auto=format&fit=crop&q=80",
    capacity: 14,
    amenities: ["Ganti Baju", "Loker", "Parkir", "WiFi", "Kantin"],
    available: true,
    rating: 4.8,
    category: "Futsal",
  },
  {
    id: "badminton-1",
    name: "Lapangan Badminton A",
    description:
      "Lapangan badminton indoor dengan lantai kayu parket berkualitas tinggi. Tersedia 4 lapangan berstandar BWF dengan net premium.",
    pricePerHour: 75000,
    image:
      "https://images.unsplash.com/photo-1599391398131-cd12dfc6c24e?w=800&auto=format&fit=crop&q=80",
    capacity: 8,
    amenities: ["Ganti Baju", "Loker", "Parkir", "Sewa Raket"],
    available: true,
    rating: 4.7,
    category: "Badminton",
  },
  {
    id: "tenis-1",
    name: "Lapangan Tenis Outdoor",
    description:
      "Lapangan tenis hard court berstandar internasional. Cocok untuk latihan dan turnamen dengan tribun penonton berkapasitas 50 orang.",
    pricePerHour: 100000,
    image:
      "https://images.unsplash.com/photo-1545809074-59472b3f5ecc?w=800&auto=format&fit=crop&q=80",
    capacity: 6,
    amenities: ["Tribun Penonton", "Parkir", "Kantin", "Sewa Raket"],
    available: true,
    rating: 4.6,
    category: "Tenis",
  },
  {
    id: "basket-1",
    name: "Lapangan Basket",
    description:
      "Lapangan basket indoor dengan lantai parket resmi NBA. Dilengkapi papan skor digital dan sistem tata suara untuk suasana kompetitif.",
    pricePerHour: 200000,
    image:
      "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&auto=format&fit=crop&q=80",
    capacity: 20,
    amenities: ["Papan Skor Digital", "Sound System", "Ganti Baju", "Parkir"],
    available: true,
    rating: 4.9,
    category: "Basket",
  },
  {
    id: "renang-1",
    name: "Kolam Renang Olimpik",
    description:
      "Kolam renang berukuran 50m x 25m standar olimpik. Air dikelola dengan sistem filtrasi modern dan suhu dijaga optimal sepanjang hari.",
    pricePerHour: 50000,
    image:
      "https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=800&auto=format&fit=crop&q=80",
    capacity: 50,
    amenities: ["Kamar Ganti", "Loker", "Shower", "Instruktur", "Kantin"],
    available: true,
    rating: 4.5,
    category: "Renang",
  },
  {
    id: "gym-1",
    name: "Fitness Center & Gym",
    description:
      "Pusat kebugaran lengkap dengan peralatan cardio dan beban terkini. Tersedia personal trainer berpengalaman dan kelas group fitness.",
    pricePerHour: 35000,
    image:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80",
    capacity: 40,
    amenities: ["Personal Trainer", "Locker Room", "Shower", "WiFi", "Juice Bar"],
    available: true,
    rating: 4.7,
    category: "Gym",
  },
];

export const testimonials: Testimonial[] = [
  {
    id: "t1",
    name: "Budi Santoso",
    role: "Atlet Futsal",
    content:
      "Lapangan futsal di sini luar biasa! Rumput sintetisnya empuk dan pencahayaannya sempurna. Cocok banget buat latihan rutin tim kami.",
    rating: 5,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Budi",
  },
  {
    id: "t2",
    name: "Sari Dewi",
    role: "Perenang Profesional",
    content:
      "Kolam renangnya sangat bersih dan terawat. Air selalu segar dan temperaturnya ideal. Booking online juga mudah banget!",
    rating: 5,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sari",
  },
  {
    id: "t3",
    name: "Ahmad Rizki",
    role: "Badminton Enthusiast",
    content:
      "Fasilitas badminton terbaik di area bandara. Lantai parketnya bagus, dan staffnya sangat ramah. Pasti akan balik lagi!",
    rating: 4,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmad",
  },
];

export const timeOptions = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00",
];

export type DayKey = "senin" | "selasa" | "rabu" | "kamis" | "jumat" | "sabtu" | "minggu";

export const dayLabels: { key: DayKey; label: string; short: string }[] = [
  { key: "senin", label: "Senin", short: "Sen" },
  { key: "selasa", label: "Selasa", short: "Sel" },
  { key: "rabu", label: "Rabu", short: "Rab" },
  { key: "kamis", label: "Kamis", short: "Kam" },
  { key: "jumat", label: "Jumat", short: "Jum" },
  { key: "sabtu", label: "Sabtu", short: "Sab" },
  { key: "minggu", label: "Minggu", short: "Min" },
];

export const daySchedules: Record<DayKey, DayScheduleItem[]> = {
  senin: [
    { id: "s1", time: "06:00 – 07:00", activity: "Futsal Umum", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s2", time: "07:00 – 08:00", activity: "Kelas Badminton Pagi", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 3, pricePerHour: 75000 },
    { id: "s3", time: "08:00 – 09:00", activity: "Renang Bebas", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 30, bookedSlots: 10, pricePerHour: 50000 },
    { id: "s4", time: "09:00 – 10:00", activity: "Latihan Tenis", location: "Lapangan Tenis Outdoor", facilityId: "tenis-1", totalSlots: 6, bookedSlots: 6, pricePerHour: 100000 },
    { id: "s5", time: "10:00 – 11:00", activity: "Futsal Umum", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 5, pricePerHour: 150000 },
    { id: "s6", time: "10:00 – 11:00", activity: "Sesi Gym Pagi", location: "Fitness Center & Gym", facilityId: "gym-1", totalSlots: 20, bookedSlots: 8, pricePerHour: 35000 },
    { id: "s7", time: "15:00 – 16:00", activity: "Kelas Basket Junior", location: "Lapangan Basket", facilityId: "basket-1", totalSlots: 20, bookedSlots: 20, pricePerHour: 200000 },
    { id: "s8", time: "16:00 – 17:00", activity: "Badminton Sore", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 2, pricePerHour: 75000 },
    { id: "s9", time: "17:00 – 18:00", activity: "Futsal Sore", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s10", time: "19:00 – 20:00", activity: "Futsal Malam", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 7, pricePerHour: 150000 },
    { id: "s11", time: "19:00 – 20:00", activity: "Renang Malam", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 30, bookedSlots: 12, pricePerHour: 50000 },
    { id: "s12", time: "20:00 – 21:00", activity: "Basket Malam", location: "Lapangan Basket", facilityId: "basket-1", totalSlots: 20, bookedSlots: 9, pricePerHour: 200000 },
  ],
  selasa: [
    { id: "s13", time: "06:00 – 07:00", activity: "Renang Pagi", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 30, bookedSlots: 15, pricePerHour: 50000 },
    { id: "s14", time: "07:00 – 08:00", activity: "Futsal Pagi", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s15", time: "08:00 – 09:00", activity: "Badminton Pagi", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 4, pricePerHour: 75000 },
    { id: "s16", time: "09:00 – 10:00", activity: "Sesi Gym Pagi", location: "Fitness Center & Gym", facilityId: "gym-1", totalSlots: 20, bookedSlots: 6, pricePerHour: 35000 },
    { id: "s17", time: "16:00 – 17:00", activity: "Tenis Sore", location: "Lapangan Tenis Outdoor", facilityId: "tenis-1", totalSlots: 6, bookedSlots: 3, pricePerHour: 100000 },
    { id: "s18", time: "17:00 – 18:00", activity: "Futsal Sore", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 10, pricePerHour: 150000 },
    { id: "s19", time: "18:00 – 19:00", activity: "Basket Sore", location: "Lapangan Basket", facilityId: "basket-1", totalSlots: 20, bookedSlots: 20, pricePerHour: 200000 },
    { id: "s20", time: "19:00 – 20:00", activity: "Badminton Malam", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 5, pricePerHour: 75000 },
    { id: "s21", time: "20:00 – 21:00", activity: "Futsal Malam", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 7, pricePerHour: 150000 },
  ],
  rabu: [
    { id: "s22", time: "06:00 – 07:00", activity: "Futsal Pagi", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 8, pricePerHour: 150000 },
    { id: "s23", time: "07:00 – 08:00", activity: "Kelas Renang Anak", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 20, bookedSlots: 20, pricePerHour: 50000 },
    { id: "s24", time: "08:00 – 09:00", activity: "Gym Pagi", location: "Fitness Center & Gym", facilityId: "gym-1", totalSlots: 20, bookedSlots: 11, pricePerHour: 35000 },
    { id: "s25", time: "09:00 – 10:00", activity: "Badminton Umum", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 2, pricePerHour: 75000 },
    { id: "s26", time: "15:00 – 16:00", activity: "Tenis Sore", location: "Lapangan Tenis Outdoor", facilityId: "tenis-1", totalSlots: 6, bookedSlots: 6, pricePerHour: 100000 },
    { id: "s27", time: "16:00 – 17:00", activity: "Futsal Sore", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 4, pricePerHour: 150000 },
    { id: "s28", time: "17:00 – 18:00", activity: "Badminton Sore", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 8, pricePerHour: 75000 },
    { id: "s29", time: "19:00 – 20:00", activity: "Basket Malam", location: "Lapangan Basket", facilityId: "basket-1", totalSlots: 20, bookedSlots: 13, pricePerHour: 200000 },
  ],
  kamis: [
    { id: "s30", time: "06:00 – 07:00", activity: "Renang Pagi", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 30, bookedSlots: 9, pricePerHour: 50000 },
    { id: "s31", time: "07:00 – 08:00", activity: "Badminton Pagi", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 8, pricePerHour: 75000 },
    { id: "s32", time: "09:00 – 10:00", activity: "Futsal Pagi", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 6, pricePerHour: 150000 },
    { id: "s33", time: "10:00 – 11:00", activity: "Tenis Pagi", location: "Lapangan Tenis Outdoor", facilityId: "tenis-1", totalSlots: 6, bookedSlots: 2, pricePerHour: 100000 },
    { id: "s34", time: "15:00 – 16:00", activity: "Gym Sore", location: "Fitness Center & Gym", facilityId: "gym-1", totalSlots: 20, bookedSlots: 15, pricePerHour: 35000 },
    { id: "s35", time: "16:00 – 17:00", activity: "Futsal Sore", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s36", time: "17:00 – 18:00", activity: "Basket Sore", location: "Lapangan Basket", facilityId: "basket-1", totalSlots: 20, bookedSlots: 7, pricePerHour: 200000 },
    { id: "s37", time: "19:00 – 20:00", activity: "Futsal Malam", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 11, pricePerHour: 150000 },
    { id: "s38", time: "20:00 – 21:00", activity: "Badminton Malam", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 3, pricePerHour: 75000 },
  ],
  jumat: [
    { id: "s39", time: "06:00 – 07:00", activity: "Futsal Pagi", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s40", time: "07:00 – 08:00", activity: "Renang Pagi", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 30, bookedSlots: 18, pricePerHour: 50000 },
    { id: "s41", time: "08:00 – 09:00", activity: "Badminton Pagi", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 5, pricePerHour: 75000 },
    { id: "s42", time: "09:00 – 10:00", activity: "Gym Pagi", location: "Fitness Center & Gym", facilityId: "gym-1", totalSlots: 20, bookedSlots: 7, pricePerHour: 35000 },
    { id: "s43", time: "15:00 – 16:00", activity: "Tenis Sore", location: "Lapangan Tenis Outdoor", facilityId: "tenis-1", totalSlots: 6, bookedSlots: 4, pricePerHour: 100000 },
    { id: "s44", time: "16:00 – 17:00", activity: "Futsal Sore", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 9, pricePerHour: 150000 },
    { id: "s45", time: "17:00 – 18:00", activity: "Basket Sore", location: "Lapangan Basket", facilityId: "basket-1", totalSlots: 20, bookedSlots: 20, pricePerHour: 200000 },
    { id: "s46", time: "19:00 – 20:00", activity: "Futsal Malam", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s47", time: "20:00 – 21:00", activity: "Badminton Malam", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 1, pricePerHour: 75000 },
  ],
  sabtu: [
    { id: "s48", time: "06:00 – 07:00", activity: "Renang Pagi", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 30, bookedSlots: 25, pricePerHour: 50000 },
    { id: "s49", time: "07:00 – 08:00", activity: "Futsal Weekend", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s50", time: "08:00 – 09:00", activity: "Kelas Basket Anak", location: "Lapangan Basket", facilityId: "basket-1", totalSlots: 15, bookedSlots: 15, pricePerHour: 200000 },
    { id: "s51", time: "09:00 – 10:00", activity: "Badminton Weekend", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 6, pricePerHour: 75000 },
    { id: "s52", time: "10:00 – 11:00", activity: "Tenis Weekend", location: "Lapangan Tenis Outdoor", facilityId: "tenis-1", totalSlots: 6, bookedSlots: 3, pricePerHour: 100000 },
    { id: "s53", time: "10:00 – 11:00", activity: "Futsal Weekend", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 7, pricePerHour: 150000 },
    { id: "s54", time: "15:00 – 16:00", activity: "Renang Sore", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 30, bookedSlots: 20, pricePerHour: 50000 },
    { id: "s55", time: "16:00 – 17:00", activity: "Futsal Sore", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s56", time: "17:00 – 18:00", activity: "Basket Sore", location: "Lapangan Basket", facilityId: "basket-1", totalSlots: 20, bookedSlots: 12, pricePerHour: 200000 },
    { id: "s57", time: "19:00 – 20:00", activity: "Futsal Malam", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s58", time: "20:00 – 21:00", activity: "Gym Malam", location: "Fitness Center & Gym", facilityId: "gym-1", totalSlots: 20, bookedSlots: 10, pricePerHour: 35000 },
  ],
  minggu: [
    { id: "s59", time: "06:00 – 07:00", activity: "Senam Pagi", location: "Fitness Center & Gym", facilityId: "gym-1", totalSlots: 20, bookedSlots: 8, pricePerHour: 35000 },
    { id: "s60", time: "07:00 – 08:00", activity: "Renang Keluarga", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 50, bookedSlots: 32, pricePerHour: 50000 },
    { id: "s61", time: "08:00 – 09:00", activity: "Futsal Weekend", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 14, pricePerHour: 150000 },
    { id: "s62", time: "09:00 – 10:00", activity: "Badminton Keluarga", location: "Lapangan Badminton A", facilityId: "badminton-1", totalSlots: 8, bookedSlots: 8, pricePerHour: 75000 },
    { id: "s63", time: "10:00 – 11:00", activity: "Tenis Keluarga", location: "Lapangan Tenis Outdoor", facilityId: "tenis-1", totalSlots: 6, bookedSlots: 2, pricePerHour: 100000 },
    { id: "s64", time: "15:00 – 16:00", activity: "Basket Umum", location: "Lapangan Basket", facilityId: "basket-1", totalSlots: 20, bookedSlots: 14, pricePerHour: 200000 },
    { id: "s65", time: "16:00 – 17:00", activity: "Futsal Sore", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 9, pricePerHour: 150000 },
    { id: "s66", time: "17:00 – 18:00", activity: "Renang Sore", location: "Kolam Renang Olimpik", facilityId: "renang-1", totalSlots: 30, bookedSlots: 30, pricePerHour: 50000 },
    { id: "s67", time: "19:00 – 20:00", activity: "Futsal Malam", location: "Lapangan Futsal Indoor", facilityId: "futsal-1", totalSlots: 14, bookedSlots: 11, pricePerHour: 150000 },
  ],
};
