import { google } from "googleapis";
import { config } from "./config.js";
import type { PilotTrackerSubmission } from "./schemas.js";
import { buildPilotTrackerRows, PILOT_TRACKER_HEADERS } from "./tracker-domain.js";

const INPUT_BLOCKS = [
  { startColumn: 0, endColumn: 15 },
  { startColumn: 16, endColumn: 20 },
  { startColumn: 21, endColumn: 23 },
  { startColumn: 24, endColumn: 25 },
  { startColumn: 29, endColumn: 30 },
  { startColumn: 34, endColumn: 35 },
  { startColumn: 37, endColumn: 39 },
  { startColumn: 40, endColumn: 42 },
  { startColumn: 45, endColumn: 46 },
  { startColumn: 47, endColumn: 52 }
] as const;

function cellData(value: string | number): Record<string, unknown> {
  return typeof value === "number"
    ? { userEnteredValue: { numberValue: value } }
    : { userEnteredValue: { stringValue: value } };
}

function quotedSheetName(): string {
  return `'${config.pilotTrackerSheetName.replace(/'/g, "''")}'`;
}

function sameHeaders(actual: unknown[]): boolean {
  return actual.length === PILOT_TRACKER_HEADERS.length &&
    actual.every((value, index) => String(value ?? "") === PILOT_TRACKER_HEADERS[index]);
}

export async function syncPilotTrackerRows(options: {
  input: PilotTrackerSubmission;
  qCode: string;
  startRow: number;
  offeredOn: Date;
}): Promise<void> {
  if (!config.pilotTrackerEnabled || !config.pilotTrackerSheetId) {
    throw new Error("Pilot Tracker synchronization is disabled.");
  }

  const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });
  const workbook = await sheets.spreadsheets.get({
    spreadsheetId: config.pilotTrackerSheetId,
    fields: "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))"
  });
  const target = workbook.data.sheets?.find(sheet => sheet.properties?.title === config.pilotTrackerSheetName);
  const sheetId = target?.properties?.sheetId;
  const rowCount = target?.properties?.gridProperties?.rowCount ?? 0;
  if (typeof sheetId !== "number") {
    throw new Error(`Pilot Tracker tab "${config.pilotTrackerSheetName}" was not found.`);
  }

  const header = await sheets.spreadsheets.values.get({
    spreadsheetId: config.pilotTrackerSheetId,
    range: `${quotedSheetName()}!A1:AZ1`
  });
  if (!sameHeaders(header.data.values?.[0] ?? [])) {
    throw new Error("Pilot Tracker headers changed. Synchronization stopped before writing.");
  }

  const rows = buildPilotTrackerRows(options.input, options.qCode, options.offeredOn);
  const endRow = options.startRow + rows.length - 1;
  const requests: Array<Record<string, unknown>> = [];
  if (endRow > rowCount) {
    requests.push({
      appendDimension: {
        sheetId,
        dimension: "ROWS",
        length: endRow - rowCount
      }
    });
  }
  requests.push({
    copyPaste: {
      source: {
        sheetId,
        startRowIndex: config.pilotTrackerTemplateRow - 1,
        endRowIndex: config.pilotTrackerTemplateRow,
        startColumnIndex: 0,
        endColumnIndex: PILOT_TRACKER_HEADERS.length
      },
      destination: {
        sheetId,
        startRowIndex: options.startRow - 1,
        endRowIndex: endRow,
        startColumnIndex: 0,
        endColumnIndex: PILOT_TRACKER_HEADERS.length
      },
      pasteType: "PASTE_NORMAL",
      pasteOrientation: "NORMAL"
    }
  });
  for (const block of INPUT_BLOCKS) {
    requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: options.startRow - 1,
          endRowIndex: endRow,
          startColumnIndex: block.startColumn,
          endColumnIndex: block.endColumn
        },
        rows: rows.map(row => ({
          values: row.slice(block.startColumn, block.endColumn).map(cellData)
        })),
        fields: "userEnteredValue"
      }
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.pilotTrackerSheetId,
    requestBody: { requests }
  });

  const verification = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: config.pilotTrackerSheetId,
    ranges: [
      `${quotedSheetName()}!G${options.startRow}:G${endRow}`,
      `${quotedSheetName()}!P${options.startRow}:P${endRow}`,
      `${quotedSheetName()}!U${options.startRow}:U${endRow}`,
      `${quotedSheetName()}!AU${options.startRow}:AU${endRow}`
    ],
    valueRenderOption: "FORMULA"
  });
  const ranges = verification.data.valueRanges ?? [];
  const qCodes = ranges[0]?.values ?? [];
  if (qCodes.length !== rows.length || qCodes.some(row => row?.[0] !== options.qCode)) {
    throw new Error("Pilot Tracker Q-Code verification failed after writing.");
  }
  for (const formulaRange of ranges.slice(1)) {
    const formulas = formulaRange.values ?? [];
    if (formulas.length !== rows.length || formulas.some(row => !String(row?.[0] ?? "").startsWith("="))) {
      throw new Error("Pilot Tracker formula verification failed after writing.");
    }
  }
}
