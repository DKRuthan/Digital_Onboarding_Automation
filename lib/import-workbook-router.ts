import * as XLSX from "xlsx";

import {
  detectFlatRow2HeaderMode,
  FLAT_JOURNEY_IMPORT_SHEET_NAME,
  validateFlatRow2Headers,
} from "./import-flat-row2-schema";
import {
  extractFlatSheetHeaders,
  findSheetName,
  parseFlatRow2Workbook,
  readSheetMatrix,
} from "./import-flat-row2-parser";
import {
  parseTargetMultisheetWorkbook,
  type NormalizedImport,
} from "./import-multisheet-parser";

/**
 * Route workbooks to flat Journey Import or multi-sheet parser.
 * Flat Row 2 takes precedence when Journey Import sheet has valid flat keys.
 */
export function parseImportWorkbook(workbook: XLSX.WorkBook): NormalizedImport {
  const journeySheetName = findSheetName(
    workbook.SheetNames,
    FLAT_JOURNEY_IMPORT_SHEET_NAME,
  );

  if (journeySheetName) {
    const journeySheet = workbook.Sheets[journeySheetName];
    const matrix = readSheetMatrix(journeySheet);
    if (detectFlatRow2HeaderMode(matrix) === "flat_row2") {
      const headers = extractFlatSheetHeaders(journeySheet);
      const validation = validateFlatRow2Headers(headers);
      if (validation.valid) {
        return parseFlatRow2Workbook(workbook);
      }
    }
  }

  return parseTargetMultisheetWorkbook(workbook);
}
