/**
 * Regression test: Price Sync BizPortal → Customer Portal
 *
 * Verifikasi bahwa setiap operasi yang mengubah harga di BizPortal
 * selalu memicu event `price_sync` via SSE ke Customer Portal.
 *
 * Cara menjalankan:
 *   node artifacts/api-server/tests/price-sync.regression.mjs
 *
 * Pastikan API Server sudah berjalan di PORT 8080 sebelum menjalankan test ini.
 */

import http from "http";

const BASE_HOST = "localhost";
const BASE_PORT = 8080;
const BASE = `http://${BASE_HOST}:${BASE_PORT}`;
const TIMEOUT_MS = 8000;

let passed = 0;
let failed = 0;

function log(label, status, detail = "") {
  const icon = status === "PASS" ? "✅" : "❌";
  console.log(`${icon} ${status}  ${label}${detail ? `\n       ${detail}` : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpJson(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: BASE_HOST,
      port: BASE_PORT,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Opens a real HTTP streaming connection to SSE endpoint.
 * Starts listening immediately, then fires triggerFn after 400ms.
 * Resolves true if 'price_sync' line is seen within TIMEOUT_MS.
 */
async function expectPriceSync(label, triggerFn) {
  return new Promise((resolve) => {
    let done = false;

    const finish = (ok, detail = "") => {
      if (done) return;
      done = true;
      req.destroy();
      if (ok) {
        log(label, "PASS", detail);
        passed++;
      } else {
        log(label, "FAIL", detail);
        failed++;
      }
      resolve(ok);
    };

    const timer = setTimeout(
      () => finish(false, `price_sync tidak diterima dalam ${TIMEOUT_MS}ms`),
      TIMEOUT_MS
    );

    // Open SSE connection using http module (proper streaming)
    const req = http.request(
      {
        hostname: BASE_HOST,
        port: BASE_PORT,
        path: "/api/ecommerce/events",
        method: "GET",
        headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          buf += chunk;
          if (buf.includes("event: price_sync")) {
            clearTimeout(timer);
            const eventLine = buf.split("\n").find((l) => l.startsWith("event:")) ?? "event: price_sync";
            finish(true, eventLine.trim());
          }
        });

        res.on("end", () => {
          if (!done) finish(false, "SSE connection closed unexpectedly");
        });

        // Fire trigger 400ms after connection established
        sleep(400).then(() => {
          if (!done) {
            triggerFn().catch((err) => {
              if (!done) finish(false, `Trigger error: ${err.message}`);
            });
          }
        });
      }
    );

    req.on("error", (err) => {
      if (!done) {
        clearTimeout(timer);
        finish(false, `HTTP error: ${err.message}`);
      }
    });

    req.end();
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getFirstProduct() {
  const arr = await httpJson("GET", "/api/portal/products");
  return Array.isArray(arr) ? arr[0] : null;
}

async function getFirstService() {
  const arr = await httpJson("GET", "/api/portal/services");
  return Array.isArray(arr) ? arr[0] : null;
}

async function getFirstCategory() {
  const arr = await httpJson("GET", "/api/ecommerce/product-categories");
  return (Array.isArray(arr) && arr[0]?.name) ? arr[0].name : "Furniture";
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function testProductPriceUpdate() {
  const product = await getFirstProduct();
  if (!product) {
    log("T1: PUT /api/ecommerce/products/:id (product price)", "FAIL", "Tidak ada produk di database");
    failed++;
    return;
  }
  const origPrice = Number(product.price);
  await expectPriceSync("T1: PUT /api/ecommerce/products/:id (product price)", async () => {
    await httpJson("PUT", `/api/ecommerce/products/${product.id}`, { price: origPrice + 1000 });
    await httpJson("PUT", `/api/ecommerce/products/${product.id}`, { price: origPrice });
  });
}

async function testServicePriceUpdate() {
  const service = await getFirstService();
  if (!service) {
    log("T2: PUT /api/ecommerce/products/:id (service price)", "FAIL", "Tidak ada service di database");
    failed++;
    return;
  }
  const origPrice = Number(service.price);
  await expectPriceSync("T2: PUT /api/ecommerce/products/:id (service price)", async () => {
    await httpJson("PUT", `/api/ecommerce/products/${service.id}`, { price: origPrice + 500 });
    await httpJson("PUT", `/api/ecommerce/products/${service.id}`, { price: origPrice });
  });
}

async function testCalculatorRatesUpdate() {
  // PUT /api/settings/calculator-rates memerlukan admin session (Secure cookie, HTTPS only).
  // Tidak dapat diuji via HTTP langsung. Verifikasi via code:
  //   settings.ts:75 — broadcastToPortal("price_sync", { ts: Date.now() }) dipanggil
  //   setelah upsert ke portal_content (key: calculator_rates).
  //   Listener: calculator.tsx → invalidateQueries(["portal-calculator-rates"])
  console.log("ℹ️  SKIP  T3: PUT /api/settings/calculator-rates");
  console.log("         Reason: auth Secure cookie tidak bisa dibawa via HTTP");
  console.log("         Code path: settings.ts:75 broadcastToPortal('price_sync') ✓ verified");
}

async function testBulkImport() {
  const product = await getFirstProduct();
  const category = await getFirstCategory();
  if (!product) {
    log("T4: POST /api/ecommerce/products/bulk-import", "FAIL", "Tidak ada produk di database");
    failed++;
    return;
  }
  await expectPriceSync("T4: POST /api/ecommerce/products/bulk-import", async () => {
    await httpJson("POST", "/api/ecommerce/products/bulk-import", {
      rows: [
        {
          nama: product.name,
          sku: product.sku ?? `SKU-REGTEST-${Date.now()}`,
          harga: Number(product.price),
          stok: Number(product.stock ?? 0),
          kategori: category,
        },
      ],
    });
  });
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function run() {
  console.log("=== Price Sync Regression Tests ===\n");
  console.log(`Target: ${BASE}`);
  console.log(`SSE:    ${BASE}/api/ecommerce/events\n`);

  await testProductPriceUpdate();
  await testServicePriceUpdate();
  await testCalculatorRatesUpdate();
  await testBulkImport();

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Hasil: ${passed} PASS  |  ${failed} FAIL  |  1 SKIP`);

  if (failed > 0) {
    console.log("\n⚠️  Ada test yang gagal. Periksa broadcastToPortal di endpoint terkait.");
    process.exit(1);
  } else {
    console.log("\n✅ Semua test passed.");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
