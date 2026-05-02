export const TRANSLATIONS = {
  "id-ID": {
    nav_home: "Beranda",
    nav_products: "Produk",
    nav_services: "Jasa/Services",
    nav_about: "Tentang Kami",
    nav_contact: "Kontak",
    nav_tracking: "Lacak Pesanan",
    nav_login: "Masuk",
    nav_register: "Daftar Sekarang",
    nav_dashboard: "Dashboard",
    nav_logout: "Keluar",
    nav_admin: "Admin",
    nav_cart: "Keranjang",

    hero_badge: "Solusi Logistik Terintegrasi & Berbasis Teknologi",
    hero_title: "Logistik Global, Presisi Tanpa Kompromi.",
    hero_description:
      "Solusi ekspor, impor, dan kepabeanan yang andal — menghubungkan bisnis Anda ke seluruh dunia dengan aman dan tepat waktu.",
    hero_primary_cta: "Lihat Layanan",
    hero_secondary_cta: "Daftar sebagai Mitra",

    about_label: "Tentang Kami",
    about_title: "Infrastruktur & Keahlian yang Tidak Tertandingi",
    about_description:
      "adalah perusahaan freight forwarding dan customs brokerage terpercaya yang melayani kebutuhan ekspor-impor korporat maupun UMKM di Indonesia. Kami memiliki tim bersertifikat dan jaringan agen global di lebih dari 150 negara.",
    about_cta: "Bergabung Bersama Kami",
    about_feature_1: "Visibilitas rantai pasok dari ujung ke ujung secara real-time",
    about_feature_2: "Tenaga ahli kepabeanan berlisensi untuk pengurusan dokumen cepat",
    about_feature_3: "Fasilitas pergudangan strategis dekat pelabuhan utama",
    about_feature_4: "Account manager dedikasi untuk klien korporat",
    about_feature_5: "Teknologi tracking shipment berbasis cloud",

    why_label: "Keunggulan Kami",
    why_title: "Mengapa Percayakan Logistik kepada Kami?",
    why_description:
      "Kami tidak sekadar mengangkut barang — kami memastikan seluruh perjalanan kargo Anda berjalan mulus dari dokumen hingga tiba di tujuan.",

    stats_countries: "Negara Tujuan",
    stats_security: "Keamanan Kargo",
    stats_shipments: "Pengiriman per Bulan",
    stats_support: "Layanan Pelanggan",

    cta_title: "Siap Memulai?",
    cta_description:
      "Percayakan kebutuhan logistik Anda kepada kami. Dapatkan kuotasi gratis dan konsultasi dengan tim ahli kami hari ini.",
    cta_primary: "Hubungi Kami",
    cta_secondary: "Lacak Pesanan",

    footer_tagline: "Solusi logistik terintegrasi untuk bisnis global Anda.",
    footer_rights: "Semua hak cipta dilindungi.",
  },

  "en-US": {
    nav_home: "Home",
    nav_products: "Products",
    nav_services: "Services",
    nav_about: "About Us",
    nav_contact: "Contact",
    nav_tracking: "Track Order",
    nav_login: "Login",
    nav_register: "Register Now",
    nav_dashboard: "Dashboard",
    nav_logout: "Logout",
    nav_admin: "Admin",
    nav_cart: "Cart",

    hero_badge: "Integrated Logistics Solutions Powered by Technology",
    hero_title: "Global Logistics, Precision Without Compromise.",
    hero_description:
      "Reliable export, import, and customs solutions connecting your business worldwide safely and on time.",
    hero_primary_cta: "View Services",
    hero_secondary_cta: "Become a Partner",

    about_label: "About Us",
    about_title: "Unmatched Infrastructure & Expertise",
    about_description:
      "is a trusted freight forwarding and customs brokerage company serving export-import needs of corporate clients and SMEs in Indonesia. Our certified team operates a global agent network across more than 150 countries.",
    about_cta: "Join Us",
    about_feature_1: "End-to-end supply chain visibility in real-time",
    about_feature_2: "Licensed customs specialists for fast document processing",
    about_feature_3: "Strategic warehouse facilities near major ports",
    about_feature_4: "Dedicated account managers for corporate clients",
    about_feature_5: "Cloud-based shipment tracking technology",

    why_label: "Our Advantages",
    why_title: "Why Trust Us With Your Logistics?",
    why_description:
      "We don't just move goods — we ensure the entire cargo journey runs smoothly from documentation to delivery.",

    stats_countries: "Destination Countries",
    stats_security: "Cargo Safety",
    stats_shipments: "Shipments per Month",
    stats_support: "Customer Support",

    cta_title: "Ready to Get Started?",
    cta_description:
      "Entrust your logistics needs to us. Get a free quote and consult with our expert team today.",
    cta_primary: "Contact Us",
    cta_secondary: "Track Order",

    footer_tagline: "Integrated logistics solutions for your global business.",
    footer_rights: "All rights reserved.",
  },
} as const;

export type SupportedLocale = keyof typeof TRANSLATIONS;
export type TranslationKey = keyof (typeof TRANSLATIONS)["id-ID"];

export const SUPPORTED_LOCALES = Object.keys(TRANSLATIONS) as SupportedLocale[];
