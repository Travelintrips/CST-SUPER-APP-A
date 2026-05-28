export type CustomFieldType = "text" | "number" | "select" | "textarea" | "date";

export interface CustomField {
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
  unit?: string;
}

export interface RequiredDocument {
  key: string;
  label: string;
  required: boolean;
}

export interface ChecklistItem {
  key: string;
  label: string;
}

export interface ConditionalRule {
  fieldKey: string;
  condition: { value: string | number };
  show: string[];
}

export interface ValidationRule {
  fieldKey: string;
  message: string;
}

export interface ProductTemplate {
  category: string;
  label: string;
  version: string;
  requiredDocuments: RequiredDocument[];
  checklist: ChecklistItem[];
  packagingInstructions: string;
  customFields: CustomField[];
  conditionalRules: ConditionalRule[];
  validationRules: ValidationRule[];
}

const templates: Record<string, ProductTemplate> = {
  coal: {
    category: "coal",
    label: "Batubara",
    version: "1.0.0",
    requiredDocuments: [
      { key: "coa", label: "Certificate of Analysis (COA)", required: true },
      { key: "seal_cert", label: "Seal Certificate", required: true },
      { key: "survey_report", label: "Survey Report", required: false },
    ],
    checklist: [
      { key: "sampling_done", label: "Sampling selesai dilakukan" },
      { key: "weight_verified", label: "Berat terverifikasi" },
      { key: "moisture_checked", label: "Kadar moisture dicek" },
      { key: "seal_applied", label: "Segel dipasang" },
      { key: "docs_complete", label: "Dokumen lengkap" },
    ],
    packagingInstructions:
      "Gunakan bulk carrier / tongkang yang bersih dan kering. Pastikan tidak ada kontaminasi dari muatan sebelumnya. Tutup palka rapat saat hujan.",
    customFields: [
      { key: "gar_nar", label: "GAR/NAR (kcal/kg)", type: "number", required: true, placeholder: "5000" },
      { key: "moisture", label: "Total Moisture (%)", type: "number", required: true, placeholder: "25" },
      { key: "ash", label: "Ash Content (%)", type: "number", required: true, placeholder: "8" },
      { key: "sulfur", label: "Total Sulfur (%)", type: "number", required: true, placeholder: "0.5" },
      { key: "seal_number", label: "Nomor Segel", type: "text", required: false, placeholder: "SEAL-XXXXX" },
      { key: "mine_origin", label: "Asal Tambang", type: "text", required: true, placeholder: "Kalimantan Timur" },
      { key: "quantity_mt", label: "Kuantitas (MT)", type: "number", required: true, placeholder: "1000" },
    ],
    conditionalRules: [],
    validationRules: [
      { fieldKey: "gar_nar", message: "GAR/NAR wajib diisi" },
      { fieldKey: "moisture", message: "Moisture wajib diisi" },
      { fieldKey: "mine_origin", message: "Asal tambang wajib diisi" },
      { fieldKey: "quantity_mt", message: "Kuantitas wajib diisi" },
    ],
  },

  iron_steel: {
    category: "iron_steel",
    label: "Besi & Baja",
    version: "1.0.0",
    requiredDocuments: [
      { key: "mtc", label: "Mill Test Certificate (MTC)", required: true },
      { key: "packing_list", label: "Packing List", required: true },
      { key: "invoice", label: "Commercial Invoice", required: false },
    ],
    checklist: [
      { key: "grade_verified", label: "Grade material terverifikasi" },
      { key: "dimension_checked", label: "Dimensi sesuai spesifikasi" },
      { key: "weight_verified", label: "Berat total terverifikasi" },
      { key: "marking_done", label: "Marking/labeling selesai" },
      { key: "docs_complete", label: "Dokumen lengkap" },
    ],
    packagingInstructions:
      "Ikat dengan banding steel minimal 2 titik per bundle. Gunakan pelindung sudut untuk profile. Simpan di tempat kering, hindari kontak langsung dengan tanah.",
    customFields: [
      { key: "grade", label: "Grade Material", type: "text", required: true, placeholder: "SS400, A36, dll." },
      { key: "dimension", label: "Dimensi (mm)", type: "text", required: true, placeholder: "100x100x6000" },
      { key: "weight_kg", label: "Berat Total (kg)", type: "number", required: true, placeholder: "5000" },
      { key: "hs_code", label: "HS Code", type: "text", required: false, placeholder: "7213.10.00" },
      { key: "mill_origin", label: "Asal Pabrik/Mill", type: "text", required: false, placeholder: "Krakatau Steel" },
      { key: "heat_number", label: "Heat Number", type: "text", required: false, placeholder: "H-XXXXX" },
    ],
    conditionalRules: [],
    validationRules: [
      { fieldKey: "grade", message: "Grade material wajib diisi" },
      { fieldKey: "dimension", message: "Dimensi wajib diisi" },
      { fieldKey: "weight_kg", message: "Berat total wajib diisi" },
    ],
  },

  coffee: {
    category: "coffee",
    label: "Kopi",
    version: "1.0.0",
    requiredDocuments: [
      { key: "phyto", label: "Phytosanitary Certificate", required: true },
      { key: "fumigation", label: "Fumigation Certificate", required: true },
      { key: "ico", label: "ICO Certificate of Origin", required: false },
    ],
    checklist: [
      { key: "sorting_done", label: "Sortasi biji selesai" },
      { key: "moisture_checked", label: "Kadar air dicek (max 13%)" },
      { key: "defect_counted", label: "Defect count selesai" },
      { key: "fumigation_done", label: "Fumigasi selesai" },
      { key: "docs_complete", label: "Dokumen ekspor lengkap" },
    ],
    packagingInstructions:
      "Gunakan jute bag 60 kg atau grain bag GrainPro. Simpan di gudang sejuk (15–25°C), kelembaban rendah. Hindari paparan sinar matahari langsung.",
    customFields: [
      {
        key: "bean_type",
        label: "Jenis Biji",
        type: "select",
        required: true,
        options: ["Arabica", "Robusta", "Liberica", "Blend"],
      },
      {
        key: "grade",
        label: "Grade",
        type: "select",
        required: true,
        options: ["Grade 1", "Grade 2", "Grade 3", "Specialty"],
      },
      { key: "moisture_pct", label: "Kadar Air (%)", type: "number", required: true, placeholder: "12" },
      { key: "origin", label: "Daerah Asal", type: "text", required: true, placeholder: "Toraja, Gayo, Flores, dll." },
      { key: "quantity_kg", label: "Kuantitas (kg)", type: "number", required: true, placeholder: "1000" },
      { key: "harvest_year", label: "Tahun Panen", type: "text", required: false, placeholder: "2025" },
    ],
    conditionalRules: [],
    validationRules: [
      { fieldKey: "bean_type", message: "Jenis biji wajib dipilih" },
      { fieldKey: "origin", message: "Daerah asal wajib diisi" },
      { fieldKey: "moisture_pct", message: "Kadar air wajib diisi" },
      { fieldKey: "quantity_kg", message: "Kuantitas wajib diisi" },
    ],
  },

  electronics: {
    category: "electronics",
    label: "Elektronik",
    version: "1.0.0",
    requiredDocuments: [
      { key: "warranty_doc", label: "Dokumen Garansi", required: false },
      { key: "msds", label: "MSDS (jika mengandung baterai)", required: false },
      { key: "test_report", label: "Test Report / SNI", required: false },
    ],
    checklist: [
      { key: "serial_recorded", label: "Serial number dicatat" },
      { key: "packaging_intact", label: "Kemasan original utuh" },
      { key: "accessories_complete", label: "Aksesori lengkap" },
      { key: "battery_info_noted", label: "Info baterai dicatat (jika ada)" },
      { key: "docs_complete", label: "Dokumen lengkap" },
    ],
    packagingInstructions:
      "Gunakan bubble wrap dan kardus double-wall. Untuk perangkat dengan baterai, tandai 'CONTAINS BATTERY' di luar kemasan sesuai regulasi IATA DGR.",
    customFields: [
      { key: "brand", label: "Merek", type: "text", required: true, placeholder: "Samsung, Apple, dll." },
      { key: "model", label: "Model/Tipe", type: "text", required: true, placeholder: "Galaxy S25" },
      { key: "serial_number", label: "Serial Number", type: "text", required: false, placeholder: "SN-XXXXXXXX" },
      {
        key: "has_battery",
        label: "Mengandung Baterai",
        type: "select",
        required: true,
        options: ["Ya", "Tidak"],
      },
      { key: "battery_wh", label: "Kapasitas Baterai (Wh)", type: "number", required: false, placeholder: "50", unit: "Wh" },
      { key: "quantity_pcs", label: "Jumlah (pcs)", type: "number", required: true, placeholder: "10" },
    ],
    conditionalRules: [
      { fieldKey: "has_battery", condition: { value: "Ya" }, show: ["battery_wh"] },
    ],
    validationRules: [
      { fieldKey: "brand", message: "Merek wajib diisi" },
      { fieldKey: "model", message: "Model wajib diisi" },
      { fieldKey: "has_battery", message: "Info baterai wajib dipilih" },
      { fieldKey: "quantity_pcs", message: "Jumlah wajib diisi" },
    ],
  },

  general: {
    category: "general",
    label: "Umum / Lainnya",
    version: "1.0.0",
    requiredDocuments: [
      { key: "packing_list", label: "Packing List", required: false },
    ],
    checklist: [
      { key: "quantity_verified", label: "Kuantitas terverifikasi" },
      { key: "condition_checked", label: "Kondisi barang dicek" },
      { key: "packaging_ok", label: "Kemasan sesuai standar" },
    ],
    packagingInstructions:
      "Kemas sesuai standar pengiriman. Pastikan barang terlindungi dari benturan dan cuaca.",
    customFields: [
      { key: "description", label: "Deskripsi Barang", type: "textarea", required: true, placeholder: "Deskripsi lengkap barang..." },
      { key: "quantity", label: "Kuantitas", type: "number", required: true, placeholder: "1" },
      { key: "unit", label: "Satuan", type: "text", required: false, placeholder: "pcs, kg, box, dll." },
    ],
    conditionalRules: [],
    validationRules: [
      { fieldKey: "description", message: "Deskripsi barang wajib diisi" },
      { fieldKey: "quantity", message: "Kuantitas wajib diisi" },
    ],
  },
};

export function getTemplate(category: string): ProductTemplate {
  return templates[category] ?? templates["general"]!;
}

export function getAllTemplates(): ProductTemplate[] {
  return Object.values(templates);
}

export { templates };
