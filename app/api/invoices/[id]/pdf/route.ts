import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createClient } from "@/lib/supabase/server";

const require = createRequire(import.meta.url);

const PAGE = { width: 595.2756, height: 841.8898 };
const BLACK = rgb(0, 0, 0);
const LIGHT_GREY = rgb(0.960784, 0.960784, 0.960784);
const TABLE = { x: 57.6378, width: 480, divider: 417.6378, top: 541.8898, bottom: 113.3 };
const FONT_SIZE = 10;
const LEADING = 12;

function pdfSafe(value: unknown) {
  return String(value ?? "")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .replaceAll("\t", " ");
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
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix} ${d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`;
}

function centerText(page: any, text: string, font: any, size: number, centerX: number, y: number) {
  const safe = pdfSafe(text);
  const width = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: centerX - width / 2, y, size, font, color: BLACK });
}

function drawLines(page: any, lines: string[], x: number, firstBaseline: number) {
  lines.forEach((line, index) => {
    page.drawText(pdfSafe(line), { x, y: firstBaseline - index * LEADING, size: FONT_SIZE, font: page.__font, color: BLACK });
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

  const { data: rawInvoice, error } = await supabase
    .from("invoices")
    .select("*, clients(name,email,phone), projects(name), invoice_contents(*), payments(*)")
    .eq("id", id)
    .maybeSingle();

  if (error || !rawInvoice) return new NextResponse("Invoice not found", { status: 404 });

  const invoice: any = rawInvoice;
  const contents = [...(invoice.invoice_contents ?? [])].sort((a: any, b: any) => a.position - b.position);
  const pricedContents = contents.filter((item: any) => item.priced);
  const total = pricedContents.reduce((sum: number, item: any) => sum + Number(item.amount ?? Number(item.quantity ?? 1) * Number(item.rate ?? 0)), 0);
  const paid = (invoice.payments ?? []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
  const hasUnpriced = contents.some((item: any) => !item.priced);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  let fontBytes: Uint8Array;
  try {
    fontBytes = await readFile(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"));
  } catch {
    return new NextResponse("Invoice font unavailable", { status: 500 });
  }
  const font = await pdf.embedFont(fontBytes, { subset: true });

  const page = pdf.addPage([PAGE.width, PAGE.height]);
  (page as any).__font = font;

  // Canonical Elle/Ogaan billing profile used by the supplied invoice reference.
  // Other clients fall back to their stored client name while retaining the same geometry.
  const isElle = /elle|ogaan/i.test(String(invoice.clients?.name ?? ""));
  const billedTo = isElle
    ? [
        "BILLED TO:",
        "Ogaan Media Pvt. Ltd.",
        "Floor 11, A-1102, Naman Midtown",
        "Senapati Bapat Marg, Nr India Bulls",
        "Prabhadevi, Mumbai City",
        "PAN No. AAACO1078K",
        "GSTIN: 27AAACO1078K1ZB",
      ]
    : [
        "BILLED TO:",
        String(invoice.clients?.name ?? "Client"),
        invoice.clients?.phone ?? "",
        invoice.clients?.email ?? "",
      ].filter(Boolean);

  const payTo = [
    "PAY TO:",
    "NAME: Kumar Aman",
    "A/C NO. 55550101570800",
    "BANK: FEDERAL BANK",
    "BRANCH: Patna/Kankarbagh",
    "BRANCH CODE: 2189",
    "IFSC CODE: FDRL0002189",
    "PAN NO. CIBPA9801L",
  ];

  drawLines(page, billedTo, 53.6378, 750.8898);
  drawLines(page, payTo, 53.6378, 654.8898);

  drawLines(page, ["INVOICE NO:", String(invoice.invoice_number ?? "")], 413.6378, 618.8898);
  drawLines(page, ["DATE:", formatDate(invoice.issue_date)], 413.6378, 582.8898);

  // Fixed-height table matching the supplied 186 reference.
  page.drawRectangle({
    x: TABLE.x,
    y: TABLE.top - 23,
    width: TABLE.width,
    height: 23,
    color: LIGHT_GREY,
    borderWidth: 0,
  });

  const top = TABLE.top;
  const bottom = TABLE.bottom;
  const headerBottom = top - 23;
  const totalTop = bottom + 23;

  // Outer frame + header/total rules + description/amount divider.
  const lineWidth = 0.8;
  const lineOpts = { thickness: lineWidth, color: BLACK };
  page.drawLine({ start: { x: TABLE.x, y: top }, end: { x: TABLE.x + TABLE.width, y: top }, ...lineOpts });
  page.drawLine({ start: { x: TABLE.x, y: bottom }, end: { x: TABLE.x + TABLE.width, y: bottom }, ...lineOpts });
  page.drawLine({ start: { x: TABLE.x, y: bottom }, end: { x: TABLE.x, y: top }, ...lineOpts });
  page.drawLine({ start: { x: TABLE.x + TABLE.width, y: bottom }, end: { x: TABLE.x + TABLE.width, y: top }, ...lineOpts });
  page.drawLine({ start: { x: TABLE.x, y: headerBottom }, end: { x: TABLE.x + TABLE.width, y: headerBottom }, ...lineOpts });
  page.drawLine({ start: { x: TABLE.x, y: totalTop }, end: { x: TABLE.x + TABLE.width, y: totalTop }, ...lineOpts });
  page.drawLine({ start: { x: TABLE.divider, y: bottom }, end: { x: TABLE.divider, y: top }, ...lineOpts });

  centerText(page, "DESCRIPTION", font, FONT_SIZE, TABLE.x + 180, top - 16);
  centerText(page, "AMOUNT", font, FONT_SIZE, TABLE.divider + (TABLE.width - (TABLE.divider - TABLE.x)) / 2, top - 16);

  // The supplied reference vertically spaces four 186 line items near the top
  // of a deliberately tall table, leaving the remaining body blank.
  const descriptionCenter = (TABLE.x + TABLE.divider) / 2;
  const amountCenter = TABLE.divider + (TABLE.width - (TABLE.divider - TABLE.x)) / 2;
  const itemBaselines = [top - 48, top - 88, top - 128, top - 168];

  contents.slice(0, 4).forEach((item: any, index: number) => {
    const title = String(item.title ?? "");
    const amount = item.priced
      ? money(Number(item.amount ?? Number(item.quantity ?? 1) * Number(item.rate ?? 0)))
      : unknownMoney();

    const words = pdfSafe(title).split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, FONT_SIZE) <= 270) current = candidate;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);

    const baseline = itemBaselines[index] ?? itemBaselines[itemBaselines.length - 1] - (index - 3) * 40;
    lines.slice(0, 3).forEach((line, lineIndex) => {
      centerText(page, line, font, FONT_SIZE, descriptionCenter, baseline - lineIndex * LEADING);
    });
    centerText(page, amount, font, FONT_SIZE, amountCenter, baseline);
  });

  const totalLabelY = bottom + 7;
  centerText(page, "TOTAL", font, FONT_SIZE, descriptionCenter, totalLabelY);
  centerText(page, hasUnpriced ? unknownMoney() : money(total), font, FONT_SIZE, amountCenter, totalLabelY);

  // The supplied reference uses a two-line footer close to the page bottom.
  page.drawText("Please contact framedbyaman@gmail.com in case of any queries.", {
    x: 78, y: 25, size: FONT_SIZE, font, color: BLACK,
  });
  page.drawText("Thank you for your time.", {
    x: 78, y: 9, size: FONT_SIZE, font, color: BLACK,
  });

  const bytes = await pdf.save();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="INV_${invoice.invoice_number}-Kumar Aman-Video Editing.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
