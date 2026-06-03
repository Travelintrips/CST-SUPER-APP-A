// Google Sheets connector via Replit Connectors SDK
// Uses @replit/connectors-sdk — do NOT cache the connector instance (tokens expire)

import { ReplitConnectors } from "@replit/connectors-sdk";

function getConnectors() {
  return new ReplitConnectors();
}

async function proxyRequest(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const connectors = getConnectors();
  const res = await connectors.proxy("google-sheet", path, {
    method: options.method ?? "GET",
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Encode range: nama sheet dengan spasi harus pakai 'quotes'!A:Z
// mis. "Chart of Accounts" → %27Chart%20of%20Accounts%27!A:Z
function rangeParam(sheetName: string, cols = "A:Z"): string {
  return encodeURIComponent(`'${sheetName}'!${cols}`);
}

export async function createSpreadsheet(title: string): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const data = await proxyRequest("/v4/spreadsheets", {
    method: "POST",
    body: {
      properties: { title },
      sheets: [
        { properties: { title: "Chart of Accounts", index: 0 } },
        { properties: { title: "Journal Entries", index: 1 } },
        { properties: { title: "Entry Lines", index: 2 } },
        { properties: { title: "Trial Balance", index: 3 } },
      ],
    },
  }) as { spreadsheetId: string; spreadsheetUrl: string };
  return data;
}

export async function getSpreadsheetMeta(spreadsheetId: string): Promise<{ title: string; sheets: string[] }> {
  const data = await proxyRequest(`/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`) as {
    properties: { title: string };
    sheets: Array<{ properties: { title: string } }>;
  };
  return {
    title: data.properties.title,
    sheets: data.sheets.map((s) => s.properties.title),
  };
}

// Pastikan semua tab yang dibutuhkan ada di spreadsheet (buat jika belum ada)
export async function ensureSheets(spreadsheetId: string, sheetNames: string[]): Promise<void> {
  const meta = await getSpreadsheetMeta(spreadsheetId);
  const existing = new Set(meta.sheets);
  const toAdd = sheetNames.filter((n) => !existing.has(n));
  if (toAdd.length === 0) return;
  await proxyRequest(`/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: {
      requests: toAdd.map((title, i) => ({
        addSheet: {
          properties: { title, index: sheetNames.indexOf(title) + i },
        },
      })),
    },
  });
}

export async function clearAndWriteSheet(
  spreadsheetId: string,
  sheetName: string,
  rows: unknown[][],
): Promise<void> {
  // Clear dulu — gunakan format 'Sheet Name'!A:Z
  await proxyRequest(
    `/v4/spreadsheets/${spreadsheetId}/values/${rangeParam(sheetName)}:clear`,
    { method: "POST", body: {} },
  );
  if (rows.length === 0) return;
  // Tulis data
  await proxyRequest(
    `/v4/spreadsheets/${spreadsheetId}/values/${rangeParam(sheetName)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: { values: rows } },
  );
}

export async function readSheet(
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const data = await proxyRequest(
    `/v4/spreadsheets/${spreadsheetId}/values/${rangeParam(sheetName)}`,
  ) as { values?: string[][] };
  return data.values ?? [];
}
