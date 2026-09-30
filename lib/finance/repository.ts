"use client";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { mapInvoice } from "./domain";
import type { Content, Invoice, PaymentMethod, Status } from "./domain";

const supabase = createClient();

export async function listInvoices(): Promise<{ data: Invoice[]; error: string | null }> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, clients(name), projects(name), invoice_contents(*), payments(*), activity_log(*)")
    .order("issue_date", { ascending: false });

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
  const { error } = await supabase
    .from("invoices")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", invoice.id);

  if (error) return error.message;
  return logActivity(invoice.id, "invoice_status_changed", { from: invoice.status, to: next });
}

export async function saveInvoice(next: Invoice) {
  const { error } = await supabase
    .from("invoices")
    .update({
      notes: next.notes ?? null,
      adjustment_note: next.adjustment ?? null,
      issue_date: next.date,
      due_date: next.dueDate ?? null,
      status: next.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", next.id);

  if (error) return error.message;

  const deleted = await supabase.from("invoice_contents").delete().eq("invoice_id", next.id);
  if (deleted.error) return deleted.error.message;

  const rows = next.contents.map((c, index) => ({
    invoice_id: next.id,
    position: index,
    kind: c.kind,
    title: c.title,
    quantity: c.quantity || 1,
    rate: c.rate ?? null,
    amount: c.priced ? (c.amount ?? c.quantity * (c.rate ?? 0)) : null,
    priced: c.priced,
    note: c.note ?? null,
  }));

  if (rows.length) {
    const inserted = await supabase.from("invoice_contents").insert(rows);
    if (inserted.error) return inserted.error.message;
  }

  return logActivity(next.id, "invoice_updated", {
    content_count: rows.length,
    total: next.contents.reduce((sum, c) => sum + (c.priced ? (c.amount ?? c.quantity * (c.rate ?? 0)) : 0), 0),
  });
}

// FinOS organisation-aware invoice creation
export async function createInvoice(draft: {
  number: string;
  client: string;
  project: string;
  date: string;
  dueDate: string;
  organizationId?: string | null;
  contents: Content[];
}) {
  let { data: client } = await supabase.from("clients").select("id").eq("name", draft.client).maybeSingle();

  if (!client) {
    const result = await supabase.from("clients").insert({ name: draft.client, organization_id: draft.organizationId ?? null }).select("id").single();
    if (result.error) return { id: null, error: result.error.message };
    client = result.data;
  }

  let { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("name", draft.project)
    .eq("client_id", client.id)
    .maybeSingle();

  if (!project) {
    const result = await supabase
      .from("projects")
      .insert({ name: draft.project, client_id: client.id, organization_id: draft.organizationId ?? null })
      .select("id")
      .single();

    if (result.error) return { id: null, error: result.error.message };
    project = result.data;
  }

  const total = draft.contents.reduce(
    (sum, c) => sum + (c.priced ? (c.amount ?? c.quantity * (c.rate ?? 0)) : 0),
    0,
  );

  const result = await supabase
    .from("invoices")
    .insert({
      invoice_number: draft.number.trim(),
      client_id: client.id,
      project_id: project.id,
      issue_date: draft.date,
      due_date: draft.dueDate || null,
      status: "draft",
      source_total: total,
      organization_id: draft.organizationId ?? null,
    })
    .select("id")
    .single();

  if (result.error) return { id: null, error: result.error.message };

  const rows = draft.contents.map((c, index) => ({
    invoice_id: result.data.id,
    position: index,
    kind: c.kind,
    title: c.title,
    quantity: c.quantity || 1,
    rate: c.rate ?? null,
    amount: c.priced ? (c.amount ?? c.quantity * (c.rate ?? 0)) : null,
    priced: c.priced,
    note: c.note ?? null,
  }));

  if (rows.length) {
    const inserted = await supabase.from("invoice_contents").insert(rows);
    if (inserted.error) return { id: result.data.id, error: inserted.error.message };
  }

  const activityError = await logActivity(result.data.id, "invoice_created", {
    invoice_number: draft.number.trim(),
    total,
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

  const balance = Math.max(
    invoice.contents.reduce((sum, c) => sum + (c.priced ? (c.amount ?? c.quantity * (c.rate ?? 0)) : 0), 0)
      - invoice.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    0,
  );

  if (amount > balance) return "Payment cannot exceed the current invoice balance.";

  const { error } = await supabase.from("payments").insert({
    invoice_id: invoice.id,
    amount,
    payment_date: date || null,
    method,
    reference: reference || null,
  });

  if (error) return error.message;

  return logActivity(invoice.id, "payment_recorded", {
    amount,
    payment_date: date || null,
    method,
    reference: reference || null,
  });
}

export async function getInvoiceFinancials() {
  return supabase.from("invoice_financials").select("*");
}
