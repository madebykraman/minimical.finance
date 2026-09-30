import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

const PAGE = { width: 595, height: 842 };
const ink = rgb(0.09, 0.09, 0.08);
const muted = rgb(0.43, 0.43, 0.40);
const faint = rgb(0.62, 0.61, 0.57);
const line = rgb(0.88, 0.87, 0.83);
const paper = rgb(0.98, 0.975, 0.955);
const green = rgb(0.09, 0.42, 0.28);
const amber = rgb(0.52, 0.36, 0.08);

const money = (value: number) => `INR ${Math.round(value).toLocaleString("en-IN")}`;

function pdfSafe(value: unknown, font: any) {
  const text = String(value ?? "").replaceAll("₹", "INR ");
  let safe = "";
  for (const char of text) {
    if (char === "\n" || char === "\r" || char === "\t") {
      safe += " ";
      continue;
    }
    try {
      font.encodeText(char);
      safe += char;
    } catch {
      safe += "?";
    }
  }
  return safe;
}

function wrap(text: string, font: any, size: number, maxWidth: number) {
  const words = pdfSafe(text, font).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
  const total = contents.reduce((sum: number, c: any) => sum + (c.priced ? Number(c.amount ?? Number(c.quantity) * Number(c.rate ?? 0)) : 0), 0);
  const paid = (invoice.payments ?? []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const balance = Math.max(total - paid, 0);
  const client = invoice.clients?.name ?? "Client";
  const project = invoice.projects?.name ?? "Project";

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let pageNumber = 1;
  let y = 786;

  const footer = () => {
    page.drawLine({ start: { x: 48, y: 42 }, end: { x: 547, y: 42 }, thickness: 0.5, color: line });
    page.drawText("minimical.finance · internal finance record", { x: 48, y: 26, size: 7, font: regular, color: faint });
    page.drawText(`${pageNumber}`, { x: 540, y: 26, size: 7, font: regular, color: faint });
  };

  const newPage = () => {
    footer();
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pageNumber += 1;
    y = 786;
  };

  const ensure = (height: number) => {
    if (y - height < 70) newPage();
  };

  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(1, 1, 1) });
  page.drawText("minimical", { x: 48, y, size: 22, font: bold, color: ink });
  page.drawText("STUDIO FINANCE", { x: 48, y: y - 17, size: 7, font: regular, color: muted });
  page.drawText(pdfSafe(`INVOICE #${invoice.invoice_number}`, bold), { x: 365, y: y + 1, size: 12, font: bold, color: ink });
  page.drawText(pdfSafe(String(invoice.status).replace("_", " ").toUpperCase(), bold), { x: 365, y: y - 14, size: 7, font: bold, color: invoice.status === "paid" ? green : muted });
  page.drawLine({ start: { x: 48, y: y - 30 }, end: { x: 547, y: y - 30 }, thickness: 1, color: ink });
  y -= 70;

  const drawLabelValue = (x: number, label: string, value: string, width = 220) => {
    page.drawText(label.toUpperCase(), { x, y, size: 7, font: bold, color: faint });
    const lines = wrap(value, bold, 11, width);
    lines.slice(0, 2).forEach((l, idx) => page.drawText(l, { x, y: y - 17 - idx * 14, size: 11, font: bold, color: ink }));
  };

  drawLabelValue(48, "Bill to", client);
  if (invoice.clients?.email) page.drawText(pdfSafe(invoice.clients.email, regular), { x: 48, y: y - 45, size: 8, font: regular, color: muted });
  if (invoice.clients?.phone) page.drawText(pdfSafe(invoice.clients.phone, regular), { x: 48, y: y - 58, size: 8, font: regular, color: muted });

  drawLabelValue(300, "Project", project, 140);
  page.drawText("ISSUED", { x: 300, y: y - 45, size: 7, font: bold, color: faint });
  page.drawText(pdfSafe(dateLabel(invoice.issue_date), regular), { x: 300, y: y - 59, size: 8.5, font: regular, color: ink });
  page.drawText("DUE", { x: 425, y: y - 45, size: 7, font: bold, color: faint });
  page.drawText(pdfSafe(dateLabel(invoice.due_date), regular), { x: 425, y: y - 59, size: 8.5, font: regular, color: ink });
  y -= 100;

  const header = () => {
    page.drawRectangle({ x: 48, y: y - 5, width: 499, height: 28, color: paper });
    page.drawText("DESCRIPTION", { x: 58, y: y + 5, size: 7, font: bold, color: muted });
    page.drawText("QTY", { x: 350, y: y + 5, size: 7, font: bold, color: muted });
    page.drawText("RATE", { x: 397, y: y + 5, size: 7, font: bold, color: muted });
    page.drawText("AMOUNT", { x: 472, y: y + 5, size: 7, font: bold, color: muted });
    y -= 30;
  };

  header();

  for (const item of contents) {
    const amount = item.priced ? Number(item.amount ?? Number(item.quantity) * Number(item.rate ?? 0)) : 0;
    const title = item.priced ? item.title : `${item.title} · TBD`;
    const titleLines = wrap(title, item.priced ? regular : bold, 8.5, 275);
    ensure(Math.max(30, titleLines.length * 12 + 18));
    if (y > 770) header();

    titleLines.slice(0, 3).forEach((l, idx) => page.drawText(l, {
      x: 58, y: y - idx * 12, size: 8.5, font: item.priced ? regular : bold, color: item.priced ? ink : amber,
    }));
    page.drawText(pdfSafe(String(item.quantity ?? 1), regular), { x: 350, y, size: 8.5, font: regular, color: ink });
    page.drawText(item.priced && item.rate != null ? money(Number(item.rate)) : "—", { x: 397, y, size: 8.5, font: regular, color: muted });
    page.drawText(item.priced ? money(amount) : "TBD", { x: 472, y, size: 8.5, font: bold, color: item.priced ? ink : amber });
    y -= Math.max(28, titleLines.length * 12 + 10);
    page.drawLine({ start: { x: 48, y: y + 7 }, end: { x: 547, y: y + 7 }, thickness: 0.35, color: line });
  }

  ensure(120);
  y -= 10;
  page.drawRectangle({ x: 326, y: y - 82, width: 221, height: 88, color: paper });
  page.drawText("TOTAL", { x: 342, y: y - 3, size: 8, font: bold, color: muted });
  page.drawText(money(total), { x: 442, y: y - 2, size: 13, font: bold, color: ink });
  page.drawText("PAID", { x: 342, y: y - 27, size: 8, font: regular, color: muted });
  page.drawText(money(paid), { x: 442, y: y - 26, size: 9, font: regular, color: ink });
  page.drawText("BALANCE", { x: 342, y: y - 51, size: 8, font: bold, color: muted });
  page.drawText(money(balance), { x: 442, y: y - 50, size: 10, font: bold, color: balance ? amber : green });
  y -= 108;

  const notes: string[] = [];
  if (invoice.notes) notes.push(invoice.notes);
  if (invoice.adjustment_note) notes.push(`Adjustment context: ${invoice.adjustment_note}`);
  if (invoice.source_total != null && Number(invoice.source_total) !== total) {
    notes.push(`Source total recorded as ${money(Number(invoice.source_total))}; calculated total is ${money(total)}.`);
  }

  if (notes.length) {
    ensure(70);
    page.drawText("NOTES", { x: 48, y, size: 7, font: bold, color: faint });
    y -= 16;
    for (const note of notes) {
      const lines = wrap(note, regular, 8.5, 490);
      for (const l of lines.slice(0, 8)) {
        ensure(14);
        page.drawText(l, { x: 48, y, size: 8.5, font: regular, color: muted });
        y -= 13;
      }
      y -= 4;
    }
  }

  footer();
  const bytes = await pdf.save();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice-${invoice.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
