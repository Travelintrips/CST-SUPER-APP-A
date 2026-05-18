import type { Facility, Testimonial, Schedule } from "@/types";

export const facilities: Facility[] = [
  {
    id: "futsal-01",
    name: "Lapangan Futsal",
    description: "Lapangan futsal standar FIFA dengan rumput sintetis premium. Dilengkapi pencahayaan LED profesional dan sistem ventilasi modern.",
    pricePerHour: 150000,
    image: "https://placehold.co/600x400/2563EB/white?text=Futsal",
    capacity: 14,
    amenities: ["Rumput Sintetis", "Lighting LED", "Ruang Ganti", "Parkir"],
    available: true,
    rating: 4.8,
    category: "Futsal",
  },
  {
    id: "badminton-01",
    name: "Lapangan Badminton",
    description: "Lapangan indoor dengan lantai vinyl profesional berstandar BWF. Tersedia 4 lapangan dengan net premium.",
    pricePerHour: 75000,
    image: "https://placehold.co/600x400/10B981/white?text=Badminton",
    capacity: 8,
    amenities: ["Indoor", "Vinyl Floor", "Shuttlecock Available", "Sewa Raket"],
    available: true,
    rating: 4.7,
    category: "Badminton",
  },
  {
    id: "basket-01",
    name: "Lapangan Basket",
    description: "Lapangan basket indoor dengan lantai parket resmi NBA. Dilengkapi papan skor digital dan sistem tata suara.",
    pricePerHour: 200000,
    image: "https://placehold.co/600x400/F97316/white?text=Basket",
    capacity: 20,
    amenities: ["Papan Skor Digital", "Sound System", "Ruang Ganti", "Parkir"],
    available: true,
    rating: 4.9,
    category: "Basket",
  },
  {
    id: "fitness-01",
    name: "Fitness Center",
    description: "Pusat kebugaran lengkap dengan peralatan cardio dan beban terkini. Tersedia personal trainer berpengalaman.",
    pricePerHour: 35000,
    image: "https://placehold.co/600x400/8B5CF6/white?text=Fitness",
    capacity: 40,
    amenities: ["Personal Trainer", "Locker Room", "Shower", "WiFi", "Juice Bar"],
    available: true,
    rating: 4.7,
    category: "Gym",
  },
  {
    id: "yoga-01",
    name: "Studio Yoga",
    description: "Studio yoga ber-AC dengan lantai kayu hangat dan perlengkapan yoga lengkap. Cocok untuk semua level.",
    pricePerHour: 50000,
    image: "https://placehold.co/600x400/EC4899/white?text=Yoga",
    capacity: 20,
    amenities: ["AC", "Matras Yoga", "Loker", "Shower", "Instruktur Tersedia"],
    available: true,
    rating: 4.8,
    category: "Yoga",
  },
  {
    id: "zumba-01",
    name: "Studio Zumba & Aerobik",
    description: "Studio dance dan aerobik dengan lantai sprung, cermin full-wall, dan sound system bertenaga untuk sesi yang menyenangkan.",
    pricePerHour: 60000,
    image: "https://placehold.co/600x400/EF4444/white?text=Zumba",
    capacity: 25,
    amenities: ["Sound System", "Cermin Full-Wall", "AC", "Loker", "Shower"],
    available: true,
    rating: 4.6,
    category: "Aerobik",
  },
];

export const testimonials: Testimonial[] = [
  {
    id: "t1",
    name: "Budi Santoso",
    role: "Atlet Futsal",
    content: "Lapangan futsal di sini luar biasa! Rumput sintetisnya empuk dan pencahayaannya sempurna. Cocok banget buat latihan rutin tim kami.",
    rating: 5,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Budi",
  },
  {
    id: "t2",
    name: "Sari Dewi",
    role: "Instruktur Yoga",
    content: "Studio yoga-nya nyaman banget! Peralatannya lengkap, AC sejuk, dan instrukturnya profesional. Booking online juga mudah!",
    rating: 5,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sari",
  },
  {
    id: "t3",
    name: "Ahmad Rizki",
    role: "Badminton Enthusiast",
    content: "Fasilitas badminton terbaik di area bandara. Lantai vinyl-nya bagus, dan staffnya sangat ramah. Pasti akan balik lagi!",
    rating: 4,
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmad",
  },
];

export const timeOptions = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00",
];

export type DayKey = "Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat" | "Sabtu" | "Minggu";

export const dayLabels: { key: DayKey; short: string }[] = [
  { key: "Senin", short: "Sen" },
  { key: "Selasa", short: "Sel" },
  { key: "Rabu", short: "Rab" },
  { key: "Kamis", short: "Kam" },
  { key: "Jumat", short: "Jum" },
  { key: "Sabtu", short: "Sab" },
  { key: "Minggu", short: "Min" },
];

