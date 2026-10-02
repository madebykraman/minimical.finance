import * as XLSX from "@e965/xlsx";

export type ImportSource = {
  name: string;
  sheet: string;
  headers: string[];
  rows: Record<string, unknown>[];
  headerRow: number;
  headerDetected: boolean;
  confidence: number;
  skippedRows: number;
};

export type ImportMapping = {
  organization?: string;
  client?: string;
  assignedBy?: string;
  lineItem?: string;
  project?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  amount?: string;
  invoiceTotal?: string;
  status?: string;
  paymentDate?: string;
  paymentAmount?: string;
  description?: string;
  notes?: string;
};

export type ImportFieldAnalysis = {
  field: keyof ImportMapping;
  label: string;
  header?: string;
  confidence: number;
  reason: string;
};

export type ImportAnalysis = {
  mapping: ImportMapping;
  fields: ImportFieldAnalysis[];
  headerRow: number;
  confidence: number;
  sourceShape: "tabular" | "headerless";
};

const aliases: Record<keyof ImportMapping, string[]> = {
  organization: ["organisation","organization","org","company","entity","business","billing entity","billing organisation","billing organization"],
  assignedBy: ["assigned by","assigned","owner","producer","coordinator"],
  client: ["client","client name","customer","customer name","party","buyer","billed to","bill to"],
  lineItem: ["name / project","name/project","line item","service","item","deliverable"],
  project: ["project","project name","job","engagement","work","campaign"],
  invoiceNumber: ["invoice","invoice no","invoice number","invoice #","invoice id","bill no","bill number","document number"],
  issueDate: ["issue date","invoice date","issued","created","created date","date raised","bill date"],
  dueDate: ["due date","payment due","due","due on"],
  amount: ["amount","line amount","item amount","value","line value"],
  invoiceTotal: ["total","invoice total","grand total","gross total","net total","bill total","invoice value"],
  status: ["status","invoice status","state","payment status"],
  paymentDate: ["payment date","paid date","received date","date paid","settled date"],
  paymentAmount: ["payment amount","paid amount","received amount","amount paid","amount received","payment received"],
  description: ["description","particular","particulars","details","narration"],
  notes: ["notes","note","comments","remark","remarks","memo","audit note"],
};

const labels: Record<keyof ImportMapping,string> = {
  organization:"Organisation",client:"Client",assignedBy:"Assigned by",project:"Project",invoiceNumber:"Invoice number",
  issueDate:"Issue date",dueDate:"Due date",amount:"Amount",status:"Status",
  paymentDate:"Payment date",paymentAmount:"Payment amount",description:"Description",notes:"Notes",
};

const normalize = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\\s+/g, " ");

function score(header: string, candidate: string) {
  const h = normalize(header);
  const c = normalize(candidate);
  if (!h || !c) return 0;
  if (h === c) return 1;
  if (h.replace(/\\b(name|date|no|number)\\b/g, "").trim() === c.replace(/\\b(name|date|no|number)\\b/g, "").trim()) return 0.92;
  if (h.includes(c) || c.includes(h)) return 0.78;
  return 0;
}

function nonEmpty(row: unknown[]) {
  return row.filter(v => String(v ?? "").trim() !== "");
}

function looksLikeDate(value: unknown) {
  return Boolean(normalizeDate(value));
}

function looksLikeAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return true;
  const raw = String(value ?? "").trim();
  return Boolean(raw && /(?:₹|rs\\.?|inr|\\$|€|£|,)/i.test(raw) && normalizeAmount(raw) != null);
}

function rowHeaderScore(row: unknown[]) {
  const values = nonEmpty(row).map(v => String(v).trim());
  if (values.length < 2) return 0;
  const unique = new Set(values.map(normalize)).size;
  const aliasHits = values.reduce((sum, value) => {
    return sum + (Object.values(aliases).some(list => list.some(alias => score(value, alias) >= 0.78)) ? 1 : 0);
  }, 0);
  const dataPenalty = values.filter(v => looksLikeDate(v) || looksLikeAmount(v)).length;
  const shortLabelBonus = values.filter(v => v.length <= 34 && !/[.!?]{2,}/.test(v)).length / values.length;
  return aliasHits * 5 + unique * 0.7 + shortLabelBonus * 2 - dataPenalty * 2;
}

function dedupeHeaders(values: string[]) {
  const counts = new Map<string,number>();
  return values.map((value,index) => {
    const base = value.trim() || `Column ${String.fromCharCode(65 + (index % 26))}`;
    const count = (counts.get(base) || 0) + 1;
    counts.set(base,count);
    return count === 1 ? base : `${base} ${count}`;
  });
}

function matrixToRows(matrix: unknown[][], headers: string[], headerIndex: number) {
  const rows: Record<string,unknown>[] = [];
  let skipped = 0;
  for (const values of matrix.slice(headerIndex + 1)) {
    if (!nonEmpty(values).length) continue;
    const row = Object.fromEntries(headers.map((header,index) => [header, values[index] ?? ""]));
    const normalized = Object.values(row).map(normalize);
    const repeatedHeader = normalized.length > 1 && normalized.filter((v,i) => normalize(headers[i]) === v).length >= Math.max(2, Math.ceil(headers.length * .6));
    if (repeatedHeader) { skipped++; continue; }
    rows.push(row);
  }
  return { rows, skipped };
}

