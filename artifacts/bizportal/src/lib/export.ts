import * as XLSX from "xlsx";

export function exportXlsx(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const colWidths = headers.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length), 8),
  }));
  ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function printWindow(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  rightCols?: number[]
) {
  const rightSet = new Set(rightCols ?? []);
  const thHtml = headers
    .map((h, i) => `<th style="${rightSet.has(i) ? "text-align:right" : ""}">${h}</th>`)
    .join("");
  const tbodyHtml = rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (cell, i) =>
              `<td style="${rightSet.has(i) ? "text-align:right;font-family:monospace" : ""}">${cell ?? ""}</td>`
          )
          .join("")}</tr>`
    )
    .join("");

  const win = window.open("", "_blank", "width=960,height=720");
  if (!win) { alert("Pop-up diblokir browser. Izinkan pop-up untuk mencetak."); return; }
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>${title}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:12px;margin:24px}
      h1{font-size:18px;margin:0 0 2px}
      .sub{color:#666;font-size:11px;margin:0 0 14px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ccc;padding:5px 7px;font-size:11px}
      th{background:#f0f0f0;font-weight:600}
      @media print{@page{margin:15mm}button{display:none!important}}
    </style>
  </head><body>
    <h1>${title}</h1>
    <p class="sub">Dicetak: ${new Date().toLocaleString("id-ID")}</p>
    <button onclick="window.print()" style="margin-bottom:12px;padding:6px 14px;cursor:pointer">🖨 Cetak</button>
    <table><thead><tr>${thHtml}</tr></thead><tbody>${tbodyHtml}</tbody></table>
  </body></html>`);
  win.document.close();
  win.focus();
}
