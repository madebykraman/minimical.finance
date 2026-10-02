import * as XLSX from "@e965/xlsx";

export type ImportSource = {
  name: string;
  sheet: string;
  headers: string[];
  rows: Record<string, unknown>[];
};

export type ImportMapping = {
  organization?: string;
  client?: string;
  project?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  amount?: string;
  status?: string;
  paymentDate?: string;
  paymentAmount?: string;
  description?: string;
};

const aliases: Record<keyof ImportMapping, string[]> = {
  organization: ["organisation","organization","org","company","entity","business"],
  client: ["client","client name","customer","customer name","party","buyer"],
  project: ["project","project name","job","engagement","work"],
  invoiceNumber: ["invoice","invoice no","invoice number","invoice #","number","bill no"],
  issueDate: ["issue date","invoice date","date","created","created date"],
  dueDate: ["due date","payment due","due"],
  amount: ["amount","total","invoice total","grand total","value"],
  status: ["status","invoice status","state"],
  paymentDate: ["payment date","paid date","received date"],
  paymentAmount: ["payment","paid","paid amount","received","received amount"],
  description: ["description","service","item","particular","particulars","details","narration","note"],
};

const normalize = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

function score(header: string, candidate: string) {
  const h = normalize(header);
  const c = normalize(candidate);
  if (!h) return 0;
  if (h === c) return 1;
  if (h.includes(c) || c.includes(h)) return 0.75;
  return 0;
}

export function inferImportMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  for (const key of Object.keys(aliases) as (keyof ImportMapping)[]) {
    let best: { header: string; score: number } | null = null;
    for (const header of headers) {
      for (const alias of aliases[key]) {
        const s = score(header, alias);
        if (!best || s > best.score) best = { header, score: s };
      }
    }
    if (best && best.score >= 0.75) mapping[key] = best.header;
  }
  return mapping;
}

export async function parseSpreadsheet(file: File): Promise<ImportSource[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return workbook.SheetNames.map((sheet) => {
    const ws = workbook.Sheets[sheet];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const headers = rows.length
      ? Object.keys(rows[0])
      : (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" })[0] ?? []);
    return { name: file.name, sheet, headers: headers.map(String), rows };
  });
}

export function valueFor(row: Record<string, unknown>, key?: string) {
  return key ? row[key] ?? "" : "";
}

export function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return iso[1] + "-" + iso[2].padStart(2, "0") + "-" + iso[3].padStart(2, "0");
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return dmy[3] + "-" + dmy[2].padStart(2, "0") + "-" + dmy[1].padStart(2, "0");
  return "";
}

export function normalizeAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").replace(/[₹$€£,\s]/g, "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function fingerprint(row: Record<string, unknown>, mapping: ImportMapping): string {
  return [
    normalize(valueFor(row, mapping.organization)),
    normalize(valueFor(row, mapping.client)),
    normalize(valueFor(row, mapping.invoiceNumber)),
    normalizeDate(valueFor(row, mapping.issueDate)),
    normalizeAmount(valueFor(row, mapping.amount)) ?? "",
  ].join("|");
}
