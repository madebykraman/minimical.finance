"use client";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { mapInvoice, invoiceTotal, paidTotal, invoiceBalance } from "./domain";
import type { Content, Invoice, PaymentMethod, Status } from "./domain";
import { isAllOrganizationsScope } from "./types";

const supabase = createClient();

export async function listInvoices(organizationId?: string | null): Promise<{ data: Invoice[]; error: string | null }> {
  let query = supabase
    .from("invoices")
    .select("*, clients(name), projects(name), invoice_contents(*), payments(*), activity_log(*)")
    .order("issue_date", { ascending: false });

  if (organizationId && !isAllOrganizationsScope(organizationId)) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;

  return {
    data: (data ?? []).map(mapInvoice),
    error: error?.message ?? null,
  };
}

export async function logActivity(
  invoiceId: string | null,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabase
    .from("activity_log")
    .insert({ invoice_id: invoiceId, action, metadata: metadata as Database["public"]["Tables"]["activity_log"]["Insert"]["metadata"] });
  return error?.message ?? null;
}

export async function setInvoiceStatus(invoice: Invoice, next: Status) {
  const total = invoiceTotal(invoice);
  const paid = paidTotal(invoice);
  if (next === "paid" && paid < total) return "An invoice can only be marked paid after the full balance has been received.";
  if (next === "partially_paid" && (paid <= 0 || paid >= total)) return "Partially paid requires a payment recorded against a remaining balance.";
  if (next === "sent" && paid > 0) return "This invoice already has a payment. Its status must remain partially paid or paid.";
  if (next === "sent" && invoice.status === "draft") {
    const { error } = await supabase.rpc("issue_invoice", { p_invoice_id: invoice.id });
    return error?.message ?? null;
  }
  const { error } = await supabase
    .from("invoices")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", invoice.id);

  if (error) return error.message;
  return logActivity(invoice.id, "invoice_status_changed", { from: invoice.status, to: next });
}

export async function saveInvoice(next: Invoice) {
  if (!next.organizationId) return "Select a billing organisation before saving the invoice.";

  const { error } = await supabase.rpc("save_invoice", {
    p_invoice_id: next.id,
    p_client_id: next.clientId ?? undefined,
    p_project_id: next.projectId ?? undefined,
    p_notes: next.notes ?? undefined,
    p_adjustment_note: next.adjustment ?? undefined,
    p_issue_date: next.date,
    p_due_date: next.dueDate ?? undefined,
    p_status: next.status,
    p_organization_id: next.organizationId,
    p_contents: next.contents.map((c) => ({
      kind: c.kind,
      title: c.title,
      quantity: c.quantity || 1,
      rate: c.rate ?? undefined,
      amount: c.priced ? (c.amount ?? c.quantity * (c.rate ?? 0)) : undefined,
      priced: c.priced,
      note: c.note ?? undefined,
      assignedBy: c.assignedBy ?? undefined,
    })),
  });

  return error?.message ?? null;
}

