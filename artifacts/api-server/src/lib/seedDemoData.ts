import {
  db,
  customersTable,
  salesDocumentsTable,
  salesDocumentLinesTable,
  freightShipmentsTable,
  freightAttachmentsTable,
  expenseCategoriesTable,
  expensesTable,
  chartOfAccountsTable,
  productsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";

const DEMO_SO_NUMBER = "SO-DEMO-2026-001";

const EXPENSE_CATEGORIES = [
  { code: "BIAYA-OCEAN-FREIGHT", name: "Biaya Ocean Freight" },
  { code: "BIAYA-AIR-FREIGHT",   name: "Biaya Air Freight" },
  { code: "BIAYA-TRUCKING",      name: "Biaya Trucking & Transport" },
  { code: "BIAYA-HANDLING",      name: "Biaya Handling & Port Charges" },
  { code: "BIAYA-CUSTOMS",       name: "Biaya Customs Clearance" },
  { code: "BIAYA-STORAGE",       name: "Biaya Storage & Demurrage" },
  { code: "BIAYA-ASURANSI",      name: "Biaya Asuransi Kargo" },
  { code: "BIAYA-LAINNYA",       name: "Biaya Operasional Lainnya" },
];

export async function seedDemoData(): Promise<void> {
  try {
    // Check if demo already seeded
    const [existing] = await db
      .select({ id: salesDocumentsTable.id })
      .from(salesDocumentsTable)
      .where(eq(salesDocumentsTable.docNumber, DEMO_SO_NUMBER))
      .limit(1);
    if (existing) {
      logger.info("Demo data already seeded, skipping");
      return;
    }

    // ── 1. Expense Categories ─────────────────────────────────────────────────
    // Find relevant accounts (Beban Operasional Lain & Hutang Usaha)
    const [expenseAccount] = await db
      .select({ id: chartOfAccountsTable.id })
      .from(chartOfAccountsTable)
      .where(eq(chartOfAccountsTable.code, "5-2040"))
      .limit(1);
    const [payableAccount] = await db
      .select({ id: chartOfAccountsTable.id })
      .from(chartOfAccountsTable)
      .where(eq(chartOfAccountsTable.code, "2-1010"))
      .limit(1);

    await db
      .insert(expenseCategoriesTable)
      .values(
        EXPENSE_CATEGORIES.map((cat) => ({
          code: cat.code,
          name: cat.name,
          expenseAccountId: expenseAccount?.id ?? null,
          payableAccountId: payableAccount?.id ?? null,
          requiresAttachment: false,
          isActive: true,
        }))
      )
      .onConflictDoNothing({ target: expenseCategoriesTable.code });

    logger.info("Expense categories seeded");

    // ── 2. Demo Customer ──────────────────────────────────────────────────────
    let customerId: number;
    const [existingCustomer] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.name, "PT. Ekspedisi Nusantara"))
      .limit(1);

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const [newCustomer] = await db
        .insert(customersTable)
        .values({
          name: "PT. Ekspedisi Nusantara",
          email: "ops@ekspedisinusantara.co.id",
          phone: "+62-21-5555-1234",
          address: "Jl. Pelabuhan Raya No. 88, Tanjung Priok, Jakarta Utara",
          npwp: "01.234.567.8-901.000",
        })
        .returning();
      customerId = newCustomer!.id;
      logger.info("Demo customer created");
    }

    // ── 3. Logistics Products (get IDs) ───────────────────────────────────────
    const oceanFreightProduct = await db
      .select({ id: productsTable.id, name: productsTable.name, price: productsTable.price })
      .from(productsTable)
      .where(eq(productsTable.sku, "SVC-OCEAN-FREIGHT"))
      .limit(1);
    const handlingProduct = await db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.sku, "SVC-HANDLING"))
      .limit(1);
    const customsProduct = await db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.sku, "SVC-CUSTOMS"))
      .limit(1);

    // ── 4. Demo Sales Order (Confirmed & Invoiced) ────────────────────────────
    const soLines = [
      {
        productId: oceanFreightProduct[0]?.id ?? null,
        name: "Jasa Ocean Freight – Jakarta ke Singapore",
        description: "FCL 20' Container, tarif all-in",
        quantity: "1",
        unitPrice: "15000000",
        subtotal: "15000000",
      },
      {
        productId: handlingProduct[0]?.id ?? null,
        name: "Jasa Handling & Port Charges",
        description: "Container handling di Tanjung Priok",
        quantity: "1",
        unitPrice: "2500000",
        subtotal: "2500000",
      },
      {
        productId: customsProduct[0]?.id ?? null,
        name: "Jasa Customs Clearance Ekspor",
        description: "Pengurusan dokumen ekspor PEB",
        quantity: "1",
        unitPrice: "1500000",
        subtotal: "1500000",
      },
    ];
    const totalAmount = 19000000;

    const [demoSo] = await db
      .insert(salesDocumentsTable)
      .values({
        docNumber: DEMO_SO_NUMBER,
        kind: "order",
        status: "confirmed",
        invoiceStatus: "invoiced",
        deliveryStatus: "to_deliver",
        customerId,
        customerName: "PT. Ekspedisi Nusantara",
        totalAmount: String(totalAmount),
        taxAmount: "0",
        grandTotal: String(totalAmount),
        origin: "Jakarta, Indonesia",
        destination: "Singapore",
        transportMode: "sea",
        expectedDate: new Date("2026-05-15"),
        confirmedAt: new Date(),
        notes: "Demo Sales Order — dibuat otomatis untuk contoh data",
      })
      .returning();

    await db.insert(salesDocumentLinesTable).values(
      soLines.map((line) => ({ ...line, documentId: demoSo!.id }))
    );

    logger.info(`Demo Sales Order ${DEMO_SO_NUMBER} created`);

    // ── 5. Demo Freight Shipment ──────────────────────────────────────────────
    const shipmentNumber = "FS-DEMO-2026-001";

    const [existingShipment] = await db
      .select({ id: freightShipmentsTable.id })
      .from(freightShipmentsTable)
      .where(eq(freightShipmentsTable.shipmentNumber, shipmentNumber))
      .limit(1);

    let shipmentId: number;
    if (existingShipment) {
      shipmentId = existingShipment.id;
    } else {
      const [demoShipment] = await db
        .insert(freightShipmentsTable)
        .values({
          shipmentNumber,
          shipperName: "PT. Maju Bersama Indonesia",
          shipperAddress: "Kawasan Industri MM2100 Blok A-1, Cikarang, Bekasi",
          consigneeName: "PT. Ekspedisi Nusantara",
          consigneeAddress: "8 Kallang Avenue, Singapore 339509",
          notifyParty: "PT. Ekspedisi Nusantara — sama dengan consignee",
          commodity: "Garment / Pakaian Jadi",
          hsCode: "6204.62.00",
          grossWeight: "3250",
          netWeight: "3050",
          quantity: 120,
          packingType: "Carton",
          dimensions: "120 x 80 x 100 cm per pallet",
          marksAndNumbers: "PT MBI / JKT-SGP-2026 / Carton No. 1-120",
          measurement: "9.6 CBM",
          origin: "Jakarta, Indonesia",
          destination: "Singapore",
          portOfLoading: "Tanjung Priok, Jakarta",
          portOfDischarge: "Port of Singapore (PSA)",
          vessel: "MV. Strait Enterprise",
          voyage: "SE-2026-0412",
          transportMode: "sea",
          cargoType: "FCL",
          containerNo: "MSCU7234561",
          awbNumber: "BL-2026-01234",
          status: "in_transit",
          departureDate: "2026-04-15",
          approvedVendorName: "PT. Samudera Shipping Lines",
          salesDocId: demoSo!.id,
          notes: "Demo Shipment — FCL 20' Jakarta → Singapore",
        })
        .returning();
      shipmentId = demoShipment!.id;
    }

    logger.info(`Demo Freight Shipment ${shipmentNumber} created`);

    // ── 6. Demo Freight Attachments (BL & AWB documents) ─────────────────────
    await db
      .insert(freightAttachmentsTable)
      .values([
        {
          shipmentId,
          objectPath: "demo/documents/bl-2026-01234.pdf",
          fileName: "BL-2026-01234.pdf",
          contentType: "application/pdf",
          fileType: "document",
          label: "Bill of Lading",
          docType: "BL",
          docNumber: "BL-2026-01234",
          docDate: "2026-04-15",
          docStatus: "issued",
        },
        {
          shipmentId,
          objectPath: "demo/documents/packing-list-2026-001.pdf",
          fileName: "PackingList-2026-001.pdf",
          contentType: "application/pdf",
          fileType: "document",
          label: "Packing List",
          docType: "PackingList",
          docNumber: "PL-2026-001",
          docDate: "2026-04-14",
          docStatus: "issued",
        },
        {
          shipmentId,
          objectPath: "demo/documents/peb-2026-005678.pdf",
          fileName: "PEB-2026-005678.pdf",
          contentType: "application/pdf",
          fileType: "document",
          label: "Pemberitahuan Ekspor Barang",
          docType: "PEB",
          docNumber: "PEB-2026-005678",
          docDate: "2026-04-14",
          docStatus: "submitted",
        },
      ]);

    logger.info("Demo freight documents (BL, Packing List, PEB) attached");

    // ── 7. Demo Expenses ──────────────────────────────────────────────────────
    const [oceanFreightCat] = await db
      .select({ id: expenseCategoriesTable.id })
      .from(expenseCategoriesTable)
      .where(eq(expenseCategoriesTable.code, "BIAYA-OCEAN-FREIGHT"))
      .limit(1);
    const [handlingCat] = await db
      .select({ id: expenseCategoriesTable.id })
      .from(expenseCategoriesTable)
      .where(eq(expenseCategoriesTable.code, "BIAYA-HANDLING"))
      .limit(1);
    const [customsCat] = await db
      .select({ id: expenseCategoriesTable.id })
      .from(expenseCategoriesTable)
      .where(eq(expenseCategoriesTable.code, "BIAYA-CUSTOMS"))
      .limit(1);

    await db.insert(expensesTable).values([
      {
        expenseNumber: "EXP-DEMO-2026-001",
        date: "2026-04-13",
        vendorEmployee: "PT. Samudera Shipping Lines",
        expenseType: "vendor_bill",
        shipmentId,
        salesDocId: demoSo!.id,
        categoryId: oceanFreightCat?.id ?? null,
        description: "Biaya Ocean Freight FCL 20' — Jakarta ke Singapore",
        qty: "1",
        unit: "shipment",
        unitPrice: "12500000",
        subtotal: "12500000",
        taxAmount: "0",
        total: "12500000",
        currency: "IDR",
        status: "posted",
        expenseAccountId: expenseAccount?.id ?? null,
        payableAccountId: payableAccount?.id ?? null,
        notes: "Invoice No. SSP/2026/04/0891 dari Samudera Shipping",
      },
      {
        expenseNumber: "EXP-DEMO-2026-002",
        date: "2026-04-13",
        vendorEmployee: "PT. Graha Port Services",
        expenseType: "vendor_bill",
        shipmentId,
        salesDocId: demoSo!.id,
        categoryId: handlingCat?.id ?? null,
        description: "Biaya Handling & Port Charges di Tanjung Priok",
        qty: "1",
        unit: "lot",
        unitPrice: "1800000",
        subtotal: "1800000",
        taxAmount: "0",
        total: "1800000",
        currency: "IDR",
        status: "posted",
        expenseAccountId: expenseAccount?.id ?? null,
        payableAccountId: payableAccount?.id ?? null,
        notes: "Termasuk biaya TKBM dan lift-on/lift-off",
      },
      {
        expenseNumber: "EXP-DEMO-2026-003",
        date: "2026-04-14",
        vendorEmployee: "PT. Bea Cukai Partner",
        expenseType: "vendor_bill",
        shipmentId,
        salesDocId: demoSo!.id,
        categoryId: customsCat?.id ?? null,
        description: "Biaya Customs Clearance Ekspor (PEB)",
        qty: "1",
        unit: "dokumen",
        unitPrice: "750000",
        subtotal: "750000",
        taxAmount: "0",
        total: "750000",
        currency: "IDR",
        status: "draft",
        expenseAccountId: expenseAccount?.id ?? null,
        payableAccountId: payableAccount?.id ?? null,
        notes: "Menunggu konfirmasi final dari Bea Cukai",
      },
    ]).onConflictDoNothing({ target: expensesTable.expenseNumber });

    logger.info("Demo expenses (3 entries) created");

    logger.info(
      `Demo data seeded successfully — SO: ${DEMO_SO_NUMBER}, Shipment: ${shipmentNumber}, ` +
      `Revenue: IDR 19,000,000, Total Cost: IDR 15,050,000, Estimated Profit: IDR 3,950,000 (20.8%)`
    );
  } catch (err) {
    logger.error({ err }, "Failed to seed demo data");
  }
}
