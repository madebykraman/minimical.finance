import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Line = {
  title: string;
  description?: string | null;
  quantity: number;
  rate?: number | null;
  amount?: number | null;
  priced: boolean;
  kind: string;
};

const esc = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");

const money = (value: number) => `INR ${Math.round(value).toLocaleString("en-IN")}`;

function pdfDocument(lines: string[]) {
  const objects: string[] = [];
  const add = (body: string) => { objects.push(body); return objects.length; };
  const content = lines.join("\n");
  const contentId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageId = add(`<< /Type /Page /Parent 4 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`);
  const pagesId = add(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Fix the page's parent now that the Pages object exists.
  objects[pageId - 1] = objects[pageId - 1].replace("/Parent 4 0 R", `/Parent ${pagesId} 0 R`);

  let pdf = "%PDF-1.4\n% minimical.finance\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function text(x: number, y: number, value: string, font = "F1", size = 9) {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(value)}) Tj ET`;
}

function line(x1: number, y1: number, x2: number, y2: number, width = 0.7) {
  return `q ${width} w ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function rect(x: number, y: number, w: number, h: number, gray = 0.96) {
  return `q ${gray} ${gray} ${gray} rg ${x} ${y} ${w} ${h} re f Q`;
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

  const contents = [...(invoice.invoice_contents ?? [])].sort((a, b) => a.position - b.position) as Line[];
  const total = contents.reduce((sum, c) => sum + (c.priced ? Number(c.amount ?? (c.quantity * (c.rate ?? 0))) : 0), 0);
  const paid = (invoice.payments ?? []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const balance = Math.max(total - paid, 0);
  const client = invoice.clients?.name ?? "Client";
  const project = invoice.projects?.name ?? "Project";

  const cmds: string[] = [];
  cmds.push("q 0.11 0.11 0.10 rg");
  cmds.push(text(48, 792, "minimical", "F2", 20));
  cmds.push(text(48, 773, "STUDIO FINANCE", "F1", 7));
  cmds.push(text(410, 792, `INVOICE #${invoice.invoice_number}`, "F2", 12));
  cmds.push(text(410, 777, String(invoice.status).replace("_", " ").toUpperCase(), "F1", 7));
  cmds.push("Q");
  cmds.push(line(48, 755, 547, 755, 1.1));

  cmds.push(text(48, 726, "BILL TO", "F2", 7));
  cmds.push(text(48, 708, client, "F2", 12));
  if (invoice.clients?.email) cmds.push(text(48, 692, invoice.clients.email, "F1", 8));
  if (invoice.clients?.phone) cmds.push(text(48, 678, invoice.clients.phone, "F1", 8));

  cmds.push(text(300, 726, "PROJECT", "F2", 7));
  cmds.push(text(300, 708, project, "F1", 10));
  cmds.push(text(440, 726, "ISSUED", "F2", 7));
  cmds.push(text(440, 708, invoice.issue_date, "F1", 9));
  cmds.push(text(440, 692, "DUE", "F2", 7));
  cmds.push(text(440, 674, invoice.due_date ?? "—", "F1", 9));

  cmds.push(rect(48, 624, 499, 28, 0.94));
  cmds.push(text(58, 634, "DESCRIPTION", "F2", 7));
  cmds.push(text(335, 634, "QTY", "F2", 7));
  cmds.push(text(382, 634, "RATE", "F2", 7));
  cmds.push(text(470, 634, "AMOUNT", "F2", 7));

  let y = 608;
  for (const item of contents) {
    const amount = item.priced ? Number(item.amount ?? item.quantity * (item.rate ?? 0)) : 0;
    const label = item.priced ? item.title : `${item.title} — TBD`;
    cmds.push(text(58, y, label.slice(0, 58), item.priced ? "F1" : "F2", 8.5));
    cmds.push(text(335, y, String(item.quantity ?? 1), "F1", 8.5));
    cmds.push(text(382, y, item.priced && item.rate != null ? money(Number(item.rate)) : "—", "F1", 8.5));
    cmds.push(text(470, y, item.priced ? money(amount) : "TBD", "F2", 8.5));
    y -= 27;
    cmds.push(line(48, y + 12, 547, y + 12, 0.35));
    if (y < 180) break;
  }

  y -= 6;
  cmds.push(rect(330, y - 8, 217, 82, 0.96));
  cmds.push(text(345, y + 48, "TOTAL", "F2", 8));
  cmds.push(text(430, y + 47, money(total), "F2", 13));
  cmds.push(text(345, y + 24, "PAID", "F1", 8));
  cmds.push(text(430, y + 23, money(paid), "F1", 9));
  cmds.push(text(345, y + 2, "BALANCE", "F2", 8));
  cmds.push(text(430, y + 1, money(balance), "F2", 10));

  if (invoice.notes) {
    cmds.push(text(48, y - 48, "NOTES", "F2", 7));
    cmds.push(text(48, y - 64, invoice.notes.slice(0, 100), "F1", 8));
  }
  cmds.push(text(48, 45, "Generated by minimical.finance · Internal finance record", "F1", 7));
  cmds.push(text(475, 45, `1 / 1`, "F1", 7));

  const bytes = pdfDocument(cmds);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice-${invoice.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