// Organisation-aware invoice creation
export async function createInvoice(draft: {
  number: string;
  client: string;
  project?: string;
  date: string;
  dueDate: string;
  organizationId?: string | null;
  contents: Content[];
}) {
  if (!draft.organizationId) return { id: null, error: "Select a billing organisation before creating an invoice." };
  if (!draft.client.trim()) return { id: null, error: "Select or enter a client before creating an invoice." };

  let { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("name", draft.client.trim())
    .eq("organization_id", draft.organizationId)
    .maybeSingle();

  if (clientError) return { id: null, error: clientError.message };

  if (!client) {
    const result = await supabase
      .from("clients")
      .insert({ name: draft.client.trim(), organization_id: draft.organizationId })
      .select("id")
      .single();
    if (result.error || !result.data) return { id: null, error: result.error?.message ?? "Client could not be created." };
    client = result.data;
  }

  let projectId: string | null = null;
  if (draft.project?.trim()) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("name", draft.project.trim())
      .eq("client_id", client.id)
      .eq("organization_id", draft.organizationId)
      .maybeSingle();

    if (projectError) return { id: null, error: projectError.message };

    if (project) {
      projectId = project.id;
    } else {
      const result = await supabase
        .from("projects")
        .insert({
          name: draft.project.trim(),
          client_id: client.id,
          organization_id: draft.organizationId,
        })
        .select("id")
        .single();
      if (result.error || !result.data) return { id: null, error: result.error?.message ?? "Project could not be created." };
      projectId = result.data.id;
    }
  }

  // Normal invoice creation must use the database allocator so numbering remains
  // authoritative and race-safe. Imported/historical invoice numbers are handled
  // by the import path and are intentionally preserved there.
  const allocation = await supabase.rpc("allocate_invoice_number", {
    p_organization_id: draft.organizationId,
  });
  if (allocation.error) return { id: null, error: allocation.error.message };
  const number = String(allocation.data || "");
  if (!number) return { id: null, error: "Invoice number could not be allocated." };
  const total = draft.contents.reduce(
    (sum, item) => sum + (item.priced ? (item.amount ?? item.quantity * (item.rate ?? 0)) : 0),
    0,
  );

  const result = await supabase
    .from("invoices")
    .insert({
      invoice_number: number,
      client_id: client.id,
      project_id: projectId,
      issue_date: draft.date,
      due_date: draft.dueDate || null,
      status: "draft",
      source_total: total,
      organization_id: draft.organizationId,
    })
    .select("id")
    .single();

  if (result.error || !result.data) return { id: null, error: result.error?.message ?? "Invoice could not be created." };

  const rows = draft.contents.map((item, index) => ({
    invoice_id: result.data.id,
    position: index,
    kind: item.kind,
    title: item.title.trim(),
    quantity: item.quantity || 1,
    rate: item.rate ?? null,
    amount: item.priced ? (item.amount ?? item.quantity * (item.rate ?? 0)) : null,
    priced: item.priced,
    note: item.note ?? null,
    assigned_by: item.assignedBy ?? null,
  })).filter(item => item.title);

  if (rows.length) {
    const inserted = await supabase.from("invoice_contents").insert(rows);
    if (inserted.error) {
      await supabase.from("invoices").delete().eq("id", result.data.id);
      return { id: null, error: inserted.error.message };
    }
  }

  const activityError = await logActivity(result.data.id, "invoice_created", {
    invoice_number: number,
    total,
    organization_id: draft.organizationId,
    client_id: client.id,
    project_id: projectId,
  });

  return { id: result.data.id, error: activityError };
}

export async function issueInvoice(invoiceId: string) {
  const { error } = await supabase.rpc("issue_invoice", { p_invoice_id: invoiceId });
  return error?.message ?? null;
}

export async function listDocuments(organizationId?: string | null) {
  let query = supabase
    .from("documents")
    .select("*, organizations(name), clients(name), invoices(invoice_number)")
    .order("created_at", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  return query;
}

export async function recordPayment(
  invoice: Invoice,
  amount: number,
  date: string,
  method: PaymentMethod,
  reference: string,
) {
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid payment amount.";

  const balance = invoiceBalance(invoice);
  if (amount > balance) return "Payment cannot exceed the current invoice balance.";

  const { error } = await supabase.rpc("record_invoice_payment", {
    p_invoice_id: invoice.id,
    p_amount: amount,
    p_payment_date: date,
    p_method: method,
    p_reference: reference || undefined,
    p_notes: undefined,
  });

  return error?.message ?? null;
}

export async function getInvoiceFinancials() {
  return supabase.from("invoice_financials").select("*");
}


export type ImportInvoiceRow = {
  organizationId: string;
  clientName: string;
  assignedBy?: string;
  projectName?: string;
  invoiceNumber?: string;
  issueDate: string;
  dueDate?: string;
  amount: number;
  description?: string;
  status?: Status;
  paymentDate?: string;
  paymentAmount?: number;
  paymentMethod?: PaymentMethod;
  contents?: Array<{title:string;amount:number|null;note?:string}>;
};

export async function importInvoiceRows(rows: ImportInvoiceRow[]) {
  if (!rows.length) return { ok: false, created: 0, error: "No rows to import." };

  const { data, error } = await supabase.rpc("import_invoice_batch", {
    p_rows: rows.map(row => ({
      organizationId: row.organizationId,
      clientName: row.clientName,
      assignedBy: row.assignedBy ?? null,
      projectName: row.projectName ?? null,
      invoiceNumber: row.invoiceNumber ?? null,
      issueDate: row.issueDate,
      dueDate: row.dueDate ?? null,
      amount: row.amount,
      description: row.description ?? null,
      status: row.status ?? "draft",
      paymentDate: row.paymentDate ?? null,
      paymentAmount: row.paymentAmount ?? 0,
      paymentMethod: row.paymentMethod ?? "bank_transfer",
      contents: row.contents ?? [],
    })),
  });

  if (error) return { ok: false, created: 0, error: error.message };
  const created = Number((data as any)?.created ?? rows.length);
  return { ok: true, created };
}
