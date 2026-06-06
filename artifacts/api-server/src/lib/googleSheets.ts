// Google Sheets connector via googleapis (Service Account)
// Env: GOOGLE_SERVICE_ACCOUNT_JSON  — isi JSON key file dari Google Cloud Console

import { google, type sheets_v4 } from "googleapis";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON belum dikonfigurasi di Secrets.");
  let creds: {
    client_email: string;
    private_key: string;
    project_id?: string;
  };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid.");
  }
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
}

function getSheetsClient(): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function getDriveClient() {
  return google.drive({ version: "v3", auth: getAuth() });
}

function rangeStr(sheetName: string, cols = "A:Z"): string {
  return `'${sheetName}'!${cols}`;
}

export async function createSpreadsheet(
  title: string,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        { properties: { title: "CoA", index: 0 } },
        { properties: { title: "Jurnal", index: 1 } },
        { properties: { title: "Lines", index: 2 } },
        { properties: { title: "TrialBalance", index: 3 } },
        { properties: { title: "GL", index: 4 } },
      ],
    },
  });
  const spreadsheetId = res.data.spreadsheetId!;
  const spreadsheetUrl = res.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  return { spreadsheetId, spreadsheetUrl };
}

export async function getSpreadsheetMeta(
  spreadsheetId: string,
): Promise<{ title: string; sheets: string[] }> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "properties.title,sheets.properties.title",
  });
  return {
    title: res.data.properties?.title ?? "",
    sheets: (res.data.sheets ?? []).map((s) => s.properties?.title ?? ""),
  };
}

export async function ensureSheets(
  spreadsheetId: string,
  sheetNames: string[],
): Promise<void> {
  const meta = await getSpreadsheetMeta(spreadsheetId);
  const existing = new Set(meta.sheets);
  const toAdd = sheetNames.filter((n) => !existing.has(n));
  if (toAdd.length === 0) return;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: toAdd.map((title) => ({
        addSheet: { properties: { title } },
      })),
    },
  });
}

export async function clearAndWriteSheet(
  spreadsheetId: string,
  sheetName: string,
  rows: unknown[][],
): Promise<void> {
  const sheets = getSheetsClient();
  const range = rangeStr(sheetName);
  await sheets.spreadsheets.values.clear({ spreadsheetId, range });
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows as string[][] },
  });
}

export async function readSheet(
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const sheets = getSheetsClient();
  const range = rangeStr(sheetName);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values ?? []) as string[][];
}

// Ekspor ke spreadsheet baru dan kembalikan URL-nya
// Berguna untuk export sekali pakai (logistic orders, dll) tanpa setup permanen
export async function exportToNewSpreadsheet(
  title: string,
  tabs: Array<{ name: string; rows: unknown[][] }>,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: tabs.map((t, i) => ({ properties: { title: t.name, index: i } })),
    },
  });
  const spreadsheetId = res.data.spreadsheetId!;
  const spreadsheetUrl =
    res.data.spreadsheetUrl ??
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  for (const tab of tabs) {
    if (tab.rows.length === 0) continue;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: rangeStr(tab.name),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: tab.rows as string[][] },
    });
  }

  // Jadikan spreadsheet ini bisa dibaca oleh siapa saja yang punya link
  try {
    const drive = getDriveClient();
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch {
    // Jika gagal share, tetap kembalikan URL — user bisa buka via SA email
  }

  return { spreadsheetId, spreadsheetUrl };
}