export function detectHeaderRow(matrix: unknown[][]) {
  const limit = Math.min(matrix.length, 25);
  let bestIndex = -1;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const scoreValue = rowHeaderScore(matrix[i] || []);
    if (scoreValue > bestScore) { bestScore = scoreValue; bestIndex = i; }
  }
  return { index: bestIndex, confidence: bestIndex >= 0 ? Math.min(0.99, bestScore / 18) : 0 };
}

export function inferImportMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const used = new Set<string>();
  const ranked = (Object.keys(aliases) as (keyof ImportMapping)[])
    .flatMap(field => headers.map(header => ({ field, header, score: Math.max(...aliases[field].map(alias => score(header, alias))) })))
    .sort((a,b) => b.score - a.score);

  for (const candidate of ranked) {
    if (candidate.score < 0.78 || used.has(candidate.header) || mapping[candidate.field]) continue;
    mapping[candidate.field] = candidate.header;
    used.add(candidate.header);
  }
  return mapping;
}

function valueSignal(field:keyof ImportMapping, values:unknown[]){
  const nonEmpty=values.filter(v=>cleanValue(v));
  if(!nonEmpty.length)return 0;
  if(field==="issueDate"||field==="dueDate"||field==="paymentDate")return nonEmpty.filter(looksLikeDate).length/nonEmpty.length;
  if(field==="amount"||field==="invoiceTotal"||field==="paymentAmount")return nonEmpty.filter(looksLikeAmount).length/nonEmpty.length;
  if(field==="invoiceNumber")return nonEmpty.filter(v=>/^(?:inv(?:oice)?|bill|doc(?:ument)?)?[-\\s#_]*[a-z0-9/]+$/i.test(String(v).trim())).length/nonEmpty.length;
  if(field==="status"){const allowed=new Set(["draft","sent","partially paid","paid","void","cancelled","canceled","overdue"]);return nonEmpty.filter(v=>allowed.has(normalize(v))).length/nonEmpty.length;}
  if(field==="description")return Math.min(1,nonEmpty.reduce((s,v)=>s+String(v).length,0)/(nonEmpty.length*28));
  return 0;
}
const cleanValue=(v:unknown)=>String(v??"").trim();

export function analyzeImportSource(source: ImportSource): ImportAnalysis {
  const mapping = inferImportMapping(source.headers);
  const used = new Set(Object.values(mapping).filter(Boolean));
  const fields = (Object.keys(labels) as (keyof ImportMapping)[]).map(field => {
    const header = mapping[field];
    if (header) return { field, label: labels[field], header, confidence: source.headerDetected ? 0.92 : 0.64, reason: "Matched source heading" };
    let best:{header:string;score:number}|null=null;
    for(const candidate of source.headers){
      if(used.has(candidate))continue;
      const values=source.rows.map(row=>valueFor(row,candidate));
      const scoreValue=valueSignal(field,values);
      if(!best||scoreValue>best.score)best={header:candidate,score:scoreValue};
    }
    if(best&&best.score>=0.72){
      mapping[field]=best.header;used.add(best.header);
      return {field,label:labels[field],header:best.header,confidence:Math.round(best.score*100)/100,reason:"Inferred from column values"};
    }
    return {field,label:labels[field],confidence:0,reason:"Needs review"};
  });
  const confidence=Math.round((fields.filter(f=>f.confidence>=.78).length/fields.length)*100);
  return {mapping,fields,headerRow:source.headerRow,confidence,sourceShape:source.headerDetected?"tabular":"headerless"};
}

export async function parseSpreadsheet(file: File): Promise<ImportSource[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return workbook.SheetNames.map((sheet) => {
    const ws = workbook.Sheets[sheet];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
    const detection = detectHeaderRow(matrix);
    const headerDetected = detection.index >= 0 && rowHeaderScore(matrix[detection.index] || []) >= 4;
    const headerRow = headerDetected ? detection.index : 0;
    const rawHeaders = headerDetected ? (matrix[headerRow] || []) : (matrix[0] || []);
    const headers = dedupeHeaders(rawHeaders.map(String));
    const parsed = matrixToRows(matrix, headers, headerRow);
    return {
      name: file.name,
      sheet,
      headers,
      rows: parsed.rows,
      headerRow,
      headerDetected,
      confidence: detection.confidence,
      skippedRows: parsed.skipped,
    };
  });
}

export function valueFor(row: Record<string, unknown>, key?: string) {
  return key ? row[key] ?? "" : "";
}

export function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})$/);
  if (iso) return iso[1] + "-" + iso[2].padStart(2, "0") + "-" + iso[3].padStart(2, "0");
  const dmy = raw.match(/^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})$/);
  if (dmy) return dmy[3] + "-" + dmy[2].padStart(2, "0") + "-" + dmy[1].padStart(2, "0");
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && /[a-z]/i.test(raw)) return parsed.toISOString().slice(0,10);
  return "";
}

export function normalizeAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "").replace(/[₹$€£,\s]/g, "").trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw);
  const n = Number(raw.replace(/[()]/g,""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function normalizeInvoiceNumber(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || /^(?:n\/?a|na|none|-)$/i.test(raw)) return "";
  const prefixed = raw.match(/^(?:inv(?:oice)?|bill|document)\\.?\\s*#?\\s*(.+)$/i);
  return (prefixed?.[1] ?? raw).trim();
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
