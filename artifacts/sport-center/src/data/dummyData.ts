import type { Facility, Testimonial, Schedule } from "@/types";

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

export const schedules: Schedule[] = [
  {
    facilityId: "futsal-1",
    facilityName: "Lapangan Futsal Indoor",
    slots: [
      { time: "06:00 - 07:00", mon: true, tue: true, wed: false, thu: true, fri: true, sat: false, sun: false },
      { time: "07:00 - 08:00", mon: false, tue: false, wed: true, thu: false, fri: false, sat: true, sun: true },
      { time: "08:00 - 09:00", mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
      { time: "09:00 - 10:00", mon: true, tue: false, wed: true, thu: false, fri: true, sat: false, sun: true },
      { time: "15:00 - 16:00", mon: false, tue: true, wed: false, thu: true, fri: false, sat: true, sun: false },
      { time: "16:00 - 17:00", mon: true, tue: true, wed: true, thu: true, fri: false, sat: false, sun: true },
      { time: "17:00 - 18:00", mon: false, tue: false, wed: false, thu: false, fri: true, sat: true, sun: false },
      { time: "19:00 - 20:00", mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
      { time: "20:00 - 21:00", mon: false, tue: true, wed: false, thu: true, fri: true, sat: false, sun: false },
    ],
  },
  {
    facilityId: "badminton-1",
    facilityName: "Lapangan Badminton A",
    slots: [
      { time: "06:00 - 07:00", mon: true, tue: true, wed: true, thu: false, fri: true, sat: true, sun: false },
      { time: "07:00 - 08:00", mon: false, tue: false, wed: false, thu: true, fri: false, sat: false, sun: true },
      { time: "08:00 - 09:00", mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
      { time: "16:00 - 17:00", mon: false, tue: true, wed: false, thu: false, fri: false, sat: true, sun: true },
      { time: "17:00 - 18:00", mon: true, tue: false, wed: true, thu: true, fri: true, sat: false, sun: false },
      { time: "18:00 - 19:00", mon: false, tue: true, wed: false, thu: false, fri: false, sat: true, sun: true },
    ],
  },
];

export const timeOptions = [
  "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
  "18:00", "19:00", "20:00", "21:00", "22:00",
];
