"use client";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { mapInvoice, invoiceTotal, paidTotal } from "./domain";
import type { Content, Invoice, PaymentMethod, Status } from "./domain";

const supabase = createClient();

export async function listInvoices(organizationId?: string | null): Promise<{ data: Invoice[]; error: string | null }> {
  let query = supabase
    .from("invoices")
    .select("*, clients(name), projects(name), invoice_contents(*), payments(*), activity_log(*)")
    .order("issue_date", { ascending: false });

  if (organizationId) query = query.eq("organization_id", organizationId);

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
    p_client_id: next.clientId ?? null,
    p_project_id: next.projectId ?? null,
    p_notes: next.notes ?? null,
    p_adjustment_note: next.adjustment ?? null,
    p_issue_date: next.date,
    p_due_date: next.dueDate ?? null,
    p_status: next.status,
    p_organization_id: next.organizationId,
    p_contents: next.contents.map((c) => ({
      kind: c.kind,
      title: c.title,
      quantity: c.quantity || 1,
      rate: c.rate ?? null,
      amount: c.priced ? (c.amount ?? c.quantity * (c.rate ?? 0)) : null,
      priced: c.priced,
      note: c.note ?? null,
    })),
  });

  return error?.message ?? null;
}

// FinOS organisation-aware invoice creation
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

  const allocation = await supabase.rpc("allocate_invoice_number", {
    p_organization_id: draft.organizationId,
  });
  if (allocation.error) return { id: null, error: allocation.error.message };

  const number = String(allocation.data || draft.number.trim());
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
    p_payment_date: date || null,
    p_method: method,
    p_reference: reference || null,
    p_notes: null,
  });

  return error?.message ?? null;
}

export async function getInvoiceFinancials() {
  return supabase.from("invoice_financials").select("*");
}


export type ImportInvoiceRow = {
  organizationId: string;
  clientName: string;
  projectName?: string;
  invoiceNumber?: string;
  issueDate: string;
  dueDate?: string;
  amount: number;
  description?: string;
  status?: Status;
};

export async function importInvoiceRows(rows: ImportInvoiceRow[]) {
  const results: { row: ImportInvoiceRow; id?: string; error?: string }[] = [];
  for (const row of rows) {
    if (!row.organizationId || !row.clientName || !row.issueDate) {
      results.push({ row, error: "Organisation, client and issue date are required." });
      continue;
    }
    const { data: existing } = row.invoiceNumber
      ? await supabase.from("invoices").select("id").eq("organization_id", row.organizationId).eq("invoice_number", row.invoiceNumber).maybeSingle()
      : { data: null };
    if (existing) {
      results.push({ row, error: "Invoice number already exists in this organisation." });
      continue;
    }

    let { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", row.organizationId)
      .eq("name", row.clientName)
      .maybeSingle();

    if (!client) {
      const created = await supabase.from("clients")
        .insert({ organization_id: row.organizationId, name: row.clientName })
        .select("id").single();
      if (created.error || !created.data) {
        results.push({ row, error: created.error?.message ?? "Client creation failed." });
        continue;
      }
      client = created.data;
    }

    let projectId: string | null = null;
    if (row.projectName?.trim()) {
      const project = await supabase.from("projects")
        .select("id")
        .eq("organization_id", row.organizationId)
        .eq("client_id", client.id)
        .eq("name", row.projectName.trim())
        .maybeSingle();
      if (project.error) {
        results.push({ row, error: project.error.message });
        continue;
      }
      if (project.data) projectId = project.data.id;
      else {
        const createdProject = await supabase.from("projects")
          .insert({ organization_id: row.organizationId, client_id: client.id, name: row.projectName.trim() })
          .select("id").single();
        if (createdProject.error || !createdProject.data) {
          results.push({ row, error: createdProject.error?.message ?? "Project creation failed." });
          continue;
        }
        projectId = createdProject.data.id;
      }
    }

    const allocated = await supabase.rpc("allocate_invoice_number", { p_organization_id: row.organizationId });
    const number = row.invoiceNumber?.trim() || String(allocated.data ?? "");
    if (allocated.error && !row.invoiceNumber) {
      results.push({ row, error: allocated.error.message });
      continue;
    }

    const created = await supabase.from("invoices").insert({
      organization_id: row.organizationId,
      client_id: client.id,
      project_id: projectId,
      invoice_number: number,
      issue_date: row.issueDate,
      due_date: row.dueDate || null,
      source_total: row.amount,
      status: row.status ?? "draft",
    }).select("id").single();

    if (created.error || !created.data) {
      results.push({ row, error: created.error?.message ?? "Invoice creation failed." });
      continue;
    }

    const content = await supabase.from("invoice_contents").insert({
      invoice_id: created.data.id,
      position: 0,
      kind: "service",
      title: row.description?.trim() || "Imported invoice",
      quantity: 1,
      rate: row.amount,
      amount: row.amount,
      priced: true,
    });
    if (content.error) {
      results.push({ row, id: created.data.id, error: content.error.message });
      continue;
    }

    await logActivity(created.data.id, "invoice_imported", {
      source: "spreadsheet",
      invoice_number: number,
    });
    results.push({ row, id: created.data.id });
  }
  return results;
}