export const schedules: Schedule[] = [
  // SENIN
  { id: "sch-001", facilityId: "futsal-01",   day: "Senin", startTime: "06:00", endTime: "08:00", activity: "Futsal Pagi",           availableSlots: 0,  price: 150000 },
  { id: "sch-002", facilityId: "badminton-01", day: "Senin", startTime: "06:00", endTime: "07:00", activity: "Badminton Pagi",         availableSlots: 5,  price: 75000 },
  { id: "sch-003", facilityId: "fitness-01",   day: "Senin", startTime: "06:00", endTime: "07:00", activity: "Sesi Gym Pagi",          availableSlots: 12, price: 35000 },
  { id: "sch-004", facilityId: "yoga-01",      day: "Senin", startTime: "07:00", endTime: "08:00", activity: "Kelas Yoga Pagi",        availableSlots: 8,  price: 50000 },
  { id: "sch-005", facilityId: "futsal-01",    day: "Senin", startTime: "10:00", endTime: "12:00", activity: "Futsal Umum",            availableSlots: 4,  price: 150000 },
  { id: "sch-006", facilityId: "basket-01",    day: "Senin", startTime: "15:00", endTime: "17:00", activity: "Kelas Basket Junior",    availableSlots: 0,  price: 200000 },
  { id: "sch-007", facilityId: "zumba-01",     day: "Senin", startTime: "16:00", endTime: "17:00", activity: "Zumba Sore",             availableSlots: 10, price: 60000 },
  { id: "sch-008", facilityId: "badminton-01", day: "Senin", startTime: "16:00", endTime: "18:00", activity: "Badminton Sore",         availableSlots: 2,  price: 75000 },
  { id: "sch-009", facilityId: "futsal-01",    day: "Senin", startTime: "17:00", endTime: "19:00", activity: "Futsal Sore",            availableSlots: 0,  price: 150000 },
  { id: "sch-010", facilityId: "futsal-01",    day: "Senin", startTime: "19:00", endTime: "21:00", activity: "Futsal Malam",           availableSlots: 5,  price: 150000 },
  { id: "sch-011", facilityId: "basket-01",    day: "Senin", startTime: "20:00", endTime: "22:00", activity: "Basket Malam",           availableSlots: 7,  price: 200000 },

  // SELASA
  { id: "sch-012", facilityId: "fitness-01",   day: "Selasa", startTime: "06:00", endTime: "07:00", activity: "Gym Pagi",              availableSlots: 15, price: 35000 },
  { id: "sch-013", facilityId: "futsal-01",    day: "Selasa", startTime: "07:00", endTime: "09:00", activity: "Futsal Pagi",           availableSlots: 0,  price: 150000 },
  { id: "sch-014", facilityId: "badminton-01", day: "Selasa", startTime: "08:00", endTime: "09:00", activity: "Badminton Pagi",        availableSlots: 3,  price: 75000 },
  { id: "sch-015", facilityId: "yoga-01",      day: "Selasa", startTime: "09:00", endTime: "10:00", activity: "Yoga Pagi",             availableSlots: 6,  price: 50000 },
  { id: "sch-016", facilityId: "zumba-01",     day: "Selasa", startTime: "10:00", endTime: "11:00", activity: "Aerobik Pagi",          availableSlots: 12, price: 60000 },
  { id: "sch-017", facilityId: "basket-01",    day: "Selasa", startTime: "16:00", endTime: "18:00", activity: "Basket Sore",           availableSlots: 0,  price: 200000 },
  { id: "sch-018", facilityId: "futsal-01",    day: "Selasa", startTime: "17:00", endTime: "19:00", activity: "Futsal Sore",           availableSlots: 4,  price: 150000 },
  { id: "sch-019", facilityId: "badminton-01", day: "Selasa", startTime: "19:00", endTime: "21:00", activity: "Badminton Malam",       availableSlots: 3,  price: 75000 },
  { id: "sch-020", facilityId: "futsal-01",    day: "Selasa", startTime: "20:00", endTime: "22:00", activity: "Futsal Malam",          availableSlots: 6,  price: 150000 },

  // RABU
  { id: "sch-021", facilityId: "futsal-01",    day: "Rabu", startTime: "06:00", endTime: "08:00", activity: "Futsal Pagi",             availableSlots: 4,  price: 150000 },
  { id: "sch-022", facilityId: "yoga-01",      day: "Rabu", startTime: "07:00", endTime: "08:00", activity: "Yoga Pagi",               availableSlots: 10, price: 50000 },
  { id: "sch-023", facilityId: "fitness-01",   day: "Rabu", startTime: "08:00", endTime: "09:00", activity: "Gym Pagi",                availableSlots: 9,  price: 35000 },
  { id: "sch-024", facilityId: "badminton-01", day: "Rabu", startTime: "09:00", endTime: "10:00", activity: "Badminton Umum",          availableSlots: 6,  price: 75000 },
  { id: "sch-025", facilityId: "zumba-01",     day: "Rabu", startTime: "10:00", endTime: "11:00", activity: "Zumba Pagi",              availableSlots: 0,  price: 60000 },
  { id: "sch-026", facilityId: "futsal-01",    day: "Rabu", startTime: "16:00", endTime: "18:00", activity: "Futsal Sore",             availableSlots: 8,  price: 150000 },
  { id: "sch-027", facilityId: "badminton-01", day: "Rabu", startTime: "17:00", endTime: "19:00", activity: "Badminton Sore",          availableSlots: 0,  price: 75000 },
  { id: "sch-028", facilityId: "basket-01",    day: "Rabu", startTime: "19:00", endTime: "21:00", activity: "Basket Malam",            availableSlots: 5,  price: 200000 },

  // KAMIS
  { id: "sch-029", facilityId: "badminton-01", day: "Kamis", startTime: "06:00", endTime: "07:00", activity: "Badminton Pagi",         availableSlots: 0,  price: 75000 },
  { id: "sch-030", facilityId: "fitness-01",   day: "Kamis", startTime: "07:00", endTime: "08:00", activity: "Gym Pagi",               availableSlots: 18, price: 35000 },
  { id: "sch-031", facilityId: "futsal-01",    day: "Kamis", startTime: "09:00", endTime: "11:00", activity: "Futsal Pagi",            availableSlots: 6,  price: 150000 },
  { id: "sch-032", facilityId: "yoga-01",      day: "Kamis", startTime: "10:00", endTime: "11:00", activity: "Kelas Yoga",             availableSlots: 4,  price: 50000 },
  { id: "sch-033", facilityId: "fitness-01",   day: "Kamis", startTime: "15:00", endTime: "16:00", activity: "Gym Sore",               availableSlots: 5,  price: 35000 },
  { id: "sch-034", facilityId: "futsal-01",    day: "Kamis", startTime: "16:00", endTime: "18:00", activity: "Futsal Sore",            availableSlots: 0,  price: 150000 },
  { id: "sch-035", facilityId: "basket-01",    day: "Kamis", startTime: "17:00", endTime: "19:00", activity: "Basket Sore",            availableSlots: 9,  price: 200000 },
  { id: "sch-036", facilityId: "zumba-01",     day: "Kamis", startTime: "18:00", endTime: "19:00", activity: "Aerobik Malam",          availableSlots: 7,  price: 60000 },
  { id: "sch-037", facilityId: "futsal-01",    day: "Kamis", startTime: "19:00", endTime: "21:00", activity: "Futsal Malam",           availableSlots: 3,  price: 150000 },
  { id: "sch-038", facilityId: "badminton-01", day: "Kamis", startTime: "20:00", endTime: "22:00", activity: "Badminton Malam",        availableSlots: 5,  price: 75000 },

  // JUMAT
  { id: "sch-039", facilityId: "futsal-01",    day: "Jumat", startTime: "06:00", endTime: "08:00", activity: "Futsal Pagi",            availableSlots: 0,  price: 150000 },
  { id: "sch-040", facilityId: "fitness-01",   day: "Jumat", startTime: "07:00", endTime: "08:00", activity: "Gym Pagi",               availableSlots: 10, price: 35000 },
  { id: "sch-041", facilityId: "badminton-01", day: "Jumat", startTime: "08:00", endTime: "09:00", activity: "Badminton Pagi",         availableSlots: 3,  price: 75000 },
  { id: "sch-042", facilityId: "yoga-01",      day: "Jumat", startTime: "09:00", endTime: "10:00", activity: "Yoga Pagi",              availableSlots: 7,  price: 50000 },
  { id: "sch-043", facilityId: "zumba-01",     day: "Jumat", startTime: "09:00", endTime: "10:00", activity: "Zumba Pagi",             availableSlots: 5,  price: 60000 },
  { id: "sch-044", facilityId: "futsal-01",    day: "Jumat", startTime: "16:00", endTime: "18:00", activity: "Futsal Sore",            availableSlots: 2,  price: 150000 },
  { id: "sch-045", facilityId: "basket-01",    day: "Jumat", startTime: "17:00", endTime: "19:00", activity: "Basket Sore",            availableSlots: 0,  price: 200000 },
  { id: "sch-046", facilityId: "futsal-01",    day: "Jumat", startTime: "19:00", endTime: "21:00", activity: "Futsal Malam",           availableSlots: 0,  price: 150000 },
  { id: "sch-047", facilityId: "badminton-01", day: "Jumat", startTime: "20:00", endTime: "22:00", activity: "Badminton Malam",        availableSlots: 4,  price: 75000 },

  // SABTU
  { id: "sch-048", facilityId: "fitness-01",   day: "Sabtu", startTime: "06:00", endTime: "07:00", activity: "Gym Pagi",               availableSlots: 20, price: 35000 },
  { id: "sch-049", facilityId: "futsal-01",    day: "Sabtu", startTime: "07:00", endTime: "09:00", activity: "Futsal Weekend",         availableSlots: 0,  price: 150000 },
  { id: "sch-050", facilityId: "basket-01",    day: "Sabtu", startTime: "08:00", endTime: "10:00", activity: "Kelas Basket Anak",      availableSlots: 0,  price: 200000 },
  { id: "sch-051", facilityId: "yoga-01",      day: "Sabtu", startTime: "08:00", endTime: "09:00", activity: "Yoga Pagi",              availableSlots: 3,  price: 50000 },
  { id: "sch-052", facilityId: "badminton-01", day: "Sabtu", startTime: "09:00", endTime: "11:00", activity: "Badminton Weekend",      availableSlots: 1,  price: 75000 },
  { id: "sch-053", facilityId: "zumba-01",     day: "Sabtu", startTime: "09:00", endTime: "10:00", activity: "Zumba Weekend",          availableSlots: 8,  price: 60000 },
  { id: "sch-054", facilityId: "futsal-01",    day: "Sabtu", startTime: "10:00", endTime: "12:00", activity: "Futsal Umum",            availableSlots: 5,  price: 150000 },
  { id: "sch-055", facilityId: "futsal-01",    day: "Sabtu", startTime: "15:00", endTime: "17:00", activity: "Futsal Sore",            availableSlots: 0,  price: 150000 },
  { id: "sch-056", facilityId: "basket-01",    day: "Sabtu", startTime: "17:00", endTime: "19:00", activity: "Basket Sore",            availableSlots: 6,  price: 200000 },
  { id: "sch-057", facilityId: "futsal-01",    day: "Sabtu", startTime: "19:00", endTime: "21:00", activity: "Futsal Malam",           availableSlots: 0,  price: 150000 },
  { id: "sch-058", facilityId: "fitness-01",   day: "Sabtu", startTime: "20:00", endTime: "22:00", activity: "Gym Malam",              availableSlots: 10, price: 35000 },

  // MINGGU
  { id: "sch-059", facilityId: "fitness-01",   day: "Minggu", startTime: "06:00", endTime: "07:00", activity: "Senam Pagi",            availableSlots: 12, price: 35000 },
  { id: "sch-060", facilityId: "futsal-01",    day: "Minggu", startTime: "08:00", endTime: "10:00", activity: "Futsal Keluarga",       availableSlots: 0,  price: 150000 },
  { id: "sch-061", facilityId: "yoga-01",      day: "Minggu", startTime: "08:00", endTime: "09:00", activity: "Yoga Minggu",           availableSlots: 5,  price: 50000 },
  { id: "sch-062", facilityId: "badminton-01", day: "Minggu", startTime: "09:00", endTime: "11:00", activity: "Badminton Keluarga",    availableSlots: 0,  price: 75000 },
  { id: "sch-063", facilityId: "zumba-01",     day: "Minggu", startTime: "09:00", endTime: "10:00", activity: "Zumba Minggu",          availableSlots: 15, price: 60000 },
  { id: "sch-064", facilityId: "basket-01",    day: "Minggu", startTime: "15:00", endTime: "17:00", activity: "Basket Umum",           availableSlots: 4,  price: 200000 },
  { id: "sch-065", facilityId: "futsal-01",    day: "Minggu", startTime: "16:00", endTime: "18:00", activity: "Futsal Sore",           availableSlots: 3,  price: 150000 },
  { id: "sch-066", facilityId: "badminton-01", day: "Minggu", startTime: "17:00", endTime: "19:00", activity: "Badminton Sore",        availableSlots: 0,  price: 75000 },
  { id: "sch-067", facilityId: "futsal-01",    day: "Minggu", startTime: "19:00", endTime: "21:00", activity: "Futsal Malam",          availableSlots: 6,  price: 150000 },
];
