import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";

const PAGE = { width: 595.2756, height: 841.8898 };
const BLACK = rgb(0, 0, 0);

// Coordinates are calibrated from the supplied 658×958 reference screenshot.
// They intentionally preserve the original whitespace, proportions and sparse composition.
const X = {
  left: 62.42,
  right: 536.60,
  divider: 419.30,
  metaRight: 520.20,
  descriptionCenter: 240.86,
  amountCenter: 477.95,
};
const Y = {
  billedLabel: 772.46,
  billedFirst: 756.65,
  payLabel: 671.40,
  payFirst: 655.58,
  invoiceLabel: 772.46,
  invoiceNumber: 756.65,
  dateLabel: 721.49,
  dateValue: 706.55,
  tableTop: 538.70,
  tableHeader: 511.46,
  tableTotal: 148.52,
  tableBottom: 125.67,
  totalBaseline: 133.65,
  footer1: 57.12,
  footer2: 42.18,
};

const FONT_SIZE = 9.8;
const LEADING = 11.8;
const LINE_WIDTH = 0.62;

function safe(value: unknown) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ");
}

function money(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}/-`;
}

function unknownMoney() {
  return "₹X,XXX/-";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return value;
  const day = d.getDate();
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix} ${d.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  })}`;
}

function draw(page: any, text: string, x: number, y: number, font: any, size = FONT_SIZE) {
  page.drawText(safe(text), { x, y, size, font, color: BLACK });
}

function drawRight(page: any, text: string, right: number, y: number, font: any, size = FONT_SIZE) {
  const value = safe(text);
  page.drawText(value, {
    x: right - font.widthOfTextAtSize(value, size),
    y,
    size,
    font,
    color: BLACK,
  });
}

function center(page: any, text: string, centerX: number, y: number, font: any, size = FONT_SIZE) {
  const value = safe(text);
  page.drawText(value, {
    x: centerX - font.widthOfTextAtSize(value, size) / 2,
    y,
    size,
    font,
    color: BLACK,
  });
}

