// Google Sheets connector via Replit Connectors SDK
// Uses @replit/connectors-sdk — do NOT cache the connector instance (tokens expire)

import { ReplitConnectors } from "@replit/connectors-sdk";

const SHEETS_BASE = "https://sheets.googleapis.com";

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

export async function clearAndWriteSheet(
  spreadsheetId: string,
  sheetName: string,
  rows: unknown[][],
): Promise<void> {
  // Clear first
  await proxyRequest(`/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:clear`, {
    method: "POST",
    body: {},
  });
  if (rows.length === 0) return;
  // Write
  await proxyRequest(
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: { values: rows },
    },
  );
}

export async function readSheet(
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const data = await proxyRequest(
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
  ) as { values?: string[][] };
  return data.values ?? [];
}
