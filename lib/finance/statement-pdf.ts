import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const A4: [number, number] = [595.2756, 841.8898];
const BLACK = rgb(0, 0, 0);
const MUTED = rgb(0.42, 0.42, 0.4);
const LINE = rgb(0.86, 0.85, 0.82);

export type StatementLedgerRow = {
  transaction_date: string;
  transaction_type: string;
  reference: string;
  debit: number;
  credit: number;
  running_balance: number;
};

export type StatementPdfContext = {
  organization: Record<string, unknown>;
  client: Record<string, unknown>;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  rows: StatementLedgerRow[];
  openingBalance: number;
};

const safe = (value: unknown) => String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
const money = (value: number) => `₹${Math.round(value || 0).toLocaleString("en-IN")}`;
const formatDate = (value: string) =>
  new Date(value + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

function hexRgb(hex: string | null | undefined) {
  const normalized = String(hex || "#171716").replace("#", "");
  const value = Number.parseInt(normalized.length === 6 ? normalized : "171716", 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

async function embedLogo(pdf: PDFDocument, url: string | null | undefined) {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const type = (response.headers.get("content-type") || "").toLowerCase();
    return type.includes("png") || url.toLowerCase().includes(".png")
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export async function renderStatementPdf(context: StatementPdfContext) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(
    await readFile(join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")),
    { subset: true },
  );
  const bold = await pdf.embedFont(
    await readFile(join(process.cwd(), "public", "fonts", "Geist-SemiBold.ttf")),
    { subset: true },
  );
  const mono = await pdf.embedFont(
    await readFile(join(process.cwd(), "public", "fonts", "GeistMono-Regular.ttf")),
    { subset: true },
  );

  const width = A4[0];
  const height = A4[1];
  const pages: { page: ReturnType<typeof pdf.addPage>; y: number; running: number }[] = [];
  const addPage = (showHeader = false) => {
    const page = pdf.addPage(A4);
    const pageState = { page, y: showHeader ? height - 66 : height - 205, running: context.openingBalance };
    pages.push(pageState);
    return pageState;
  };

  const org = context.organization;
  const client = context.client;
  const accent = hexRgb(String(org.accent_hex || "#171716"));
  const orgLogo = await embedLogo(pdf, String(org.logo_path || "") || null);
  const clientLogo = await embedLogo(pdf, String(client.logo_path || "") || null);

  const first = addPage();

  const drawText = (
    page: ReturnType<typeof pdf.addPage>,
    value: string,
    x: number,
    y: number,
    size = 8,
    font = regular,
    color = BLACK,
  ) => page.drawText(safe(value), { x, y, size, font, color });

  const drawRight = (
    page: ReturnType<typeof pdf.addPage>,
    value: string,
    right: number,
    y: number,
    size = 8,
    font = regular,
    color = BLACK,
  ) => {
    const rendered = safe(value);
    page.drawText(rendered, {
      x: right - font.widthOfTextAtSize(rendered, size),
      y,
      size,
      font,
      color,
    });
  };

  if (orgLogo) {
    const dims = orgLogo.scale(Math.min(44 / orgLogo.width, 24 / orgLogo.height));
    first.page.drawImage(orgLogo, { x: 48, y: height - 45 - dims.height, width: dims.width, height: dims.height });
  }
  if (clientLogo) {
    const dims = clientLogo.scale(Math.min(44 / clientLogo.width, 24 / clientLogo.height));
    first.page.drawImage(clientLogo, { x: width - 48 - dims.width, y: height - 45 - dims.height, width: dims.width, height: dims.height });
  }

  drawText(first.page, String(org.name || org.legal_name || ""), 48, height - 52, 16, bold);
  first.page.drawLine({ start: { x: 48, y: height - 62 }, end: { x: width - 48, y: height - 62 }, thickness: 0.7, color: BLACK });
  drawText(first.page, "ACCOUNT STATEMENT", 48, height - 82, 8, bold, MUTED);
  drawText(first.page, String(client.legal_name || client.name || "Client"), 48, height - 112, 11, bold);
  drawText(first.page, context.periodLabel, width - 48 - bold.widthOfTextAtSize(context.periodLabel, 8), height - 112, 8, bold);
  drawRight(first.page, formatDate(context.periodEnd), width - 48, height - 128, 8, regular, MUTED);

  const billed = context.rows.reduce((sum, row) => sum + Number(row.debit || 0), 0);
  const paid = context.rows.reduce((sum, row) => sum + Number(row.credit || 0), 0);
  const closing = context.openingBalance + billed - paid;
  const cards = [
    ["OPENING", money(context.openingBalance)],
    ["BILLED", money(billed)],
    ["PAID", money(paid)],
    ["CLOSING", money(closing)],
  ] as const;

  cards.forEach(([label, value], index) => {
    const x = 48 + index * 124;
    first.page.drawRectangle({ x, y: height - 174, width: 112, height: 40, borderWidth: 0.5, borderColor: LINE });
    drawText(first.page, label, x + 8, height - 151, 6.5, bold, MUTED);
    drawText(first.page, value, x + 8, height - 167, 10, bold);
  });

  let state = first;
  state.y = height - 208;

  const tableHeader = () => {
    state.page.drawLine({ start: { x: 48, y: state.y }, end: { x: width - 48, y: state.y }, thickness: 0.6, color: BLACK });
    state.y -= 18;
    drawText(state.page, "DATE", 48, state.y, 6.5, bold, MUTED);
    drawText(state.page, "TYPE", 125, state.y, 6.5, bold, MUTED);
    drawText(state.page, "REFERENCE", 195, state.y, 6.5, bold, MUTED);
    drawRight(state.page, "DEBIT", 415, state.y, 6.5, bold, MUTED);
    drawRight(state.page, "CREDIT", 480, state.y, 6.5, bold, MUTED);
    drawRight(state.page, "BALANCE", 547, state.y, 6.5, bold, MUTED);
    state.y -= 10;
    state.page.drawLine({ start: { x: 48, y: state.y }, end: { x: width - 48, y: state.y }, thickness: 0.4, color: LINE });
    state.y -= 16;
  };

  tableHeader();

  for (const row of context.rows) {
    if (state.y < 92) {
      state = addPage(true);
      state.y = height - 64;
      drawText(state.page, String(org.name || org.legal_name || ""), 48, state.y, 13, bold);
      state.y -= 22;
      tableHeader();
    }
    state.running += Number(row.debit || 0) - Number(row.credit || 0);
    drawText(state.page, formatDate(row.transaction_date), 48, state.y, 7.5);
    drawText(state.page, row.transaction_type === "invoice" ? "Invoice" : "Payment", 125, state.y, 7.5, bold);
    drawText(state.page, row.reference, 195, state.y, 7.5);
    drawRight(state.page, row.debit ? money(Number(row.debit)) : "—", 415, state.y, 7.5, mono);
    drawRight(state.page, row.credit ? money(Number(row.credit)) : "—", 480, state.y, 7.5, mono);
    drawRight(state.page, money(state.running), 547, state.y, 7.5, mono, accent);
    state.page.drawLine({ start: { x: 48, y: state.y - 7 }, end: { x: width - 48, y: state.y - 7 }, thickness: 0.25, color: LINE });
    state.y -= 19;
  }

  if (!context.rows.length) {
    drawText(state.page, "No transactions in this period.", 48, state.y, 8, regular, MUTED);
  }

  drawText(
    state.page,
    `Period: ${formatDate(context.periodStart)} — ${formatDate(context.periodEnd)}`,
    48,
    42,
    6.5,
    regular,
    MUTED,
  );
  drawText(
    state.page,
    "Statement of account · invoice charges are debits; recorded payments are credits.",
    260,
    42,
    6.5,
    regular,
    MUTED,
  );

  return pdf.save();
}