function wrap(text: string, font: any, maxWidth: number, size = FONT_SIZE) {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawBlock(page: any, lines: string[], x: number, firstY: number, regular: any, bold: any) {
  lines.forEach((line, index) => {
    draw(page, line, x, firstY - index * LEADING, index === 0 ? bold : regular);
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new NextResponse("Unauthorized", { status: 401 });

  const [{ data: rawInvoice, error }, { data: settings }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, clients(*), projects(name), invoice_contents(*), payments(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("workspace_settings").select("*").eq("id", true).maybeSingle(),
  ]);

  if (error || !rawInvoice) return new NextResponse("Invoice not found", { status: 404 });

  const invoice: any = rawInvoice;
  const billingClient = invoice.clients ?? {};
  const contents = [...(invoice.invoice_contents ?? [])].sort(
    (a: any, b: any) => Number(a.position) - Number(b.position),
  );
  const total = contents.reduce(
    (sum: number, item: any) =>
      sum + (item.priced ? Number(item.amount ?? Number(item.quantity ?? 1) * Number(item.rate ?? 0)) : 0),
    0,
  );
  const paid = (invoice.payments ?? []).reduce(
    (sum: number, payment: any) => sum + Number(payment.amount || 0),
    0,
  );
  const hasUnpriced = contents.some((item: any) => !item.priced);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const regularBytes = await readFile(join(process.cwd(), "public", "fonts", "DejaVuSans.ttf"));
  const boldBytes = await readFile(join(process.cwd(), "public", "fonts", "DejaVuSans-Bold.ttf"));
  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const bold = await pdf.embedFont(boldBytes, { subset: true });

  const page = pdf.addPage([PAGE.width, PAGE.height]);

  // BILLING / PAY-TO BLOCK
  const addressLines = Array.isArray(billingClient.address_lines)
    ? billingClient.address_lines.map((line: unknown) => safe(line))
    : [];

  draw(page, "BILLED TO:", X.left, Y.billedLabel, regular, FONT_SIZE);
  page.drawText("BILLED TO:", { x: X.left, y: Y.billedLabel, size: FONT_SIZE, font: bold, color: BLACK });
  const billedLines = [
    billingClient.legal_name || billingClient.name || "Client",
    ...addressLines,
    billingClient.pan ? `PAN No. ${billingClient.pan}` : "",
    billingClient.gstin ? `GSTIN: ${billingClient.gstin}` : "",
  ].filter(Boolean);
  billedLines.forEach((line: string, index: number) =>
    draw(page, line, X.left, Y.billedFirst - index * LEADING, regular),
  );

  page.drawText("PAY TO:", { x: X.left, y: Y.payLabel, size: FONT_SIZE, font: bold, color: BLACK });
  const payLines = [
    `NAME: ${settings?.payee_name || "Kumar Aman"}`,
    `A/C NO. ${settings?.account_number || ""}`,
    `BANK: ${settings?.bank_name || ""}`,
    `BRANCH: ${settings?.branch_name || ""}`,
    `BRANCH CODE: ${settings?.branch_code || ""}`,
    `IFSC CODE: ${settings?.ifsc_code || ""}`,
    `PAN NO. ${settings?.pan_number || ""}`,
  ];
  payLines.forEach((line: string, index: number) =>
    draw(page, line, X.left, Y.payFirst - index * LEADING, regular),
  );

  // RIGHT META BLOCK
  page.drawText("INVOICE NO:", { x: X.invoiceLabel, y: Y.invoiceLabel, size: FONT_SIZE, font: bold, color: BLACK });
  drawRight(page, String(invoice.invoice_number ?? ""), X.metaRight, Y.invoiceNumber, regular);
  page.drawText("DATE:", { x: X.dateLabel, y: Y.dateLabel, size: FONT_SIZE, font: bold, color: BLACK });
  drawRight(page, formatDate(invoice.issue_date), X.metaRight, Y.dateValue, regular);

  // CANONICAL LEGACY TABLE — no card, no fill, no modern invoice treatment.
  const line = { thickness: LINE_WIDTH, color: BLACK };
  page.drawRectangle({
    x: X.left,
    y: Y.tableBottom,
    width: X.right - X.left,
    height: Y.tableTop - Y.tableBottom,
    borderWidth: LINE_WIDTH,
    borderColor: BLACK,
  });
  page.drawLine({ start: { x: X.divider, y: Y.tableBottom }, end: { x: X.divider, y: Y.tableTop }, ...line });
  page.drawLine({ start: { x: X.left, y: Y.tableHeader }, end: { x: X.right, y: Y.tableHeader }, ...line });
  page.drawLine({ start: { x: X.left, y: Y.tableTotal }, end: { x: X.right, y: Y.tableTotal }, ...line });

  center(page, "DESCRIPTION", X.descriptionCenter, Y.tableTop - 17.0, bold);
  center(page, "AMOUNT", X.amountCenter, Y.tableTop - 17.0, bold);

  // The original template deliberately leaves a large empty body.
  // Four line-item slots are placed at the same vertical rhythm as the reference.
  const slots = [Y.tableTop - 53, Y.tableTop - 96, Y.tableTop - 139, Y.tableTop - 182];

  contents.slice(0, 4).forEach((item: any, index: number) => {
    const title = String(item.title ?? "");
    const amount = item.priced
      ? money(Number(item.amount ?? Number(item.quantity ?? 1) * Number(item.rate ?? 0)))
      : unknownMoney();

    const lines = wrap(title, regular, 245, FONT_SIZE).slice(0, 3);
    const slot = slots[index] ?? slots[slots.length - 1] - (index - 3) * 43;
    const first = slot + ((lines.length - 1) * LEADING) / 2;

    lines.forEach((text, lineIndex) =>
      center(page, text, X.descriptionCenter, first - lineIndex * LEADING, regular),
    );
    center(page, amount, X.amountCenter, slot, regular);
  });

  center(page, "TOTAL", X.descriptionCenter, Y.totalBaseline, bold);
  center(page, hasUnpriced ? unknownMoney() : money(total), X.amountCenter, Y.totalBaseline, bold);

  draw(
    page,
    settings?.invoice_footer_line_1 || "Please contact framedbyaman@gmail.com in case of any queries.",
    X.left,
    Y.footer1,
    regular,
    9.4,
  );
  draw(
    page,
    settings?.invoice_footer_line_2 || "Thank you for your time.",
    X.left,
    Y.footer2,
    regular,
    9.4,
  );

  const bytes = await pdf.save();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="INV_${invoice.invoice_number}-Kumar Aman-Video Editing.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
